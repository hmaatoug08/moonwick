import Phaser from "phaser";
import { FEEDBACK, MAGIC, NEAR_MISS, OBSTACLES, WORLD } from "./config";

/** Paramètres de difficulté du moment, interpolés entre paliers par la scène. */
export type Difficulty = {
  speed: number;
  gapSize: number;
  spawnInterval: number;
};

/**
 * Intervalle maximal entre deux obstacles, en secondes.
 *
 * CONTRAINTE D'ÉQUITÉ : chaque obstacle est la seule occasion de recharger le
 * minuteur de combo. Si deux obstacles sont trop espacés, le multiplicateur
 * saute alors même que le joueur joue parfaitement — une chaîne cassée sans
 * faute de sa part. Le plafond est appliqué à CHAQUE tirage d'intervalle,
 * quel que soit le palier : même en tunant TIERS n'importe comment, la
 * génération reste équitable. C'est volontairement une garantie structurelle
 * (doublée d'une assertion dev dans config.ts) pour que le tuning ne puisse
 * pas la casser.
 */
const MAX_INTERVAL = MAGIC.max * MAGIC.grazeWindowFactor;

/** Applique la contrainte d'équité ci-dessus à un intervalle voulu. */
function clampInterval(interval: number): number {
  return Math.min(interval, MAX_INTERVAL);
}

/**
 * Profondeur des obstacles (halo compris) : AU-DESSUS de l'overlay
 * d'assombrissement (profondeur 2 côté scène), sous la sorcière (5).
 * INVARIANT de lisibilité : aucun effet visuel ne doit passer devant
 * les obstacles ou leurs halos de frôlement.
 */
const OBSTACLE_DEPTH = 3;

export type ObstacleKind = "branch-top" | "branch-bottom" | "trunk";

/**
 * Une partie d'obstacle : une barre à bout arrondi (capsule) d'axe vertical.
 * `tipAtBottom` dit de quel côté se trouve le bout arrondi, l'autre extrémité
 * étant toujours collée à un bord de l'écran.
 */
type Part = { top: number; bottom: number; tipAtBottom: boolean };

/**
 * Formes de collision, en coordonnées locales au conteneur (x local = 0).
 * Elles épousent exactement le visuel : barre rectangulaire + bout arrondi.
 */
export type CollisionShape =
  | { type: "rect"; halfWidth: number; top: number; bottom: number }
  | { type: "circle"; y: number; radius: number };

/**
 * Un obstacle = un conteneur de formes qui défile d'un bloc.
 * `gapTop`/`gapBottom` décrivent la bande libre : c'est par là que la sorcière
 * doit passer (utilisé pour garantir un enchaînement jouable).
 */
export class Obstacle {
  /** Entrée dans la zone déjà signalée : la recharge n'a lieu qu'une fois. */
  grazeEntered = false;
  /** Frôlement déjà compté : un seul par obstacle, quoi qu'il arrive. */
  grazed = false;
  /** Point de passage déjà compté. */
  passed = false;
  /** La sorcière est actuellement dans l'anneau de frôlement. */
  inGrazeZone = false;
  /** Distance minimale atteinte, et position de la sorcière à ce moment-là :
   *  c'est là que s'affiche le texte de frôlement. */
  minDistance = Infinity;
  grazeX = 0;
  grazeY = 0;
  /** Dernier alpha de liseré appliqué (évite les setStrokeStyle redondants). */
  private strokeAlpha = -1;

  constructor(
    readonly kind: ObstacleKind,
    readonly container: Phaser.GameObjects.Container,
    readonly halo: Phaser.GameObjects.Graphics,
    readonly gapTop: number,
    readonly gapBottom: number,
    readonly shapes: readonly CollisionShape[],
    readonly halfWidth: number,
    readonly strokeShapes: readonly Phaser.GameObjects.Shape[]
  ) {}

  /**
   * Contraste garanti : le liseré clair se renforce quand la lumière baisse,
   * pour que l'obstacle reste parfaitement lisible à obscurité maximale.
   */
  setContrast(alpha: number): void {
    if (Math.abs(alpha - this.strokeAlpha) < 0.01) return;
    this.strokeAlpha = alpha;
    for (const shape of this.strokeShapes) {
      shape.setStrokeStyle(2, OBSTACLES.colors.stroke, alpha);
    }
  }

