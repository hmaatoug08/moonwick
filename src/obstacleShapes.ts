import Phaser from "phaser";
import { MOON, NEAR_MISS, OBSTACLE_ART, OBSTACLES, WORLD } from "./config";

/**
 * Procedural obstacle silhouettes, generated once at boot into a cached
 * RenderTexture atlas. No external assets, no per-obstacle geometry work.
 *
 * THE RULE THAT DRIVES THIS FILE: the drawn shape must CONTAIN the collision
 * capsule. Collision stays what it always was — one rectangle plus one rounded
 * tip per part, in obstacles.ts — and the art is built around it.
 *
 * Everything here is measured in COLLISION RADII, with y counted from the
 * anchored end (the screen edge) and x from the capsule's axis, so the
 * guarantee survives any scaling. Two things would break it, and both are
 * handled where the profile is built:
 *
 *  - narrowing: the spindle is clamped so the half-width never drops below a
 *    radius (and, in the tip, below the rounded cap's own outline);
 *  - CURVATURE: the centreline bows sideways while the hitbox stays a straight
 *    bar on the axis. A bow of `cx` therefore has to be paid for with `cx`
 *    extra half-width, otherwise the side opposite the bow would expose the
 *    hitbox. `coverFloor()` is the single place that arbitrates this.
 *
 * The visual may overshoot the hitbox; it can never fall inside it.
 */

export type Essence = "birch" | "gnarled" | "bramble" | "denseStand";
export const ESSENCES: readonly Essence[] = ["birch", "gnarled", "bramble", "denseStand"];

export const SHAPE_TEXTURE = "obstacle-silhouettes";

/** Frame naming: one shaft and one tip, per layer, per essence, per variant. */
export function frameName(
  layer: "body" | "rim",
  essence: Essence,
  variant: number,
  zone: "shaft" | "tip"
): string {
  return `${layer}-${essence}-${variant}-${zone}`;
}

/** Small deterministic PRNG, so a given seed always rebuilds the same forest. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Traits = {
  /** Higher = the spindle narrows sooner. Never 0, so width is never constant. */
  taper: number;
  /** Sideways bow of the centreline, in radii. Never 0, so never a straight line. */
  curve: number;
  /** Contour noise amplitude, as a fraction of the local half-width. */
  jitter: number;
  /** Rounded swellings along the shaft. */
  knots: number;
  /** Outward thorns. */
  barbs: number;
  /** How the far end finishes — never a straight cut. */
  termination: "point" | "fork" | "break";
};

/**
 * Curvature is the expensive trait: a bow of `cx` also forces `cx` of extra
 * half-width to keep covering the straight hitbox (see `coverFloor`), so it
 * costs twice over against the graze-halo budget asserted below. Keep it
 * modest and let taper, knots and barbs carry the character.
 */
const TRAITS: Record<Essence, Traits> = {
  // Birches: slim, tall, barely tapering, almost unbranched.
  birch: { taper: 0.7, curve: 0.25, jitter: 0.05, knots: 0, barbs: 0, termination: "point" },
  // Gnarled trunks: massive, irregular, knotted, snapped off.
  gnarled: { taper: 1.4, curve: 0.35, jitter: 0.16, knots: 4, barbs: 0, termination: "break" },
  // Brambles: thin, curved, covered in thorns, forking.
  bramble: { taper: 2.2, curve: 0.45, jitter: 0.12, knots: 0, barbs: 10, termination: "fork" },
  // Dense stand: heavy verticals, little curve, blunt broken tops.
  denseStand: { taper: 0.45, curve: 0.15, jitter: 0.07, knots: 2, barbs: 0, termination: "break" }
};

/** One contour sample: centreline offset and half-width, both in radii. */
type Sample = { y: number; cx: number; hw: number };
/** Decorations, in radii. They only ever ADD material. */
type Tri = { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number };
type Disc = { x: number; y: number; r: number };

type Silhouette = { shaft: Sample[]; tip: Sample[]; tris: Tri[]; discs: Disc[] };

const SHAFT_SAMPLES = 26;
const TIP_SAMPLES = 18;
/** Where the collision capsule's straight part ends, inside the tip zone. */
const CAP_END = 2;

/**
 * Minimum half-width that still contains the hitbox at a given point.
 * `axisReach` is how far the hitbox extends from the axis there: one radius
 * along the straight part, then the rounded cap's outline, then nothing.
 * The bow `cx` is added because the shape is offset while the hitbox is not.
 */
