import { DEATHS, DEBUG_RESET_TUTORIAL, HISTORY, MERCY } from "./config";

/**
 * localStorage persistence. Every key is prefixed with `moonwick:`.
 * Tolerates unavailable storage (private browsing, quota): the game then runs
 * without persistence and never throws.
 *
 * Keys in use:
 *   moonwick:bestScore     best score (integer)
 *   moonwick:bestCombo     best combo (integer, number of grazes)
 *   moonwick:bestTier      index of the furthest tier reached (0..TIERS-1)
 *   moonwick:games         number of games played
 *   moonwick:sound         "1" (default) / "0"
 *   moonwick:tutorialDone  "1" once the first graze has succeeded
 *   moonwick:lang          "en" | "fr" | "es" | "it" — explicit choice, wins
 *                          permanently over navigator.language
 *   moonwick:history       JSON array of the last HISTORY.size scores, oldest
 *                          first; malformed content degrades to an empty list
 *   moonwick:deaths        JSON array of the last DEATHS.size deaths, oldest
 *                          first: { t: seconds survived, tier, cause, grazes }
 *                          — the tuning source of truth, and what the adaptive
 *                          easing is derived from
 *
 * Legacy `sorciere:` keys are migrated automatically (see below).
 */
const PREFIX = "moonwick:";
/** Legacy prefix, from before the brand rename. */
const LEGACY_PREFIX = "sorciere:";

/**
 * Silent migration, run once when the module loads: every `sorciere:` key is
 * copied to `moonwick:` and then removed. Existing scores and settings are
 * kept without the player noticing anything.
 * A value already present under the new prefix is never overwritten.
 */
function migrateLegacyKeys(): void {
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(LEGACY_PREFIX)) legacyKeys.push(key);
    }
    for (const legacyKey of legacyKeys) {
      const newKey = PREFIX + legacyKey.slice(LEGACY_PREFIX.length);
      const value = localStorage.getItem(legacyKey);
      if (value !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, value);
      }
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Storage unavailable: nothing to migrate, the game runs without it.
  }
}

migrateLegacyKeys();

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage unavailable: we play without persistence.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

/**
 * Raw prefixed access, for modules that own their own key and serialisation
 * (stats.ts). Everything still goes through this file, so the `moonwick:`
 * prefix, the legacy migration and the storage-unavailable tolerance stay in
 * one place — see CLAUDE.md: nothing else may touch localStorage directly.
 */
export function readRaw(key: string): string | null {
  return read(key);
}

export function writeRaw(key: string, value: string): void {
  write(key, value);
}

export function removeRaw(key: string): void {
  remove(key);
}

/**
 * Last scores, oldest first. Never throws: corrupted or hand-edited content
 * simply reads back as an empty history.
 */
export function loadHistory(): number[] {
  const raw = read("history");
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .slice(-HISTORY.size);
  } catch {
    return [];
  }
}

/** Appends a score and keeps only the last HISTORY.size entries. */
function pushHistory(score: number): number[] {
  const history = [...loadHistory(), score].slice(-HISTORY.size);
  write("history", JSON.stringify(history));
  return history;
}

/** Why the run ended. Only obstacles kill, so this says which kind. */
export type DeathCause = "branch" | "trunk";

/** One recorded death. Short keys: fifty of these live in one storage value. */
export type DeathRecord = {
  /** Seconds survived. */
  t: number;
  /** Index into TIERS where the run ended. */
  tier: number;
  cause: DeathCause;
  /** Grazes completed during the run. */
  grazes: number;
};

/**
 * The last deaths, oldest first. Never throws: corrupted or hand-edited
 * content reads back as an empty log, and individual malformed entries are
 * dropped rather than poisoning the whole list.
 */
export function loadDeaths(): DeathRecord[] {
  const raw = read("deaths");
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is DeathRecord => {
        if (typeof v !== "object" || v === null) return false;
        const r = v as Partial<DeathRecord>;
        return (
          typeof r.t === "number" &&
          Number.isFinite(r.t) &&
          typeof r.tier === "number" &&
          Number.isFinite(r.tier) &&
          (r.cause === "branch" || r.cause === "trunk") &&
          typeof r.grazes === "number" &&
          Number.isFinite(r.grazes)
        );
      })
      .slice(-DEATHS.size);
  } catch {
    return [];
  }
}