  get x(): number {
    return this.container.x;
  }

  /**
   * Distance de (px, py) à la SURFACE de l'obstacle, 0 = contact ou intérieur.
   * Indispensable pour les longs troncs : une distance de centre à centre
   * donnerait des frôlements complètement faux sur toute leur longueur.
   */
  distanceTo(px: number, py: number): number {
    const dx = Math.abs(px - this.container.x);
    let best = Infinity;

    for (const shape of this.shapes) {
      let d: number;
      if (shape.type === "rect") {
        const ox = Math.max(dx - shape.halfWidth, 0);
        const oy = Math.max(shape.top - py, py - shape.bottom, 0);
        d = Math.sqrt(ox * ox + oy * oy);
      } else {
        const oy = py - shape.y;
        d = Math.max(Math.sqrt(dx * dx + oy * oy) - shape.radius, 0);
      }
      if (d < best) best = d;
    }

    return best;
  }

  /** Passé derrière la sorcière : plus aucun contact possible (défilement à sens unique). */
  isBehind(witchX: number): boolean {
    return this.container.x + this.halfWidth < witchX;
  }
}

/** Catégorie tirée au sort ; le côté d'une branche est décidé ensuite. */
type ObstacleCategory = "branch" | "trunk";

/**
 * Générateur procédural : cadence temporelle pilotée par le palier courant.
 */
export class ObstacleSpawner {
  private readonly obstacles: Obstacle[] = [];
  /** Cadence temporelle : le rythme de jeu ne dépend pas de la vitesse. */
  private sinceSpawn = 0;
  private nextInterval: number = clampInterval(OBSTACLES.firstDelay);
  /** Hauteur à laquelle la sorcière franchira le dernier obstacle généré. */
  private passY = WORLD.height / 2;
  private lastCategory: ObstacleCategory | null = null;
  private sameCategoryStreak = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Obstacles vivants, du plus ancien au plus récent. */
  get all(): readonly Obstacle[] {
    return this.obstacles;
  }

  /** Remise à zéro pour un restart instantané (aucune scène rechargée). */
  reset(): void {
    for (const obstacle of this.obstacles) obstacle.container.destroy();
    this.obstacles.length = 0;
    this.sinceSpawn = 0;
    this.nextInterval = clampInterval(OBSTACLES.firstDelay);
    this.passY = WORLD.height / 2;
    this.lastCategory = null;
    this.sameCategoryStreak = 0;
  }