function coverFloor(axisReach: number, cx: number): number {
  return axisReach <= 0 ? 0 : axisReach + Math.abs(cx) + OBSTACLE_ART.coverMargin;
}

/**
 * Shaft profile, from the anchored base (y = 0) to the start of the tip zone.
 */
function buildShaft(traits: Traits, rnd: () => number): Sample[] {
  const { baseFactor, tipFactor, anchorFactor, anchorZone, shaftUnits } = OBSTACLE_ART;
  const curveSign = rnd() < 0.5 ? -1 : 1;
  const curveAmount = traits.curve * (0.6 + rnd() * 0.8);
  const knotAt = Array.from({ length: traits.knots }, () => 0.15 + rnd() * 0.7);

  const samples: Sample[] = [];
  for (let i = 0; i < SHAFT_SAMPLES; i++) {
    const k = i / (SHAFT_SAMPLES - 1);

    // Spindle: always decreasing, never a constant width.
    let hw = tipFactor + (baseFactor - tipFactor) * Math.pow(1 - k, traits.taper);

    // Anchoring: a widened footing where the obstacle meets the screen edge.
    if (k < anchorZone) {
      const t = 1 - k / anchorZone;
      hw += anchorFactor * t * t;
    }

    // Knots: local swellings.
    for (const at of knotAt) {
      const d = (k - at) / 0.07;
      hw += 0.3 * Math.exp(-d * d);
    }

    // Contour noise.
    hw *= 1 + (rnd() - 0.5) * 2 * traits.jitter;

    // Curvature: a gentle arc, strongest near the tip.
    const cx = curveSign * curveAmount * Math.sin(k * Math.PI * 0.62);

    // The clamp that protects the collision shape (see the file header).
    hw = Math.max(hw, coverFloor(1, cx), tipFactor);

    samples.push({ y: k * shaftUnits, cx, hw });
  }
  return samples;
}

/**
 * Tip profile, continuing from the shaft's last sample. The collision capsule
 * ends CAP_END radii into this zone and is closed by a rounded cap of radius 1.
 */
function buildTip(traits: Traits, rnd: () => number, from: Sample): Sample[] {
  const { tipUnits, shaftUnits } = OBSTACLE_ART;
  const samples: Sample[] = [];

  // TERMINATION, and why it is shaped sideways rather than lengthways.
  // Every tip faces the gap the player flies through, so overshooting the
  // hitbox lengthways would visually close a passage that is actually open —
  // at the last tiers a single radius per side would eat a fifth of the hole.
  // The end therefore stays flush, and "never a straight cut" is obtained by
  // making it RAGGED and OFF-CENTRE instead of long: a slanted apex, plus
  // outward bumps over the cap. Both only add width, which costs nothing to
  // the gap (it is measured along the other axis).
  const slant = (rnd() - 0.5) * 0.9;
  const roughSeed = rnd() * 10;

  for (let i = 0; i < TIP_SAMPLES; i++) {
    const k = i / (TIP_SAMPLES - 1);
    const local = k * tipUnits;

    // Art: narrow towards the far end, with a little noise.
    let hw = from.hw * (1 - k) ** 1.1;
    hw *= 1 + (rnd() - 0.5) * 2 * traits.jitter;

    // Slanted apex: the centreline drifts as the end approaches, so the shape
    // finishes off to one side instead of as a symmetric dome.
    const cx = from.cx * (1 + k * 0.35) + slant * k * k;

    // How far the hitbox still reaches from the axis at this height. The cap is
    // inflated by the safety margin rather than taken at its exact radius: at
    // the apex the limiting direction is ALONG the axis, not across it, so a
    // purely lateral margin would leave the last pixel or two of the rounded
    // end under an antialiased edge instead of solid black.
    const capR = 1 + OBSTACLE_ART.coverMargin;
    let axisReach = 0;
    if (local <= CAP_END) axisReach = 1;
    else if (local <= CAP_END + capR)
      axisReach = Math.sqrt(Math.max(0, capR ** 2 - (local - CAP_END) ** 2));
    hw = Math.max(hw, coverFloor(axisReach, cx));

    // Raggedness over the rounded cap, where the profile would otherwise be a
    // clean dome. Purely outward, so the coverage floor still holds.
    if (local > CAP_END * 0.6) {
      const n = Math.sin(roughSeed + k * 21.7) * Math.sin(roughSeed * 1.7 + k * 13.1);
      hw += Math.max(0, n) * 0.34;
    }

    samples.push({ y: shaftUnits + local, cx, hw });
  }
  return samples;
}

