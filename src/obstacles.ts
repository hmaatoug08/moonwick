import Phaser from "phaser";
import { FEEDBACK, MAGIC, NEAR_MISS, OBSTACLES, WORLD } from "./config";

/** Current difficulty parameters, interpolated between tiers by the scene. */
export type Difficulty = {
  speed: number;
  gapSize: number;
  spawnInterval: number;
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
  /** Last outline alpha applied (avoids redundant setStrokeStyle calls). */
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
   * Guaranteed contrast: the bright outline strengthens as light fades, so the
   * obstacle stays perfectly readable at maximum darkness.
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

  constructor(private readonly scene: Phaser.Scene) {}

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
  }

  update(dt: number, diff: Difficulty): void {
    this.sinceSpawn += dt;
    if (this.sinceSpawn >= this.nextInterval) {
      this.sinceSpawn -= this.nextInterval;
      // Jitter around the tier interval, then the fairness cap.
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
      color = OBSTACLES.colors.trunkFill;

      // Hole = the tier's gapSize +/- jitter, never below the playable floor.
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

      // The bars stop short of the hole and the rounded tips close it exactly
      // on gapTop/gapBottom: the hole really measures gapHeight.
      parts.push({ top: 0, bottom: gapTop - cap, tipAtBottom: true });
      parts.push({ top: gapBottom + cap, bottom: WORLD.height, tipAtBottom: false });
    } else {
      cap = OBSTACLES.branch.width / 2;
      color = OBSTACLES.colors.fill;

      // Pick the narrower side (lengths are already bounded by reachability
      // above), at random when both are equivalent.
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

    // Halo first: added to the container before the bars, so it renders behind.
    const halo = this.scene.add.graphics().setAlpha(FEEDBACK.haloAlpha);
    container.add(halo);
    halo.fillStyle(FEEDBACK.haloColor, 1);
    for (const part of parts) this.addHalo(halo, part, cap);

    for (const part of parts) {
      this.addBar(container, shapes, strokes, cap * 2, part.top, part.bottom, color);
      this.addTip(container, shapes, strokes, part.tipAtBottom ? part.bottom : part.top, cap, color);
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

    this.obstacles.push(new Obstacle(kind, container, halo, gapTop, gapBottom, shapes, cap, strokes));
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
      Phaser.Math.Between(-OBSTACLES.branch.bandJitter, OBSTACLES.branch.bandJitter);
    const wanted = WORLD.height - band - cap;
    const maxLength = reachable - OBSTACLES.clearance - cap;
    return Math.max(OBSTACLES.branch.lengthMin, Math.min(wanted, maxLength));
  }

  /** Vertical bar between two heights (geometric placeholder art). */
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

  /** Rounded end of a branch / edge of a hole. */
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
    // Never three of the same category in a row: avoids monotonous patterns
    // (a branch's side, on the other hand, is dictated by the narrowing).
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