  update(dt: number, diff: Difficulty): void {
    this.sinceSpawn += dt;
    if (this.sinceSpawn >= this.nextInterval) {
      this.sinceSpawn -= this.nextInterval;
      // Jitter autour de l'intervalle du palier, puis plafond d'équité.
      const jitter = Phaser.Math.FloatBetween(1 - OBSTACLES.intervalJitter, 1 + OBSTACLES.intervalJitter);
      this.nextInterval = clampInterval(diff.spawnInterval * jitter);
      this.spawn(diff.gapSize);
    }

    const step = diff.speed * dt;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obstacle = this.obstacles[i];
      obstacle.container.x -= step;
      if (obstacle.container.x < OBSTACLES.despawnX) {
        obstacle.container.destroy();
        this.obstacles.splice(i, 1);
      }
    }
  }

  private spawn(gapSize: number): void {
    const category = this.pickCategory();
    const container = this.scene.add
      .container(WORLD.width + OBSTACLES.spawnMargin, 0)
      .setDepth(OBSTACLE_DEPTH);
    const shapes: CollisionShape[] = [];
    const strokes: Phaser.GameObjects.Shape[] = [];
    const parts: Part[] = [];

    let kind: ObstacleKind;
    let gapTop: number;
    let gapBottom: number;
    let cap: number;
    let color: number;

    // Une branche n'est resserrable que si sa bande peut être atteinte depuis
    // la trajectoire courante (maxGapShift). Quand AUCUN côté ne le peut, on
    // pose un tronc à la place : son trou se centre près de la trajectoire,
    // donc il est toujours atteignable ET toujours à la largeur du palier.
    // Sans ce repli, les branches « élargies par l'atteignabilité » seraient
    // une échappatoire à la garantie « demi-passage < 38 px dès Les Ronces ».
    let buildTrunk = category === "trunk";
    let lengthTop = 0;
    let lengthBottom = 0;

    if (!buildTrunk) {
      lengthTop = this.branchLength(gapSize, this.passY + OBSTACLES.maxGapShift);
      lengthBottom = this.branchLength(gapSize, WORLD.height - (this.passY - OBSTACLES.maxGapShift));
      const capB = OBSTACLES.branch.width / 2;
      const bestBand =
        WORLD.height - Math.max(lengthTop, lengthBottom) - capB;
      if (bestBand > gapSize + OBSTACLES.branch.bandJitter + 1) {
        buildTrunk = true;
        // Comptabilité de variété : c'est un tronc qui est réellement posé.
        this.lastCategory = "trunk";
        this.sameCategoryStreak = 1;
      }
    }

    if (buildTrunk) {
      kind = "trunk";
      cap = OBSTACLES.trunk.width / 2;
      color = OBSTACLES.colors.trunkFill;

      // Trou = gapSize du palier +/- jitter, jamais sous le plancher jouable.
      const gapHeight = Math.max(
        OBSTACLES.gapFloor,
        gapSize + Phaser.Math.Between(-OBSTACLES.trunk.gapJitter, OBSTACLES.trunk.gapJitter)
      );
      const wanted = this.passY + Phaser.Math.Between(-OBSTACLES.maxGapShift, OBSTACLES.maxGapShift);
      const center = Phaser.Math.Clamp(
        wanted,
        OBSTACLES.safeMarginTop + gapHeight / 2,
        WORLD.height - OBSTACLES.safeMarginBottom - gapHeight / 2
      );
      gapTop = center - gapHeight / 2;
      gapBottom = center + gapHeight / 2;

      // Les barres s'arrêtent avant le trou, les bourgeons arrondis viennent
      // le fermer pile sur gapTop/gapBottom : le trou fait vraiment gapHeight.
      parts.push({ top: 0, bottom: gapTop - cap, tipAtBottom: true });
      parts.push({ top: gapBottom + cap, bottom: WORLD.height, tipAtBottom: false });
    } else {
      cap = OBSTACLES.branch.width / 2;
      color = OBSTACLES.colors.fill;

      // Côté le plus étroit (les longueurs sont déjà bornées par
      // l'atteignabilité ci-dessus), au hasard quand les deux se valent.
      const bandTop = WORLD.height - lengthTop - cap;
      const bandBottom = WORLD.height - lengthBottom - cap;
      const slack = OBSTACLES.branch.sideSwitchSlack;
      if (bandTop > bandBottom + slack) kind = "branch-bottom";
      else if (bandBottom > bandTop + slack) kind = "branch-top";
      else kind = Math.random() < 0.5 ? "branch-top" : "branch-bottom";

      if (kind === "branch-top") {
        gapTop = lengthTop + cap;
        gapBottom = WORLD.height;
        parts.push({ top: 0, bottom: lengthTop, tipAtBottom: true });
      } else {
        gapTop = 0;
        gapBottom = WORLD.height - lengthBottom - cap;
        parts.push({ top: WORLD.height - lengthBottom, bottom: WORLD.height, tipAtBottom: false });
      }
    }

    // Halo d'abord : ajouté au conteneur avant les barres, donc rendu derrière.
    const halo = this.scene.add.graphics().setAlpha(FEEDBACK.haloAlpha);
    container.add(halo);
    halo.fillStyle(FEEDBACK.haloColor, 1);
    for (const part of parts) this.addHalo(halo, part, cap);

    for (const part of parts) {
      this.addBar(container, shapes, strokes, cap * 2, part.top, part.bottom, color);
      this.addTip(container, shapes, strokes, part.tipAtBottom ? part.bottom : part.top, cap, color);
    }

    // Le joueur suit la trajectoire la plus courte : on mémorise où il passera.
    // La marge de respiration se réduit d'elle-même quand le passage devient
    // plus étroit qu'elle (paliers serrés), sinon les bornes se croiseraient.
    const clearance = Math.min(OBSTACLES.clearance, (gapBottom - gapTop) / 2 - 6);
    this.passY = Phaser.Math.Clamp(
      this.passY,
      Math.max(gapTop + clearance, OBSTACLES.safeMarginTop),
      Math.min(gapBottom - clearance, WORLD.height - OBSTACLES.safeMarginBottom)
    );

    this.obstacles.push(new Obstacle(kind, container, halo, gapTop, gapBottom, shapes, cap, strokes));
  }

  /**
   * Halo = la capsule de la partie, dilatée du rayon de frôlement.
   * Sa bordure est donc exactement l'isoligne "d = grazeRadius" : le joueur
   * voit littéralement la zone qui rapporte des points.
   */
  private addHalo(halo: Phaser.GameObjects.Graphics, part: Part, cap: number): void {
    const r = cap + NEAR_MISS.grazeRadius;
    halo.fillRoundedRect(-r, part.top - r, r * 2, part.bottom - part.top + r * 2, r);
  }

  /**
   * Longueur d'une branche : sa bande libre vise gapSize x bandFactor
   * (+/- jitter), et `reachable` — la position verticale la plus éloignée
   * encore atteignable — la raccourcit si besoin pour ne jamais exiger un
   * saut impossible.
   */
  private branchLength(gapSize: number, reachable: number): number {
    const cap = OBSTACLES.branch.width / 2;
    const band =
      gapSize * OBSTACLES.branch.bandFactor +
      Phaser.Math.Between(-OBSTACLES.branch.bandJitter, OBSTACLES.branch.bandJitter);
    const wanted = WORLD.height - band - cap;
    const maxLength = reachable - OBSTACLES.clearance - cap;
    return Math.max(OBSTACLES.branch.lengthMin, Math.min(wanted, maxLength));
  }

  /** Barre verticale entre deux hauteurs (placeholder géométrique). */
  private addBar(
    container: Phaser.GameObjects.Container,
    shapes: CollisionShape[],
    strokes: Phaser.GameObjects.Shape[],
    width: number,
    top: number,
    bottom: number,
    color: number
  ): void {
    const height = bottom - top;
    if (height <= 0) return;
    const bar = this.scene.add.rectangle(0, top + height / 2, width, height, color);
    bar.setStrokeStyle(2, OBSTACLES.colors.stroke, OBSTACLES.colors.strokeAlphaLit);
    container.add(bar);
    shapes.push({ type: "rect", halfWidth: width / 2, top, bottom });
    strokes.push(bar);
  }

  /** Extrémité arrondie d'une branche / bord d'un trou. */
  private addTip(
    container: Phaser.GameObjects.Container,
    shapes: CollisionShape[],
    strokes: Phaser.GameObjects.Shape[],
    y: number,
    radius: number,
    color: number
  ): void {
    const tip = this.scene.add.circle(0, y, radius, color);
    tip.setStrokeStyle(2, OBSTACLES.colors.stroke, OBSTACLES.colors.strokeAlphaLit);
    container.add(tip);
    shapes.push({ type: "circle", y, radius });
    strokes.push(tip);
  }

  private pickCategory(): ObstacleCategory {
    const entries: Array<[ObstacleCategory, number]> = [
      ["branch", OBSTACLES.weights.branchTop + OBSTACLES.weights.branchBottom],
      ["trunk", OBSTACLES.weights.trunk]
    ];
    // Jamais trois fois la même catégorie d'affilée : évite les patterns
    // monotones (le côté d'une branche, lui, est dicté par le resserrement).
    const pool =
      this.sameCategoryStreak >= 2 ? entries.filter(([k]) => k !== this.lastCategory) : entries;

    const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * total;
    let category: ObstacleCategory = pool[pool.length - 1][0];
    for (const [candidate, weight] of pool) {
      roll -= weight;
      if (roll < 0) {
        category = candidate;
        break;
      }
    }

    this.sameCategoryStreak = category === this.lastCategory ? this.sameCategoryStreak + 1 : 1;
    this.lastCategory = category;
    return category;
  }
}