/**
 * Thorns, knot lumps and the terminations. Purely additive, so they can never
 * break the coverage guarantee — they are measured, not clamped.
 */
function buildDecorations(traits: Traits, rnd: () => number, all: Sample[], tip: Sample[]) {
  const tris: Tri[] = [];
  const discs: Disc[] = [];

  for (let i = 0; i < traits.barbs; i++) {
    const s = all[Math.floor(rnd() * (all.length - 2)) + 1];
    const side = rnd() < 0.5 ? -1 : 1;
    const rootX = s.cx + side * s.hw;
    const len = 0.28 + rnd() * 0.42;
    const rise = 0.3 + rnd() * 0.4;
    tris.push({
      x1: rootX,
      y1: s.y - rise * 0.5,
      x2: rootX,
      y2: s.y + rise * 0.5,
      x3: rootX + side * len,
      y3: s.y + rise * (0.4 + rnd() * 0.8)
    });
  }

  for (let i = 0; i < traits.knots; i++) {
    const s = all[Math.floor(rnd() * all.length)];
    discs.push({
      x: s.cx + (rnd() - 0.5) * s.hw,
      y: s.y,
      r: 0.3 + rnd() * 0.3
    });
  }

  // Termination: the far end is never a straight cut. The prongs grow SIDEWAYS
  // from the outer contour near the end (see buildTip): growing them lengthways
  // would visually close the gap the tip faces.
  const last = tip[tip.length - 1];
  const near = tip[Math.floor(tip.length * 0.78)];
  if (traits.termination === "fork") {
    for (const side of [-1, 1]) {
      const root = near.cx + side * near.hw * 0.7;
      tris.push({
        x1: root,
        y1: near.y - 0.5,
        x2: root,
        y2: near.y + 0.4,
        x3: root + side * (0.45 + rnd() * 0.5),
        y3: last.y - rnd() * 0.5
      });
    }
  } else if (traits.termination === "break") {
    // A snapped end: two uneven splinters off the shoulders.
    for (const side of [-1, 1]) {
      const root = near.cx + side * near.hw * 0.6;
      tris.push({
        x1: root,
        y1: near.y - 0.7 - rnd() * 0.5,
        x2: root + side * (0.3 + rnd() * 0.45),
        y2: near.y + 0.1 + rnd() * 0.4,
        x3: root - side * 0.2,
        y3: near.y + 0.5
      });
    }
  }

  return { tris, discs };
}

function buildSilhouette(essence: Essence, variant: number): Silhouette {
  const traits = TRAITS[essence];
  const essenceIndex = ESSENCES.indexOf(essence);
  // One seed per (essence, variant): different contour noise every time, but
  // stable across reloads.
  const rnd = mulberry32(OBSTACLE_ART.seed + essenceIndex * 977 + variant * 131);
  const shaft = buildShaft(traits, rnd);
  const tip = buildTip(traits, rnd, shaft[shaft.length - 1]);
  const { tris, discs } = buildDecorations(traits, rnd, [...shaft, ...tip], tip);
  return { shaft, tip, tris, discs };
}

/**
 * Every silhouette, generated at module load. Pure maths — no Phaser — so the
 * atlas can be sized from the shapes that actually exist rather than from a
 * guessed margin that a curvier essence would later overflow.
 */
const SILHOUETTES: Silhouette[] = [];
for (const essence of ESSENCES) {
  for (let variant = 0; variant < OBSTACLE_ART.variantsPerEssence; variant++) {
    SILHOUETTES.push(buildSilhouette(essence, variant));
  }
}

/** Widest horizontal reach over all shapes, decorations and rim included. */
const MAX_EXTENT_UNITS = (() => {
  let max = 0;
  for (const s of SILHOUETTES) {
    for (const sample of [...s.shaft, ...s.tip]) {
      max = Math.max(max, Math.abs(sample.cx) + sample.hw);
    }
    for (const t of s.tris) max = Math.max(max, Math.abs(t.x1), Math.abs(t.x2), Math.abs(t.x3));
    for (const d of s.discs) max = Math.max(max, Math.abs(d.x) + d.r);
  }
  return max + OBSTACLE_ART.rimWidthUnits;
})();

