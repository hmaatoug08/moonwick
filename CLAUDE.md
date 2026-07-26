# Moonwick — jeu mobile near-miss

## Vision
**Moonwick** — jeu hypercasual portrait, une main, sessions de 30-90 s. Une sorcière sur balai vole de nuit dans une forêt maudite. **Frôler les obstacles charge sa magie** : la traînée s'illumine, le multiplicateur monte, jusqu'au mode "Pleine Lune" (×5). Toucher un obstacle = mort. Restart < 1 seconde.

Critère n°1 de toute décision : *le joueur veut-il immédiatement rejouer après avoir perdu ?*
Critère n°2 : *un nouveau joueur comprend-il en 10 secondes qu'il doit frôler, sans tutoriel ?*

## Stack
- Phaser 3 + TypeScript + Vite. Cible : 60 fps sur mobile milieu de gamme.
- `npm run dev` pour développer, `npm run build` pour valider (tsc + vite).
- Capacitor en Phase 7 seulement. Aucun backend, aucune dépendance serveur.

## Règles de développement (IMPORTANT)
1. **Une phase à la fois.** Ne jamais implémenter des fonctionnalités d'une phase future sans demande explicite.
2. **Simplicité maximale.** Pas d'ECS, pas de state manager, pas de framework d'architecture. Des scènes Phaser et des classes simples suffisent.
3. **Le game feel prime sur le code élégant.** Toutes les constantes de gameplay vivent dans `config.ts` et doivent être tunables à la main.
4. **Ne jamais réintroduire une mécanique listée dans "Décisions" comme abandonnée.**
5. Après chaque modification : vérifier que `npm run build` passe et indiquer comment tester manuellement.
6. Commentaires en français, concis.
7. **Moonwick est un nom de marque, jamais traduit, jamais passé par i18n.** Il vit dans `BRAND` (config.ts) et se traite typographiquement comme un logo, pas comme du texte d'interface.

## Règles du jeu (état actuel — fait autorité)

### Vol
Maintenir = monter, relâcher = descendre. Gravité douce, vitesse clampée.

### Mort
**Uniquement par contact avec un obstacle.** Aucune autre source de mort dans le jeu.
- Hitbox mortelle : cercle r=10 centré sur la sorcière, volontairement plus petit que le visuel (générosité perçue).
- Écran de mort minimal : score + "Tape pour rejouer". Restart < 300 ms. Le tap de relance ne doit pas être interprété comme un input de vol.

### Frôlement (near-miss)
- Zone de frôlement : anneau 10 < d ≤ 38 px de la **surface** de l'obstacle (distance point-rectangle réelle, pas centre-à-centre).
- Un frôlement maximum par obstacle (flag `grazed`).
- `onGrazeEnter` → recharge immédiate du minuteur de combo.
- `onGrazeExit` → attribution du score et incrément du combo.

### Combo et multiplicateur
- Combo +1 par frôlement. Multiplicateur = 1 + combo/2, plafonné à **×5 (Pleine Lune)**.
- **Minuteur de combo** (`MAGIC_MAX = 4` s) : décroît en continu, rechargé à chaque frôlement.
- À 0 : `combo = 0`, multiplicateur ×1, **la partie continue**. Le minuteur n'est pas une barre de vie.
- L'assombrissement de l'écran quand le minuteur baisse est du **feedback visuel pur**, sans effet mécanique.

