import { DEBUG_FORCE_LANG } from "./config";
import { readLang, writeLang } from "./save";

export type Lang = "en" | "fr" | "es" | "it";

/** Ordre d'affichage dans les réglages. */
export const LANGS: readonly Lang[] = ["en", "fr", "es", "it"];

/** Noms natifs, jamais traduits : chacun se reconnaît dans sa langue. */
export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  it: "Italiano"
};

/**
 * Référence de clés : l'anglais fait autorité. Les trois autres langues sont
 * typées `Record<StringKey, string>`, donc une clé oubliée casse le build.
 *
 * Les valeurs peuvent contenir des paramètres `{nom}`, remplacés par `t()`.
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

  "death.newRecord": "New record!",
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

    "death.newRecord": "Nouveau record !",
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

    "death.newRecord": "¡Nuevo récord!",
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

    "death.newRecord": "Nuovo record!",
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

export type Params = Record<string, string | number>;

function isLang(value: string | null): value is Lang {
  return value !== null && (LANGS as readonly string[]).includes(value);
}

/**
 * `navigator.language` -> langue supportée, `en` par défaut.
 * On ne garde que la partie primaire ("fr-CA" -> "fr").
 */
export function detectLanguage(): Lang {
  const raw = typeof navigator !== "undefined" ? navigator.language : "";
  const primary = (raw || "").toLowerCase().split("-")[0];
  return isLang(primary) ? primary : "en";
}

/**
 * Langue courante : DEBUG_FORCE_LANG > choix explicite persisté > détection.
 * Le choix de l'utilisateur prime définitivement sur la langue du navigateur.
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
 * S'abonner pour rafraîchir ses textes au changement de langue.
 * Retourne la fonction de désabonnement (à appeler au SHUTDOWN d'une scène).
 */
export function onLanguageChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Change la langue, la persiste, et rafraîchit immédiatement les textes des
 * scènes abonnées — aucun rechargement.
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

/** Chaîne traduite dans la langue courante. */
export function t(key: StringKey, params?: Params): string {
  return interpolate(STRINGS[current][key] ?? STRINGS.en[key], params);
}

/**
 * Toutes les traductions d'une clé. Sert à dimensionner un bouton sur la
 * chaîne la plus LONGUE des 4 langues, pas seulement sur la langue courante.
 */
export function tAll(key: StringKey, params?: Params): string[] {
  return LANGS.map((lang) => interpolate(STRINGS[lang][key], params));
}
