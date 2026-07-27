import Phaser from "phaser";
import { FIREFLIES, NEAR_MISS, SCORING, VALUE_TAG } from "./config";
import type { Obstacle } from "./obstacles";
import { SPARK_KEY } from "./textures";

/**
 * How the game argues that grazing pays, without a word of instruction.
 *
 * It replaced the tutorial approach (a "GRAZE" band beside the first obstacle,
 * repeated until the player managed it). Telling players what to do explains a
 * rule; showing them what they gain makes them want it. Two cues:
 *
 *  - FIREFLIES float inside the graze ring. They are PURELY VISUAL and never
 *    add a point — they are bait, put exactly where the reward is, so the eye
 *    goes there on its own. Collected when she enters the ring, they escape
 *    upward and fade when the obstacle is passed without one.
 *  - The VALUE TAG shows what this obstacle is worth at the current multiplier,
 *    small, on the edge of its halo, fading in as she closes.
 *
 * Everything here is POOLED. Obstacles spawn every ~2 s for the length of a
 * run, and allocating a handful of sprites and a text each time would hand the
 * GC a steady stream of garbage in the middle of a 60 fps loop.
 */

type FlyState = "idle" | "collected" | "escaping";

type Fly = {
  img: Phaser.GameObjects.Image;
  obstacle: Obstacle | null;
  /** Anchor in obstacle-local space: x relative to its axis, y absolute. */
  ox: number;
  oy: number;
  phase: number;
  size: number;
  state: FlyState;
  /** Seconds spent in the current state. */
  t: number;
  fromX: number;
  fromY: number;
};

type Tag = {
  text: Phaser.GameObjects.Text;
  obstacle: Obstacle | null;
  /** Absolute y where the tag sits, picked once at attach. */
  y: number;
};

export class RewardCues {
  private readonly flies: Fly[] = [];
  private readonly tags: Tag[] = [];
  /**
   * Obstacles that have already been given their cues.
   *
   * This has to be tracked explicitly rather than inferred from the live
   * flies: the moment an obstacle's fireflies are collected they leave it, and
   * anything that reads "does this obstacle still have flies?" would then hand
   * it a fresh set — the same obstacle paying out over and over. A WeakSet
   * because obstacles are thrown away every run and must not be held alive.
   */
  private readonly attached = new WeakSet<Obstacle>();

  constructor(scene: Phaser.Scene, depth: number) {
    for (let i = 0; i < FIREFLIES.poolSize; i++) {
      this.flies.push({
        img: scene.add
          .image(0, 0, SPARK_KEY)
          .setTint(FIREFLIES.color)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(depth)
          .setVisible(false),
        obstacle: null,
        ox: 0,
        oy: 0,
        phase: 0,
        size: FIREFLIES.sizeMin,
        state: "idle",
        t: 0,
        fromX: 0,
        fromY: 0
      });
    }

    for (let i = 0; i < VALUE_TAG.poolSize; i++) {
      this.tags.push({
        text: scene.add
          .text(0, 0, "", {
            fontFamily: "sans-serif",
            fontStyle: "bold",
            fontSize: `${VALUE_TAG.fontSizePx}px`,
            color: VALUE_TAG.color
          })
          // Right-aligned: it hangs off the obstacle's approaching edge.
          .setOrigin(1, 0.5)
          .setDepth(depth)
          .setVisible(false),
        obstacle: null,
        y: 0
      });
    }
  }

  /**
   * The points an obstacle is worth right now. Read from the same constants the
   * scoring uses, so the tag can never promise something the score will not pay.
   */
  static valueAt(multiplier: number): number {
    return Math.round(SCORING.grazePoints * multiplier);
  }

  /**
   * Reconciles the cues with the live obstacles: attach to newcomers, release
   * whatever is no longer on screen. Driven from the scene each frame so the
   * generator does not have to know this layer exists.
   */
  sync(obstacles: readonly Obstacle[]): void {
    const live = new Set(obstacles);

    for (const fly of this.flies) {
      // A collected or escaping fly has left its obstacle: let it finish.
      if (fly.obstacle && fly.state === "idle" && !live.has(fly.obstacle)) this.park(fly);
    }
    for (const tag of this.tags) {
      if (tag.obstacle && !live.has(tag.obstacle)) {
        tag.obstacle = null;
        tag.text.setVisible(false);
      }
    }

    for (const obstacle of obstacles) {
      if (this.attached.has(obstacle)) continue;
      this.attached.add(obstacle);
      this.attach(obstacle);
    }
  }

  /**
   * Places the fireflies in the ring, on the side of the obstacle the gap is
   * on — where the player actually flies. Anything else would bait her into
   * the scenery instead of into the line that scores.
   */
  private attach(obstacle: Obstacle): void {
    const tips = obstacle.shapes.filter(
      (s): s is Extract<typeof s, { type: "circle" }> => s.type === "circle"
    );
    if (tips.length === 0) return;

    const count = Phaser.Math.Between(FIREFLIES.minPerObstacle, FIREFLIES.maxPerObstacle);
    for (let i = 0; i < count; i++) {
      const fly = this.flies.find((f) => f.obstacle === null);
      if (!fly) break; // Pool exhausted: drop the cue rather than allocate.

      const tip = tips[i % tips.length];
      // Which way does the free band lie from this tip?
      const towardsGap = tip.y <= obstacle.gapTop ? 1 : -1;
      const spread = Phaser.Math.FloatBetween(-1, 1) * (Math.PI / 2.6);
      const angle = towardsGap * (Math.PI / 2) + spread;
      const radius =
        obstacle.halfWidth + Phaser.Math.FloatBetween(FIREFLIES.ringMin, FIREFLIES.ringMax);

      fly.obstacle = obstacle;
      fly.ox = Math.cos(angle) * radius;
      fly.oy = tip.y + Math.sin(angle) * radius;
      fly.phase = Math.random() * Math.PI * 2;
      fly.size = Phaser.Math.FloatBetween(FIREFLIES.sizeMin, FIREFLIES.sizeMax);
      fly.state = "idle";
      fly.t = 0;
      fly.img.setVisible(true).setDisplaySize(fly.size, fly.size);
    }

    const tag = this.tags.find((t) => t.obstacle === null);
    if (tag) {
      tag.obstacle = obstacle;
      // On the tip that faces the gap, so the tag sits on the line she flies.
      tag.y = tips[0].y + (tips[0].y <= obstacle.gapTop ? 18 : -18);
      tag.text.setVisible(true).setAlpha(0);
    }
  }

