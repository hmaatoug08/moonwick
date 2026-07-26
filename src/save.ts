/**
 * Persistance localStorage. Clé unique préfixée `moonwick:`.
 * Tolère un stockage indisponible (navigation privée, quotas) : le jeu
 * fonctionne alors sans persistance, sans jamais lever d'exception.
 *
 * Clés utilisées :
 *   moonwick:bestScore     meilleur score (entier)
 *   moonwick:bestCombo     meilleur combo (entier, nombre de frôlements)
 *   moonwick:bestTier      index du palier le plus loin atteint (0..TIERS-1)
 *   moonwick:games         nombre de parties jouées
 *   moonwick:sound         "1" (défaut) / "0"
 *   moonwick:tutorialDone  "1" après le premier frôlement réussi
 *   moonwick:lang          "en" | "fr" | "es" | "it" — choix explicite, prime
 *                          définitivement sur navigator.language
 *
 * Les anciennes clés `sorciere:` sont migrées automatiquement (voir plus bas).
 */
const PREFIX = "moonwick:";
/** Ancien préfixe, avant le renommage de la marque. */
const LEGACY_PREFIX = "sorciere:";

/**
 * Migration silencieuse, une fois au chargement du module : toute clé
 * `sorciere:` est recopiée vers `moonwick:` puis supprimée. Les scores et
 * réglages existants sont donc conservés, sans que le joueur voie rien.
 * On n'écrase jamais une valeur déjà présente sous le nouveau préfixe.
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
    // Stockage indisponible : rien à migrer, le jeu tourne sans persistance.
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
    // Stockage indisponible : on joue sans persistance.
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

/** Enregistre une fin de partie et retourne les stats mises à jour. */
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
 * Langue choisie explicitement par l'utilisateur, ou null si jamais choisie
 * (auquel cas i18n retombe sur la détection navigateur).
 */
export function readLang(): string | null {
  return read("lang");
}

export function writeLang(lang: string): void {
  write("lang", lang);
}

/** Vrai une fois le premier frôlement réussi, pour toujours. */
export function isTutorialDone(): boolean {
  return read("tutorialDone") === "1";
}

export function markTutorialDone(): void {
  write("tutorialDone", "1");
}
