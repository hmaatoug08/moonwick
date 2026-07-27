import { DEBUG_FORCE_LANG } from "./config";
import { readLang, writeLang } from "./save";

export type Lang = "en" | "fr" | "es" | "it";

/** Display order in the settings panel. */
export const LANGS: readonly Lang[] = ["en", "fr", "es", "it"];

/** Native names, never translated: everyone recognises their own language. */
export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  it: "Italiano"
};

/**
 * Key reference: English is authoritative. The other three languages are typed
 * as `Record<StringKey, string>`, so a forgotten key breaks the build.
 *
 * Values may contain `{name}` parameters, substituted by `t()`.
 */
const EN = {
  "menu.play": "Tap to play",
  "menu.bestScore": "Best score  {score}",

  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.sound": "Sound",
  "settings.soundOn": "On",
  "settings.soundOff": "Off",
  "settings.back": "Back",
  "settings.howToPlay": "How to play",

  "help.graze": "Graze an obstacle to score",
  "help.touch": "Touch it and the run ends",
  "help.combo": "Chain grazes to multiply",

  "death.causeBranch": "You hit a branch",
  "death.tier": "Tier · {tier}",
  "death.bestCombo": "Best combo · {combo}",
  "death.share": "Share",
  "death.home": "Home",
  "death.replay": "Replay",

  "pause.title": "Paused",
  "pause.hint": "Tap to resume",

  "teach.word": "GRAZE",
  "float.graze": "GRAZED! +{points}",

  "share.newRecord": "NEW RECORD",
  "share.bestCombo": "Best combo · {combo}",

  "tier.edge": "The Edge",
  "tier.darkwood": "The Dark Wood",
  "tier.brambles": "The Brambles",
  "tier.wall": "The Wall",
  "tier.moonEye": "The Moon's Eye"
} as const;

export type StringKey = keyof typeof EN;

export const STRINGS: Record<Lang, Record<StringKey, string>> = {
  en: EN,

  fr: {
    "menu.play": "Tape pour jouer",
    "menu.bestScore": "Meilleur score  {score}",

    "settings.title": "Réglages",
    "settings.language": "Langue",
    "settings.sound": "Son",
    "settings.soundOn": "Oui",
    "settings.soundOff": "Non",
    "settings.back": "Retour",
    "settings.howToPlay": "Comment jouer",

    "help.graze": "Frôle un obstacle pour marquer",
    "help.touch": "Le toucher, et la partie s'arrête",
    "help.combo": "Enchaîne les frôlements pour multiplier",

    "death.causeBranch": "Tu as touché une branche",
    "death.tier": "Palier · {tier}",
    "death.bestCombo": "Meilleur combo · {combo}",
    "death.share": "Partager",
    "death.home": "Accueil",
    "death.replay": "Rejouer",

    "pause.title": "En pause",
    "pause.hint": "Tape pour reprendre",

    "teach.word": "FRÔLE",
    "float.graze": "FRÔLÉ ! +{points}",

    "share.newRecord": "NOUVEAU RECORD",
    "share.bestCombo": "Meilleur combo · {combo}",

    "tier.edge": "La Lisière",
    "tier.darkwood": "Le Bois Noir",
    "tier.brambles": "Les Ronces",
    "tier.wall": "Le Mur",
    "tier.moonEye": "L'Œil de la Lune"
  },

  es: {
    "menu.play": "Toca para jugar",
    "menu.bestScore": "Mejor puntuación  {score}",

    "settings.title": "Ajustes",
    "settings.language": "Idioma",
    "settings.sound": "Sonido",
    "settings.soundOn": "Sí",
    "settings.soundOff": "No",
    "settings.back": "Volver",
    "settings.howToPlay": "Cómo jugar",

    "help.graze": "Roza un obstáculo para puntuar",
    "help.touch": "Si lo tocas, la partida termina",
    "help.combo": "Encadena rozaduras para multiplicar",

    "death.causeBranch": "Has tocado una rama",
    "death.tier": "Nivel · {tier}",
    "death.bestCombo": "Mejor combo · {combo}",
    "death.share": "Compartir",
    "death.home": "Inicio",
    "death.replay": "Jugar de nuevo",

    "pause.title": "En pausa",
    "pause.hint": "Toca para continuar",

    "teach.word": "ROZA",
    "float.graze": "¡ROZADO! +{points}",

    "share.newRecord": "NUEVO RÉCORD",
    "share.bestCombo": "Mejor combo · {combo}",

    "tier.edge": "La Linde",
    "tier.darkwood": "El Bosque Negro",
    "tier.brambles": "Las Zarzas",
    "tier.wall": "El Muro",
    "tier.moonEye": "El Ojo de la Luna"
  },

  it: {
    "menu.play": "Tocca per giocare",
    "menu.bestScore": "Miglior punteggio  {score}",

    "settings.title": "Impostazioni",
    "settings.language": "Lingua",
    "settings.sound": "Audio",
    "settings.soundOn": "Sì",
    "settings.soundOff": "No",
    "settings.back": "Indietro",
    "settings.howToPlay": "Come si gioca",

    "help.graze": "Sfiora un ostacolo per segnare",
    "help.touch": "Se lo tocchi, la partita finisce",
    "help.combo": "Concatena le sfiorate per moltiplicare",

    "death.causeBranch": "Hai toccato un ramo",
    "death.tier": "Livello · {tier}",
    "death.bestCombo": "Miglior combo · {combo}",
    "death.share": "Condividi",
    "death.home": "Home",
    "death.replay": "Rigioca",

    "pause.title": "In pausa",
    "pause.hint": "Tocca per riprendere",

    "teach.word": "SFIORA",
    "float.graze": "SFIORATO! +{points}",

    "share.newRecord": "NUOVO RECORD",
    "share.bestCombo": "Miglior combo · {combo}",

    "tier.edge": "Il Margine",
    "tier.darkwood": "Il Bosco Nero",
    "tier.brambles": "I Rovi",
    "tier.wall": "Il Muro",
    "tier.moonEye": "L'Occhio della Luna"
  }
};

