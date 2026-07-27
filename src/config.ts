/**
 * Every gameplay constant in one place.
 * Goal: being able to tune the feel by hand without reading the scene code.
 */

// Type-only: obstacleShapes.ts reads OBSTACLE_ART from here, so a value import
// would close the cycle. Types are erased at compile time.
import type { Essence } from "./obstacleShapes";

/**
 * Brand name. NEVER translated, NEVER routed through i18n: it is identical in
 * all four languages (see CLAUDE.md, brand rule).
 * Treated typographically as a logo, not as interface text.
 */
export const BRAND = {
  name: "Moonwick",
  fontSizePx: 60,
  // Wide letter-spacing: this is what makes it read as a logo, not a title.
  letterSpacing: 11,
  color: "#f5efd8",
  // Moon glow behind the word, breathing very slowly.
  glowColor: 0xffe9a8,
  glowSize: 460,
  glowAlphaMin: 0.09,
  glowAlphaMax: 0.2,
  glowPulseMs: 4200
} as const;

/** Logical size (portrait); must match the scale config in main.ts. */
export const WORLD = {
  width: 480,
  height: 854
} as const;

/** Witch flight: hold to rise, release to fall. */
export const WITCH = {
  x: 110,
  radius: 14,
  gravity: 900,
  thrust: -1800,
  maxSpeed: 420,
  // Vertical bounds: the witch never leaves the screen.
  marginTop: 20,
  marginBottom: 20
} as const;

/**
 * P5 — Difficulty tiers. The main lever is NARROWING (`gapSize`, the target
 * height of the gap, for trunks AND branches).
 *
 * VERIFIABLE GOAL — from "The Brambles" onwards, crossing without grazing is
 * STRUCTURALLY impossible: half the gap width, worst-case jitter included,
 * must be < the graze zone (38 px), i.e. max gap < 76.
 * Max gap = gapSize + max(trunk gapJitter = 4, branch bandJitter = 5).
 *   - The Edge      : 250 + 5 = 255 -> half 127.5  (learning, everything fits)
 *   - The Dark Wood : 140 + 5 = 145 -> half 72.5   (bridge: still avoidable)
 *   - The Brambles  :  70 + 5 =  75 -> half 37.5 < 38  IMPOSSIBLE without grazing
 *   - The Wall      :  67 + 5 =  72 -> half 36   < 38  same, tighter
 *   - The Moon's Eye:  64 + 5 =  69 -> half 34.5 < 38  floor (gapFloor)
 * Speed only rises moderately (+30%). The last tier is a PLATEAU: beyond it
 * difficulty freezes and skill alone decides how long a run lasts.
 */
export type Tier = {
  /** i18n key for the tier name (no hard-coded label: see i18n.ts). */
  nameKey: "tier.edge" | "tier.darkwood" | "tier.brambles" | "tier.wall" | "tier.moonEye";
  /** Tier start, in seconds of play. */
  startTime: number;
  scrollSpeed: number;
  /** Target gap height (trunk hole; branches derive theirs from it). */
  gapSize: number;
  /** Obstacle spawn interval, in seconds. */
  spawnInterval: number;
  // Mood: sky tint (top / bottom of the gradient).
  skyTop: number;
  skyBottom: number;
  /**
   * Tree species drawn at this tier — RENDERING ONLY, no effect whatsoever on
   * spacing, width or difficulty. Obstacles take the species in force when
   * they spawn, so a tier change rolls in with the existing 2 s transition
   * instead of restyling the obstacles already on screen.
   */
  essence: Essence;
  /** "The Moon's Eye" contrast inversion; gated by MOON_EYE.enabled. */
  invertContrast?: boolean;
};

