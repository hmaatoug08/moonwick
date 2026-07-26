/**
 * Toutes les constantes de gameplay au même endroit.
 * Objectif : pouvoir tuner le feel à la main sans lire le code des scènes.
 */

/**
 * Nom de marque. JAMAIS traduit, JAMAIS passé par i18n : il est identique
 * dans les quatre langues (voir CLAUDE.md, règle de marque).
 * Traité typographiquement comme un logo, pas comme du texte d'interface.
 */
export const BRAND = {
  name: "Moonwick",
  fontSizePx: 60,
  // Interlettrage large : c'est ce qui fait lire « logo » plutôt que « titre ».
  letterSpacing: 11,
  color: "#f5efd8",
  // Lueur lunaire derrière le mot, qui respire très lentement.
  glowColor: 0xffe9a8,
  glowSize: 460,
  glowAlphaMin: 0.09,
  glowAlphaMax: 0.2,
  glowPulseMs: 4200
} as const;

/** Dimensions logiques (portrait), doivent correspondre au scale de main.ts. */
export const WORLD = {
  width: 480,
  height: 854
} as const;

/** Vol de la sorcière : maintenir = monter, relâcher = descendre. */
export const WITCH = {
  x: 110,
  radius: 14,
  gravity: 900,
  thrust: -1800,
  maxSpeed: 420,
  // Bornes verticales : la sorcière ne sort jamais de l'écran.
  marginTop: 20,
  marginBottom: 20
} as const;

/**
 * P5 — Paliers de difficulté. Le levier principal est le RESSERREMENT
 * (`gapSize`, hauteur cible du passage, troncs ET branches).
 *
 * OBJECTIF VÉRIFIABLE — dès « Les Ronces », traverser sans frôler est
 * STRUCTURELLEMENT impossible : la demi-largeur du passage, jitter au pire
 * compris, doit être < zone de frôlement (38 px), c.-à-d. passage max < 76.
 * Passage max = gapSize + max(gapJitter tronc = 4, bandJitter branche = 5).
 *   - La Lisière   : 250 + 5 = 255 -> demi 127,5  (apprentissage, tout passe)
 *   - Le Bois Noir : 140 + 5 = 145 -> demi 72,5   (pont : encore évitable)
 *   - Les Ronces   :  70 + 5 =  75 -> demi 37,5 < 38  IMPOSSIBLE sans frôler
 *   - Le Mur       :  67 + 5 =  72 -> demi 36   < 38  idem, plus serré
 *   - L'Œil        :  64 + 5 =  69 -> demi 34,5 < 38  plancher (gapFloor)
 * La vitesse ne monte que modérément (+30 %). Le dernier palier est un
 * PLATEAU : au-delà, la difficulté se fige, le skill fait la durée de la run.
 */
export type Tier = {
  /** Clé i18n du nom du palier (aucun libellé en dur : voir i18n.ts). */
  nameKey: "tier.edge" | "tier.darkwood" | "tier.brambles" | "tier.wall" | "tier.moonEye";
  /** Début du palier, en secondes de jeu. */
  startTime: number;
  scrollSpeed: number;
  /** Hauteur cible du passage (trou de tronc ; les branches en dérivent). */
  gapSize: number;
  /** Intervalle d'apparition des obstacles, en secondes. */
  spawnInterval: number;
  // Ambiance : teinte du ciel (haut / bas du dégradé).
  skyTop: number;
  skyBottom: number;
};

export const TIERS: readonly Tier[] = [
  // 250+5=255, demi 127,5 : large, on apprend à frôler sans risque.
  { nameKey: "tier.edge",     startTime: 0,   scrollSpeed: 220, gapSize: 250, spawnInterval: 1.9,  skyTop: 0x0b0716, skyBottom: 0x241a4a },
  // 140+5=145, demi 72,5 : dernier palier où l'évitement pur reste possible.
  { nameKey: "tier.darkwood", startTime: 25,  scrollSpeed: 240, gapSize: 140, spawnInterval: 1.75, skyTop: 0x070410, skyBottom: 0x1a1038 },
  // 70+5=75, demi 37,5 < 38 : frôlement structurellement inévitable.
  { nameKey: "tier.brambles", startTime: 50,  scrollSpeed: 255, gapSize: 70,  spawnInterval: 1.6,  skyTop: 0x0a0512, skyBottom: 0x2a1230 },
  // 67+5=72, demi 36 < 38.
  { nameKey: "tier.wall",     startTime: 80,  scrollSpeed: 270, gapSize: 67,  spawnInterval: 1.5,  skyTop: 0x060309, skyBottom: 0x1f0d22 },
  // 64+5=69, demi 34,5 < 38 — plancher absolu (gapFloor), plateau final.
  { nameKey: "tier.moonEye",  startTime: 120, scrollSpeed: 285, gapSize: 64,  spawnInterval: 1.4,  skyTop: 0x0d0a1f, skyBottom: 0x33205c }
];

