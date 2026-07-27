# Moonwick — mobile near-miss game

## Vision
**Moonwick** — a hypercasual portrait game, one hand, 30-90 second sessions. A witch on a broomstick flies through a cursed forest at night. **Grazing obstacles charges her magic**: the trail lights up, the multiplier climbs, all the way to "Full Moon" (x5). Touching an obstacle = death. Restart in under a second.

Decision criterion #1: *does the player want to replay immediately after losing?*
Criterion #2: *does a new player understand within 10 seconds that grazing is what scores, with no tutorial?*

## Stack
- Phaser 3 + TypeScript + Vite. Target: 60 fps on a mid-range phone.
- `npm run dev` to develop, `npm run build` to validate (tsc + vite).
- Capacitor in Phase 7 only. No backend, no server dependency.
- **No image files.** Every visual is generated procedurally at boot (`textures.ts`, `obstacleShapes.ts`, `witchShape.ts`).

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
- Lethal hitbox: an 8 px radius circle centred on the witch's TORSO — not on her drawing's bounding box — deliberately smaller than the visual (perceived generosity). Hat, cape and broom are never lethal. See "The witch".
- Death screen: contextual message + score + cause + run summary + score history + a giant Replay button. Restart < 300 ms. The replay tap must never be read as a flight input.
- **Nothing on the death screen may delay replaying.** The tap is live on the very first frame: no delay guard, no timer, no mandatory animation. The message and the history are drawn synchronously in `die()`.

### Contextual game-over message
One line above the score, picked by situation. Categories live in `DEATH_MESSAGES` (i18n.ts), each holding 2-3 variants drawn at random. Thresholds live in `DEATH_MESSAGE` (config.ts).

Fixed priority, first match wins:
1. `newRecord` — the run beat the stored record.
2. `nearRecord` — score >= `nearRecordRatio` (0.85) of the record, without beating it.
3. `bigCombo` — best combo of the run >= `bigComboThreshold` (8).
4. `earlyDeath` — the run lasted less than `earlyDeathSeconds` (10 s).
5. `default` — anything else.

**ANTI-CONCATENATION RULE (absolute).** A message is never assembled from fragments. Each variant is a complete sentence written out in full in every language, using only the `{score}`, `{combo}` and `{tier}` placeholders. Word order, punctuation and agreement differ per language, so glueing pieces together breaks sentences somewhere. To add a case, add a whole new template — never a fragment.

### Score history
The last `HISTORY.size` (5) scores are kept in `moonwick:history` and shown on the death screen as a mini bar chart, oldest on the left, the run that just ended on the right. The best of the five is highlighted in gold. Bars are redrawn on each death; the five labels are created once and reused, so nothing accumulates between runs.

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
- A "How to play" page (three pictograms: graze scores, touching kills, chaining multiplies) exists in the settings. It is **only ever opened on purpose** — nothing shows it automatically, and it never replaces the first-run onboarding.
- Trail density and brightness are the primary indicator of the multiplier — the player should never have to read a number.
- **READABILITY INVARIANT: obstacles and their graze halos are never darkened or degraded by any visual effect** (combo loss, tier transitions, Full Moon, and so on). The darkness overlay is drawn **under** the gameplay layer and only touches the background and scenery; combo loss is expressed through **desaturation and cooling** of the scenery (overlay capped at 0.5), and the moon rim on the obstacles **strengthens** as the light fades. This is the information the player needs most when at x1 — any future art direction must preserve this invariant.

## Difficulty balance (IMPORTANT — this reversed an earlier pillar)

Playtests said the game was too hard. The rebalance is tuning only: no mechanic
changed.

**Grazing is no longer compulsory.** The game used to guarantee that from The
Brambles onwards half the gap was narrower than the graze ring, so crossing
cleanly was *structurally impossible*. That is now **deliberately reversed**: at
every tier, including The Wall and The Moon's Eye, a careful player can cross
without ever entering the ring. A dev assertion in config.ts enforces it, and it
is the exact inverse of the assertion that used to live there.

