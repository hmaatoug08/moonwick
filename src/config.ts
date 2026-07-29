/**
 * Every gameplay constant in one place.
 * Goal: being able to tune the feel by hand without reading the scene code.
 */

// Type-only: obstacleShapes.ts reads OBSTACLE_ART from here, so a value import
// would close the cycle. Types are erased at compile time.
import type { Essence } from "./obstacleShapes";

/**
 * The type system — "Moonlight & ink" art direction.
 *
 * TWO FACES, TWO JOBS. A light high-contrast serif carries the logo, the
 * titles and every hero numeral; a geometric sans set as SMALL CAPS (uppercase
 * + wide tracking) carries labels, rows and hints. No bold system sans
 * anywhere: where the old UI shouted, this one whispers.
 *
 * FIVE RULES the interface obeys (see CLAUDE.md):
 *   1. no bordered boxes — one filled band per screen, for the one action;
 *   2. hairlines at 1 px, never 2;
 *   3. labels are small caps, values are serif;
 *   4. 28 px margins, 8 px rhythm;
 *   5. a moon-arc motif instead of frames.
 *
 * The fonts load in index.html and main.ts AWAITS them before booting Phaser,
 * so fitText() and buttonWidth() always measure the real glyphs.
 */
export const TYPE = {
  serif: '"Cormorant Garamond", Georgia, serif',
  sans: 'Manrope, "Helvetica Neue", Helvetica, sans-serif',
  /** Small-caps tracking, as a fraction of the font size (0.22em). */
  trackEm: 0.22,

  // Ink and paper of the night: cream for what matters, muted violet-grey for
  // labels, gold RATIONED to records, rewards and Full Moon.
  cream: "#f4eee0",
  gold: "#ffd9a0",
  goldWarm: "#ffe9a8",
  label: "#8d86a8",
  labelBright: "#c9c0e0",
  violetDim: "rgba(160,143,208,0.75)",

  // Hairlines: 1 px, violet, low alpha. The three levels used by the screens.
  hairline: 0xa08fd0,
  hairlineAlpha: 0.14,
  hairlineAlphaStrong: 0.3,
  hairlineDiamond: 5,

  // The one filled band per screen (Replay, Back): violet gradient, top
  // hairline, letterspaced caps. No border.
  bandColor: 0x9b6bff,
  bandAlphaTop: 0.06,
  bandAlphaBottom: 0.22,
  bandLine: 0xd8c9ff,
  bandLineAlpha: 0.55
} as const;

/**
 * Brand name. NEVER translated, NEVER routed through i18n: it is identical in
 * all four languages (see CLAUDE.md, brand rule).
 * Treated typographically as a logo, not as interface text.
 */
export const BRAND = {
  name: "Moonwick",
  fontSizePx: 66,
  // Serif light, wide letter-spacing: what makes it a logo, not a title.
  letterSpacing: 10.5,
  color: "#f4eee0",
  // Moon glow behind the word, breathing very slowly.
  glowColor: 0xffe9a8,
  glowSize: 460,
  glowAlphaMin: 0.09,
  glowAlphaMax: 0.2,
  glowPulseMs: 4200,
  // Soft halo baked into the glyphs themselves (canvas text shadow), so the
  // word glows even where the breathing background glow is at its dimmest.
  shadowColor: "rgba(255,233,168,0.35)",
  shadowBlur: 26
} as const;

/**
 * The mark — "the lit crescent". The name is two things, a MOON and a WICK,
 * so the mark is one shape doing both: a waxing crescent whose upper horn is
 * lit like a candle. Two circles and a teardrop (src/logo.ts), no image file.
 *
 * Geometry in a 200-unit square: moon circle r 100, shadow circle r 92 with
 * its centre offset 44 towards the dark side, flame 14 x 24 above the upper
 * horn. THE LIT SIDE FOLLOWS `MOON.x` — the mark reads the same constant the
 * obstacles do, so moving the moon in config relights the logo with the
 * forest.
 *
 * Below ~28 px a hairline sliver and a teardrop both disappear, so the small
 * recipes thicken the crescent and round the flame into a dot: same
 * construction, three sets of radii (the favicon uses `tiny`).
 *
 * DON'T (from the brand sheet): no outline around the crescent, no second
 * flame, no rotation, no gradient across the wordmark, and never a violet
 * flame on a dark ground — it stops reading as fire.
 */
