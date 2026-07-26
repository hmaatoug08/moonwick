# Moonwick — mobile near-miss game

## Vision
**Moonwick** — a hypercasual portrait game, one hand, 30-90 second sessions. A witch on a broomstick flies through a cursed forest at night. **Grazing obstacles charges her magic**: the trail lights up, the multiplier climbs, all the way to "Full Moon" (x5). Touching an obstacle = death. Restart in under a second.

Decision criterion #1: *does the player want to replay immediately after losing?*
Criterion #2: *does a new player understand within 10 seconds that they must graze, with no tutorial?*

## Stack
- Phaser 3 + TypeScript + Vite. Target: 60 fps on a mid-range phone.
- `npm run dev` to develop, `npm run build` to validate (tsc + vite).
- Capacitor in Phase 7 only. No backend, no server dependency.

## Development rules (IMPORTANT)
1. **One phase at a time.** Never implement features from a future phase without an explicit request.
2. **Maximum simplicity.** No ECS, no state manager, no architecture framework. Phaser scenes and plain classes are enough.
3. **Game feel beats elegant code.** Every gameplay constant lives in `config.ts` and must be tunable by hand.
4. **Never reintroduce a mechanic listed as abandoned in "Decisions".**
5. After every change: check that `npm run build` passes and explain how to test manually.
6. **All source code in English** — comments, identifiers, documentation. The only French, Spanish and Italian text in the repo is the translation strings inside `i18n.ts`.
7. **Moonwick is a brand name, never translated, never routed through i18n.** It lives in `BRAND` (config.ts) and is treated typographically as a logo, not as interface text.

## Game rules (current state — authoritative)

### Flight
Hold = climb, release = descend. Gentle gravity, clamped speed.

### Death
**Only by contact with an obstacle.** There is no other source of death in the game.
- Lethal hitbox: a 10 px radius circle centred on the witch, deliberately smaller than the visual (perceived generosity).
- Death screen: score + cause + run summary + a giant Replay button. Restart < 300 ms. The replay tap must never be read as a flight input.

### Graze (near-miss)
- Graze zone: a ring 10 < d <= 38 px from the obstacle **surface** (a real point-to-rectangle distance, not centre to centre).
- One graze maximum per obstacle (`grazed` flag).
- `onGrazeEnter` -> immediate refill of the combo timer.
- `onGrazeExit` -> score award and combo increment.

### Combo and multiplier
- Combo +1 per graze. Multiplier = 1 + combo/2, capped at **x5 (Full Moon)**.
- **Combo timer** (`MAGIC.max = 4` s): drains continuously, refilled by every graze.
- At 0: `combo = 0`, multiplier x1, **the run continues**. The timer is not a health bar.
- The screen darkening as the timer drops is **pure visual feedback**, with no mechanical effect.

### Score
- Graze: **10 x multiplier**. Shown large at the graze position.
- Obstacle passed **while the combo is at 0**: `SCORING.darkPointsSequence = [1, 1, 1, 0]` — the Nth obstacle of the current run through the dark awards the Nth value, then **0 beyond that**. Shown small and discreet (nothing is shown when the value is 0).
- The sequence counter **restarts as soon as a graze revives the combo**.
- Obstacle passed while the combo is active: **0 points**. Only grazes score.
- Dark points must **never** grow with survival time or obstacle count: they **fade out**. There is no other passive source of points.

### Beacon
- After `DROUGHT_THRESHOLD = 3` obstacles passed with the combo at 0, the witch's light pulses (~2 Hz) and upcoming obstacle halos pulse in sync.
- Visual aid only: no mechanical effect, no bonus.

### Affordance
- The graze zone is drawn as a translucent violet halo **around every obstacle** (alpha 0.15, -> 0.5 when the witch is inside). It is the main teacher of the rule.
- Trail density and brightness are the primary indicator of the multiplier — the player should never have to read a number.
- **READABILITY INVARIANT: obstacles and their graze halos are never darkened or degraded by any visual effect** (combo loss, tier transitions, Full Moon, and so on). The darkness overlay is drawn **under** the gameplay layer and only touches the background and scenery; combo loss is expressed through **desaturation and cooling** of the scenery (overlay capped at 0.5), and the bright obstacle outline **strengthens** as the light fades. This is the information the player needs most when at x1 — any future art direction must preserve this invariant.

## Roadmap
- [x] **P1 — Skeleton**: hold/release flight, one scrolling obstacle, 60 fps.
- [x] **P2 — Procedural**: varied obstacle generation, playable spacing, constant scroll.
- [x] **P3 — Near-miss + death**: hitbox, graze zone, combo, score, instant restart.
- [x] **P4 — Game feel**: combo-driven particles, light screen shake, slow motion on extreme grazes, Full Moon mode, synthesised Web Audio sounds.
- [x] **P5 — Difficulty**: time-based tiers in `TIERS` (config.ts) — **The Edge** (0 s, `gapSize` 250), **The Dark Wood** (25 s, 140), **The Brambles** (50 s, 70), **The Wall** (80 s, 67), **The Moon's Eye** (120 s, 64 — final plateau: difficulty freezes, skill decides run length). Main lever = narrowing; speed rises moderately (220 -> 285 px/s). **From The Brambles onwards, half the gap width (worst-case jitter included) is < 38 px: crossing without grazing is structurally impossible** — the calculation is commented per tier in config.ts, and the generator places a trunk whenever no branch can be narrowed without becoming unreachable. Transitions: name shown ~1.5 s, parameters and sky interpolated over 2 s. Fairness constraint (`spawnInterval` < `MAGIC.max * 0.6`) guaranteed on every draw plus a dev assertion. `DEBUG_START_TIER` to start at a given tier.
- [x] **P6 — Light meta**: `MenuScene` (logo, best score, full-screen tap, settings, animated scenery with a looping witch); localStorage persistence; enriched death screen (score, tier, best combo of the run, "New record!", **Replay** filling the bottom of the screen); **shareable score image** 1080x1920 generated on an off-screen canvas (Web Share API with a file, otherwise a PNG download); tutorial-free onboarding on the first run (exaggerated halo + graze word, gone for good after the first graze); **automatic pause** on `visibilitychange`/blur with resume on tap, and no death possible while away.
- [ ] **P7 — Mobile**: Capacitor, iOS/Android builds, safe areas, haptics.
- [ ] **P8 — Monetisation/analytics**: AdMob rewarded ("continue" once per run), interstitial at most every 3 runs, no-ads IAP.

