import Phaser from "phaser";
import { PERCEE, WITCH, WORLD } from "./config";
import { LIGHT_KEY, SPARK_KEY } from "./textures";

/**
 * La Percée — the personal record made into a PLACE.
 *
 * The record is a duration, so the marker stands at that exact moment of the
 * run: an arch of frozen fireflies and moonlight spanning the screen. It is
 * PURELY VISUAL — no collision shape, no scoring, no effect on generation.
 * The player can fly straight through it; that is the point.
 *
 * It is positioned by TIME, not spawned like an obstacle:
 *
 *     x = WITCH.x + (perceeTime - runDuration) * scrollSpeed
 *
 * so it lands on the witch at exactly `perceeTime` whatever the scroll speed is
 * doing — tier transitions, the adaptive easing and GLOBAL_SPEED all change it
 * mid-run, and a marker spawned once at a fixed distance would drift off the
 * record it is supposed to represent.
 */
export class PerceeMarker {
  private readonly container: Phaser.GameObjects.Container;
  private readonly column: Phaser.GameObjects.Image;
  private readonly lights: Phaser.GameObjects.Image[] = [];
  private readonly burstEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private visible = false;

  constructor(scene: Phaser.Scene, depth: number) {
    // Moonlight column: a soft vertical shaft, additive so it lights the sky
    // without ever darkening what is behind it.
    this.column = scene.add
      .image(0, WORLD.height / 2, LIGHT_KEY)
      .setDisplaySize(PERCEE.archWidth * 2.2, WORLD.height)
      .setTint(PERCEE.archColor)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD);

    // The arch itself: fireflies held still, bowed across the full height.
    for (let i = 0; i < PERCEE.archFireflies; i++) {
      const k = i / (PERCEE.archFireflies - 1);
      const y = k * WORLD.height;
      const x = Math.sin(k * Math.PI) * PERCEE.archWidth;
      const light = scene.add
        .image(x, y, SPARK_KEY)
        .setDisplaySize(11, 11)
        .setTint(PERCEE.archGlowColor)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.lights.push(light);
    }

    this.container = scene.add
      .container(WORLD.width * 2, 0, [this.column, ...this.lights])
      .setDepth(depth)
      .setVisible(false);

    this.burstEmitter = scene.add.particles(0, 0, SPARK_KEY, {
      speed: { min: 80, max: 320 },
      lifespan: 900,
      scale: 0.45,
      alpha: { start: 0.95, end: 0 },
      tint: PERCEE.archGlowColor,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false
    });
    this.burstEmitter.setDepth(depth);
  }

  get x(): number {
    return this.container.x;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /**
   * @param perceeTime run seconds where the marker stands; 0 = no record yet,
   *                   in which case nothing is shown and nothing is hinted at
   * @param tension    0 outside the approach, 1 at the marker
   */
  update(
    runDuration: number,
    perceeTime: number,
    scrollSpeed: number,
    time: number,
    tension: number
  ): void {
    if (perceeTime <= 0) {
      this.hide();
      return;
    }

    const x = WITCH.x + (perceeTime - runDuration) * scrollSpeed;
    // Only draw it while it can actually be seen; off-screen it costs nothing.
    if (x < -PERCEE.archWidth * 3 || x > WORLD.width + PERCEE.archWidth * 6) {
      this.hide();
      return;
    }

    this.container.x = x;
    if (!this.visible) {
      this.visible = true;
      this.container.setVisible(true);
    }

    // The arch brightens as it nears, and breathes very slowly: frozen, not
    // dead. Tension pushes it further still.
    const breathe = 0.5 + 0.5 * Math.sin(time / 620);
    const near = Phaser.Math.Clamp(1 - (x - WITCH.x) / (WORLD.width * 1.2), 0, 1);
    const intensity = Phaser.Math.Linear(0.35, 1, Math.max(near, tension));
    this.column.setAlpha(0.18 + 0.34 * intensity);
    for (let i = 0; i < this.lights.length; i++) {
      const phase = breathe * 0.35 + (i % 3) * 0.12;
      this.lights[i].setAlpha(Phaser.Math.Clamp(0.45 + phase * intensity, 0, 1));
      const size = 9 + 5 * intensity;
      this.lights[i].setDisplaySize(size, size);
    }
  }

  /** Crossed: the arch bursts into fireflies and leaves the screen. */
  burst(): void {
    if (this.visible) {
      for (const light of this.lights) {
        this.burstEmitter.emitParticleAt(
          this.container.x + light.x,
          light.y,
          Math.max(1, Math.round(PERCEE.archBurst / this.lights.length))
        );
      }
    }
    this.hide();
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.container.setVisible(false);
  }

  reset(): void {
    this.hide();
    this.container.x = WORLD.width * 2;
    this.burstEmitter.killAll();
  }

  destroy(): void {
    this.container.destroy();
    this.burstEmitter.destroy();
  }
}

/**
 * Tension in the four seconds before the marker: 0 outside, 1 at the marker,
 * back to 0 once it is behind. Everything it drives is atmosphere only — the
 * readability invariant forbids it from touching obstacles or their halos.
 */
export function perceeTension(runDuration: number, perceeTime: number): number {
  if (perceeTime <= 0) return 0;
  const remaining = perceeTime - runDuration;
  if (remaining <= 0 || remaining > PERCEE.approach) return 0;
  return 1 - remaining / PERCEE.approach;
}

/** Firefly drift towards the marker while the tension builds, in px/s. */
export function perceeDrift(tension: number): number {
  return tension * PERCEE.tensionDrift;
}