  /** She entered the ring: the fireflies rush into her. */
  collect(obstacle: Obstacle): boolean {
    let any = false;
    for (const fly of this.flies) {
      if (fly.obstacle !== obstacle || fly.state !== "idle") continue;
      fly.state = "collected";
      fly.t = 0;
      fly.fromX = fly.img.x;
      fly.fromY = fly.img.y;
      any = true;
    }
    return any;
  }

  /** Passed without a graze: they drift off and go out. Discreet, never smug. */
  release(obstacle: Obstacle): void {
    for (const fly of this.flies) {
      if (fly.obstacle !== obstacle || fly.state !== "idle") continue;
      fly.state = "escaping";
      fly.t = 0;
      fly.fromX = fly.img.x;
      fly.fromY = fly.img.y;
    }
  }

  private park(fly: Fly): void {
    fly.obstacle = null;
    fly.state = "idle";
    fly.t = 0;
    fly.img.setVisible(false);
  }

  /**
   * @param wx,wy the witch's position — where collected fireflies converge
   * @param multiplier current multiplier, for the value tags
   */
  update(dt: number, time: number, wx: number, wy: number, multiplier: number): void {
    const value = RewardCues.valueAt(multiplier);

    for (const fly of this.flies) {
      if (fly.obstacle === null) continue;
      const img = fly.img;

      if (fly.state === "idle") {
        const t = time / 1000;
        img.x =
          fly.obstacle.x + fly.ox + Math.sin(t * Math.PI * 2 * FIREFLIES.driftHz + fly.phase) * FIREFLIES.driftPx;
        img.y =
          fly.oy + Math.cos(t * Math.PI * 2 * FIREFLIES.driftHz * 0.8 + fly.phase) * FIREFLIES.driftPx;
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * FIREFLIES.pulseHz + fly.phase);
        img.setAlpha(Phaser.Math.Linear(FIREFLIES.alphaIdle, FIREFLIES.alphaPeak, pulse));
        img.setDisplaySize(fly.size, fly.size);
        continue;
      }

      fly.t += dt;

      if (fly.state === "collected") {
        const k = Math.min(1, fly.t / (FIREFLIES.collectMs / 1000));
        // Ease in: it should look pulled, not thrown.
        const e = k * k;
        img.x = Phaser.Math.Linear(fly.fromX, wx, e);
        img.y = Phaser.Math.Linear(fly.fromY, wy, e);
        img.setAlpha(1 - e * 0.6);
        img.setDisplaySize(fly.size * (1 - e * 0.7), fly.size * (1 - e * 0.7));
        if (k >= 1) this.park(fly);
        continue;
      }

      // escaping
      const k = Math.min(1, fly.t / (FIREFLIES.escapeMs / 1000));
      img.x = fly.fromX;
      img.y = fly.fromY - FIREFLIES.escapeRise * k;
      img.setAlpha((1 - k) * FIREFLIES.alphaIdle);
      if (k >= 1) this.park(fly);
    }

    for (const tag of this.tags) {
      const obstacle = tag.obstacle;
      if (obstacle === null) continue;
      // Once earned, the promise has been kept: stop advertising it.
      if (obstacle.grazed || obstacle.passed) {
        tag.text.setVisible(false);
        continue;
      }
      const dx = obstacle.x - wx;
      const k = Phaser.Math.Clamp(
        (VALUE_TAG.fadeInFromX - dx) / (VALUE_TAG.fadeInFromX - VALUE_TAG.fullAtX),
        0,
        1
      );
      tag.text
        .setVisible(dx > 0)
        .setText(`+${value}`)
        .setPosition(obstacle.x + VALUE_TAG.offsetX, tag.y)
        .setAlpha(Phaser.Math.Linear(VALUE_TAG.alphaMin, VALUE_TAG.alphaMax, k));
    }
  }

  /** Instant restart: everything back to the pool, nothing carried over. */
  reset(): void {
    for (const fly of this.flies) this.park(fly);
    for (const tag of this.tags) {
      tag.obstacle = null;
      tag.text.setVisible(false);
    }
  }

  /** Test hook: how much of the pool is currently in use. */
  get inUse(): { flies: number; tags: number } {
    return {
      flies: this.flies.filter((f) => f.obstacle !== null).length,
      tags: this.tags.filter((t) => t.obstacle !== null).length
    };
  }
}

// --- Guard rail (dev only): fireflies must float INSIDE the graze ring.
// Outside it they would advertise a reward that is not there; closer than the
// lethal radius they would bait the player into dying.
if (import.meta.env.DEV) {
  if (FIREFLIES.ringMin <= NEAR_MISS.deathRadius || FIREFLIES.ringMax >= NEAR_MISS.grazeRadius) {
    throw new Error(
      `FIREFLIES ring [${FIREFLIES.ringMin}, ${FIREFLIES.ringMax}] must sit strictly inside ` +
        `the graze ring (${NEAR_MISS.deathRadius}, ${NEAR_MISS.grazeRadius}).`
    );
  }
}