/** Mise en scène des changements de palier. */
export const TIER_FX = {
  // Durée d'affichage du nom du palier au centre de l'écran.
  announceMs: 1500,
  announceFadeMs: 220,
  // Interpolation des paramètres (vitesse, passage, ciel) entre paliers.
  transitionS: 2
} as const;

/**
 * Debug : démarrer directement à un palier (index dans TIERS) pour le tester
 * sans rejouer les 80 premières secondes. -1 = désactivé (départ normal).
 */
export const DEBUG_START_TIER = -1;

/**
 * Debug : force une langue sans toucher aux réglages du navigateur ni au
 * choix persisté. null = comportement normal (choix explicite, sinon
 * détection via navigator.language). Voir i18n.ts.
 */
export const DEBUG_FORCE_LANG: "en" | "fr" | "es" | "it" | null = null;

/**
 * Traînée à particules — INDICATEUR PRINCIPAL du multiplicateur.
 * Le joueur doit lire son combo dans sa traînée, pas dans le chiffre du HUD :
 * rare et terne à ×1, dense et lumineuse à ×5. Chaque paire `…Idle` / `…Max`
 * est interpolée sur le multiplicateur courant.
 */
export const TRAIL = {
  // Intervalle d'émission (ms). Au plus bas, la traînée devient continue.
  frequencyIdle: 55,
  frequencyMax: 6,
  lifespanIdle: 260,
  lifespanMax: 640,
  scaleIdle: 0.32,
  scaleMax: 0.95,
  alphaIdle: 0.32,
  alphaMax: 0.9,
  // Plage de vitesse de recul et ouverture du cône, vers l'arrière.
  // Fixes : c'est la densité, la taille et la couleur qui portent le combo.
  driftMin: 70,
  driftMax: 170,
  spreadDeg: 16,
  colorIdle: 0x6b4fa0,
  colorMax: 0xffd27a,
  // Décalage d'émission derrière la sorcière.
  offsetX: -11
} as const;

/** Génération procédurale des obstacles. Cadence et passages pilotés par TIERS. */
export const OBSTACLES = {
  // Variation aléatoire (+/-) autour du spawnInterval du palier, en fraction.
  // Évite l'effet métronome sans casser la contrainte d'équité (clampée après).
  intervalJitter: 0.15,
  // Délai avant le premier obstacle : petit run-up pour prendre le vol en main.
  firstDelay: 0.9,
  // Apparition hors écran à droite, suppression hors écran à gauche.
  spawnMargin: 40,
  despawnX: -80,

  // On ne place jamais le passage collé au haut ou au bas de l'écran.
  safeMarginTop: 90,
  safeMarginBottom: 90,
  // Marge de vol laissée autour du passage (rayon sorcière + respiration).
  // Réduite automatiquement quand le passage devient plus étroit qu'elle.
  clearance: 48,
  // Décalage vertical max du passage d'un obstacle au suivant : garantit
  // que le trou suivant est toujours atteignable à vitesse de vol max.
  maxGapShift: 260,
  // Plancher absolu d'un passage, quel que soit le palier : en dessous,
  // le jeu deviendrait littéralement infranchissable (hitbox 2x10 px + marge).
  gapFloor: 64,

  // Fréquence relative des 3 types. Le tronc est le plus dur, donc plus rare.
  weights: {
    branchTop: 4,
    branchBottom: 4,
    trunk: 3
  },

  // Branches (hautes ou basses) : une barre qui dépasse d'un bord.
  // Bande libre = gapSize x bandFactor +/- bandJitter. Facteur 1 et jitters
  // serrés : la garantie « demi-passage < 38 px dès Les Ronces » (voir TIERS)
  // doit valoir pour TOUS les types, sinon les branches restent une échappatoire.
  // La variété vient de la POSITION du passage, pas de sa taille.
  branch: {
    width: 26,
    lengthMin: 120,
    bandFactor: 1.0,
    bandJitter: 5,
    // Si le côté tiré au sort doit rester plus large que l'autre d'au moins
    // cette marge (garantie d'atteignabilité), on change de côté.
    sideSwitchSlack: 40
  },

  // Tronc traversant : trou = gapSize du palier +/- jitter (petit : la
  // contrainte des Ronces est calculée jitter au pire compris).
  trunk: {
    width: 30,
    gapJitter: 4
  },

  // Silhouette sombre + liseré clair : les obstacles doivent se lire
  // instantanément sur le dégradé du ciel (lisibilité = jouabilité).
  // INVARIANT : le liseré est permanent et se RENFORCE quand la lumière
  // baisse — la lisibilité des obstacles n'est jamais dégradée par un effet.
  colors: {
    fill: 0x0c0618,
    trunkFill: 0x080410,
    stroke: 0x7a5ad0,
    // Alpha du liseré : pleine lumière -> obscurité maximale.
    strokeAlphaLit: 0.55,
    strokeAlphaDark: 1
  }
} as const;

