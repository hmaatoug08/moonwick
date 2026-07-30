import Phaser from "phaser";
import { GRAZE_TIERS, OBSTACLE_ART, OMENS, TIERS, WITCH_ART } from "./config";
import type { StringKey } from "./i18n";
import { MOON_ON_RIGHT } from "./obstacleShapes";
import { readRaw, writeRaw } from "./save";
import type { LifetimeStats } from "./stats";

/**
 * The omens — twelve signs the forest gives, shown on the Scores page.
 *
 * PURELY COMMEMORATIVE. An omen never touches gameplay: no modifier, no
 * unlock-gated content, no effect on generation — the forest never changes
 * because of what is written here.
 *
 * DERIVED, NEVER STORED. Whether an omen is lit is a pure reading of the
 * lifetime stats, recomputed every time the page opens. There is no
 * `moonwick:omens` unlock key that could drift out of sync with the deeds, a
 * veteran's past runs light their omens retroactively, and a deed worth a new
 * omen is paid for with a new stats field (versioned, tolerant), never with a
 * stored flag. The only thing persisted is presentation state — which lit
 * omens the page has already REVEALED (`moonwick:omensSeen`) — and losing it
 * costs one repeated shimmer, nothing more.
 *
 * WORDLESS LORE. A locked omen shows its glyph dimmed, with no name: the
 * glyph is the riddle, the name is part of the reward, and no unlock
 * condition is ever spelled out in prose. The grid reads in journey order —
 * the discovery, the forest, mastery, the moon — so the collection is the
 * story of the night told in glyphs, not a quest log.
 *
 * The glyphs speak the interface icons' language (src/icons.ts): dark body
 * lifted off black, silver-violet light, one moon direction for everything.
 * No image file — every glyph is a drawing routine.
 */

export type Omen = {
  /** Stable id, used only for the seen-set. Never displayed. */
  id: string;
  nameKey: StringKey;
  /** Pure predicate over the recorded deeds. `bestCombo` is the larger of the
   * two eras' best combos, exactly as the Records page shows it. */
  isLit: (s: LifetimeStats, bestCombo: number) => boolean;
  /** Draws the glyph centred on (x, y) inside a 2·OMENS.glyphR box. */
  draw: (g: Phaser.GameObjects.Graphics, x: number, y: number, alpha: number) => void;
};

// Same sources as icons.ts: the witch's lifted body colour (near-black fill
// on the darkest screen must not be pure black), the obstacles' rim.
const BODY = WITCH_ART.bodyColor;
const RIM = OBSTACLE_ART.rimColor;
const STROKE = 2.4;
const SIDE = MOON_ON_RIGHT ? 1 : -1;

/** Tier index by name key: stable against reordering, loud when a tier goes. */
function tierIndex(nameKey: string): number {
  const index = TIERS.findIndex((tier) => tier.nameKey === nameKey);
  if (index < 0) throw new Error(`omens: unknown tier ${nameKey}`);
  return index;
}

const BRAMBLES = tierIndex("tier.brambles");
const WALL = tierIndex("tier.wall");
const MOON_EYE_TIER = tierIndex("tier.moonEye");

/** A four-point spark: the game's light, so strokes of rim, not a dark mass. */
function spark(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  alpha: number,
  width = 2
): void {
  g.lineStyle(width, RIM, alpha);
  g.lineBetween(x, y - r, x, y + r);
  g.lineBetween(x - r * 0.7, y, x + r * 0.7, y);
  g.lineStyle(width * 0.7, RIM, alpha * 0.6);
  g.lineBetween(x - r * 0.4, y - r * 0.4, x + r * 0.4, y + r * 0.4);
  g.lineBetween(x - r * 0.4, y + r * 0.4, x + r * 0.4, y - r * 0.4);
}

/** The moon-side arc of a circle: the rim treatment, on a glyph's scale. */
function rimArc(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  alpha: number,
  width = STROKE
): void {
  const centre = MOON_ON_RIGHT ? 0 : Math.PI;
  g.lineStyle(width, RIM, alpha);
  g.beginPath();
  g.arc(x, y, r, centre - 1.25, centre + 1.25);
  g.strokePath();
}