export const TIERS: readonly Tier[] = [
  // 250+5=255, half 127.5: wide, you learn to graze without risk.
  { nameKey: "tier.edge",     startTime: 0,   scrollSpeed: 220, gapSize: 250, spawnInterval: 1.9,  skyTop: 0x0b0716, skyBottom: 0x241a4a, essence: "birch" },
  // 140+5=145, half 72.5: last tier where pure avoidance is still possible.
  { nameKey: "tier.darkwood", startTime: 25,  scrollSpeed: 240, gapSize: 140, spawnInterval: 1.75, skyTop: 0x070410, skyBottom: 0x1a1038, essence: "gnarled" },
  // 70+5=75, half 37.5 < 38: grazing becomes structurally unavoidable.
  { nameKey: "tier.brambles", startTime: 50,  scrollSpeed: 255, gapSize: 70,  spawnInterval: 1.6,  skyTop: 0x0a0512, skyBottom: 0x2a1230, essence: "bramble" },
  // 67+5=72, half 36 < 38.
  { nameKey: "tier.wall",     startTime: 80,  scrollSpeed: 270, gapSize: 67,  spawnInterval: 1.5,  skyTop: 0x060309, skyBottom: 0x1f0d22, essence: "denseStand" },
  // 64+5=69, half 34.5 < 38 — absolute floor (gapFloor), final plateau.
  // Same shapes as The Wall, but the contrast flips: the moon floods the sky.
  { nameKey: "tier.moonEye",  startTime: 120, scrollSpeed: 285, gapSize: 64,  spawnInterval: 1.4,  skyTop: 0x0d0a1f, skyBottom: 0x33205c, essence: "denseStand", invertContrast: true }
];

/** Sky colours actually used by a tier, once the inversion toggle is applied. */
export function tierSky(tier: Tier): { top: number; bottom: number } {
  return MOON_EYE.enabled && tier.invertContrast
    ? { top: MOON_EYE.skyTop, bottom: MOON_EYE.skyBottom }
    : { top: tier.skyTop, bottom: tier.skyBottom };
}

/** Staging of tier changes. */
export const TIER_FX = {
  // How long the tier name stays on screen.
  announceMs: 1500,
  announceFadeMs: 220,
  // Interpolation of parameters (speed, gap, sky) between tiers.
  transitionS: 2
} as const;

/**
 * Debug: start directly at a tier (index into TIERS) to test it without
 * replaying the first 80 seconds. -1 = disabled (normal start).
 */
export const DEBUG_START_TIER = -1;

/**
 * Debug: force a language without touching browser settings or the persisted
 * choice. null = normal behaviour (explicit choice, otherwise detection via
 * navigator.language). See i18n.ts.
 */
export const DEBUG_FORCE_LANG: "en" | "fr" | "es" | "it" | null = null;

/**
 * Particle trail — the PRIMARY indicator of the multiplier.
 * The player should read their combo in the trail, not in the HUD number:
 * sparse and dull at x1, dense and bright at x5. Each `…Idle` / `…Max` pair
 * is interpolated against the current multiplier.
 */
export const TRAIL = {
  // Emission interval (ms). At its lowest the trail becomes continuous.
  frequencyIdle: 55,
  frequencyMax: 6,
  lifespanIdle: 260,
  lifespanMax: 640,
  scaleIdle: 0.32,
  scaleMax: 0.95,
  alphaIdle: 0.32,
  alphaMax: 0.9,
  // Backward drift speed range and cone spread.
  // Fixed: density, size and colour are what carry the combo.
  driftMin: 70,
  driftMax: 170,
  spreadDeg: 16,
  colorIdle: 0x6b4fa0,
  colorMax: 0xffd27a,
  // Emission offset, behind the witch.
  offsetX: -11
} as const;

