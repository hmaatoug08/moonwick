import Phaser from "phaser";
import { FEEDBACK, MAGIC, MOON_EYE, NEAR_MISS, OBSTACLE_ART, OBSTACLES, WORLD } from "./config";
import {
  ensureObstacleTextures,
  frameName,
  MOON_ON_RIGHT,
  SHAPE_METRICS,
  SHAPE_TEXTURE,
  type Essence
} from "./obstacleShapes";
import { rng } from "./rng";

/** Current difficulty parameters, interpolated between tiers by the scene. */
export type Difficulty = {
  speed: number;
  gapSize: number;
  spawnInterval: number;
  /** Tree species of the current tier — RENDERING ONLY. */
  essence: Essence;
  /** "The Moon's Eye" contrast inversion — RENDERING ONLY. */
  inverted: boolean;
};

/**
 * Maximum interval between two obstacles, in seconds.
 *
 * FAIRNESS CONSTRAINT: every obstacle is the only chance to refill the combo
 * timer. If two obstacles are too far apart, the multiplier breaks even though
 * the player is playing perfectly — a chain lost through no fault of theirs.
 * The cap is applied to EVERY interval draw, whatever the tier: even with
 * TIERS tuned arbitrarily, generation stays fair. This is deliberately a
 * structural guarantee (backed by a dev assertion in config.ts) so that tuning
 * cannot break it.
 */
const MAX_INTERVAL = MAGIC.max * MAGIC.grazeWindowFactor;

/** Applies the fairness constraint above to a desired interval. */
function clampInterval(interval: number): number {
  return Math.min(interval, MAX_INTERVAL);
}

/**
 * Obstacle depth (halo included): ABOVE the darkening overlay (depth 2 on the
 * scene side), below the witch (5).
 * Readability INVARIANT: no visual effect may ever be drawn in front of
 * obstacles or their graze halos.
 */
const OBSTACLE_DEPTH = 3;

export type ObstacleKind = "branch-top" | "branch-bottom" | "trunk";

/**
 * One part of an obstacle: a vertical bar with a rounded tip (a capsule).
 * `tipAtBottom` says which end carries the rounded tip; the other end is
 * always flush against a screen edge.
 */
type Part = { top: number; bottom: number; tipAtBottom: boolean };

/**
 * Collision shapes, in coordinates local to the container (local x = 0).
 * They match the visuals exactly: rectangular bar + rounded tip.
 */
export type CollisionShape =
  | { type: "rect"; halfWidth: number; top: number; bottom: number }
  | { type: "circle"; y: number; radius: number };

/**
 * An obstacle is a container of shapes that scrolls as one block.
 * `gapTop`/`gapBottom` describe the free band: the witch is meant to fly
 * through there (used to guarantee a playable sequence).
 */
export class Obstacle {
  /** Zone entry already reported: the refill only happens once. */
  grazeEntered = false;
  /** Graze already counted: one per obstacle, whatever happens. */
  grazed = false;
  /** Pass-through already counted. */
  passed = false;
  /** The witch is currently inside the graze ring. */
  inGrazeZone = false;
  /** Closest distance reached, and the witch position at that moment: this is
   *  where the graze text pops up. */
  minDistance = Infinity;
  grazeX = 0;
  grazeY = 0;
  /** Last rim alpha applied (avoids redundant setAlpha calls). */
  private rimAlpha = -1;

  constructor(
    readonly kind: ObstacleKind,
    readonly container: Phaser.GameObjects.Container,
    readonly halo: Phaser.GameObjects.Graphics,
    readonly gapTop: number,
    readonly gapBottom: number,
    readonly shapes: readonly CollisionShape[],
    readonly halfWidth: number,
    /** Moon-lit edges, the obstacle's primary readability element. */
    readonly rimImages: readonly Phaser.GameObjects.Image[],
    /**
     * Halo opacity multiplier. Above 1 under contrast inversion, where a dark
     * ring on pale gold needs more presence than a bright one on black.
     */
    readonly haloAlphaScale: number,
    /** Under contrast inversion the rim is a fixed dark edge, not a glow. */
    private readonly fixedRimAlpha: number | null
  ) {}

  /**
   * Guaranteed contrast: the moon rim strengthens as light fades, so the
   * obstacle stays perfectly readable at maximum darkness.
   */
  setContrast(alpha: number): void {
    const wanted = this.fixedRimAlpha ?? alpha;
    if (Math.abs(wanted - this.rimAlpha) < 0.01) return;
    this.rimAlpha = wanted;
    for (const image of this.rimImages) image.setAlpha(wanted);
  }