What replaces the structural pressure is **economic**: only grazes score, and
dark points decay to zero within a run (`SCORING.darkPointsSequence`). Playing
safe is allowed and pays almost nothing. Measured clean corridor — the band
where the witch is outside the ring on both sides — runs 169 px at The Edge down
to 16 px at The Moon's Eye.

Consequence to keep in mind: criterion #2 is now carried by the score feedback
alone, not by the geometry. If playtests ever show new players never discovering
grazing, that is where to look first.

**`GLOBAL_SPEED`** (0.85) multiplies the scroll speed and DIVIDES the spawn
interval. Distance between obstacles = speed x interval, so the course keeps its
exact spatial layout and only time is stretched — one knob for the whole game's
rhythm, with no tier redesign. It is why `spawnInterval` values in TIERS are
authored *before* the factor, and why the fairness assertion checks the
effective interval: otherwise `clampInterval` would silently cap it and the
slowdown would stop applying at the widest tiers.

**The Edge is a learning tier** (30 s, `gapSize` 250, slowest). A naive bot that
merely aims at the middle of the next gap clears it 12/12.

**Hitbox 8 px** (was 10), purely for perceived generosity. The graze ring is
unchanged, so the ring simply starts closer to the witch.

### Adaptive easing (`MERCY`)

After 3 consecutive deaths under 12 s, the next run gets +15% `gapSize` and -10%
speed. The help lifts mid-run as soon as the player passes 20 s.

- **Totally invisible.** No message, no icon, no sound. A player being helped
  must never be told, or the help becomes a judgement on their skill.
- The trigger is **derived** from the death log, never stored: a long run breaks
  the trailing streak of quick deaths by itself, so there is no second source of
  truth to keep in sync.
- It only touches the generator (`effectiveDiff()`), never `diffCurrent`, so the
  sky, the tier announcement and the debug readout keep showing the real tier.
- `MERCY.enabled` turns the whole thing off.

### Death log and the tuning readout

`moonwick:deaths` keeps the last 50 deaths: seconds survived, tier, cause,
grazes. It is the source of truth for tuning, and what the adaptive easing is
derived from.

**Long press (700 ms) on the logo** opens a stats screen: median survival,
median grazes, share of deaths under the quick-death threshold, cause split, and
the death distribution per tier as bars. Tap anywhere to close.

That screen is a DEBUG surface, like the `DEBUG_STATS` overlay: its labels are
technical tokens and stay **out of i18n** — only tier names, which are keys, go
through `t()`. It is the one documented exception to the no-literal-strings
rule, and it exists because tuning against recorded deaths beats tuning against
a hunch.

Note the interaction with the home screen: on the logo the tap decision waits
for the *release* (short press plays, long press opens the readout). Everywhere
else the tap still starts the run on press, so the game keeps its instant feel.

### The witch (`src/witchShape.ts`)

Drawn with `Graphics` once at boot, cached in a `RenderTexture` (two frames: body and rim), then displayed as a sprite. No image file. Same light as the obstacles: silver-violet rim on the moon-facing side, direction taken from `MOON` — one light source for the whole scene.

**Her body is deliberately lifted off pure black** (`WITCH_ART.bodyColor`), unlike the obstacles. At near-black her contrast against the sky *collapsed* as the scene darkened (down to ~1.05), which is exactly when the combo has been lost and the player most needs to find herself; lifted, contrast *rises* as the light fades (~1.4). It also stops her reading as the same material as the trees. Any change here must be checked against **every** tier sky, top and bottom, dimmed and not — a single flat colour matches the gradient somewhere, which is why the rim and the aura, not the fill, are what guarantee she is findable.

**HITBOX AT THE BUST.** The 10 px lethal circle is centred on the TORSO, never on the drawing's bounding box. The torso is also the sprite's origin and its rotation pivot, so `witch.x/y` is at once what the collision tests and what the art pivots around — they cannot drift apart. The hat, the cape and the broom's brush all reach well past the circle and **none of them is lethal**.

**The visual contains the hitbox, never the reverse.** The body is built on a core disc of `WITCH_ART.coreRadius` (> `deathRadius`) centred on the torso, so the guarantee holds by construction; a dev assertion throws if that ever stops being true. `DEBUG_HITBOX` draws the circle *over* the silhouette (debug depth 25 > witch depth 5).