export const LOGO = {
  unit: 200,
  moonR: 100,
  /**
   * TWO-TIER SYSTEM: `full` carries the WITCH flying out of the crescent's
   * bay — she is what lights the wick — and rides in every lockup at
   * `witchMinPx` of mark or more. Below that the mark drops to crescent and
   * flame alone (`small`, `tiny`): at 30 px of silhouette she is a smudge,
   * and a smudge is worse than an absence.
   */
  full: { shadowR: 92, shadowOffset: 44, flameW: 14, flameH: 24, teardrop: true },
  small: { shadowR: 88, shadowOffset: 40, flameW: 26, flameH: 34, teardrop: false },
  tiny: { shadowR: 84, shadowOffset: 36, flameW: 38, flameH: 44, teardrop: false },
  witchMinPx: 88,
  /** Gap between the upper horn and the flame's base, in units. */
  flameLift: 12,
  bodyColor: "#f4eee0",
  flameColor: "#ffd9a0",
  flameTipColor: "#fff6e2",
  // Her silhouette keeps the game's own colours (witchShape.ts): near-black
  // body lifted off pure black, silver-violet rim on the moon side.
  witchBody: "#332b4e",
  witchRim: "#c9b6ff",
  /** Mark height on the home screen, in px — above `witchMinPx` on purpose. */
  homeSize: 96
} as const;

/** Logical size (portrait); must match the scale config in main.ts. */
export const WORLD = {
  width: 480,
  height: 854
} as const;

/**
 * Bottom safe-area inset, in logical px.
 *
 * EVERY piece of interface pinned to the bottom of the screen must sit above
 * it — the progress thread, the Replay band, anything added later. On a phone
 * with a home indicator the last strip of screen is both visually occupied and
 * a system gesture area: a control there is half-hidden and half-swallowed.
 *
 * A constant rather than a runtime query on purpose: Capacitor arrives in P7,
 * and until then this is the one place to widen when real insets are read from
 * `env(safe-area-inset-bottom)`.
 */
export const SAFE_BOTTOM = 34;

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
 * Global pace. Multiplies the scroll speed AND divides the spawn interval, so
 * the SPATIAL layout of the forest is untouched and only time is stretched:
 * distance between obstacles = speed x interval = (k.v) x (I/k) = v.I.
 * The player gets more reaction time for exactly the same course.
 *
 * One knob for the whole game's rhythm. Below 1 = easier, above 1 = harder.
 */
export const GLOBAL_SPEED = 0.85;

