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
  // Home: a still serif line and a caps hint beneath it — the line no longer
  // blinks at a player who is reading it (design decision, "Moonlight & ink").
  "menu.hold": "Hold to fly",
  "menu.tap": "Tap anywhere",
  "menu.best": "Best",
  // The shared daily course: same forest for everyone, seeded by the UTC date.
  "menu.daily": "Daily Moon",
  // Under the lockup on a first launch only: once a best score exists, the
  // record takes this line. The brand NAME stays out of i18n; its tagline is
  // interface text like any other.
  "menu.tagline": "A night flight",

  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.sound": "Sound",
  "settings.music": "Music",
  "settings.soundOn": "On",
  "settings.soundOff": "Off",
  "settings.back": "Back",
  "settings.howToPlay": "How to play",

  // Captions are full serif sentences; the caps titles name the three moves.
  "help.grazeTitle": "Graze",
  "help.touchTitle": "Touch",
  "help.comboTitle": "Chain",
  "help.graze": "Graze an obstacle to score",
  "help.touch": "Touch it and the run ends",
  "help.combo": "Chain grazes to multiply",

  "death.causeBranch": "You hit a branch",
  "death.causeTrunk": "You hit a trunk",
  // La Percée. Whole sentences, never assembled from fragments: word order and
  // agreement differ per language (see the anti-concatenation rule).
  percee: "BREAKTHROUGH",
  "death.tier": "Tier · {tier}",
  "death.bestCombo": "Best combo · {combo}",
  "death.share": "Share",
  "death.home": "Home",
  "death.replay": "Replay",

  // The progression hub. The DISPLAYED name is this key alone, so it can be
  // renamed without touching a line of code — the scene is `ScoresScene` and
  // its key is "scores", both deliberately neutral.
  scores: "Scores",
  "scores.records": "Records",
  "scores.journal": "Journal",
  "scores.forest": "The forest",
  "scores.best": "Best score",
  "scores.bestCombo": "Best combo",
  "scores.bestTime": "Longest flight",
  "scores.recent": "Recent runs",
  "scores.games": "Runs flown",
  "scores.playTime": "Time in the forest",
  "scores.grazes": "Grazes",
  "scores.fullMoons": "Full Moons",
  "scores.closestGraze": "Closest graze",
  "scores.byTier": "By tier",
  "scores.byEssence": "By species",
  "scores.reached": "reached",
  "scores.cleared": "cleared",
  "scores.empty": "Fly once and this page fills itself.",
  "scores.seconds": "{value} s",
  "scores.pixels": "{value} px",
  "essence.birch": "Birches",
  "essence.gnarled": "Gnarled trunks",
  "essence.bramble": "Brambles",
  "essence.denseStand": "Dense stand",

  // The omens (see src/omens.ts). A name is the ONLY prose an omen ever gets
  // — no description, no unlock condition — and it only shows once lit.
  "scores.omens": "Omens",
  "omen.firstSpark": "The first spark",
  "omen.hundredSparks": "A hundred sparks",
  "omen.chain": "The chain",
  "omen.brambles": "Into the brambles",
  "omen.wall": "Through the Wall",
  "omen.eye": "Under the Eye",
  "omen.needle": "The needle",
  "omen.flurry": "The flurry",
  "omen.longNight": "The long night",
  "omen.fullMoon": "Full Moon",
  "omen.percee": "The Breakthrough",
  "omen.daily": "The day's moon",

  "pause.title": "Paused",
  "pause.hint": "Tap to resume",

  // Numbers only: no word may appear during play (see CLAUDE.md, reward cues).
  // Kept as a key so the format stays in one place, per language.
  "float.graze": "+{points}",

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
    "menu.hold": "Maintiens pour voler",
    "menu.tap": "Tape n'importe où",
    "menu.best": "Record",
    "menu.daily": "Lune du jour",
    "menu.tagline": "Un vol de nuit",

    "settings.title": "Réglages",
    "settings.language": "Langue",
    "settings.sound": "Son",
    "settings.music": "Musique",
    "settings.soundOn": "Oui",
    "settings.soundOff": "Non",
    "settings.back": "Retour",
    "settings.howToPlay": "Comment jouer",

    "help.grazeTitle": "Frôle",
    "help.touchTitle": "Touche",
    "help.comboTitle": "Enchaîne",
    "help.graze": "Frôle un obstacle pour marquer",
    "help.touch": "Le toucher, et la partie s'arrête",
    "help.combo": "Enchaîne les frôlements pour multiplier",

    "death.causeBranch": "Tu as touché une branche",
    "death.causeTrunk": "Tu as touché un tronc",
    percee: "LA PERCÉE",
    "death.tier": "Palier · {tier}",
    "death.bestCombo": "Meilleur combo · {combo}",
    "death.share": "Partager",
    "death.home": "Accueil",
    "death.replay": "Rejouer",

    scores: "Scores",
    "scores.records": "Records",
    "scores.journal": "Journal",
    "scores.forest": "La forêt",
    "scores.best": "Meilleur score",
    "scores.bestCombo": "Meilleur combo",
    "scores.bestTime": "Plus long vol",
    "scores.recent": "Dernières parties",
    "scores.games": "Vols effectués",
    "scores.playTime": "Temps dans la forêt",
    "scores.grazes": "Frôlements",
    "scores.fullMoons": "Pleines Lunes",
    "scores.closestGraze": "Frôlement le plus court",
    "scores.byTier": "Par palier",
    "scores.byEssence": "Par essence",
    "scores.reached": "atteint",
    "scores.cleared": "traversé",
    "scores.empty": "Vole une fois et cette page se remplira.",
    "scores.seconds": "{value} s",
    "scores.pixels": "{value} px",
    "essence.birch": "Bouleaux",
    "essence.gnarled": "Troncs noueux",
    "essence.bramble": "Ronces",
    "essence.denseStand": "Futaie dense",

    "scores.omens": "Présages",
    "omen.firstSpark": "La première étincelle",
    "omen.hundredSparks": "Cent étincelles",
    "omen.chain": "La chaîne",
    "omen.brambles": "Au cœur des ronces",
    "omen.wall": "Au-delà du Mur",
    "omen.eye": "Sous l'Œil",
    "omen.needle": "L'aiguille",
    "omen.flurry": "La rafale",
    "omen.longNight": "La longue nuit",
    "omen.fullMoon": "Pleine Lune",
    "omen.percee": "La Percée",
    "omen.daily": "La lune du jour",

    "pause.title": "En pause",
    "pause.hint": "Tape pour reprendre",

    "float.graze": "+{points}",

    "share.newRecord": "NOUVEAU RECORD",
    "share.bestCombo": "Meilleur combo · {combo}",

    "tier.edge": "La Lisière",
    "tier.darkwood": "Le Bois Noir",
    "tier.brambles": "Les Ronces",
    "tier.wall": "Le Mur",
    "tier.moonEye": "L'Œil de la Lune"
  },

  es: {
    "menu.hold": "Mantén pulsado para volar",
    "menu.tap": "Toca en cualquier lugar",
    "menu.best": "Récord",
    "menu.daily": "Luna del día",
    "menu.tagline": "Un vuelo nocturno",

    "settings.title": "Ajustes",
    "settings.language": "Idioma",
    "settings.sound": "Sonido",
    "settings.music": "Música",
    "settings.soundOn": "Sí",
    "settings.soundOff": "No",
    "settings.back": "Volver",
    "settings.howToPlay": "Cómo jugar",

    "help.grazeTitle": "Roza",
    "help.touchTitle": "Toca",
    "help.comboTitle": "Encadena",
    "help.graze": "Roza un obstáculo para puntuar",
    "help.touch": "Si lo tocas, la partida termina",
    "help.combo": "Encadena rozaduras para multiplicar",

    "death.causeBranch": "Has tocado una rama",
    "death.causeTrunk": "Has tocado un tronco",
    percee: "LA BRECHA",
    "death.tier": "Nivel · {tier}",
    "death.bestCombo": "Mejor combo · {combo}",
    "death.share": "Compartir",
    "death.home": "Inicio",
    "death.replay": "Jugar de nuevo",

    scores: "Puntuaciones",
    "scores.records": "Récords",
    "scores.journal": "Diario",
    "scores.forest": "El bosque",
    "scores.best": "Mejor puntuación",
    "scores.bestCombo": "Mejor combo",
    "scores.bestTime": "Vuelo más largo",
    "scores.recent": "Últimas partidas",
    "scores.games": "Vuelos realizados",
    "scores.playTime": "Tiempo en el bosque",
    "scores.grazes": "Roces",
    "scores.fullMoons": "Lunas Llenas",
    "scores.closestGraze": "Roce más ajustado",
    "scores.byTier": "Por nivel",
    "scores.byEssence": "Por especie",
    "scores.reached": "alcanzado",
    "scores.cleared": "superado",
    "scores.empty": "Vuela una vez y esta página se llenará.",
    "scores.seconds": "{value} s",
    "scores.pixels": "{value} px",
    "essence.birch": "Abedules",
    "essence.gnarled": "Troncos nudosos",
    "essence.bramble": "Zarzas",
    "essence.denseStand": "Bosque denso",

    "scores.omens": "Presagios",
    "omen.firstSpark": "La primera chispa",
    "omen.hundredSparks": "Cien chispas",
    "omen.chain": "La cadena",
    "omen.brambles": "Entre las zarzas",
    "omen.wall": "Más allá del Muro",
    "omen.eye": "Bajo el Ojo",
    "omen.needle": "La aguja",
    "omen.flurry": "La ráfaga",
    "omen.longNight": "La larga noche",
    "omen.fullMoon": "Luna Llena",
    "omen.percee": "La Brecha",
    "omen.daily": "La luna del día",

    "pause.title": "En pausa",
    "pause.hint": "Toca para continuar",

    "float.graze": "+{points}",

    "share.newRecord": "NUEVO RÉCORD",
    "share.bestCombo": "Mejor combo · {combo}",

    "tier.edge": "La Linde",
    "tier.darkwood": "El Bosque Negro",
    "tier.brambles": "Las Zarzas",
    "tier.wall": "El Muro",
    "tier.moonEye": "El Ojo de la Luna"
  },

  it: {
    "menu.hold": "Tieni premuto per volare",
    "menu.tap": "Tocca ovunque",
    "menu.best": "Record",
    "menu.daily": "Luna del giorno",
    "menu.tagline": "Un volo notturno",

    "settings.title": "Impostazioni",
    "settings.language": "Lingua",
    "settings.sound": "Audio",
    "settings.music": "Musica",
    "settings.soundOn": "Sì",
    "settings.soundOff": "No",
    "settings.back": "Indietro",
    "settings.howToPlay": "Come si gioca",

    "help.grazeTitle": "Sfiora",
    "help.touchTitle": "Tocca",
    "help.comboTitle": "Concatena",
    "help.graze": "Sfiora un ostacolo per segnare",
    "help.touch": "Se lo tocchi, la partita finisce",
    "help.combo": "Concatena le sfiorate per moltiplicare",

    "death.causeBranch": "Hai toccato un ramo",
    "death.causeTrunk": "Hai toccato un tronco",
    percee: "IL VARCO",
    "death.tier": "Livello · {tier}",
    "death.bestCombo": "Miglior combo · {combo}",
    "death.share": "Condividi",
    "death.home": "Home",
    "death.replay": "Rigioca",

    scores: "Punteggi",
    "scores.records": "Record",
    "scores.journal": "Diario",
    "scores.forest": "La foresta",
    "scores.best": "Punteggio migliore",
    "scores.bestCombo": "Combo migliore",
    "scores.bestTime": "Volo più lungo",
    "scores.recent": "Ultime partite",
    "scores.games": "Voli effettuati",
    "scores.playTime": "Tempo nella foresta",
    "scores.grazes": "Sfioramenti",
    "scores.fullMoons": "Lune Piene",
    "scores.closestGraze": "Sfioramento più stretto",
    "scores.byTier": "Per livello",
    "scores.byEssence": "Per specie",
    "scores.reached": "raggiunto",
    "scores.cleared": "superato",
    "scores.empty": "Vola una volta e questa pagina si riempirà.",
    "scores.seconds": "{value} s",
    "scores.pixels": "{value} px",
    "essence.birch": "Betulle",
    "essence.gnarled": "Tronchi nodosi",
    "essence.bramble": "Rovi",
    "essence.denseStand": "Bosco fitto",

    "scores.omens": "Presagi",
    "omen.firstSpark": "La prima scintilla",
    "omen.hundredSparks": "Cento scintille",
    "omen.chain": "La catena",
    "omen.brambles": "Tra i rovi",
    "omen.wall": "Oltre il Muro",
    "omen.eye": "Sotto l'Occhio",
    "omen.needle": "L'ago",
    "omen.flurry": "La raffica",
    "omen.longNight": "La lunga notte",
    "omen.fullMoon": "Luna Piena",
    "omen.percee": "Il Varco",
    "omen.daily": "La luna del giorno",

    "pause.title": "In pausa",
    "pause.hint": "Tocca per riprendere",

    "float.graze": "+{points}",

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
 * The death screen's ONE line. It is the only prose on that screen, so it does
 * two jobs at once: it says what happened (the gap to the record, the combo,
 * the tier) AND it gives the player a reason to go again.
 *
 * TONE: short, warm, never mocking. Someone who has just missed their record
 * by a second must not feel teased about it. Two short lines at most.
 *
 * ANTI-CONCATENATION RULE: a message is NEVER assembled from fragments. Each
 * variant is a complete sentence written out in full in every language, with
 * `{seconds}`, `{combo}` and `{tier}` placeholders. Word order,
 * punctuation and agreement differ per language, so glueing pieces together
 * produces broken sentences somewhere — always add a whole new template.
 *
 * `{seconds}` appears ONLY in `nearRecord`, which is the one category that
 * cannot be picked without a record to measure against.
 *
 * Each category holds 2-3 variants, picked at random by `deathMessage()`.
 */
export type DeathCategory = "newRecord" | "nearRecord" | "bigCombo" | "earlyDeath" | "default";

export const DEATH_MESSAGES: Record<Lang, Record<DeathCategory, string[]>> = {
  en: {
    newRecord: [
      "New record. You have never flown this far.",
      "A new best. {tier} did not stop you.",
      "Record broken. That line was yours."
    ],
    nearRecord: [
      "{seconds} s short of your record. You were almost there.",
      "Your best was {seconds} s away. So close.",
      "Only {seconds} s left to go. The next one is yours."
    ],
    bigCombo: [
      "A combo of {combo}. Your magic held a long time.",
      "{combo} grazes without breaking. That was fine flying.",
      "Combo of {combo}. The trail barely dimmed."
    ],
    earlyDeath: [
      "{tier} is still waiting for you.",
      "A short flight. {tier} will still be there.",
      "The night had barely started. {tier} again?"
    ],
    default: [
      "{tier} behind you. The forest goes on.",
      "You held your line through {tier}. Again?",
      "A good stretch of forest. The trees keep coming."
    ]
  },

  fr: {
    newRecord: [
      "Nouveau record. Tu n'as jamais volé aussi loin.",
      "Nouveau meilleur vol. {tier} ne t'a pas arrêtée.",
      "Record battu. Cette ligne était la tienne."
    ],
    nearRecord: [
      "Il te restait {seconds} s. Tu y étais presque.",
      "Ton record était à {seconds} s. Si près.",
      "Plus que {seconds} s. La prochaine est la bonne."
    ],
    bigCombo: [
      "Combo de {combo} — ta magie a tenu longtemps.",
      "{combo} frôlements sans rompre. C'était du beau vol.",
      "Combo de {combo}. La traînée n'a presque pas faibli."
    ],
    earlyDeath: [
      "{tier} t'attend encore.",
      "Vol court. {tier} sera toujours là.",
      "La nuit commençait à peine. On retente {tier} ?"
    ],
    default: [
      "{tier} derrière toi. La forêt continue.",
      "Tu as tenu ta ligne jusqu'à {tier}. On y retourne ?",
      "Belle portion de forêt. Les arbres défilent encore."
    ]
  },

  // TODO: écrire en natif — texte anglais en attendant.
  es: {
    newRecord: [
      "New record. You have never flown this far.",
      "A new best. {tier} did not stop you.",
      "Record broken. That line was yours."
    ],
    nearRecord: [
      "{seconds} s short of your record. You were almost there.",
      "Your best was {seconds} s away. So close.",
      "Only {seconds} s left to go. The next one is yours."
    ],
    bigCombo: [
      "A combo of {combo}. Your magic held a long time.",
      "{combo} grazes without breaking. That was fine flying.",
      "Combo of {combo}. The trail barely dimmed."
    ],
    earlyDeath: [
      "{tier} is still waiting for you.",
      "A short flight. {tier} will still be there.",
      "The night had barely started. {tier} again?"
    ],
    default: [
      "{tier} behind you. The forest goes on.",
      "You held your line through {tier}. Again?",
      "A good stretch of forest. The trees keep coming."
    ]
  },

  // TODO: écrire en natif — texte anglais en attendant.
  it: {
    newRecord: [
      "New record. You have never flown this far.",
      "A new best. {tier} did not stop you.",
      "Record broken. That line was yours."
    ],
    nearRecord: [
      "{seconds} s short of your record. You were almost there.",
      "Your best was {seconds} s away. So close.",
      "Only {seconds} s left to go. The next one is yours."
    ],
    bigCombo: [
      "A combo of {combo}. Your magic held a long time.",
      "{combo} grazes without breaking. That was fine flying.",
      "Combo of {combo}. The trail barely dimmed."
    ],
    earlyDeath: [
      "{tier} is still waiting for you.",
      "A short flight. {tier} will still be there.",
      "The night had barely started. {tier} again?"
    ],
    default: [
      "{tier} behind you. The forest goes on.",
      "You held your line through {tier}. Again?",
      "A good stretch of forest. The trees keep coming."
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