/** Procedural obstacle generation. Pace and gaps are driven by TIERS. */
export const OBSTACLES = {
  // Random variation (+/-) around the tier's spawnInterval, as a fraction.
  // Avoids a metronome feel without breaking the fairness constraint
  // (which is clamped afterwards).
  intervalJitter: 0.15,
  // Delay before the first obstacle: a short run-up to settle into flying.
  firstDelay: 0.9,
  // Spawn off-screen right, despawn off-screen left.
  spawnMargin: 40,
  despawnX: -80,

  // The gap is never placed flush against the top or bottom of the screen.
  safeMarginTop: 90,
  safeMarginBottom: 90,
  // Flight margin kept around the gap (witch radius + breathing room).
  // Automatically reduced when the gap becomes narrower than the margin.
  clearance: 48,
  // Max vertical shift of the gap from one obstacle to the next: guarantees
  // the next hole is always reachable at maximum flight speed.
  maxGapShift: 260,
  // Absolute floor for a gap, whatever the tier: below this the game would
  // be literally impassable (2x10 px hitbox + margin).
  gapFloor: 64,

  // Relative frequency of the 3 types. Trunks are hardest, so rarest.
  weights: {
    branchTop: 4,
    branchBottom: 4,
    trunk: 3
  },

  // Branches (top or bottom): a bar jutting in from one edge.
  // Free band = gapSize x bandFactor +/- bandJitter. Factor 1 and tight
  // jitter: the "half-gap < 38 px from The Brambles" guarantee (see TIERS)
  // must hold for ALL types, otherwise branches stay an escape hatch.
  // Variety comes from the gap's POSITION, not its size.
  branch: {
    width: 26,
    lengthMin: 120,
    bandFactor: 1.0,
    bandJitter: 5,
    // If the randomly picked side would stay wider than the other by at
    // least this margin (reachability guarantee), we switch sides.
    sideSwitchSlack: 40
  },

  // Full-height trunk: hole = the tier's gapSize +/- jitter (small: the
  // Brambles constraint is computed with worst-case jitter included).
  trunk: {
    width: 30,
    gapJitter: 4
  },

  // Dark silhouette + bright outline: obstacles must read instantly against
  // the sky gradient (readability = playability).
  // INVARIANT: the outline is permanent and STRENGTHENS as light fades —
  // obstacle readability is never degraded by any visual effect.
  colors: {
    fill: 0x0c0618,
    trunkFill: 0x080410,
    stroke: 0x7a5ad0,
    // Outline alpha: full light -> maximum darkness.
    strokeAlphaLit: 0.55,
    strokeAlphaDark: 1
  }
} as const;

/**
 * Witch art — RENDERING ONLY. The hitbox is untouched: `NEAR_MISS.deathRadius`
 * stays a 10 px circle centred on the TORSO, which is also the sprite's origin
 * and its rotation pivot. The hat, the cape and the broom's brush reach well
 * past it and are never lethal.
 *
 * The drawn body must CONTAIN that circle: the silhouette is built on a core
 * mass of `coreRadius` around the torso, so the guarantee holds by
 * construction (see witchShape.ts).
 */
export const WITCH_ART = {
  /** Core body radius, in px. Must stay > NEAR_MISS.deathRadius. */
  coreRadius: 11.5,
  /** Supersampling of the cached texture: crisper edges under rotation. */
  superSample: 2,

  // Tilt: a real rotation driven by vertical speed, smoothed, never a jump.
  tiltUpDeg: -30,
  tiltDownDeg: 35,
  /** Higher = the tilt catches up faster (exponential smoothing, per second). */
  tiltSmoothing: 9,

  // Cape and hat tip: a 3-point damped spring chain trailing the witch.
  capeStiffness: 260,
  capeDamping: 16,
  /**
   * Segment length, px. Three of these is the whole trailing length, so it is
   * what decides whether the cape reads as cloth or as a stray line drifting
   * behind her.
   */
  capeSegment: 7,
  capeWidth: 9.5,
  hatStiffness: 340,
  hatDamping: 19,
  hatSegment: 4.5,
  hatWidth: 3.2,
  /** Trailing points are clamped this far from their anchor (px). */
  chainMaxStretch: 26,

  /**
   * Body colour. Lifted off pure black on purpose, and not only for taste: at
   * near-black (#08050f) her contrast against the sky COLLAPSED as the scene
   * darkened (down to ~1.05), which is precisely when the player has lost the
   * combo and most needs to find herself. Lifted, contrast instead RISES as
   * the light fades (~1.4). It also stops her reading as the same material as
   * the obstacles, which stay near-black.
   */
  bodyColor: 0x332b4e,
  rimColor: 0xc9b6ff,
  rimColorFullMoon: 0xffe0a0,
  /** Rim thickness of the baked light edge, in design px. */
  rimWidth: 2.2,

  // The witch carries the combo: rim and aura grow with the multiplier.
  // The rim carries her against a near-black sky, so even at x1 it has to be
  // clearly present: a near-black body with a faint rim would be untrackable,
  // and the player aims a 10 px hitbox with it.
  rimAlphaIdle: 0.8,
  rimAlphaMax: 1,
  auraAlphaIdle: 0.08,
  auraAlphaMax: 0.42,
  /**
   * Aura diameter in PIXELS, not a multiple of the light texture: the source
   * is 256 px, so scaling it by ~1 would drown the character in a floodlight
   * instead of rimming her.
   */
  auraSizeIdle: 46,
  auraSizeMax: 116,
  auraColor: 0xa98bff,
  auraColorFullMoon: 0xffd68a,

  // Graze reaction: a brief lean away from the obstacle, plus a cape ripple.
  grazeKickMs: 150,
  grazeKickDeg: 7,
  grazeCapeImpulse: 300
} as const;