/**
 * Difficulty tiers. The main lever is NARROWING (`gapSize`, the target height
 * of the gap, for trunks AND branches).
 *
 * REBALANCE (playtest: the game was too hard). The former goal — from "The
 * Brambles" onwards, half the gap smaller than the graze zone so crossing
 * without grazing was STRUCTURALLY impossible — is DELIBERATELY REVERSED.
 * Crossing cleanly is now possible at every tier, including The Wall; it is
 * simply barely worth anything, because only grazes score and dark points
 * fade to zero (SCORING.darkPointsSequence). The incentive to graze is now
 * economic instead of structural.
 *
 * VERIFIABLE GOAL — at EVERY tier, half the gap at its NARROWEST (worst-case
 * jitter) must exceed the graze radius (38 px), i.e. min gap > 76.
 * Min gap = gapSize - max(trunk gapJitter = 4, branch bandJitter = 5).
 *   - The Edge      : 250 - 5 = 245 -> half 122.5  (learning: 30 s, slow, wide)
 *   - The Dark Wood : 170 - 5 = 165 -> half  82.5
 *   - The Brambles  : 130 - 5 = 125 -> half  62.5
 *   - The Wall      : 105 - 5 = 100 -> half  50
 *   - The Moon's Eye:  88 - 5 =  83 -> half  41.5  (tightest, still passable)
 * A dev assertion at the end of this file enforces it on every tier.
 *
 * `spawnInterval` values are the values BEFORE GLOBAL_SPEED. They are chosen
 * so the effective interval still fits under the fairness cap once divided by
 * it — otherwise `clampInterval` would silently eat the slowdown.
 *
 * The last tier is a PLATEAU: beyond it difficulty freezes and skill alone
 * decides how long a run lasts.
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
  // LEARNING TIER, 30 s: wide, slow, forgiving. A first-time player must be
  // able to survive here without effort and discover grazing on their own.
  { nameKey: "tier.edge",     startTime: 0,   scrollSpeed: 220, gapSize: 250, spawnInterval: 1.75, skyTop: 0x0b0716, skyBottom: 0x241a4a, essence: "birch" },
  // half 82.5: the forest closes in, still very passable.
  { nameKey: "tier.darkwood", startTime: 30,  scrollSpeed: 235, gapSize: 170, spawnInterval: 1.7,  skyTop: 0x070410, skyBottom: 0x1a1038, essence: "gnarled" },
  // half 62.5: grazing becomes clearly the profitable line, never the only one.
  { nameKey: "tier.brambles", startTime: 55,  scrollSpeed: 248, gapSize: 130, spawnInterval: 1.6,  skyTop: 0x0a0512, skyBottom: 0x2a1230, essence: "bramble" },
  // half 50: tight, and still crossable clean by a careful player.
  { nameKey: "tier.wall",     startTime: 85,  scrollSpeed: 258, gapSize: 105, spawnInterval: 1.5,  skyTop: 0x060309, skyBottom: 0x1f0d22, essence: "denseStand" },
  // half 45.5: the narrowest the game ever gets, final plateau. Measured clean
  // corridor ~15 px — demanding, but a real line rather than a pixel-perfect
  // stunt (at gapSize 88 it was down to 8 px).
  { nameKey: "tier.moonEye",  startTime: 125, scrollSpeed: 268, gapSize: 96,  spawnInterval: 1.45, skyTop: 0x0d0a1f, skyBottom: 0x33205c, essence: "denseStand", invertContrast: true }
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
  // be literally impassable (2x8 px hitbox + margin). No tier reaches it any
  // more since the rebalance; it stays as a backstop for hand tuning.
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
 * Background scenery — RENDERING ONLY, and strictly SCENERY in the sense of
 * the readability invariant: every piece lives UNDER the darkness overlay, so
 * it darkens with the sky and never competes with the obstacles, their halos
 * or the witch. No image file: everything is generated once at boot
 * (src/scenery.ts) into cached canvas textures, then displayed as sprites or
 * scrolling tiles. All colours are applied as TINTS over white art, so the
 * whole mood can follow the tier sky with no redraw.
 */