/** Appends a death and keeps only the last DEATHS.size entries. */
export function pushDeath(record: DeathRecord): DeathRecord[] {
  const deaths = [...loadDeaths(), record].slice(-DEATHS.size);
  write("deaths", JSON.stringify(deaths));
  return deaths;
}

/**
 * Whether the next run should get the adaptive easing.
 *
 * DERIVED, never stored: it is simply "the last `deathsToTrigger` deaths were
 * all quick ones". A run that lasts breaks the trailing streak by itself, so
 * there is no separate flag that could drift out of sync with the log.
 */
export function shouldEase(deaths: DeathRecord[] = loadDeaths()): boolean {
  if (!MERCY.enabled) return false;
  if (deaths.length < MERCY.deathsToTrigger) return false;
  return deaths
    .slice(-MERCY.deathsToTrigger)
    .every((d) => d.t < MERCY.quickDeathSeconds);
}

export type Stats = {
  bestScore: number;
  bestCombo: number;
  bestTier: number;
  games: number;
};

export function loadStats(): Stats {
  return {
    bestScore: Number(read("bestScore")) || 0,
    bestCombo: Number(read("bestCombo")) || 0,
    bestTier: Number(read("bestTier")) || 0,
    games: Number(read("games")) || 0
  };
}

/**
 * Records a finished run and returns the updated stats, plus the score
 * history including this run. `previousBest` is the record BEFORE this run,
 * which the caller needs to phrase the "so close" message.
 */
export function recordRun(
  score: number,
  combo: number,
  tier: number
): { stats: Stats; newBestScore: boolean; history: number[]; previousBest: number } {
  const stats = loadStats();
  const previousBest = stats.bestScore;
  const newBestScore = score > stats.bestScore && stats.games > 0;
  stats.bestScore = Math.max(stats.bestScore, score);
  stats.bestCombo = Math.max(stats.bestCombo, combo);
  stats.bestTier = Math.max(stats.bestTier, tier);
  stats.games += 1;
  write("bestScore", String(stats.bestScore));
  write("bestCombo", String(stats.bestCombo));
  write("bestTier", String(stats.bestTier));
  write("games", String(stats.games));
  const history = pushHistory(score);
  return { stats, newBestScore, history, previousBest };
}

export function isSoundEnabled(): boolean {
  return read("sound") !== "0";
}

export function setSoundEnabled(on: boolean): void {
  write("sound", on ? "1" : "0");
}

/**
 * The Daily Moon: today's best and attempt count, under `moonwick:daily`.
 * One record only — yesterday's daily is gone the moment the date differs,
 * which is the whole point of a daily. Malformed content degrades to "no
 * daily yet", never throws.
 */
export type DailyRecord = { date: string; best: number; attempts: number };

export function loadDaily(date: string): DailyRecord | null {
  const raw = read("daily");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DailyRecord>;
    if (
      parsed.date === date &&
      typeof parsed.best === "number" &&
      typeof parsed.attempts === "number"
    ) {
      return { date, best: parsed.best, attempts: parsed.attempts };
    }
  } catch {
    // Hand-edited or truncated: treated as absent.
  }
  return null;
}

/** One more attempt flown today; keeps the day's best. */
export function recordDailyRun(date: string, score: number): DailyRecord {
  const current = loadDaily(date);
  const next: DailyRecord = {
    date,
    best: Math.max(current?.best ?? 0, score),
    attempts: (current?.attempts ?? 0) + 1
  };
  write("daily", JSON.stringify(next));
  return next;
}

/** Music toggle, separate from the effects: `moonwick:music`, on by default. */
export function isMusicEnabled(): boolean {
  return read("music") !== "0";
}

export function setMusicEnabled(on: boolean): void {
  write("music", on ? "1" : "0");
}

/**
 * Language explicitly chosen by the player, or null if never chosen (in which
 * case i18n falls back to browser detection).
 */
export function readLang(): string | null {
  return read("lang");
}

export function writeLang(lang: string): void {
  write("lang", lang);
}

/** True once the first graze has succeeded, forever. */
export function isTutorialDone(): boolean {
  return read("tutorialDone") === "1";
}

export function markTutorialDone(): void {
  write("tutorialDone", "1");
}

/** Makes the first-run graze hint show again, leaving every other key alone. */
export function resetTutorial(): void {
  remove("tutorialDone");
}

// Debug flag applied once at module load, before any scene reads the flag.
if (DEBUG_RESET_TUTORIAL) resetTutorial();