/**
 * Contextual game-over messages, shown as one line above the score.
 *
 * ANTI-CONCATENATION RULE: a message is NEVER assembled from fragments. Each
 * variant is a complete sentence written out in full in every language, with
 * `{score}`, `{combo}` and `{tier}` placeholders. Word order, punctuation and
 * agreement differ per language, so glueing pieces together produces broken
 * sentences somewhere — always add a whole new template instead.
 *
 * Each category holds 2-3 variants, picked at random by `deathMessage()`.
 */
export type DeathCategory = "newRecord" | "nearRecord" | "bigCombo" | "earlyDeath" | "default";

export const DEATH_MESSAGES: Record<Lang, Record<DeathCategory, string[]>> = {
  en: {
    newRecord: [
      "New record — {score} points.",
      "Your best run yet: {score}.",
      "{score}. Nothing you have flown comes close."
    ],
    nearRecord: [
      "So close. {score}, and the record still stands.",
      "{score} — your record is within reach.",
      "You were closing in: {score}."
    ],
    bigCombo: [
      "A chain of {combo} grazes. The forest noticed.",
      "{combo} grazes without breaking. That was the good stuff.",
      "Combo {combo} — you were flying on magic alone."
    ],
    earlyDeath: [
      "That was quick. The night had barely started.",
      "Barely airborne. Again?",
      "The very first branches got you."
    ],
    default: [
      "{score} points. The forest keeps its trophies.",
      "You reached {tier} with {score}.",
      "{score}. The branches win this round."
    ]
  },

  fr: {
    newRecord: [
      "Nouveau record — {score} points.",
      "Ta meilleure course : {score}.",
      "{score}. Rien de ce que tu as volé n'en approche."
    ],
    nearRecord: [
      "Tout près. {score}, et le record tient encore.",
      "{score} — ton record est à portée.",
      "Tu te rapprochais : {score}."
    ],
    bigCombo: [
      "Une chaîne de {combo} frôlements. La forêt l'a remarqué.",
      "{combo} frôlements sans rompre. C'était du beau vol.",
      "Combo {combo} — tu ne volais plus qu'à la magie."
    ],
    earlyDeath: [
      "Vite terminé. La nuit venait à peine de commencer.",
      "À peine en l'air. On recommence ?",
      "Les toutes premières branches ont eu raison de toi."
    ],
    default: [
      "{score} points. La forêt garde ses trophées.",
      "Tu as atteint {tier} avec {score}.",
      "{score}. Les branches gagnent cette manche."
    ]
  },

  // TODO: écrire en natif — texte anglais en attendant.
  es: {
    newRecord: [
      "New record — {score} points.",
      "Your best run yet: {score}.",
      "{score}. Nothing you have flown comes close."
    ],
    nearRecord: [
      "So close. {score}, and the record still stands.",
      "{score} — your record is within reach.",
      "You were closing in: {score}."
    ],
    bigCombo: [
      "A chain of {combo} grazes. The forest noticed.",
      "{combo} grazes without breaking. That was the good stuff.",
      "Combo {combo} — you were flying on magic alone."
    ],
    earlyDeath: [
      "That was quick. The night had barely started.",
      "Barely airborne. Again?",
      "The very first branches got you."
    ],
    default: [
      "{score} points. The forest keeps its trophies.",
      "You reached {tier} with {score}.",
      "{score}. The branches win this round."
    ]
  },

  // TODO: écrire en natif — texte anglais en attendant.
  it: {
    newRecord: [
      "New record — {score} points.",
      "Your best run yet: {score}.",
      "{score}. Nothing you have flown comes close."
    ],
    nearRecord: [
      "So close. {score}, and the record still stands.",
      "{score} — your record is within reach.",
      "You were closing in: {score}."
    ],
    bigCombo: [
      "A chain of {combo} grazes. The forest noticed.",
      "{combo} grazes without breaking. That was the good stuff.",
      "Combo {combo} — you were flying on magic alone."
    ],
    earlyDeath: [
      "That was quick. The night had barely started.",
      "Barely airborne. Again?",
      "The very first branches got you."
    ],
    default: [
      "{score} points. The forest keeps its trophies.",
      "You reached {tier} with {score}.",
      "{score}. The branches win this round."
    ]
  }
};