/**
 * The moon's position. It is the scene's single light source, so it also fixes
 * the direction of the obstacle rim light: every silhouette is lit on the side
 * facing this point, and moving the moon moves every rim with it. See
 * obstacleShapes.ts / OBSTACLE_ART.rim*.
 */
export const MOON = {
  x: WORLD.width - 70,
  y: 90
} as const;

/**
 * Obstacle art — RENDERING ONLY. None of this touches collision, scoring or
 * difficulty: the hitbox stays the simple capsule built in obstacles.ts.
 *
 * HARD RULE: the drawn silhouette must CONTAIN the collision shape. Every
 * half-width below is expressed in multiples of the collision radius, and the
 * generator clamps to `tipFactor` >= 1, so no lethal pixel is ever invisible.
 * The visual may overshoot — never undershoot.
 */
export const OBSTACLE_ART = {
  variantsPerEssence: 6,
  // Deterministic seed base: the same build always produces the same shapes.
  seed: 20260727,

  // Spindle: half-width from the anchored base down to the tip, in collision
  // radii. Strictly decreasing, and never below 1.
  baseFactor: 1.7,
  tipFactor: 1.05,
  /**
   * Safety margin, in collision radii, kept between the drawn contour and the
   * hitbox. Without it the clamp lands exactly on the hitbox edge on the side
   * opposite the bow, and the outermost lethal pixel would only be covered by
   * a half-transparent antialiased edge.
   */
  coverMargin: 0.12,
  // Widened footing where the obstacle meets the screen edge.
  anchorFactor: 0.42,
  anchorZone: 0.18,

  // Tip zone, in collision radii: it starts 2 radii before the collision end
  // and reaches 1.2 radii past it, so the rounded cap is always covered.
  tipUnits: 3.2,
  tipOvershoot: 1.2,

  // Source resolution: one collision radius is this many texture pixels.
  unitPx: 16,
  shaftUnits: 10,

  // Body is near-pure black; the rim is the readability element.
  bodyColor: 0x05030a,
  rimColor: 0xc9b6ff,
  rimWidthUnits: 0.26,
  // Rim opacity: full light -> maximum darkness. Mirrors the outline rule
  // that the old flat obstacles used (see CLAUDE.md, readability invariant).
  rimAlphaLit: 0.5,
  rimAlphaDark: 1
} as const;

/**
 * "The Moon's Eye" contrast inversion: pale golden sky flooded by the moon,
 * obstacles in absolute black. Toggle for the whole effect — when false the
 * tier keeps the normal dark palette and nothing else changes.
 */
export const MOON_EYE = {
  enabled: true,
  skyTop: 0xd9c9a0,
  skyBottom: 0xa88f63,
  bodyColor: 0x000000,
  // On a pale background the silhouette reads by itself; the rim turns into a
  // discreet dark edge instead of a glow.
  rimColor: 0x2a2036,
  rimAlpha: 0.45,
  /**
   * Inverting the background inverts what "visible" means. The graze halo and
   * the HUD are light-on-dark everywhere else; left as they are they would
   * almost vanish against pale gold — and CLAUDE.md requires the halo to stay
   * perfectly readable at all times. Both flip to dark-on-light here.
   */
  haloColor: 0x4a2d8f,
  haloAlphaScale: 1.6,
  scoreColor: "#241a08",
  multiplierColor: "#4a2d8f",
  magicBarColor: 0x4a2d8f
} as const;

/**
 * Ambient dust (background scenery): warm and present when magic is full,
 * sparse and cold once the combo is lost.
 * Scenery only: drawn UNDER the overlay, never on the gameplay layer.
 */
export const AMBIENT = {
  // Emission interval (ms): full magic -> combo lost.
  frequencyLit: 160,
  frequencyCold: 900,
  alphaLit: 0.45,
  alphaCold: 0.15,
  colorLit: 0xd8b878,
  colorCold: 0x6f7c96,
  lifespanMs: 3500,
  driftMin: 12,
  driftMax: 45,
  scale: 0.14
} as const;

/**
 * Near-miss: the heart of the game. Distances are measured from the witch to
 * the obstacle SURFACE (not centre to centre).
 */