  get x(): number {
    return this.container.x;
  }

  /**
   * Distance from (px, py) to the obstacle SURFACE; 0 means contact or inside.
   * Essential for long trunks: a centre-to-centre distance would produce
   * completely wrong grazes along their whole length.
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

  /** Past the witch: no contact is possible any more (scrolling is one-way). */
  isBehind(witchX: number): boolean {
    return this.container.x + this.halfWidth < witchX;
  }
}

/** Category drawn at random; a branch's side is decided afterwards. */
type ObstacleCategory = "branch" | "trunk";

/**
 * Procedural generator: time-based pacing driven by the current tier.
 */
export class ObstacleSpawner {
  private readonly obstacles: Obstacle[] = [];
  /** Time-based pacing: the rhythm of play does not depend on speed. */
  private sinceSpawn = 0;
  private nextInterval: number = clampInterval(OBSTACLES.firstDelay);
  /** Height at which the witch will clear the last generated obstacle. */
  private passY = WORLD.height / 2;
  private lastCategory: ObstacleCategory | null = null;
  private sameCategoryStreak = 0;
  /**
   * Authored opening (first-ever runs): gap-size multipliers consumed one per
   * spawn, trunks only — the most readable shape, hole near the flight line.
   * Widening is strictly easier, so every generation guarantee holds.
   */
  private onboarding: number[] = [];
  /**
   * Seeded course (the Daily Moon): non-null replaces every GAMEPLAY draw —
   * intervals, categories, gap sizes, gap positions, branch sides — never
   * the cosmetic silhouette-variant picks: course parity is COLLISION
   * parity, and two players may see differently barked trees in the same
   * places. Cleared by reset(); the scene re-arms it per attempt so every
   * attempt of the day flies the same forest.
   */
  private seeded: (() => number) | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    ensureObstacleTextures(scene);
  }

  /** Live obstacles, oldest first. */
  get all(): readonly Obstacle[] {
    return this.obstacles;
  }

  /** Reset for an instant restart (no scene reload). */
  reset(): void {
    for (const obstacle of this.obstacles) obstacle.container.destroy();
    this.obstacles.length = 0;
    this.sinceSpawn = 0;
    this.nextInterval = clampInterval(OBSTACLES.firstDelay);
    this.passY = WORLD.height / 2;
    this.lastCategory = null;
    this.sameCategoryStreak = 0;
    // Neither the authored opening nor the seeded course survives a reset by
    // itself: the scene re-arms what the next run needs.
    this.onboarding.length = 0;
    this.seeded = null;
  }

  /** Arm the authored opening: one gap-size multiplier per upcoming spawn. */
  setOnboarding(gapScales: readonly number[]): void {
    this.onboarding = [...gapScales];
  }

  /** Arm (or clear) the seeded course. Call right after reset(). */
  setSeed(seed: number | null): void {
    this.seeded = seed === null ? null : rng(seed);
  }

  // Every gameplay draw funnels through these three, so the seeded course
  // and free play cannot diverge in WHICH decisions are random — only in
  // where the numbers come from.
  private rand(): number {
    return this.seeded ? this.seeded() : Math.random();
  }

  private randBetween(min: number, max: number): number {
    return Math.floor(this.rand() * (max - min + 1)) + min;
  }

  private randFloat(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }

  update(dt: number, diff: Difficulty): void {
    this.sinceSpawn += dt;
    if (this.sinceSpawn >= this.nextInterval) {
      this.sinceSpawn -= this.nextInterval;
      // Jitter around the tier interval, then the fairness cap.
      const jitter = this.randFloat(1 - OBSTACLES.intervalJitter, 1 + OBSTACLES.intervalJitter);
      this.nextInterval = clampInterval(diff.spawnInterval * jitter);
      this.spawn(diff);
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

  private spawn(diff: Difficulty): void {
    // Authored opening: consume one widened, trunk-only step per spawn.
    const authored = this.onboarding.shift();
    const gapSize = diff.gapSize * (authored ?? 1);
    const category = authored !== undefined ? "trunk" : this.pickCategory();
    const container = this.scene.add
      .container(WORLD.width + OBSTACLES.spawnMargin, 0)
      .setDepth(OBSTACLE_DEPTH);
    const shapes: CollisionShape[] = [];
    const parts: Part[] = [];

    let kind: ObstacleKind;
    let gapTop: number;
    let gapBottom: number;
    let cap: number;

    // A branch can only be narrowed if its band is reachable from the current
    // flight line (maxGapShift). When NEITHER side can be, we place a trunk
    // instead: its hole centres near the flight line, so it is always both
    // reachable AND at the tier's width.
    // Without this fallback, branches "widened by reachability" would be an
    // escape hatch from the "half-gap < 38 px from The Brambles" guarantee.
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
        // Variety bookkeeping: a trunk is what actually gets placed.
        this.lastCategory = "trunk";
        this.sameCategoryStreak = 1;
      }
    }

    if (buildTrunk) {
      kind = "trunk";
      cap = OBSTACLES.trunk.width / 2;

      // Hole = the tier's gapSize +/- jitter, never below the playable floor.
      const gapHeight = Math.max(
        OBSTACLES.gapFloor,
        gapSize + this.randBetween(-OBSTACLES.trunk.gapJitter, OBSTACLES.trunk.gapJitter)
      );
      const wanted = this.passY + this.randBetween(-OBSTACLES.maxGapShift, OBSTACLES.maxGapShift);
      const center = Phaser.Math.Clamp(
        wanted,
        OBSTACLES.safeMarginTop + gapHeight / 2,
        WORLD.height - OBSTACLES.safeMarginBottom - gapHeight / 2
      );
      gapTop = center - gapHeight / 2;
      gapBottom = center + gapHeight / 2;

      // The bars stop short of the hole and the rounded tips close it exactly
      // on gapTop/gapBottom: the hole really measures gapHeight.
      parts.push({ top: 0, bottom: gapTop - cap, tipAtBottom: true });
      parts.push({ top: gapBottom + cap, bottom: WORLD.height, tipAtBottom: false });
    } else {
      cap = OBSTACLES.branch.width / 2;

      // Pick the narrower side (lengths are already bounded by reachability
      // above), at random when both are equivalent.
      const bandTop = WORLD.height - lengthTop - cap;
      const bandBottom = WORLD.height - lengthBottom - cap;
      const slack = OBSTACLES.branch.sideSwitchSlack;
      if (bandTop > bandBottom + slack) kind = "branch-bottom";
      else if (bandBottom > bandTop + slack) kind = "branch-top";
      else kind = this.rand() < 0.5 ? "branch-top" : "branch-bottom";

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

    // Halo first: added to the container before the art, so it renders behind.
    // Under contrast inversion it flips to dark-on-light, because a pale violet
    // ring on pale gold would stop teaching the rule.
    const halo = this.scene.add.graphics();
    container.add(halo);
    halo.fillStyle(diff.inverted ? MOON_EYE.haloColor : FEEDBACK.haloColor, 1);
    for (const part of parts) this.addHalo(halo, part, cap);

    // COLLISION — unchanged: one rectangle plus one rounded tip per part. The
    // art below is built around these primitives and never replaces them.
    for (const part of parts) {
      const height = part.bottom - part.top;
      if (height <= 0) continue;
      shapes.push({ type: "rect", halfWidth: cap, top: part.top, bottom: part.bottom });
      shapes.push({ type: "circle", y: part.tipAtBottom ? part.bottom : part.top, radius: cap });
    }

    // ART — bodies first, then rims, so every rim sits on top.
    const rims: Phaser.GameObjects.Image[] = [];
    const bodyColor = diff.inverted ? MOON_EYE.bodyColor : OBSTACLE_ART.bodyColor;
    const rimColor = diff.inverted ? MOON_EYE.rimColor : OBSTACLE_ART.rimColor;
    // One variant per part, drawn once: body and rim must share the same shape.
    const variants = parts.map(() => Phaser.Math.Between(0, OBSTACLE_ART.variantsPerEssence - 1));
    for (const layer of ["body", "rim"] as const) {
      parts.forEach((part, i) => {
        if (part.bottom - part.top <= 0) return;
        const anchorY = part.tipAtBottom ? part.top : part.bottom;
        const endY = part.tipAtBottom ? part.bottom : part.top;
        const images = this.addSilhouette(
          container,
          layer,
          diff.essence,
          variants[i],
          anchorY,
          endY,
          cap
        );
        for (const image of images) {
          image.setTint(layer === "body" ? bodyColor : rimColor);
          if (layer === "rim") rims.push(image);
        }
      });
    }

    // The player follows the shortest path, so we remember where they will
    // cross. The breathing margin shrinks by itself when the gap gets narrower
    // than the margin (tight tiers), otherwise the bounds would cross over.
    const clearance = Math.min(OBSTACLES.clearance, (gapBottom - gapTop) / 2 - 6);
    this.passY = Phaser.Math.Clamp(
      this.passY,
      Math.max(gapTop + clearance, OBSTACLES.safeMarginTop),
      Math.min(gapBottom - clearance, WORLD.height - OBSTACLES.safeMarginBottom)
    );

    this.obstacles.push(
      new Obstacle(
        kind,
        container,
        halo,
        gapTop,
        gapBottom,
        shapes,
        cap,
        rims,
        diff.inverted ? MOON_EYE.haloAlphaScale : 1,
        diff.inverted ? MOON_EYE.rimAlpha : null
      )
    );
  }

  /**
   * The halo is the part's capsule, dilated by the graze radius.
   * Its border is therefore exactly the "d = grazeRadius" isoline: the player
   * literally sees the zone that scores points.
   */
  private addHalo(halo: Phaser.GameObjects.Graphics, part: Part, cap: number): void {
    const r = cap + NEAR_MISS.grazeRadius;
    halo.fillRoundedRect(-r, part.top - r, r * 2, part.bottom - part.top + r * 2, r);
  }

  /**
   * Branch length: its free band aims for gapSize x bandFactor (+/- jitter),
   * and `reachable` — the furthest vertical position still attainable —
   * shortens it when needed so an impossible dive is never demanded.
   */
  private branchLength(gapSize: number, reachable: number): number {
    const cap = OBSTACLES.branch.width / 2;
    const band =
      gapSize * OBSTACLES.branch.bandFactor +
      this.randBetween(-OBSTACLES.branch.bandJitter, OBSTACLES.branch.bandJitter);
    const wanted = WORLD.height - band - cap;
    const maxLength = reachable - OBSTACLES.clearance - cap;
    return Math.max(OBSTACLES.branch.lengthMin, Math.min(wanted, maxLength));
  }

  /**
   * Draws one part's silhouette, from the screen edge (`anchorY`) to the
   * collision end (`endY`). Two frames, because they scale differently:
   *
   *  - the SHAFT stretches over the part's length; its half-width never drops
   *    below one collision radius, so stretching cannot expose the hitbox;
   *  - the TIP is drawn at a fixed pixel scale (`cap` px per unit) starting
   *    `tipStartBeforeEnd` radii before the collision end. Its profile was
   *    generated as the max of the art and the rounded cap's own outline, so
   *    the capsule's round end is covered — and because it is never stretched,
   *    the overshoot past the hitbox stays a bounded ~1.2 radii on long
   *    obstacles instead of growing with their length.
   */
  private addSilhouette(
    container: Phaser.GameObjects.Container,
    layer: "body" | "rim",
    essence: Essence,
    variant: number,
    anchorY: number,
    endY: number,
    cap: number
  ): Phaser.GameObjects.Image[] {
    const down = endY > anchorY;
    const sign = down ? 1 : -1;
    const width = SHAPE_METRICS.halfWidthUnits * 2 * cap;
    // Never let the tip start before the anchor: on very short parts the whole
    // silhouette is the tip, which still covers the capsule (its floor is a
    // full radius up to the collision end).
    const shaftLen = Math.max(0, Math.abs(endY - anchorY) - SHAPE_METRICS.tipStartBeforeEnd * cap);
    const tipLen = SHAPE_METRICS.tipUnits * cap;

    const images: Phaser.GameObjects.Image[] = [];
    const place = (zone: "shaft" | "tip", from: number, to: number) => {
      if (to - from <= 0) return;
      const image = this.scene.add
        .image(0, anchorY + sign * (from + to) / 2, SHAPE_TEXTURE, frameName(layer, essence, variant, zone))
        .setOrigin(0.5, 0.5)
        .setFlipY(down)
        // Single light direction: the rim is baked on +x, so it only needs
        // mirroring when the moon is on the other side of the screen.
        .setFlipX(!MOON_ON_RIGHT)
        .setDisplaySize(width, to - from);
      container.add(image);
      images.push(image);
    };

    place("shaft", 0, shaftLen);
    place("tip", shaftLen, shaftLen + tipLen);
    return images;
  }

  private pickCategory(): ObstacleCategory {
    const entries: Array<[ObstacleCategory, number]> = [
      ["branch", OBSTACLES.weights.branchTop + OBSTACLES.weights.branchBottom],
      ["trunk", OBSTACLES.weights.trunk]
    ];
    // Never three of the same category in a row: avoids monotonous patterns
    // (a branch's side, on the other hand, is dictated by the narrowing).
    const pool =
      this.sameCategoryStreak >= 2 ? entries.filter(([k]) => k !== this.lastCategory) : entries;

    const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.rand() * total;
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
