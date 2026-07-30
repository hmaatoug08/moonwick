import { TIERS } from "./config";
import { ESSENCES, type Essence } from "./obstacleShapes";
import { readRaw, writeRaw, removeRaw } from "./save";

/**
 * Lifetime statistics, persisted under `moonwick:stats`.
 *
 * WRITTEN EXACTLY ONCE PER RUN, at death. Nothing here touches localStorage
 * while the game is running: a synchronous write in the middle of a 60 fps loop
 * is a frame hitch waiting to happen, and a run that ends in a crash losing its
 * numbers matters far less than a run that stutters.
 *
 * The shape is VERSIONED. Fields will be added as the game grows, and a player
 * who has been keeping stats for months must not lose them to a schema change:
 * `load()` fills in whatever is missing instead of rejecting the whole object.
 */

export const STATS_VERSION = 1;

/** What one tier records about itself. */
export type TierStats = {
  /** Runs that got at least this far. */
  reached: number;
  /** Runs that went all the way through and into the next tier. */
  cleared: number;
  /** Best combo achieved while inside this tier. */
  bestCombo: number;
};

export type LifetimeStats = {
  version: number;

  gamesPlayed: number;
  /** Seconds flown, all runs added up. */
  totalPlayTime: number;
  /** Longest run, in seconds. This is the Percée's reference record. */
  bestTime: number;

  perTier: TierStats[];

  totalGrazes: number;
  grazesByEssence: Record<Essence, number>;

  bestCombo: number;
  fullMoons: number;
  /** Seconds spent at the multiplier cap, all runs added up. */
  fullMoonTime: number;

  /** Closest a graze ever came without dying, in px. Infinity = never grazed. */
  closestGraze: number;
  /** Most grazes ever landed inside a one-second window. */
  bestGrazesPerSecond: number;

  /** Runs that flew past their own record (a Percée crossing). */
  perceesCrossed: number;
  /** Daily Moon attempts flown, all days added up. */
  dailiesFlown: number;
};

/** What a finished run contributes. Assembled by the scene, applied here. */
export type RunStats = {
  duration: number;
  /** Highest tier index reached. */
  tierReached: number;
  /** True when the run left the last tier it reached (i.e. cleared it). */
  clearedTierReached: boolean;
  /** Best combo per tier index, for the tiers this run visited. */
  combosByTier: Record<number, number>;
  grazes: number;
  grazesByEssence: Record<Essence, number>;
  bestCombo: number;
  reachedFullMoon: boolean;
  fullMoonTime: number;
  closestGraze: number;
  bestGrazesPerSecond: number;
  /** True when this run crossed the Percée (only possible with a record). */
  crossedPercee: boolean;
  /** True when this run was a Daily Moon attempt. */
  dailyFlight: boolean;
};

function emptyTier(): TierStats {
  return { reached: 0, cleared: 0, bestCombo: 0 };
}

function emptyByEssence(): Record<Essence, number> {
  const out = {} as Record<Essence, number>;
  for (const essence of ESSENCES) out[essence] = 0;
  return out;
}

export function emptyLifetimeStats(): LifetimeStats {
  return {
    version: STATS_VERSION,
    gamesPlayed: 0,
    totalPlayTime: 0,
    bestTime: 0,
    perTier: TIERS.map(emptyTier),
    totalGrazes: 0,
    grazesByEssence: emptyByEssence(),
    bestCombo: 0,
    fullMoons: 0,
    fullMoonTime: 0,
    closestGraze: Infinity,
    bestGrazesPerSecond: 0,
    perceesCrossed: 0,
    dailiesFlown: 0
  };
}

/** A finite number from unknown input, or the fallback. */
function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Reads the stats back, filling in anything absent.
 *
 * TOLERANT BY DESIGN: an older payload, a hand-edited file, a field added in a
 * later version — all of it degrades to defaults for the missing parts and
 * keeps everything it can still understand. It never throws and never wipes.
 */