## Decisions (history — do not revert)
- **Magic gauge as a health bar -> abandoned.** It killed players who were clearing obstacles correctly. It is now the multiplier timer, nothing else. `FLICKER_GRACE` in its original role and death by drained magic are gone.
- **x4 surge after crossing in the dark -> abandoned.** It rewarded deliberately stopping to graze (farming the return bonus). Replaced by `darkPointsSequence` + the visual beacon.
- **Systematic pass-through points -> abandoned.** They diluted readability while the combo was active. Kept only in the dark, and decaying.
- **Timer refill on leaving the zone -> abandoned** in favour of entry, which removed deaths perceived as unfair.
- The procedural generator must guarantee that an obstacle always appears within `MAGIC.max * 0.6`: without that constraint, holding a combo sometimes becomes impossible regardless of skill.

## Internationalisation (IMPORTANT)
Supported languages: **English, Français, Español, Italiano**. Everything lives in `src/i18n.ts`.

- **Only exception: the brand name "Moonwick"** (`BRAND.name`), identical in all four languages.
- **ABSOLUTE RULE: no other literal display string in the scenes.** Menu, settings, death screen, pause screen, first-run onboarding, floating texts, tier names and the share image *all* go through `t("key")`. The only literals allowed in scenes are technical tokens (`"sans-serif"`, `"bold"`, scene keys, texture keys).
- Tier names are keys, not labels: `TIERS[i].nameKey` (`tier.edge`, `tier.darkwood`, `tier.brambles`, `tier.wall`, `tier.moonEye`).
- English is authoritative for keys: `STRINGS.fr/es/it` are typed against it, so **a forgotten key breaks the build**.
- `t(key, params)` interpolates `{parameters}`. `tAll(key)` returns all 4 translations — used for sizing.
- `setLanguage(lang)` persists and notifies subscribers (`onLanguageChange`): scenes refresh **immediately, with no reload**. Any scene displaying text must subscribe in `create()` and unsubscribe on `SHUTDOWN`.
- Detection on first launch via `navigator.language` (primary subtag, falling back to `en`). **The player's explicit choice wins permanently.**
- Settings reachable from the home screen via the gear icon: language selector (native names) + sound toggle + back button.
- `DEBUG_FORCE_LANG` (config.ts) forces a language for testing, without touching the browser or the persisted choice.

### Multilingual layout (permanent floor)
Length gaps reach **x2.3** (`Replay` -> `Jugar de nuevo`). Therefore:
- a button is sized against the **longest of the 4 translations** (`buttonWidth()` in `src/ui.ts`), never against English;
- every text goes through `fitText()`, which shrinks the font if it overflows its area;
- the share image applies the same constraint (`fitFont()` in `src/share.ts`);
- every new string must be checked visually in all 4 languages.

## Persistence (localStorage)
Every key is prefixed `moonwick:` and handled in `src/save.ts` — never touch `localStorage` directly anywhere else. Legacy `sorciere:` keys (from before the brand rename) are **migrated silently** on load: copied then removed, never overwriting a value already present. Unavailable storage (private browsing, quota) is tolerated: the game runs without persistence and never throws.

| Key | Contents |
| --- | --- |
| `moonwick:bestScore` | Best score, integer |
| `moonwick:bestCombo` | Best combo (number of chained grazes) |
| `moonwick:bestTier` | Index in `TIERS` of the furthest tier reached |
| `moonwick:games` | Number of games played |
| `moonwick:sound` | `"1"` (default) / `"0"` — settings toggle, persists across sessions |
| `moonwick:tutorialDone` | `"1"` after the first successful graze; hides onboarding forever |
| `moonwick:lang` | `"en"` / `"fr"` / `"es"` / `"it"` — explicit choice in the settings, wins permanently over `navigator.language` |

## Accessibility and quality (permanent floor)
- `prefers-reduced-motion` honoured for screen shake and slow motion.
- Sound volume low by default, mutable from the settings (choice persists).
- Portrait format, one hand, no text required to understand the game.
- Playable in 4 languages with no text overflow on any screen (see Internationalisation).
- Restart stays **under 300 ms** (in-place reset, no scene reload) and the tap that restarts is never read as a flight input. Same for the tap that resumes after a pause.
- No leaks between runs: obstacles, floating texts, particles and tweens return to identical counts after 20 consecutive runs.