### Score
- Frôlement : **10 × multiplicateur**. Affiché en grand à la position du frôlement (`FRÔLÉ ! +N`).
- Obstacle dépassé **alors que le combo est à 0** : `DARK_POINTS_SEQUENCE = [1, 1, 1, 0]` — le Nième obstacle de la traversée en cours rapporte la Nième valeur, puis **0 au-delà**. Affiché en petit et discret (rien n'est affiché quand la valeur est 0).
- Le compteur de la séquence **repart à zéro dès qu'un frôlement relance le combo**.
- Obstacle dépassé alors que le combo est actif : **0 point**. Seuls les frôlements marquent.
- Les points d'obscurité ne doivent **jamais** augmenter avec le temps de survie ni avec le nombre d'obstacles : ils **s'éteignent**. Aucune autre source de points passive.

### Balise (beacon)
- Après `DROUGHT_THRESHOLD = 3` obstacles dépassés avec le combo à 0, la lumière de la sorcière pulse (~2 Hz) et les halos des obstacles à venir pulsent en synchro.
- Aide visuelle uniquement : aucun effet mécanique, aucun bonus.

### Affordance
- La zone de frôlement est dessinée comme un halo violet translucide **autour de chaque obstacle** (alpha 0.15, → 0.5 quand la sorcière est dedans). C'est le principal enseignant de la règle.
- La densité et la luminosité de la traînée sont l'indicateur principal du multiplicateur — le joueur ne doit pas avoir à lire un chiffre.
- **INVARIANT de lisibilité : les obstacles et leurs halos de frôlement ne sont jamais assombris ni dégradés par un effet visuel** (perte de combo, transitions de palier, Pleine Lune…). L'overlay d'obscurité est dessiné **sous** la couche de jeu et ne touche que le fond et le décor ; la perte de combo s'exprime par **désaturation/refroidissement** du décor (overlay plafonné à 0.5), et le liseré clair des obstacles se **renforce** quand la lumière baisse. C'est l'information dont le joueur a le plus besoin quand il est à ×1 — toute future DA doit préserver cet invariant.

## Roadmap
- [x] **P1 — Squelette** : vol maintenir/relâcher, obstacle qui défile, 60 fps.
- [x] **P2 — Procédural** : génération d'obstacles variés, espacement jouable, scroll constant.
- [x] **P3 — Near-miss + mort** : hitbox, zone de frôlement, combo, score, restart instantané.
- [x] **P4 — Game feel** : particules liées au combo, screen shake léger, slow-motion sur frôlement extrême, mode Pleine Lune, sons Web Audio synthétisés.
- [x] **P5 — Difficulté** : paliers temporels dans `TIERS` (config.ts) — **La Lisière** (0 s, `gapSize` 250), **Le Bois Noir** (25 s, 140), **Les Ronces** (50 s, 70), **Le Mur** (80 s, 67), **L'Œil de la Lune** (120 s, 64 — plateau final : la difficulté se fige, le skill fait la durée). Levier principal = resserrement ; vitesse en hausse modérée (220 → 285 px/s). **Dès Les Ronces, la demi-largeur du passage (jitter au pire compris) est < 38 px : traverser sans frôler est structurellement impossible** — le calcul est commenté par palier dans config.ts, et le générateur pose un tronc quand aucune branche ne peut se resserrer sans devenir inatteignable. Transitions : nom affiché ~1,5 s, paramètres et ciel interpolés sur 2 s. Contrainte d'équité (`spawnInterval` < `MAGIC_MAX * 0.6`) garantie à chaque tirage + assertion en dev. `DEBUG_START_TIER` pour démarrer à un palier donné.
- [x] **P6 — Meta légère** : `MenuScene` (titre, meilleur score, tap plein écran, toggle son, décor animé avec sorcière en boucle) ; persistance localStorage ; écran de mort enrichi (score, palier, meilleur combo de la run, « Nouveau record ! », **Rejouer** occupant le bas de l'écran) ; **image de score partageable** 1080×1920 générée sur canvas hors écran (Web Share API avec fichier, sinon téléchargement PNG) ; apprentissage sans tutoriel à la première partie (halo exagéré + « FRÔLE », disparaît définitivement au premier frôlement) ; **pause automatique** sur `visibilitychange`/blur avec reprise au tap, sans mort possible pendant l'absence.
- [ ] **P7 — Mobile** : Capacitor, builds iOS/Android, safe areas, haptics.
- [ ] **P8 — Monétisation/analytics** : AdMob rewarded ("continuer" 1×/partie), interstitiel max 1/3 parties, IAP no-ads.

## Décisions (historique — ne pas revenir en arrière)
- **Jauge de magie comme barre de vie → abandonnée.** Elle tuait des joueurs qui passaient correctement les obstacles. C'est désormais le minuteur du multiplicateur, rien d'autre. `FLICKER_GRACE` et la mort par magie éteinte sont supprimés.
- **Sursaut ×4 après traversée dans le noir → abandonné.** Récompensait l'arrêt volontaire du frôlement (farm du bonus de retour). Remplacé par `DARK_POINTS = 1` + la balise visuelle.
- **Points de traversée systématiques → abandonnés.** Ils diluaient la lecture quand le combo est actif. Conservés uniquement dans l'obscurité, à valeur fixe.
- **Recharge du minuteur à la sortie de zone → abandonnée** au profit de l'entrée, qui supprimait des morts perçues comme injustes.
- Le générateur procédural doit garantir qu'un obstacle apparaît toujours dans un délai < `MAGIC_MAX * 0.6` : sans cette contrainte, le maintien du combo devient parfois impossible indépendamment du skill.

## Internationalisation (IMPORTANT)
Langues supportées : **English, Français, Español, Italiano**. Tout vit dans `src/i18n.ts`.

- **Seule exception : le nom de marque « Moonwick »** (`BRAND.name`), identique dans les quatre langues.
- **RÈGLE ABSOLUE : aucune autre chaîne littérale affichée dans les scènes.** Menu, réglages, écran de mort, écran de pause, tutoriel première partie, textes flottants, noms de paliers et image de partage passent *tous* par `t("clé")`. Les seuls littéraux tolérés dans les scènes sont les jetons techniques (`"sans-serif"`, `"bold"`, clés de scène, clés de texture).
- Les noms de paliers ne sont pas des libellés mais des clés : `TIERS[i].nameKey` (`tier.edge`, `tier.darkwood`, `tier.brambles`, `tier.wall`, `tier.moonEye`).
- L'anglais fait autorité pour les clés : `STRINGS.fr/es/it` sont typés sur lui, donc **une clé oubliée casse le build**.
- `t(key, params)` interpole les `{paramètres}`. `tAll(key)` retourne les 4 traductions — utilisé pour dimensionner.
- `setLanguage(lang)` persiste et notifie les abonnés (`onLanguageChange`) : les scènes se rafraîchissent **immédiatement, sans rechargement**. Toute scène qui affiche du texte doit s'abonner dans `create()` et se désabonner au `SHUTDOWN`.
- Détection au premier lancement via `navigator.language` (partie primaire, repli `en`). **Le choix explicite de l'utilisateur prime définitivement.**
- Réglages accessibles depuis l'accueil via l'icône engrenage : sélecteur de langue (noms natifs) + toggle son + bouton retour.
- `DEBUG_FORCE_LANG` (config.ts) force une langue pour tester, sans toucher au navigateur ni au choix persisté.

### Mise en page multilingue (plancher permanent)
Les écarts de longueur atteignent **×2,3** (`Replay` → `Jugar de nuevo`). Donc :
- un bouton se dimensionne sur la **plus longue des 4 traductions** (`buttonWidth()` dans `src/ui.ts`), jamais sur l'anglais ;
- tout texte passe par `fitText()`, qui réduit la police s'il déborde de sa zone ;
- l'image de partage applique la même contrainte (`fitFont()` dans `src/share.ts`) ;
- toute nouvelle chaîne doit être vérifiée visuellement dans les 4 langues.

## Persistance (localStorage)
Toutes les clés sont préfixées `moonwick:` et gérées dans `src/save.ts` — jamais d'accès direct à `localStorage` ailleurs. Les anciennes clés `sorciere:` (avant le renommage de la marque) sont **migrées silencieusement** au chargement : recopiées puis supprimées, sans jamais écraser une valeur déjà présente. Un stockage indisponible (navigation privée, quota) est toléré : le jeu tourne sans persistance, sans jamais lever d'exception.

| Clé | Contenu |
| --- | --- |
| `moonwick:bestScore` | Meilleur score, entier |
| `moonwick:bestCombo` | Meilleur combo (nombre de frôlements enchaînés) |
| `moonwick:bestTier` | Index dans `TIERS` du palier le plus loin atteint |
| `moonwick:games` | Nombre de parties jouées |
| `moonwick:sound` | `"1"` (défaut) / `"0"` — toggle du menu, persiste entre sessions |
| `moonwick:tutorialDone` | `"1"` après le premier frôlement réussi ; masque l'apprentissage pour toujours |
| `moonwick:lang` | `"en"` / `"fr"` / `"es"` / `"it"` — choix explicite dans les réglages, prime définitivement sur `navigator.language` |

## Accessibilité et qualité (plancher permanent)
- `prefers-reduced-motion` respecté pour le screen shake et le slow-motion.
- Volume des sons bas par défaut, coupable depuis le menu (choix persistant).
- Format portrait, une main, aucun texte indispensable à la compréhension.
- Jeu jouable en 4 langues, sans débordement de texte sur aucun écran (voir Internationalisation).
- Le restart reste **sous 300 ms** (remise à zéro en place, aucune scène rechargée) et le tap qui relance n'est jamais interprété comme un input de vol. Idem pour le tap qui reprend après une pause.
- Aucune fuite entre les parties : obstacles, textes flottants, particules et tweens reviennent à l'identique après 20 parties consécutives.