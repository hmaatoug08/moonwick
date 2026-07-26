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

/** Records a finished run and returns the updated stats. */
export function recordRun(
  score: number,
  combo: number,
  tier: number
): { stats: Stats; newBestScore: boolean } {
  const stats = loadStats();
  const newBestScore = score > stats.bestScore && stats.games > 0;
  stats.bestScore = Math.max(stats.bestScore, score);
  stats.bestCombo = Math.max(stats.bestCombo, combo);
  stats.bestTier = Math.max(stats.bestTier, tier);
  stats.games += 1;
  write("bestScore", String(stats.bestScore));
  write("bestCombo", String(stats.bestCombo));
  write("bestTier", String(stats.bestTier));
  write("games", String(stats.games));
  return { stats, newBestScore };
}

export function isSoundEnabled(): boolean {
  return read("sound") !== "0";
}

export function setSoundEnabled(on: boolean): void {
  write("sound", on ? "1" : "0");
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