**The rim is drawn by subtraction**, not traced by hand: draw the body, erase the same body shifted away from the moon, keep the surviving crescent. It follows the true silhouette however the drawing changes.

Other rules the art has to obey:
- **The silhouette is one connected mass.** Hat, head, torso and broom overlap on purpose — as separate pieces the rim reads as scattered floating lines rather than a character. The hat is a single polygon (brim *and* cone) tracing the real outline; drawn as two pieces it reads as a slab hovering over a ball, drawn as one filled wedge it reads as a blob.
- **The hat's height is bounded by gameplay.** The torso is clamped to `WITCH.marginTop` (20 px) and the hitbox sits on the torso, so anything more than ~26 px above it is clipped by the top of the screen every time the player holds a climb into the ceiling.
- **The rim has to be strong even at x1** (`rimAlphaIdle`): she is near-black against a near-black sky, and the player aims a 10 px hitbox with her.

**Posture.** A real rotation proportional to vertical speed, exponentially smoothed (never a jump), clamped to `tiltUpDeg`/`tiltDownDeg` (-30°/+35°). It replaced the old scale squash.

**Cape and hat tip** are procedural: two 3-point damped spring chains trailing the witch, drawn as tapered ribbons through a spline. They ripple on the climb and snap on the dive with no animation authored — stiffness, damping and segment length live in `WITCH_ART`. A hard leash (`chainMaxStretch`) stops a huge `dt` (tab wake-up, slow motion ending) from flinging the cape across the screen.

**She carries the combo.** Rim opacity and aura grow with the multiplier, up to the golden blaze of Full Moon, so the multiplier is readable on the character without looking at the number. The aura is sized in **pixels**, not as a multiple of the 256 px light texture — scaled by ~1 it floodlights the screen instead of rimming her.

**Graze reaction:** a micro-lean away from the obstacle plus a ripple through the cape, eased out over `grazeKickMs` (150 ms). The side is read from the free band — whichever edge of the gap she passed closest to is the material she grazed.

The same `Witch` class is used by the menu and the death screen, so the character never has two looks.

### Obstacle rendering (`src/obstacleShapes.ts`)

**Collision and visuals are separated.** Detection still runs on invisible primitives only — per part, one rectangle plus one circle (so 2 shapes for a branch, 4 for a trunk), with `distanceTo()` taking the minimum over the set. `NEAR_MISS.deathRadius` (10) and `grazeRadius` (38) are unchanged. The drawn silhouette is built *around* those primitives and has no say in gameplay.

**The visual may overshoot the hitbox; it may never fall inside it.** No lethal pixel is ever invisible. Two things would break this, and `coverFloor()` is the single place that arbitrates both:
- narrowing — the spindle is clamped so the half-width never drops below one collision radius;
- **curvature** — the centreline bows sideways while the hitbox stays a straight bar on the axis, so a bow of `cx` must be paid for with `cx` of extra half-width. Curvature therefore costs double, which is why the per-essence `curve` values stay modest.

`OBSTACLE_ART.coverMargin` (0.12 radius) keeps the contour clear of the hitbox rather than flush with it; without it the outermost lethal pixel would only be covered by an antialiased edge. The rounded cap is inflated by the same margin, because at the apex the limiting direction is *along* the axis, not across it.

**Silhouettes.** Seeded procedural polygons, 6 variants per essence, generated once at boot into a single cached `RenderTexture` atlas (96 frames, ~612x1696) and picked at random per part. No image file is ever added to the project. Five principles: spindle (width always decreasing), curvature (never a straight line), contour noise (a different seed per variant), termination (point, fork or break), anchoring (widened footing at the screen edge).

Each silhouette is split into a **shaft** frame and a **tip** frame because they scale differently: the shaft stretches to the part's length, while the tip is drawn at a fixed pixel scale. A stretched tip would jut far into the gap on long obstacles and make an open passage look blocked. For the same reason the termination is shaped **sideways** — ragged, off-centre, splintered — and never lengthways: every tip faces the gap the player flies through.