export const NEAR_MISS = {
  // Lethal hitbox deliberately smaller than the visual (WITCH.radius): the
  // player should feel they slipped through, never that they were robbed.
  deathRadius: 10,
  // Graze ring: deathRadius < d <= grazeRadius.
  grazeRadius: 38,
  // NB: the delay before falling back to x1 is carried by the gauge
  // (MAGIC.max), which is the combo timer. No second counter in parallel.
  // Multiplier = 1 + combo * step, capped (the cap is "Full Moon", P4).
  multiplierStep: 0.5,
  multiplierMax: 5
} as const;

export const SCORING = {
  // Points per graze, multiplied by the current multiplier.
  // While the combo is active this is the ONLY source of score.
  grazePoints: 10,
  // Decaying DARK_POINTS: within a single run through the dark (combo at 0),
  // the Nth obstacle passed awards the Nth value, then the last one (0)
  // beyond that. The counter restarts when a graze revives the combo.
  // Passivity therefore never pays more, it FADES OUT — no source of points
  // grows with survival time.
  darkPointsSequence: [1, 1, 1, 0]
} as const;

/**
 * Magic gauge: it drains continuously and ONLY a graze refills it.
 * It is the multiplier timer, NOT a health bar: at 0 the multiplier drops
 * back to x1 and the run continues. You only die by touching an obstacle.
 * A player who avoids everything stays alive, but plays without a multiplier
 * and in the dark — the pressure is visual, not lethal.
 */
export const MAGIC = {
  // Seconds before the multiplier falls back to x1.
  max: 4,
  // Drain rate, in gauge units per second.
  drainPerSecond: 1,

  // Warning: below this threshold the witch flickers to signal the multiplier
  // is about to break. Purely visual, never causes a death.
  flickerGrace: 1.2,
  // Witch flicker / veil pulse, in beats per second.
  flickerPulseHz: 6,
  // How much the veil lightens at the peak of each pulse.
  flickerDarkSwing: 0.18,
  // Low alpha of the witch while flickering.
  flickerWitchAlpha: 0.25,

  // Fraction of `max` tolerated between two chances to refill.
  // Acts as the generator's guard rail (see obstacles.ts): beyond it the
  // multiplier would break without a single obstacle coming within reach.
  grazeWindowFactor: 0.6,

  // Darkening: black overlay alpha, full gauge -> empty gauge.
  // PURELY COSMETIC, and it only touches background and scenery: the overlay
  // is drawn UNDER obstacles, their halos and the witch (readability
  // invariant — see CLAUDE.md, Affordance). Capped low: desaturation, not
  // blackness, is what carries the feeling of loss.
  darkAlphaFull: 0,
  darkAlphaEmpty: 0.5,
  // Radius of the light hole around the witch, full gauge -> empty.
  lightRadiusFull: 460,
  lightRadiusEmpty: 95,

  // Scenery cooling as magic fades: the sky desaturates towards blue-grey
  // (0 = untouched, 1 = grey) and the moon pales.
  desatMax: 0.75,
  coldMoonColor: 0xb9c2d6,

  // Thin bar under the score.
  barWidth: 170,
  barHeight: 5,
  barY: 158,
  barColor: 0xb98bff,
  barTrackAlpha: 0.12
} as const;

/** Graze feedback: obstacle halos + floating texts. */
export const FEEDBACK = {
  // Violet halo that materialises the graze zone (NEAR_MISS.grazeRadius).
  haloColor: 0x9b6bff,
  haloAlpha: 0.15,
  // While the witch is inside the zone.
  haloAlphaActive: 0.5,

  // Floating texts: rise and fade.
  floatMs: 600,
  floatRise: 48,
  grazeColor: "#f2c8ff",
  // The +1 of dark points: small and discreet, it must never compete with
  // the graze text — it is a consolation prize, not a reward.
  darkColor: "#8877aa"
} as const;

/**
 * Camera shake on a graze. Must stay BELOW conscious perception: it should be
 * felt, not noticed. Disabled when the system asks for reduced motion.
 */
export const SHAKE = {
  minPx: 2,
  maxPx: 3,
  durationMs: 80
} as const;

/**
 * Slow motion on an extreme graze — the moment players will want to record.
 * Triggered below `thresholdPx` from the surface (reminder: death is at
 * 10 px, so the window is narrow and has to be earned).
 * Disabled under reduced motion.
 */