export const OMEN_LIST: readonly Omen[] = [
  // --- Row one: the discovery.
  {
    id: "firstSpark",
    nameKey: "omen.firstSpark",
    isLit: (s) => s.totalGrazes >= 1,
    draw: (g, x, y, a) => spark(g, x, y, 14, a, 2.4)
  },
  {
    id: "hundredSparks",
    nameKey: "omen.hundredSparks",
    isLit: (s) => s.totalGrazes >= OMENS.hundredSparks,
    draw: (g, x, y, a) => {
      // A small constellation: the sparks joined by the faintest thread.
      const stars: [number, number, number][] = [
        [-13, 8, 4],
        [-3, -10, 6],
        [8, 2, 3.5],
        [15, -7, 5]
      ];
      g.lineStyle(1, RIM, a * 0.3);
      g.beginPath();
      g.moveTo(x + stars[0][0], y + stars[0][1]);
      for (const [sx, sy] of stars.slice(1)) g.lineTo(x + sx, y + sy);
      g.strokePath();
      for (const [sx, sy, r] of stars) spark(g, x + sx, y + sy, r, a, 1.8);
    }
  },
  {
    id: "chain",
    nameKey: "omen.chain",
    isLit: (_s, bestCombo) => bestCombo >= OMENS.chainCombo,
    draw: (g, x, y, a) => {
      // Three interlocked links climbing towards the moon side.
      const links: [number, number][] = [
        [-10 * SIDE, 9],
        [0, 0],
        [10 * SIDE, -9]
      ];
      links.forEach(([lx, ly], i) => {
        const bright = i === links.length - 1 ? a : a * 0.7;
        g.lineStyle(2.2, RIM, bright * 0.5);
        g.strokeCircle(x + lx, y + ly, 7.5);
        rimArc(g, x + lx, y + ly, 7.5, bright, 2.2);
      });
    }
  },

  // --- Row two: the forest.
  {
    id: "brambles",
    nameKey: "omen.brambles",
    isLit: (s) => (s.perTier[BRAMBLES]?.reached ?? 0) >= 1,
    draw: (g, x, y, a) => {
      // A curved stem with three thorns — the species itself.
      const stem: [number, number][] = [
        [-14, 14],
        [-6, 6],
        [2, 1],
        [9, -6],
        [13, -15]
      ];
      g.lineStyle(2.4, RIM, a);
      g.beginPath();
      g.moveTo(x + stem[0][0], y + stem[0][1]);
      for (const [sx, sy] of stem.slice(1)) g.lineTo(x + sx, y + sy);
      g.strokePath();
      const thorns: [number, number, number, number][] = [
        [-8, 8, -14, 2],
        [1, 2, 6, 9],
        [8, -5, 3, -12]
      ];
      g.fillStyle(BODY, a);
      for (const [tx, ty, px, py] of thorns) {
        g.fillTriangle(x + tx - 2, y + ty, x + tx + 2, y + ty, x + px, y + py);
        g.lineStyle(1.2, RIM, a * 0.7);
        g.lineBetween(x + tx, y + ty, x + px, y + py);
      }
    }
  },
  {
    id: "wall",
    nameKey: "omen.wall",
    isLit: (s) => (s.perTier[WALL]?.cleared ?? 0) >= 1,
    draw: (g, x, y, a) => {
      // The dense stand: three trunks, each lit on the moon side.
      const trunks: [number, number, number][] = [
        [-13, 18, 5],
        [0, 22, 6],
        [13, 16, 5]
      ];
      for (const [tx, h, w] of trunks) {
        g.fillStyle(BODY, a);
        g.fillRect(x + tx - w / 2, y - h, w, h * 2);
        g.lineStyle(1.2, RIM, a * 0.4);
        g.strokeRect(x + tx - w / 2, y - h, w, h * 2);
        g.lineStyle(STROKE, RIM, a);
        g.lineBetween(x + tx + (SIDE * w) / 2, y - h, x + tx + (SIDE * w) / 2, y + h);
      }
    }
  },
  {
    id: "eye",
    nameKey: "omen.eye",
    isLit: (s) => (s.perTier[MOON_EYE_TIER]?.reached ?? 0) >= 1,
    draw: (g, x, y, a) => {
      // The almond of the eye, a small moon for a pupil.
      g.lineStyle(2, RIM, a * 0.8);
      g.beginPath();
      g.arc(x, y + 12, 20, -Math.PI * 0.78, -Math.PI * 0.22);
      g.strokePath();
      g.beginPath();
      g.arc(x, y - 12, 20, Math.PI * 0.22, Math.PI * 0.78);
      g.strokePath();
      g.fillStyle(BODY, a);
      g.fillCircle(x, y, 6);
      g.lineStyle(1.2, RIM, a * 0.4);
      g.strokeCircle(x, y, 6);
      rimArc(g, x, y, 6, a, 2);
    }
  },

  // --- Row three: mastery.
  {
    id: "needle",
    nameKey: "omen.needle",
    isLit: (s) => s.closestGraze <= GRAZE_TIERS.needleBand,
    draw: (g, x, y, a) => {
      // The needle, and the thread that made it through the eye.
      g.lineStyle(2.4, RIM, a);
      g.lineBetween(x - 12, y + 13, x + 8, y - 7);
      g.lineStyle(1.6, RIM, a);
      g.strokeCircle(x + 10.5, y - 9.5, 3);
      const thread: [number, number][] = [
        [16, -16],
        [12.5, -11.5],
        [8.5, -7.5],
        [10, -1],
        [15, 4],
        [13, 11]
      ];
      g.lineStyle(1, RIM, a * 0.5);
      g.beginPath();
      g.moveTo(x + thread[0][0], y + thread[0][1]);
      for (const [tx, ty] of thread.slice(1)) g.lineTo(x + tx, y + ty);
      g.strokePath();
    }
  },
  {
    id: "flurry",
    nameKey: "omen.flurry",
    isLit: (s) => s.bestGrazesPerSecond >= OMENS.flurryPerSecond,
    draw: (g, x, y, a) => {
      // Three strokes of speed, a spark at the leading edge.
      const lines: [number, number, number][] = [
        [-16, -8, 20],
        [-13, 0, 26],
        [-16, 8, 16]
      ];
      for (const [lx, ly, len] of lines) {
        const from = SIDE > 0 ? lx : -lx - len;
        g.lineStyle(2, RIM, a * 0.35);
        g.lineBetween(x + from, y + ly, x + from + len * 0.6, y + ly);
        g.lineStyle(2, RIM, a * 0.8);
        g.lineBetween(x + from + len * 0.6, y + ly, x + from + len, y + ly);
      }
      spark(g, x + SIDE * 15, y, 6, a, 2);
    }
  },
  {
    id: "longNight",
    nameKey: "omen.longNight",
    isLit: (s) => s.totalPlayTime >= OMENS.longNightSeconds,
    draw: (g, x, y, a) => {
      // The moon filling as the night wears on: new, half, full.
      g.lineStyle(1.6, RIM, a * 0.6);
      g.strokeCircle(x - 14, y, 5);
      g.fillStyle(BODY, a);
      g.beginPath();
      g.arc(x, y, 5.5, -Math.PI / 2, Math.PI / 2, SIDE < 0);
      g.fillPath();
      g.lineStyle(1.6, RIM, a * 0.8);
      g.strokeCircle(x, y, 5.5);
      g.fillStyle(BODY, a);
      g.fillCircle(x + 14, y, 6);
      g.lineStyle(1.2, RIM, a * 0.5);
      g.strokeCircle(x + 14, y, 6);
      rimArc(g, x + 14, y, 6, a, 2);
    }
  },

  // --- Row four: the moon.
  {
    id: "fullMoon",
    nameKey: "omen.fullMoon",
    isLit: (s) => s.fullMoons >= 1,
    draw: (g, x, y, a) => {
      // The disc itself: the one glyph rimmed all the way round.
      g.fillStyle(BODY, a);
      g.fillCircle(x, y, 13);
      g.lineStyle(1.4, RIM, a * 0.5);
      g.strokeCircle(x, y, 13);
      rimArc(g, x, y, 13, a);
      g.lineStyle(1, RIM, a * 0.3);
      g.strokeCircle(x - SIDE * 3, y - 3, 2.5);
      g.strokeCircle(x + SIDE * 1, y + 5, 1.8);
    }
  },
  {
    id: "percee",
    nameKey: "omen.percee",
    isLit: (s) => s.perceesCrossed >= 1,
    draw: (g, x, y, a) => {
      // The arch of frozen fireflies, brightest at the crown.
      const dots = 7;
      for (let i = 0; i < dots; i++) {
        const angle = Math.PI + (i / (dots - 1)) * Math.PI;
        const dx = Math.cos(angle) * 15;
        const dy = Math.sin(angle) * 24 + 12;
        const crown = 1 - Math.abs(i - (dots - 1) / 2) / ((dots - 1) / 2);
        g.fillStyle(RIM, a * (0.45 + 0.55 * crown));
        g.fillCircle(x + dx, y + dy, 1.6 + crown * 0.9);
      }
    }
  },
  {
    id: "daily",
    nameKey: "omen.daily",
    isLit: (s) => s.dailiesFlown >= 1,
    draw: (g, x, y, a) => {
      // The day's moon rising over the horizon everyone shares.
      g.lineStyle(1, RIM, a * 0.4);
      g.lineBetween(x - 16, y + 11, x + 16, y + 11);
      const centre = MOON_ON_RIGHT ? -Math.PI * 0.25 : Math.PI * 1.25;
      g.lineStyle(3.4, RIM, a);
      g.beginPath();
      g.arc(x, y - 3, 9, centre - Math.PI * 0.55, centre + Math.PI * 0.55);
      g.strokePath();
    }
  }
];

// --- Guard rail (dev only): ids must be unique — the seen-set is keyed on
// them, and a duplicate would make one omen's reveal swallow another's.
if (import.meta.env.DEV) {
  const ids = new Set(OMEN_LIST.map((o) => o.id));
  if (ids.size !== OMEN_LIST.length) {
    throw new Error("omens: duplicate id in OMEN_LIST");
  }
}

/**
 * Lit omens the page has already revealed, under `moonwick:omensSeen`.
 * Presentation state only — unlock state is always derived. Malformed content
 * degrades to "nothing seen yet": the cost is one repeated shimmer.
 */
export function loadOmensSeen(): Set<string> {
  const raw = readRaw("omensSeen");
  if (raw === null) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

/** Marks omens as revealed. Ids never leave; the set only grows. */
export function markOmensSeen(ids: Iterable<string>): void {
  const seen = loadOmensSeen();
  for (const id of ids) seen.add(id);
  writeRaw("omensSeen", JSON.stringify([...seen]));
}