**Silhouettes must stay inside their own graze halo.** The halo is the main teacher of the rule, so art drawn wider than it would show "obstacle" where the game scores nothing. A dev assertion in `obstacleShapes.ts` throws if the widest silhouette exceeds `(cap + grazeRadius) / cap` radii — trunks are the binding case.

**Single light direction.** The moon (`MOON` in config.ts) is the scene's only light source and fixes the rim for every obstacle at once — never per obstacle, never depending on where an obstacle currently sits on screen. The body is near-pure black; the silver-violet rim is the primary readability element and its opacity rises as the scene darkens (`rimAlphaLit` -> `rimAlphaDark`). Move `MOON.x` across the centre and the whole forest relights itself.

**One essence per tier** (`Tier.essence`, rendering only — no effect on spacing, width or difficulty): The Edge -> `birch`, The Dark Wood -> `gnarled`, The Brambles -> `bramble`, The Wall -> `denseStand`, The Moon's Eye -> `denseStand` again with `invertContrast`. Obstacles take the essence in force when they spawn, so a tier change rolls in with the existing 2 s transition instead of restyling the trees already on screen.

**Contrast inversion** (`MOON_EYE.enabled`, toggleable): at The Moon's Eye the sky turns pale gold and the obstacles absolute black. Inverting the background inverts what "visible" means, so the graze halo and the HUD flip to dark-on-light in the same move — otherwise both would nearly vanish, and the halo must stay perfectly readable at all times.

## Roadmap
- [x] **P1 — Skeleton**: hold/release flight, one scrolling obstacle, 60 fps.
- [x] **P2 — Procedural**: varied obstacle generation, playable spacing, constant scroll.
- [x] **P3 — Near-miss + death**: hitbox, graze zone, combo, score, instant restart.
- [x] **P4 — Game feel**: combo-driven particles, light screen shake, slow motion on extreme grazes, Full Moon mode, synthesised Web Audio sounds.
- [x] **P5 — Difficulty**: time-based tiers in `TIERS` (config.ts) — **The Edge** (0 s, `gapSize` 250), **The Dark Wood** (30 s, 170), **The Brambles** (55 s, 130), **The Wall** (85 s, 105), **The Moon's Eye** (125 s, 96 — final plateau: difficulty freezes, skill decides run length). Main lever = narrowing; speed rises moderately. **Crossing without grazing is possible at EVERY tier** (see "Difficulty balance"). Transitions: name shown ~1.5 s, parameters and sky interpolated over 2 s. Fairness constraint (`spawnInterval` < `MAGIC.max * 0.6`) guaranteed on every draw plus a dev assertion. `DEBUG_START_TIER` to start at a given tier. Each tier also carries an `essence` (tree species) — see "Obstacle rendering", rendering only.
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
- `DEBUG_RESET_TUTORIAL` (config.ts) clears only `moonwick:tutorialDone` on boot, so the first-run graze hint can be replayed without wiping scores, settings or history.
- Death messages are **not** part of `STRINGS`: they live in `DEATH_MESSAGES`, typed `Record<Lang, Record<DeathCategory, string[]>>`, so a missing language or category still breaks the build. `es` and `it` currently hold the English copy behind a `TODO` comment, pending native writing.

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
| `moonwick:history` | JSON array of the last `HISTORY.size` scores, oldest first. Malformed or hand-edited content degrades to an empty list, never throws |
| `moonwick:deaths` | JSON array of the last `DEATHS.size` (50) deaths, oldest first: `{ t, tier, cause, grazes }`. Tuning source of truth, and what `MERCY` is derived from. Individual malformed entries are dropped rather than poisoning the list |

## Accessibility and quality (permanent floor)
- `prefers-reduced-motion` honoured for screen shake and slow motion.
- Sound volume low by default, mutable from the settings (choice persists).
- Portrait format, one hand, no text required to understand the game.
- Playable in 4 languages with no text overflow on any screen (see Internationalisation).
- Restart stays **under 300 ms** (in-place reset, no scene reload) and the tap that restarts is never read as a flight input. Same for the tap that resumes after a pause.
- No leaks between runs: obstacles, floating texts, particles and tweens return to identical counts after 20 consecutive runs.