// Atlas cell geometry. Pixel sizes are rounded up, so the exact unit values are
// derived back from them: callers scale by SHAPE_METRICS and never by the raw
// config, otherwise the rounding would shift the art off its collision shape.
const CELL_HALF_WIDTH_PX = Math.ceil(MAX_EXTENT_UNITS * OBSTACLE_ART.unitPx);
const CELL_WIDTH_PX = CELL_HALF_WIDTH_PX * 2;
const SHAFT_HEIGHT_PX = Math.ceil(OBSTACLE_ART.shaftUnits * OBSTACLE_ART.unitPx);
const TIP_HEIGHT_PX = Math.ceil(OBSTACLE_ART.tipUnits * OBSTACLE_ART.unitPx);
const CELL_HEIGHT_PX = SHAFT_HEIGHT_PX + TIP_HEIGHT_PX;

/**
 * Placement geometry, in collision radii. `tipStartBeforeEnd` is where the tip
 * frame begins relative to the collision end: the tip is drawn at a FIXED pixel
 * scale from there, so its overshoot past the hitbox stays bounded whatever the
 * obstacle's length.
 */
export const SHAPE_METRICS = {
  halfWidthUnits: CELL_HALF_WIDTH_PX / OBSTACLE_ART.unitPx,
  tipUnits: TIP_HEIGHT_PX / OBSTACLE_ART.unitPx,
  tipStartBeforeEnd: CAP_END
} as const;

/**
 * SINGLE LIGHT DIRECTION. The moon is the scene's only light source, so every
 * obstacle is rimmed on the side that faces it — never per-obstacle, never
 * depending on where the obstacle currently is on screen. Obstacles scroll
 * past, the moon does not, so one shared side keeps the lighting coherent.
 *
 * The rim is baked on the +x contour; when the moon sits on the other half of
 * the screen the sprites are mirrored, which carries body and rim together.
 * Move MOON.x across the centre and the whole forest relights itself.
 */
export const MOON_ON_RIGHT = MOON.x >= WORLD.width / 2;

// --- Guard rail (dev only): the art must stay inside its own graze halo.
// The halo is the collision capsule dilated by NEAR_MISS.grazeRadius, and
// CLAUDE.md makes it the main teacher of the rule: a silhouette drawn wider
// than its halo would show obstacle where the game scores nothing, and the
// ring would stop reading as a ring. Trunks are the binding case (widest cap,
// so the fewest radii of headroom).
if (import.meta.env.DEV) {
  const cap = Math.max(OBSTACLES.branch.width, OBSTACLES.trunk.width) / 2;
  const allowed = (cap + NEAR_MISS.grazeRadius) / cap;
  if (MAX_EXTENT_UNITS > allowed) {
    throw new Error(
      `OBSTACLE_ART: silhouettes reach ${MAX_EXTENT_UNITS.toFixed(2)} collision radii, ` +
        `beyond the ${allowed.toFixed(2)} covered by the graze halo. ` +
        `Lower baseFactor / anchorFactor / curve / barbs.`
    );
  }
}

/** Units -> texture pixels, with the cell's origin at its bottom centre. */
function px(x: number, y: number, bottomY: number): { x: number; y: number } {
  return {
    x: CELL_HALF_WIDTH_PX + x * OBSTACLE_ART.unitPx,
    y: bottomY - y * OBSTACLE_ART.unitPx
  };
}

/** Closed outline of a sample run: up the left side, back down the right. */
function outline(samples: Sample[], bottomY: number): Phaser.Types.Math.Vector2Like[] {
  const left = samples.map((s) => px(s.cx - s.hw, s.y, bottomY));
  const right = samples.map((s) => px(s.cx + s.hw, s.y, bottomY)).reverse();
  return [...left, ...right];
}

/**
 * Builds the atlas once. Cells are laid out as a grid: one column per variant,
 * two rows per essence (body, then rim).
 */