export const SLOWMO = {
  thresholdPx: 18,
  scale: 0.4,
  durationMs: 150
} as const;

/**
 * Full Moon mode: reached when the multiplier hits its cap.
 * Everything must change at once — moon, palette, trail — so the player knows
 * they are in an exceptional state without reading a single number.
 */
export const FULL_MOON = {
  fadeMs: 320,
  // The moon grows and gains a halo.
  moonScale: 1.4,
  glowRadius: 82,
  glowColor: 0xffe9a8,
  glowAlpha: 0.3,
  // Additive golden veil over the whole scene.
  veilColor: 0xffb43c,
  veilAlpha: 0.11,
  // The witch herself turns to gold.
  witchColor: 0xffe0a0,
  witchColorNormal: 0xd9a7ff
} as const;

/**
 * Sounds synthesised with Web Audio, no external files (P4 rule).
 * Volume deliberately low: the game is often played muted and must never
 * startle. `masterVolume` is the only knob to touch.
 */
export const SFX = {
  masterVolume: 0.12,
  // Graze swoosh: filtered noise whose pitch rises with the combo.
  swooshBaseHz: 620,
  swooshHzPerCombo: 95,
  swooshMaxHz: 2200,
  swooshMs: 130,
  // Low impact on death.
  deathFromHz: 140,
  deathToHz: 38,
  deathMs: 620
} as const;

/**
 * Tutorial-free onboarding, first run only: the first obstacle carries an
 * exaggerated halo and the graze word. Gone forever after the first
 * successful graze. No popup, nothing to skip.
 */
export const TEACH = {
  haloAlpha: 0.5,
  haloAlphaActive: 0.85,
  // The word itself comes from i18n (key "teach.word"): no hard-coded label.
  fontSizePx: 34,
  color: "#f2c8ff",
  // Word placement: left of the obstacle, centred on its gap.
  offsetX: -96
} as const;

// NOTE: there is deliberately no delay before the death screen accepts the
// replay tap. The contextual message and the score history must never gate
// replaying (see CLAUDE.md, accessibility floor).

/**
 * Score history shown on the death screen as a mini bar chart.
 * Oldest on the left, the run that just ended on the right.
 */
export const HISTORY = {
  size: 5,
  barWidth: 26,
  barGap: 14,
  maxBarHeight: 44,
  // A zero score still draws a sliver, so five runs always read as five bars.
  minBarHeight: 3,
  baselineY: 543,
  color: 0x9b6bff,
  recordColor: 0xffd27a,
  labelColor: "#8877aa",
  recordLabelColor: "#ffd27a"
} as const;

/**
 * Thresholds that pick the contextual game-over message.
 * Priority order is fixed in FlightScene.pickDeathCategory():
 * newRecord > nearRecord > bigCombo > earlyDeath > default.
 */
export const DEATH_MESSAGE = {
  // At or above this fraction of the record (without beating it) -> "so close".
  nearRecordRatio: 0.85,
  bigComboThreshold: 8,
  earlyDeathSeconds: 10
} as const;

/** Draws the lethal hitbox, the graze ring and the collision shapes. */
export const DEBUG_HITBOX = false;

/** Debug overlay, top left: fps, speed, tier name. */
export const DEBUG_STATS = false;

/**
 * Debug: clears the first-run onboarding flag on boot, so the graze hint
 * shows again. Only touches `moonwick:tutorialDone` — scores, settings and
 * history are left alone.
 */
export const DEBUG_RESET_TUTORIAL = false;

// --- Guard rail (dev only): tier fairness constraint.
// Every obstacle is the only chance to refill the combo timer, so no tier may
// space obstacles beyond MAGIC.max * 0.6 s, jitter included — otherwise the
// combo breaks through no fault of the player.
if (import.meta.env.DEV) {
  const limit = MAGIC.max * MAGIC.grazeWindowFactor;
  for (const tier of TIERS) {
    const worst = tier.spawnInterval * (1 + OBSTACLES.intervalJitter);
    if (worst > limit) {
      throw new Error(
        `TIERS "${tier.nameKey}": spawnInterval ${tier.spawnInterval}s ` +
          `(worst case ${worst.toFixed(2)}s with jitter) exceeds the limit ` +
          `MAGIC.max * grazeWindowFactor = ${limit}s`
      );
    }
  }
}