export const SCENERY = {
  // Deterministic seed: the same build always produces the same night.
  seed: 20260729,

  /**
   * Idle drift on the home and death screens, in world px/s: the forest
   * breathes even when nothing scrolls. Well below any tier speed on purpose
   * — the menu is a rest, not a run.
   */
  menuDriftPxS: 30,

  /**
   * Star field: one static texture over the top of the sky, plus a few
   * individually twinkling stars. Stars are DISTANT scenery: they do not
   * parallax. Their alpha fades to zero as the sky turns pale (The Moon's
   * Eye inversion) — stars on a golden daylit sky would read as a bug.
   */
  stars: {
    count: 110,
    /** Star band: from the top edge down to this fraction of the screen. */
    bandFraction: 0.72,
    alpha: 0.9,
    /** Sky-top luminance (0-1) where stars start fading, and are gone. */
    fadeLumStart: 0.18,
    fadeLumEnd: 0.42,
    twinkleCount: 12,
    twinkleMinHz: 0.15,
    twinkleMaxHz: 0.5,
    twinkleScale: 0.16
  },

  /**
   * The moon's face: white disc with seeded craters and a soft limb shade,
   * tinted by the scenes (idle cream, cooled blue-grey as magic fades).
   * Radius matches the flat circle it replaces.
   */
  moon: {
    radius: 34,
    craterCount: 6,
    craterMinR: 3,
    craterMaxR: 8,
    craterAlpha: 0.1,
    /** Soft idle halo around the moon (the Full Moon glow is separate). */
    idleGlowSize: 190,
    idleGlowAlpha: 0.16
  },

  /**
   * Distant forest: two tileable silhouette layers along the bottom edge,
   * scrolling slower than the obstacles (parallax sells the depth). Drawn
   * white and tinted per tier: each layer sits between the sky-bottom colour
   * and the obstacle body colour — far is closer to the sky (atmospheric
   * perspective), near is darker.
   */
  treeline: {
    far: { height: 170, parallax: 0.08, mix: 0.45, alpha: 0.85 },
    near: { height: 110, parallax: 0.18, mix: 0.75, alpha: 0.95 },
    /** Tint target the sky-bottom colour is mixed towards. */
    darkColor: 0x05030a
  },

  /**
   * Ground mist: soft tileable bands drifting slowly, slightly lighter than
   * the sky. They both scroll with the world (their own parallax share) and
   * drift on their own, so they still breathe when the world stands still.
   */
  mist: {
    bands: [
      { y: 0.86, height: 90, parallax: 0.12, driftPxS: 6, alpha: 0.1 },
      { y: 0.95, height: 70, parallax: 0.26, driftPxS: 10, alpha: 0.14 }
    ],
    /** Mist tint: sky-bottom mixed towards white by this fraction. */
    lightMix: 0.5
  }
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
  // Lethal hitbox deliberately smaller than the visual: the player should feel
  // they slipped through, never that they were robbed. Lowered 10 -> 8 in the
  // rebalance, purely for perceived generosity — the graze ring is unchanged,
  // so the ring simply starts closer to the witch.
  deathRadius: 8,
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

  /**
   * The combo timer, TOP of the screen. It must read as URGENCY, and must
   * never be mistaken for the progress thread along the bottom edge. The two
   * carry opposite meanings — one is running out, the other is going forward —
   * so they deliberately share neither shape nor palette:
   *
   *   combo timer : top,    short, centred, WARM amber, pulses near zero
   *   progress    : bottom, full width,     COLD violet, still but for the dot
   */
  // "Moonlight & ink": a hairline of fire, not a widget. Narrower and thinner
  // than before (170x5 -> 110x2) — the pulse near zero carries the urgency.
  barWidth: 110,
  barHeight: 2,
  barY: 152,
  /** Warm amber: the colour of something burning down. */
  barColor: 0xffb347,
  barTrackAlpha: 0.12,
  /** Below this fraction of the gauge, the bar pulses. */
  pulseBelow: 0.3,
  pulseHz: 3.4,
  pulseAlphaMin: 0.45,
  /** Extra height at the peak of a pulse, in px. */
  pulseGrow: 3
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
  deathMs: 620,
  // Firefly pickup: a short crystalline chime, two partials, fast decay.
  sparkHz: 1180,
  sparkPartialRatio: 2.5,
  sparkMs: 190,
  sparkGain: 0.5,
  /** Percée approach: the swoosh detunes down by this much at full tension. */
  tensionDetuneCents: -260
} as const;