export type Params = Record<string, string | number>;

function isLang(value: string | null): value is Lang {
  return value !== null && (LANGS as readonly string[]).includes(value);
}

/**
 * `navigator.language` -> supported language, defaulting to `en`.
 * Only the primary subtag is kept ("fr-CA" -> "fr").
 */
export function detectLanguage(): Lang {
  const raw = typeof navigator !== "undefined" ? navigator.language : "";
  const primary = (raw || "").toLowerCase().split("-")[0];
  return isLang(primary) ? primary : "en";
}

/**
 * Current language: DEBUG_FORCE_LANG > persisted explicit choice > detection.
 * The player's own choice wins permanently over the browser language.
 */
let current: Lang = (() => {
  if (isLang(DEBUG_FORCE_LANG)) return DEBUG_FORCE_LANG;
  const saved = readLang();
  return isLang(saved) ? saved : detectLanguage();
})();

export function getLanguage(): Lang {
  return current;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Subscribe to refresh your own texts when the language changes.
 * Returns the unsubscribe function (call it on a scene's SHUTDOWN).
 */
export function onLanguageChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Changes the language, persists it, and immediately refreshes the texts of
 * every subscribed scene — no reload.
 */
export function setLanguage(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  writeLang(lang);
  for (const listener of listeners) listener();
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/** String translated into the current language. */
export function t(key: StringKey, params?: Params): string {
  return interpolate(STRINGS[current][key] ?? STRINGS.en[key], params);
}

/**
 * Every translation of a key. Used to size a button against the LONGEST of
 * the 4 languages, not just against the current one.
 */
export function tAll(key: StringKey, params?: Params): string[] {
  return LANGS.map((lang) => interpolate(STRINGS[lang][key], params));
}

/**
 * One complete game-over sentence for the given category, picked at random
 * among that category's variants and interpolated. Never concatenated.
 */
export function deathMessage(category: DeathCategory, params?: Params): string {
  const variants = DEATH_MESSAGES[current][category];
  const pool = variants.length > 0 ? variants : DEATH_MESSAGES.en[category];
  return interpolate(pool[Math.floor(Math.random() * pool.length)], params);
}

/** Every death-message variant of a category, across all languages. */
export function deathMessagesAll(category: DeathCategory, params?: Params): string[] {
  return LANGS.flatMap((lang) =>
    DEATH_MESSAGES[lang][category].map((variant) => interpolate(variant, params))
  );
}