export function loadLifetimeStats(): LifetimeStats {
  const base = emptyLifetimeStats();
  const raw = readRaw("stats");
  if (raw === null) return base;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return base;
  const src = parsed as Record<string, unknown>;

  base.gamesPlayed = num(src.gamesPlayed, 0);
  base.totalPlayTime = num(src.totalPlayTime, 0);
  base.bestTime = num(src.bestTime, 0);
  base.totalGrazes = num(src.totalGrazes, 0);
  base.bestCombo = num(src.bestCombo, 0);
  base.fullMoons = num(src.fullMoons, 0);
  base.fullMoonTime = num(src.fullMoonTime, 0);
  base.bestGrazesPerSecond = num(src.bestGrazesPerSecond, 0);
  base.perceesCrossed = num(src.perceesCrossed, 0);
  base.dailiesFlown = num(src.dailiesFlown, 0);
  // Infinity does not survive JSON, so it comes back as null: that is the
  // legitimate "never grazed yet" state, not corruption.
  base.closestGraze = num(src.closestGraze, Infinity);

  // Tiers can be added or removed between versions: keep what lines up, pad
  // the rest, and drop anything past the end of the current TIERS.
  if (Array.isArray(src.perTier)) {
    src.perTier.slice(0, base.perTier.length).forEach((entry, i) => {
      if (typeof entry !== "object" || entry === null) return;
      const e = entry as Record<string, unknown>;
      base.perTier[i] = {
        reached: num(e.reached, 0),
        cleared: num(e.cleared, 0),
        bestCombo: num(e.bestCombo, 0)
      };
    });
  }

  if (typeof src.grazesByEssence === "object" && src.grazesByEssence !== null) {
    const e = src.grazesByEssence as Record<string, unknown>;
    for (const essence of ESSENCES) base.grazesByEssence[essence] = num(e[essence], 0);
  }

  return base;
}

/**
 * Folds a finished run into the lifetime stats and persists the result.
 * The single write of the whole session.
 */
export function recordRunStats(run: RunStats): LifetimeStats {
  const stats = loadLifetimeStats();

  stats.gamesPlayed += 1;
  stats.totalPlayTime += run.duration;
  stats.bestTime = Math.max(stats.bestTime, run.duration);

  for (let i = 0; i <= run.tierReached && i < stats.perTier.length; i++) {
    stats.perTier[i].reached += 1;
    // Every tier below the one she died in was, by definition, cleared.
    const cleared = i < run.tierReached || run.clearedTierReached;
    if (cleared) stats.perTier[i].cleared += 1;
    const combo = run.combosByTier[i] ?? 0;
    stats.perTier[i].bestCombo = Math.max(stats.perTier[i].bestCombo, combo);
  }

  stats.totalGrazes += run.grazes;
  for (const essence of ESSENCES) {
    stats.grazesByEssence[essence] += run.grazesByEssence[essence] ?? 0;
  }

  stats.bestCombo = Math.max(stats.bestCombo, run.bestCombo);
  if (run.reachedFullMoon) stats.fullMoons += 1;
  stats.fullMoonTime += run.fullMoonTime;
  stats.closestGraze = Math.min(stats.closestGraze, run.closestGraze);
  stats.bestGrazesPerSecond = Math.max(stats.bestGrazesPerSecond, run.bestGrazesPerSecond);
  if (run.crossedPercee) stats.perceesCrossed += 1;
  if (run.dailyFlight) stats.dailiesFlown += 1;

  save(stats);
  return stats;
}

function save(stats: LifetimeStats): void {
  // Infinity is not valid JSON; it round-trips through null and loads back as
  // Infinity, which is exactly the "never happened" value.
  writeRaw("stats", JSON.stringify(stats, (_key, value) => (value === Infinity ? null : value)));
}

/** Debug: wipes the lifetime stats and nothing else. */
export function resetLifetimeStats(): void {
  removeRaw("stats");
}

/** Debug: a readable dump for the console. */
export function describeLifetimeStats(stats: LifetimeStats = loadLifetimeStats()): string {
  const seconds = (v: number) => `${v.toFixed(1)}s`;
  const lines = [
    `moonwick:stats  v${stats.version}`,
    `games ${stats.gamesPlayed}   played ${seconds(stats.totalPlayTime)}   best ${seconds(stats.bestTime)}`,
    `grazes ${stats.totalGrazes}   best combo ${stats.bestCombo}`,
    `full moons ${stats.fullMoons}   in full moon ${seconds(stats.fullMoonTime)}`,
    `closest graze ${Number.isFinite(stats.closestGraze) ? stats.closestGraze.toFixed(1) + "px" : "-"}`,
    `best grazes/s ${stats.bestGrazesPerSecond}`,
    `percees crossed ${stats.perceesCrossed}   dailies flown ${stats.dailiesFlown}`,
    "by essence: " + ESSENCES.map((e) => `${e} ${stats.grazesByEssence[e]}`).join("  "),
    "by tier:"
  ];
  stats.perTier.forEach((tier, i) => {
    lines.push(
      `  ${TIERS[i].nameKey.replace("tier.", "").padEnd(10)} ` +
        `reached ${String(tier.reached).padStart(4)}  ` +
        `cleared ${String(tier.cleared).padStart(4)}  ` +
        `best combo ${tier.bestCombo}`
    );
  });
  return lines.join("\n");
}