/**
 * Adaptive music (src/music.ts) — entirely synthesised in Web Audio, on the
 * SAME AudioContext as the effects (sfx.ts), never a second one. NO AUDIO
 * FILE: the zero-asset pillar holds.
 *
 * NOT A COMPOSED LOOP: three layers that fade in and out (never a hard cut)
 * and read the game state the way the visuals do —
 *   - a permanent ambient PAD whose tonality follows the current tier;
 *   - a RHYTHMIC layer that enters from combo 2, density following the
 *     multiplier;
 *   - a MELODIC layer at Full Moon.
 * Losing the combo IMPOVERISHES the sound (layers retreat, filter closes) —
 * the same logic as the scenery's visual cooling. The Percée approach
 * hollows the whole bed; the slow-motion crossing silences it.
 *
 * Patterns are generated from a scale and a per-run seed: no fixed loop, two
 * runs never sound identical. -> DESIGN.md, "The music".
 */
export const MUSIC = {
  /** Clearly under the effects (SFX.masterVolume 0.12). */
  masterVolume: 0.055,

  /**
   * Tonality per tier: the pad's root note, one per TIERS entry, gliding
   * with the existing 2 s tier transition. Descending as the forest closes
   * in — D3, C3, Bb2, G2 — then rising to E3 at The Moon's Eye, whose pale
   * gold sky is the one bright place in the game.
   */
  tierRootHz: [146.83, 130.81, 116.54, 98.0, 164.81],
  /** Minor-pentatonic degrees, in semitones over the tier root. */
  scale: [0, 3, 5, 7, 10],

  // PAD: root an octave down + fifth, doubled and detuned a few cents so the
  // pair beats slowly. A lowpass opens with the combo and closes in the dark.
  padDetuneCents: 5,
  padGain: 0.5,
  filterMinHz: 240,
  filterMaxHz: 1200,
  /** Combo loss closes the filter towards this fraction of its floor. */
  coldFilterFactor: 0.6,
  /** Breathing: a slow LFO swaying the filter, like the mist drifts. */
  breatheHz: 0.07,
  breatheDepthHz: 40,
  /** Root glide time constant — matches TIER_FX.transitionS in feel. */
  rootGlideS: 1.2,

  // AIR: filtered procedural noise under the pad. It reads as candle-smoke /
  // distant night wind, not as a foreground sound effect.
  airGain: 0.32,
  airHz: 520,
  airQ: 0.65,
  airRestPresence: 0.55,
  airRunPresence: 0.35,
  airColdLift: 0.35,
  airTensionLift: 0.3,

  // RHYTHM: soft low pulses on an eighth-note grid, from combo 2. The
  // pattern is drawn from the run's seed per bar; density follows the
  // multiplier between the two probabilities below.
  bpm: 84,
  stepsPerBar: 8,
  rhythmEnterCombo: 2,
  rhythmDensityMin: 0.25,
  rhythmDensityMax: 0.7,
  rhythmGain: 0.4,
  rhythmDecayS: 0.16,
  /** The pulse is the root two octaves up, softened. */
  rhythmOctave: 2,

  // MELODY, Full Moon only: seeded walk over the scale, two octaves up,
  // sine plucks on the same grid at half density.
  melodyGain: 0.3,
  melodyDecayS: 0.7,
  melodyOctave: 3,
  melodyDensity: 0.45,

  /** Percée approach: fraction of the bed removed at the marker. The
   *  slow-motion crossing itself silences the music entirely. */
  tensionDuck: 0.7,

  // The rest variant (menu, death screen): pad alone, quieter, with a stray
  // firefly chime every few seconds.
  restLevel: 0.5,
  chimeMinS: 5,
  chimeMaxS: 11,
  chimeGain: 0.1,
  chimeDecayS: 1.2,

  /** Smoothing time constant for every level move: ramps, never cuts. */
  smoothS: 0.6,

  // SPACE — a convolution reverb whose impulse response is GENERATED at boot
  // (shaped noise, darkening tail): the depth of a real room, still zero
  // files. The bed gets a small send; plucks and chimes ride it openly.
  reverbSeconds: 2.8,
  /** Tail shape: higher = faster early decay. */
  reverbDecay: 3.2,
  reverbBedSend: 0.16,
  reverbPluckSend: 0.5,
  reverbReturn: 0.8,

  // VOICE — what turns "oscillator" into "instrument".
  /** Plucks: octave partial and a breath of noise at note-on. */
  pluckPartialGain: 0.3,
  pluckNoiseGain: 0.1,
  /** Plucks start this fraction sharp and settle — a plucked string does. */
  pluckPitchSettle: 0.012,
  /** Rhythm thump: pitch drops from this ratio to 1 — a soft drum skin. */
  thumpPitchDrop: 1.35,
  /** Pad width: a third detune pair, further out and quieter. */
  padWideCents: 11,
  padWideGain: 0.35
} as const;

