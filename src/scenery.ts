import Phaser from "phaser";
import { MOON, SCENERY, WORLD } from "./config";
import { LIGHT_KEY, SPARK_KEY, ensureTextures } from "./textures";

/**
 * Background scenery, shared by the flight scene, the home screen and the
 * death screen: star field, textured moon, parallax treelines, ground mist.
 *
 * Everything here is SCENERY under the readability invariant: the caller must
 * keep it below the darkness overlay and the gameplay layer. All art is drawn
 * once at boot into canvas textures, in WHITE, and coloured with tints — so a
 * tier change or the magic cooling never redraws a pixel, it just retints.
 */

export const STARFIELD_KEY = "scenery-stars";
export const MOON_KEY = "scenery-moon";
const TREELINE_FAR_KEY = "scenery-treeline-far";
const TREELINE_NEAR_KEY = "scenery-treeline-near";
const MIST_KEY = "scenery-mist";

/** Small deterministic RNG (mulberry32): same seed, same night, every boot. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Perceived luminance of a 0xRRGGBB colour, 0-1. */
export function luminance(color: number): number {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mixColor(from: number, to: number, t: number): number {
  return Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(from),
    Phaser.Display.Color.ValueToColor(to),
    255,
    Math.round(255 * Phaser.Math.Clamp(t, 0, 1))
  ).color;
}

function createStarfieldTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(STARFIELD_KEY)) return;
  const height = Math.round(WORLD.height * SCENERY.stars.bandFraction);
  const texture = scene.textures.createCanvas(STARFIELD_KEY, WORLD.width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  const rand = rng(SCENERY.seed);

  for (let i = 0; i < SCENERY.stars.count; i++) {
    const x = rand() * WORLD.width;
    // Denser towards the top: the square biases the draw upward.
    const y = rand() * rand() * height;
    const radius = 0.4 + rand() * 0.9;
    const alpha = 0.25 + rand() * 0.75;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.fill();
  }
  texture.refresh();
}

function createMoonTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(MOON_KEY)) return;
  const r = SCENERY.moon.radius;
  const size = r * 2 + 4;
  const texture = scene.textures.createCanvas(MOON_KEY, size, size);
  if (!texture) return;
  const ctx = texture.getContext();
  const rand = rng(SCENERY.seed ^ 0x5f3759df);
  const c = size / 2;

  // White base disc: the scenes tint it (cream idle, blue-grey when cooled).
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Craters: faint darker discs, clipped to the face, kept off the exact rim.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r - 1, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < SCENERY.moon.craterCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * (r - SCENERY.moon.craterMaxR - 2);
    const cr =
      SCENERY.moon.craterMinR + rand() * (SCENERY.moon.craterMaxR - SCENERY.moon.craterMinR);
    const x = c + Math.cos(angle) * dist;
    const y = c + Math.sin(angle) * dist;
    ctx.beginPath();
    ctx.arc(x, y, cr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${SCENERY.moon.craterAlpha})`;
    ctx.fill();
    // A hair of light on the crater's moonward edge keeps it readable.
    ctx.beginPath();
    ctx.arc(x - cr * 0.15, y - cr * 0.15, cr, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Soft limb shading away from the scene: the face stays flat enough to
  // read as the old plain disc at a glance, just no longer sterile.
  const limb = ctx.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.2, c, c, r);
  limb.addColorStop(0, "rgba(0,0,0,0)");
  limb.addColorStop(1, "rgba(0,0,0,0.10)");
  ctx.fillStyle = limb;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  texture.refresh();
}

/**
 * A tileable forest skyline: filled from the bottom, jagged conifer spikes on
 * top of a rolling ridge. The ridge is sampled from wrapped control points so
 * column 0 and column `width` line up exactly — a TileSprite can loop it
 * forever with no seam.
 */
function createTreelineTexture(scene: Phaser.Scene, key: string, height: number, seed: number): void {
  if (scene.textures.exists(key)) return;
  const width = WORLD.width;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  const rand = rng(seed);

  // Rolling ridge: cosine-interpolated wrapped control points.
  const points = 8;
  const ridge: number[] = [];
  for (let i = 0; i < points; i++) ridge.push(0.35 + rand() * 0.4);
  const ridgeAt = (x: number): number => {
    const f = (x / width) * points;
    const i = Math.floor(f) % points;
    const j = (i + 1) % points;
    const t = f - Math.floor(f);
    const s = (1 - Math.cos(t * Math.PI)) / 2;
    return ridge[i] * (1 - s) + ridge[j] * s;
  };

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, height);

  // Conifer spikes ride on the ridge. Their rhythm is seeded but their width
  // divides the texture exactly, so the last spike meets the first. Heights
  // vary a lot — every fourth tree or so shoots up — because an even sawtooth
  // reads as a zigzag pattern, not a forest.
  const spikes = 20;
  const step = width / spikes;
  for (let i = 0; i <= spikes; i++) {
    const x = i * step;
    const base = ridgeAt(x) * height;
    const tall = rand() < 0.28;
    const spikeH = ((tall ? 0.34 : 0.1) + rand() * (tall ? 0.34 : 0.2)) * height;
    ctx.lineTo(x, height - base);
    if (i < spikes) {
      ctx.lineTo(x + step * (0.3 + rand() * 0.2), height - base - spikeH);
      ctx.lineTo(x + step * 0.72, height - ridgeAt(x + step * 0.72) * height);
    }
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  texture.refresh();
}

/** Soft horizontal mist band: overlapping white blobs, hard-wrap safe. */
function createMistTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(MIST_KEY)) return;
  const width = 256;
  const height = 64;
  const texture = scene.textures.createCanvas(MIST_KEY, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  const rand = rng(SCENERY.seed ^ 0x9e3779b9);

  const blobs = 10;
  for (let i = 0; i < blobs; i++) {
    const x = rand() * width;
    const y = height * (0.3 + rand() * 0.4);
    const rx = 40 + rand() * 60;
    const ry = 10 + rand() * 14;
    // Drawn twice, offset by the full width, so the tile wraps seamlessly.
    for (const ox of [0, x < width / 2 ? width : -width]) {
      const grad = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, rx);
      grad.addColorStop(0, "rgba(255,255,255,0.5)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.translate(x + ox, y);
      ctx.scale(1, ry / rx);
      ctx.translate(-(x + ox), -y);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x + ox, y, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  texture.refresh();
}

/** Generate every scenery texture. Idempotent, call from any create(). */
export function ensureSceneryTextures(scene: Phaser.Scene): void {
  createStarfieldTexture(scene);
  createMoonTexture(scene);
  createTreelineTexture(scene, TREELINE_FAR_KEY, SCENERY.treeline.far.height, SCENERY.seed ^ 1);
  createTreelineTexture(scene, TREELINE_NEAR_KEY, SCENERY.treeline.near.height, SCENERY.seed ^ 2);
  createMistTexture(scene);
}

type Twinkle = { image: Phaser.GameObjects.Image; phase: number; hz: number; base: number };
type MistBand = { tile: Phaser.GameObjects.TileSprite; parallax: number; driftPxS: number };

/**
 * The living background: add it right after the sky gradient so its pieces
 * render above the sky and below everything the scene adds later (moon,
 * ambient dust, darkness overlay, gameplay).
 *
 * `update(dt, scrollSpeed)` scrolls the parallax layers; `setMood(top,
 * bottom)` retints everything from the current (already cooled) sky colours.
 */
export class NightScenery {
  private readonly stars: Phaser.GameObjects.Image;
  private readonly twinkles: Twinkle[] = [];
  private readonly treeFar: Phaser.GameObjects.TileSprite;
  private readonly treeNear: Phaser.GameObjects.TileSprite;
  private readonly mists: MistBand[] = [];
  private starMood = 1;

  constructor(scene: Phaser.Scene) {
    ensureSceneryTextures(scene);
    ensureTextures(scene); // twinkles reuse the spark texture
    const rand = rng(SCENERY.seed ^ 0xabcdef);

    this.stars = scene.add
      .image(0, 0, STARFIELD_KEY)
      .setOrigin(0, 0)
      .setAlpha(SCENERY.stars.alpha);

    // A few stars twinkle for real: tiny spark sprites over the static field.
    const bandHeight = WORLD.height * SCENERY.stars.bandFraction;
    for (let i = 0; i < SCENERY.stars.twinkleCount; i++) {
      const base = 0.3 + rand() * 0.5;
      const image = scene.add
        .image(rand() * WORLD.width, rand() * rand() * bandHeight, SPARK_KEY)
        .setScale(SCENERY.stars.twinkleScale)
        .setAlpha(base * 0.55)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.twinkles.push({
        image,
        phase: rand() * Math.PI * 2,
        hz: SCENERY.stars.twinkleMinHz + rand() * (SCENERY.stars.twinkleMaxHz - SCENERY.stars.twinkleMinHz),
        base
      });
    }

    this.treeFar = scene.add
      .tileSprite(0, WORLD.height, WORLD.width, SCENERY.treeline.far.height, TREELINE_FAR_KEY)
      .setOrigin(0, 1)
      .setAlpha(SCENERY.treeline.far.alpha);
    this.treeNear = scene.add
      .tileSprite(0, WORLD.height, WORLD.width, SCENERY.treeline.near.height, TREELINE_NEAR_KEY)
      .setOrigin(0, 1)
      .setAlpha(SCENERY.treeline.near.alpha);

    for (const band of SCENERY.mist.bands) {
      const tile = scene.add
        .tileSprite(0, WORLD.height * band.y, WORLD.width, band.height, MIST_KEY)
        .setOrigin(0, 0.5)
        .setAlpha(band.alpha);
      this.mists.push({ tile, parallax: band.parallax, driftPxS: band.driftPxS });
    }
  }

  /** Advance the parallax and the twinkles. `scrollSpeed` in world px/s. */
  update(dt: number, scrollSpeed: number): void {
    this.treeFar.tilePositionX += scrollSpeed * SCENERY.treeline.far.parallax * dt;
    this.treeNear.tilePositionX += scrollSpeed * SCENERY.treeline.near.parallax * dt;
    for (const mist of this.mists) {
      mist.tile.tilePositionX += (scrollSpeed * mist.parallax + mist.driftPxS) * dt;
    }
    for (const star of this.twinkles) {
      star.phase += star.hz * Math.PI * 2 * dt;
      star.image.setAlpha(this.starMood * star.base * (0.55 + 0.45 * Math.sin(star.phase)));
    }
  }

  /** Every display object, in paint order. */
  private get objects(): Phaser.GameObjects.GameObject[] {
    return [
      this.stars,
      ...this.twinkles.map((star) => star.image),
      this.treeFar,
      this.treeNear,
      ...this.mists.map((mist) => mist.tile)
    ];
  }

  /** One depth for the whole background (the death screen layers by depth). */
  setDepth(depth: number): this {
    for (const piece of this.objects) (piece as Phaser.GameObjects.Image).setDepth(depth);
    return this;
  }

  setVisible(visible: boolean): this {
    for (const piece of this.objects) (piece as Phaser.GameObjects.Image).setVisible(visible);
    return this;
  }

  /**
   * Retint from the sky in force this frame (cooled colours included). Stars
   * fade out as the sky-top brightens — on The Moon's Eye's pale gold they
   * would read as debris, not stars.
   */
  setMood(skyTop: number, skyBottom: number): void {
    const lum = luminance(skyTop);
    this.starMood =
      1 -
      Phaser.Math.Clamp(
        (lum - SCENERY.stars.fadeLumStart) / (SCENERY.stars.fadeLumEnd - SCENERY.stars.fadeLumStart),
        0,
        1
      );
    this.stars.setAlpha(SCENERY.stars.alpha * this.starMood);

    const dark = SCENERY.treeline.darkColor;
    this.treeFar.setTint(mixColor(skyBottom, dark, SCENERY.treeline.far.mix));
    this.treeNear.setTint(mixColor(skyBottom, dark, SCENERY.treeline.near.mix));
    const mistTint = mixColor(skyBottom, 0xffffff, SCENERY.mist.lightMix);
    for (const mist of this.mists) mist.tile.setTint(mistTint);
  }
}

/** The textured moon + its idle halo, replacing the flat cream circle. */
export function addMoon(
  scene: Phaser.Scene,
  tint: number,
  depth?: number
): { moon: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image } {
  ensureSceneryTextures(scene);
  ensureTextures(scene);
  const glow = scene.add
    .image(MOON.x, MOON.y, LIGHT_KEY)
    .setDisplaySize(SCENERY.moon.idleGlowSize, SCENERY.moon.idleGlowSize)
    .setTint(tint)
    .setAlpha(SCENERY.moon.idleGlowAlpha)
    .setBlendMode(Phaser.BlendModes.ADD);
  const moon = scene.add.image(MOON.x, MOON.y, MOON_KEY).setTint(tint).setAlpha(0.9);
  if (depth !== undefined) {
    glow.setDepth(depth);
    moon.setDepth(depth);
  }
  return { moon, glow };
}