/**
 * Poussières d'ambiance (décor de fond) : chaudes et présentes quand la
 * magie est pleine, raréfiées et froides quand le combo est perdu.
 * Décor uniquement : dessinées SOUS l'overlay, jamais sur la couche de jeu.
 */
export const AMBIENT = {
  // Intervalle d'émission (ms) : magie pleine -> combo perdu.
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
 * Near-miss : le cœur du jeu. Les distances sont mesurées de la sorcière
 * à la SURFACE de l'obstacle (pas de centre à centre).
 */
export const NEAR_MISS = {
  // Hitbox mortelle volontairement plus petite que le visuel (WITCH.radius) :
  // le joueur doit avoir l'impression d'être passé de justesse, pas d'être volé.
  deathRadius: 10,
  // Anneau de frôlement : deathRadius < d <= grazeRadius.
  grazeRadius: 38,
  // NB : le délai avant retour à ×1 est porté par la jauge (MAGIC.max),
  // qui est le minuteur du combo. Pas de second compteur en parallèle.
  // Multiplicateur = 1 + combo * step, plafonné (plafond = "Pleine Lune" en P4).
  multiplierStep: 0.5,
  multiplierMax: 5
} as const;

export const SCORING = {
  // Points par frôlement, multipliés par le multiplicateur courant.
  // Quand le combo est actif, c'est la SEULE source de score.
  grazePoints: 10,
  // DARK_POINTS dégressifs : au sein d'une même traversée dans l'obscurité
  // (combo à 0), le Nième obstacle dépassé rapporte la Nième valeur, puis la
  // dernière (0) au-delà. Le compteur repart quand un frôlement relance le
  // combo. La passivité ne rapporte donc jamais plus, elle s'ÉTEINT — aucune
  // source de points ne croît avec le temps de survie.
  darkPointsSequence: [1, 1, 1, 0]
} as const;

/**
 * Jauge de magie : elle descend en continu et SEUL un frôlement la recharge.
 * C'est le minuteur du multiplicateur, PAS une barre de vie : à 0 le
 * multiplicateur retombe à ×1 et la partie continue. On ne meurt qu'en
 * touchant un obstacle. Le joueur qui évite tout reste en jeu, mais il joue
 * sans multiplicateur et dans le noir — la pression est visuelle, pas létale.
 */
export const MAGIC = {
  // Secondes avant que le multiplicateur ne retombe à ×1.
  max: 4,
  // Vitesse de décroissance, en unités de jauge par seconde.
  drainPerSecond: 1,

  // Avertissement : sous ce seuil la sorcière clignote pour signaler que le
  // multiplicateur va sauter. Purement visuel, ne déclenche aucune mort.
  flickerGrace: 1.2,
  // Clignotement de la sorcière / pulsation du voile, en battements par seconde.
  flickerPulseHz: 6,
  // De combien le voile s'éclaircit au sommet de chaque pulsation.
  flickerDarkSwing: 0.18,
  // Alpha bas de la sorcière quand elle clignote.
  flickerWitchAlpha: 0.25,

  // Fraction de `max` tolérée entre deux occasions de recharger.
  // Sert de garde-fou au générateur (voir obstacles.ts) : au-delà, le
  // multiplicateur sauterait sans qu'aucun obstacle ne soit passé à portée.
  grazeWindowFactor: 0.6,

  // Assombrissement : alpha de l'overlay noir jauge pleine -> jauge vide.
  // PUREMENT COSMÉTIQUE, et il ne touche QUE le fond et le décor : l'overlay
  // est dessiné SOUS les obstacles, leurs halos et la sorcière (invariant de
  // lisibilité — voir CLAUDE.md, Affordance). Plafonné bas : c'est la
  // désaturation qui porte la sensation de perte, pas le noir.
  darkAlphaFull: 0,
  darkAlphaEmpty: 0.5,
  // Rayon du halo de lumière autour de la sorcière, jauge pleine -> vide.
  lightRadiusFull: 460,
  lightRadiusEmpty: 95,

  // Refroidissement du décor quand la magie baisse : le ciel se désature et
  // vire au gris bleuté (0 = intact, 1 = gris), la lune pâlit.
  desatMax: 0.75,
  coldMoonColor: 0xb9c2d6,

  // Barre fine sous le score.
  barWidth: 170,
  barHeight: 5,
  barY: 158,
  barColor: 0xb98bff,
  barTrackAlpha: 0.12
} as const;

/** Retours visuels du frôlement : halo des obstacles + textes flottants. */
export const FEEDBACK = {
  // Halo violet qui matérialise la zone de frôlement (NEAR_MISS.grazeRadius).
  haloColor: 0x9b6bff,
  haloAlpha: 0.15,
  // Quand la sorcière est dans la zone.
  haloAlphaActive: 0.5,

  // Textes flottants : montée et disparition.
  floatMs: 600,
  floatRise: 48,
  grazeColor: "#f2c8ff",
  // Le +1 des points d'obscurité : petit et discret, il ne doit jamais
  // concurrencer le FRÔLÉ ! — c'est un lot de consolation, pas une récompense.
  darkColor: "#8877aa"
} as const;

/**
 * Secousse de caméra au frôlement. Doit rester SOUS le seuil de conscience :
 * on veut que ça se sente, pas que ça se remarque. Désactivée si le système
 * demande des animations réduites.
 */
export const SHAKE = {
  minPx: 2,
  maxPx: 3,
  durationMs: 80
} as const;

/**
 * Ralenti sur frôlement extrême — le moment que le joueur voudra filmer.
 * Déclenché sous `thresholdPx` de la surface (rappel : la mort est à 10 px,
 * donc la fenêtre est étroite et se mérite). Désactivé en animations réduites.
 */
export const SLOWMO = {
  thresholdPx: 18,
  scale: 0.4,
  durationMs: 150
} as const;

/**
 * Mode Pleine Lune : atteint quand le multiplicateur touche son plafond.
 * Tout doit changer d'un coup — lune, palette, traînée — pour que le joueur
 * sache qu'il est dans un état exceptionnel sans lire un seul chiffre.
 */
export const FULL_MOON = {
  fadeMs: 320,
  // La lune grossit et s'entoure d'un halo.
  moonScale: 1.4,
  glowRadius: 82,
  glowColor: 0xffe9a8,
  glowAlpha: 0.3,
  // Voile doré additif sur toute la scène.
  veilColor: 0xffb43c,
  veilAlpha: 0.11,
  // La sorcière elle-même vire à l'or.
  witchColor: 0xffe0a0,
  witchColorNormal: 0xd9a7ff
} as const;

/**
 * Sons synthétisés en Web Audio, aucun fichier externe (règle P4).
 * Volume volontairement bas : le jeu se joue souvent sans son, il ne doit
 * jamais surprendre. `masterVolume` est le seul curseur à toucher.
 */
export const SFX = {
  masterVolume: 0.12,
  // Swoosh de frôlement : bruit filtré dont la hauteur monte avec le combo.
  swooshBaseHz: 620,
  swooshHzPerCombo: 95,
  swooshMaxHz: 2200,
  swooshMs: 130,
  // Impact grave à la mort.
  deathFromHz: 140,
  deathToHz: 38,
  deathMs: 620
} as const;

/**
 * Apprentissage sans tutoriel, première partie uniquement : le premier
 * obstacle porte un halo exagéré et le mot « FRÔLE ». Disparaît pour
 * toujours au premier frôlement réussi. Aucune popup, aucun skip.
 */
export const TEACH = {
  haloAlpha: 0.5,
  haloAlphaActive: 0.85,
  // Le mot lui-même vient de i18n (clé "teach.word") : aucun libellé en dur.
  fontSizePx: 34,
  color: "#f2c8ff",
  // Position du mot : à gauche de l'obstacle, au centre de son passage.
  offsetX: -96
} as const;

export const RESTART = {
  // Délai mini avant d'accepter le tap de relance : évite de repartir
  // sans avoir vu l'écran de mort si le doigt était déjà en train de retomber.
  minDeathMs: 100
} as const;

/** Dessine la hitbox mortelle, l'anneau de frôlement et les formes de collision. */
export const DEBUG_HITBOX = false;

/** Overlay de debug en haut à gauche : fps, vitesse, nom du palier. */
export const DEBUG_STATS = false;

// --- Garde-fou (dev uniquement) : contrainte d'équité des paliers.
// Chaque obstacle est la seule occasion de recharger le minuteur de combo :
// aucun palier ne doit espacer les obstacles au-delà de MAGIC.max * 0.6 s,
// jitter compris, sinon le combo casse sans faute du joueur.
if (import.meta.env.DEV) {
  const limit = MAGIC.max * MAGIC.grazeWindowFactor;
  for (const tier of TIERS) {
    const worst = tier.spawnInterval * (1 + OBSTACLES.intervalJitter);
    if (worst > limit) {
      throw new Error(
        `TIERS « ${tier.nameKey} » : spawnInterval ${tier.spawnInterval}s ` +
          `(pire cas ${worst.toFixed(2)}s avec jitter) dépasse la limite ` +
          `MAGIC.max * grazeWindowFactor = ${limit}s`
      );
    }
  }
}