/**
 * Tutorial-free onboarding, first run only: the first obstacle carries an
 * exaggerated halo and the graze word. Gone forever after the first
 * successful graze. No popup, nothing to skip.
 */
/**
 * Reward cues — how the game says "grazing pays" WITHOUT a single word.
 *
 * This replaced the tutorial approach (a "GRAZE" band next to the first
 * obstacle, repeated until the player succeeded). Instructions told players
 * what to do; these show them what they gain. No text appears during play any
 * more except the numeric gains themselves.
 *
 * Fireflies are PURELY VISUAL: they never add to the score. They exist to put
 * something worth wanting inside the graze ring, so the eye goes there.
 */
export const FIREFLIES = {
  /** Per obstacle. Kept low: this is bait, not confetti. */
  minPerObstacle: 2,
  maxPerObstacle: 3,
  /**
   * Where they float, as a distance from the obstacle SURFACE. Inside the
   * graze ring with a margin at both ends: never so close that reaching one
   * means dying, never outside the ring it is advertising.
   */
  ringMin: 16,
  ringMax: 32,
  /** Idle drift. */
  driftPx: 3.5,
  driftHz: 0.55,
  pulseHz: 1.1,
  sizeMin: 7,
  sizeMax: 11,
  color: 0xffe9a8,
  alphaIdle: 0.55,
  alphaPeak: 0.95,
  /** Absorption into the witch when she enters the ring. */
  collectMs: 220,
  /** Escape when the obstacle is passed without a graze. Never mocking. */
  escapeMs: 400,
  escapeRise: 54,
  /** Pool size: enough for every obstacle on screen plus those in flight. */
  poolSize: 40,
  /** Forward drift under Percée tension, px/s at full tension. */
  tensionDrift: 26
} as const;

/**
 * The value tag: what this obstacle is worth at the CURRENT multiplier, shown
 * small on the edge of its halo. It is the whole economic argument for grazing,
 * so it fades in as the witch approaches and disappears once earned.
 */
export const VALUE_TAG = {
  fontSizePx: 15,
  color: "#ffe9a8",
  /**
   * Horizontal offset from the obstacle axis. NEGATIVE on purpose: obstacles
   * scroll towards the witch, so the side facing her is the left one. Put the
   * tag on the far side and she only reads it once the decision is behind her.
   */
  offsetX: -26,
  /** Distance at which it starts fading in / reaches full strength. */
  fadeInFromX: 330,
  fullAtX: 150,
  alphaMin: 0.18,
  alphaMax: 0.95,
  poolSize: 8
} as const;

/**
 * The very first graze EVER is celebrated once, wordlessly: this is the moment
 * the whole game clicks. Never repeated — `moonwick:tutorialDone` gates it.
 */