export function ensureObstacleTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(SHAPE_TEXTURE)) return;

  const { variantsPerEssence, unitPx } = OBSTACLE_ART;
  const bottomY = CELL_HEIGHT_PX;

  const rt = scene.add.renderTexture(
    0,
    0,
    CELL_WIDTH_PX * variantsPerEssence,
    CELL_HEIGHT_PX * ESSENCES.length * 2
  );
  rt.setVisible(false);

  const pen = scene.make.graphics({}, false);

  ESSENCES.forEach((essence, essenceIndex) => {
    for (let variant = 0; variant < variantsPerEssence; variant++) {
      const shape = SILHOUETTES[essenceIndex * variantsPerEssence + variant];
      const all = [...shape.shaft, ...shape.tip];

      // --- Body layer: the covering silhouette, plus additive decorations.
      pen.clear();
      pen.fillStyle(0xffffff, 1);
      pen.fillPoints(outline(all, bottomY), true);
      for (const t of shape.tris) {
        const a = px(t.x1, t.y1, bottomY);
        const b = px(t.x2, t.y2, bottomY);
        const c = px(t.x3, t.y3, bottomY);
        pen.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
      }
      for (const d of shape.discs) {
        const c = px(d.x, d.y, bottomY);
        pen.fillCircle(c.x, c.y, d.r * unitPx);
      }
      rt.draw(pen, variant * CELL_WIDTH_PX, essenceIndex * 2 * CELL_HEIGHT_PX);

      // --- Rim layer: the moon-facing (+x) contour, on its own layer so its
      // opacity can rise as the scene darkens.
      pen.clear();
      pen.lineStyle(Math.max(2, OBSTACLE_ART.rimWidthUnits * unitPx), 0xffffff, 1);
      pen.strokePoints(
        all.map((s) => px(s.cx + s.hw, s.y, bottomY)),
        false
      );
      rt.draw(pen, variant * CELL_WIDTH_PX, (essenceIndex * 2 + 1) * CELL_HEIGHT_PX);
    }
  });

  pen.destroy();

  // Register the frames, then drop the RenderTexture game object: the GPU
  // texture it produced stays alive under SHAPE_TEXTURE.
  rt.saveTexture(SHAPE_TEXTURE);
  const texture = scene.textures.get(SHAPE_TEXTURE);
  ESSENCES.forEach((essence, essenceIndex) => {
    for (let variant = 0; variant < variantsPerEssence; variant++) {
      const x = variant * CELL_WIDTH_PX;
      for (const [layer, row] of [
        ["body", essenceIndex * 2],
        ["rim", essenceIndex * 2 + 1]
      ] as const) {
        const y = row * CELL_HEIGHT_PX;
        // The shaft is the bottom of the cell, the tip its top.
        texture.add(
          frameName(layer, essence, variant, "shaft"),
          0,
          x,
          y + TIP_HEIGHT_PX,
          CELL_WIDTH_PX,
          SHAFT_HEIGHT_PX
        );
        texture.add(frameName(layer, essence, variant, "tip"), 0, x, y, CELL_WIDTH_PX, TIP_HEIGHT_PX);
      }
    }
  });
  rt.destroy();
}

/**
 * Test hook: over one silhouette, the worst margin between the drawn contour
 * and the collision shape, in radii. Must stay >= 0 on BOTH sides, otherwise a
 * lethal pixel would be invisible.
 */
export function coverageMargin(essence: Essence, variant: number): { left: number; right: number } {
  const shape = SILHOUETTES[ESSENCES.indexOf(essence) * OBSTACLE_ART.variantsPerEssence + variant];
  let left = Infinity;
  let right = Infinity;

  const check = (s: Sample, axisReach: number) => {
    if (axisReach <= 0) return;
    right = Math.min(right, s.cx + s.hw - axisReach);
    left = Math.min(left, axisReach - (s.cx - s.hw));
  };

  for (const s of shape.shaft) check(s, 1);
  for (const s of shape.tip) {
    const local = s.y - OBSTACLE_ART.shaftUnits;
    if (local <= CAP_END) check(s, 1);
    else if (local <= CAP_END + 1) check(s, Math.sqrt(Math.max(0, 1 - (local - CAP_END) ** 2)));
  }
  return { left, right };
}

/**
 * Test hook: how far the drawn tip reaches past the hitbox's furthest point,
 * in radii. Must stay > 0, or the very end of the capsule would be uncovered.
 */
export function apexClearance(essence: Essence, variant: number): number {
  const shape = SILHOUETTES[ESSENCES.indexOf(essence) * OBSTACLE_ART.variantsPerEssence + variant];
  const hitboxEnd = OBSTACLE_ART.shaftUnits + CAP_END + 1;
  let drawnEnd = 0;
  for (const s of shape.tip) if (s.hw > 0.02) drawnEnd = Math.max(drawnEnd, s.y);
  return drawnEnd - hitboxEnd;
}