export const FIRST_GRAZE = {
  slowMoMs: 260,
  flashAlpha: 0.22,
  flashMs: 420,
  sparks: 26
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

/**
 * Death log — the tuning source of truth. The last `size` deaths are kept in
 * `moonwick:deaths` and summarised on the stats screen (long press on the
 * title). Measurement only: nothing here feeds back into gameplay except
 * through MERCY below.
 */
export const DEATHS = {
  size: 50
} as const;

/**
 * Adaptive easing. After `deathsToTrigger` consecutive deaths under
 * `quickDeathSeconds`, the next run is quietly made more generous; the help
 * lifts as soon as the player passes `clearSeconds` in a run.
 *
 * TOTALLY INVISIBLE: no message, no icon, no sound. A player being helped must
 * never be told, or the help becomes a judgement on their skill.
 *
 * The trigger state is DERIVED from the death log rather than stored: a run
 * over `clearSeconds` naturally breaks the trailing streak of quick deaths, so
 * there is no second source of truth to keep in sync.
 */
export const MERCY = {
  enabled: true,
  deathsToTrigger: 3,
  quickDeathSeconds: 12,
  /** Gap widening, as a fraction. */
  gapBonus: 0.15,
  /** Scroll speed reduction, as a fraction. */
  speedRelief: 0.1,
  /** Surviving this long in one run lifts the help, mid-run. */
  clearSeconds: 20
} as const;

/**
 * La Percée — the personal record as a PLACE in the forest rather than a
 * number on a screen. The reference record is survival TIME (`bestTime`),
 * which is what the tiers are already indexed on.
 *
 * A marker stands at that exact moment of the run: an arch of frozen fireflies
 * and moonlight spanning the screen. Purely visual — no collision, no effect on
 * gameplay of any kind. Crossing it is the whole point of a run.
 */
export const PERCEE = {
  /**
   * Below this personal best, no marker and no mention at all. A first run —
   * or a record so short the arch would land on top of the player — must not
   * put a monument three seconds into the forest.
   */
  minTime: 8,
  /** Seconds of build-up before the marker: sound hollows, light shifts. */
  approach: 4,
  /** Crossing: slow motion, trail blaze, the arch bursts. */
  slowMoMs: 400,

  // Tension ramp, all reached at the marker itself. NONE of this may touch the
  // obstacles or their halos — see the readability invariant in CLAUDE.md.
  /** Extra desaturation of the SCENERY only, 0 -> this. */
  tensionDesat: 0.35,
  /** Ambient dust drift towards the marker, px/s. */
  tensionDrift: 34,
  /** Detune of the graze swoosh at full tension, in cents. */
  tensionDetuneCents: -260,
  /** Moon veil tint pushed towards the arch's colour. */
  archColor: 0xbfa8ff,
  archGlowColor: 0xffe9a8,
  /** Arch geometry. */
  archWidth: 46,
  archFireflies: 22,
  archBurst: 40,

  /**
   * The road, on the death screen: the run laid out as a horizontal band cut
   * into tier-length segments, with where she died and where her record stands.
   * The point is to make the gap between the two a DISTANCE, not a number.
   */
  road: {
    // Sits between the cause of death and the run summary. The whole death
    // screen is a tight column: cause 392, road here, summary 494, history
    // 543, buttons 597. Moving it means re-checking those.
    y: 440,
    height: 15,
    marginX: 26,
    /** Road length in seconds. It stretches to fit whichever is longer. */
    tailFactor: 1.18,
    /** Never shorter than this, so an early death still shows a road. */
    minSpan: 40,
    trackColor: 0x2a2142,
    doneColor: 0x9b6bff,
    recordColor: 0xffd27a,
    /** A segment narrower than this gets no name: it would be unreadable. */
    minLabelWidth: 34,
    labelSizePx: 10,
    labelColor: "#8877aa",
    captionSizePx: 16,
    captionColor: "#d9a7ff",
    recordCaptionColor: "#ffd27a"
  }
} as const;

/**
 * The progress thread, along the BOTTOM edge: the run's journey, drawn as a
 * place rather than a readout. A hairline across the full width, small ticks
 * at the tier boundaries, a lit notch where the record stands, and one moving
 * point of light — the witch on her road.
 *
 * No text, no numbers, no opaque background. It is scenery, not a HUD.
 *
 * PRIORITY TO THE GAME: it is drawn UNDER the obstacles and their halos, so it
 * can never cover them (readability invariant), and it vanishes completely
 * during a Percée crossing so nothing competes with that moment.
 */
export const PROGRESS_THREAD = {
  /** Hairline thickness. Any thicker and it starts reading as a HUD bar. */
  height: 1.5,
  marginX: 18,
  /** Distance above the safe-area inset. */
  liftAboveSafe: 10,

  trackColor: 0x6b5aa0,
  trackAlpha: 0.3,
  tickColor: 0x9b8ad0,
  tickAlpha: 0.55,
  tickHeight: 5,
  /** The record: a taller, brighter notch. */
  notchColor: 0xd8c9ff,
  notchAlpha: 0.9,
  notchHeight: 11,

  /** The witch's point of light. */
  dotSize: 7,
  dotColor: 0xd8c9ff,
  dotAlpha: 0.9,

  /** Road length in seconds, fixed at the start of a run so it never slides. */
  minSpan: 45,
  spanFactor: 1.15
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

/**
 * Debug: dumps `moonwick:stats` to the console on boot, and exposes
 * `window.__moonwickStats` with `dump()` and `reset()` so the lifetime numbers
 * can be inspected and cleared without touching anything else.
 */
export const DEBUG_STATS_DUMP = false;

// --- Guard rail (dev only): tier fairness constraint.
// Every obstacle is the only chance to refill the combo timer, so no tier may
// space obstacles beyond MAGIC.max * 0.6 s, jitter included — otherwise the
// combo breaks through no fault of the player.
if (import.meta.env.DEV) {
  const limit = MAGIC.max * MAGIC.grazeWindowFactor;
  for (const tier of TIERS) {
    // GLOBAL_SPEED stretches the interval, so the check has to run on the
    // EFFECTIVE value. Otherwise clampInterval quietly caps it at runtime and
    // the slowdown silently stops applying at the widest tiers.
    const effective = tier.spawnInterval / GLOBAL_SPEED;
    const worst = effective * (1 + OBSTACLES.intervalJitter);
    if (worst > limit) {
      throw new Error(
        `TIERS "${tier.nameKey}": spawnInterval ${tier.spawnInterval}s ` +
          `(${effective.toFixed(2)}s after GLOBAL_SPEED, worst case ` +
          `${worst.toFixed(2)}s with jitter) exceeds the limit ` +
          `MAGIC.max * grazeWindowFactor = ${limit}s`
      );
    }
  }
}

// --- Guard rail (dev only): every tier must stay crossable WITHOUT grazing.
// This is the rebalance's central promise, and it is the exact inverse of the
// rule this file used to enforce. Grazing must stay a choice the player makes
// for points, never a toll the geometry collects.
if (import.meta.env.DEV) {
  const jitter = Math.max(OBSTACLES.trunk.gapJitter, OBSTACLES.branch.bandJitter);
  for (const tier of TIERS) {
    const halfNarrowest = (tier.gapSize - jitter) / 2;
    if (halfNarrowest <= NEAR_MISS.grazeRadius) {
      throw new Error(
        `TIERS "${tier.nameKey}": gapSize ${tier.gapSize} leaves a half-gap of ` +
          `${halfNarrowest}px at its narrowest, which is inside the ` +
          `${NEAR_MISS.grazeRadius}px graze ring — crossing without grazing ` +
          `would be impossible there. Raise gapSize above ` +
          `${NEAR_MISS.grazeRadius * 2 + jitter}.`
      );
    }
  }
}
