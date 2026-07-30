# Moonwick — mobile near-miss game

**This file carries the RULES and the INVARIANTS. [DESIGN.md](DESIGN.md) carries the REASONING.** A `-> DESIGN.md` mark means the binding rule is here and the full argument is there: read the pointer before changing what the rule constrains.

## Vision
**Moonwick** — a hypercasual portrait game, one hand, 30-90 second sessions. A witch on a broomstick flies through a cursed forest at night. **Grazing obstacles charges her magic**: the trail lights up, the multiplier climbs, all the way to "Full Moon" (x5). Touching an obstacle = death. Restart in under a second.

Decision criterion #1: *does the player want to replay immediately after losing?*
Criterion #2: *does a new player understand within 10 seconds that grazing is what scores, with no tutorial?* — now carried by the score feedback alone, not by the geometry (-> DESIGN.md, "Difficulty balance").

## Stack
- Phaser 3 + TypeScript + Vite. Target: 60 fps on a mid-range phone.
- `npm run dev` to develop, `npm run build` to validate (tsc + vite).
- Capacitor in Phase 7 only. No backend, no server dependency.
- **No asset files — images OR audio.** Every visual is generated procedurally at boot (`textures.ts`, `obstacleShapes.ts`, `witchShape.ts`, `icons.ts`, `logo.ts`); every sound AND the music are synthesised in Web Audio (`sfx.ts`, `music.ts`), on ONE shared AudioContext.

## Development rules (IMPORTANT)
1. **One phase at a time.** Never implement features from a future phase without an explicit request.
2. **Maximum simplicity.** No ECS, no state manager, no architecture framework. Phaser scenes and plain classes are enough.
3. **Game feel beats elegant code.** Every gameplay constant lives in `config.ts` and must be tunable by hand.
4. **Never reintroduce a mechanic listed as abandoned in "Decisions".**
5. After every change: check that `npm run build` passes and explain how to test manually.
6. **All source code in English** — comments, identifiers, documentation. The only French, Spanish and Italian text in the repo is the translation strings inside `i18n.ts`.
7. **Moonwick is a brand name, never translated, never routed through i18n.** It lives in `BRAND` (config.ts) and is treated typographically as a logo, not as interface text.
8. **Update CHANGELOG.md every session**, following the format already in the file. When a gameplay constant changes, record its before/after values and the reason (playtest feedback, bug, design decision). Name the files touched.
9. **`CLAUDE.md` carries the rules and the invariants, `DESIGN.md` carries the reasoning.** A new design decision goes in `DESIGN.md`; only the constraint it produces comes up into `CLAUDE.md`.

## Game rules (current state — authoritative)

### Flight
Hold = climb, release = descend. Gentle gravity, clamped speed.

### Death
**Only by contact with an obstacle.** There is no other source of death in the game.
- Lethal hitbox: an 8 px radius circle centred on the witch's TORSO — not on her drawing's bounding box — deliberately smaller than the visual (perceived generosity). Hat, cape and broom are never lethal. See "The witch".
- Death screen: five things only — see "The death screen". Restart < 300 ms. The replay tap must never be read as a flight input.
- **Nothing on the death screen may delay replaying.** The tap is live on the very first frame: no delay guard, no mandatory animation. All death-screen content is drawn synchronously in `die()`; the ONLY thing deferred is the rest screen's reveal, behind the impact beat.
- **The impact beat** (`DEATH_FX`): before the rest screen appears, the frozen world holds `holdMs` (420) showing WHAT killed her — a cold spark at the exact contact point (`Obstacle.contactPoint`, same shapes as the collision), the killer's moon-rim flashing bright, the witch recoiling off it. **The hold delays pixels, never input**: `onPointerDown` reads `dead`, not visibility, and a mid-beat tap restarts instantly (`resetRun` cancels the pending reveal — mandatory, or the rest screen would drop onto the new run). The spark is cold violet-white, never gold: an ending, not a reward. -> DESIGN.md, "The impact beat".

### The death screen's one line
It is the only prose on that screen, so a single sentence does **both jobs at once**: it says what happened (the gap to the record, the combo, the tier) and it gives a reason to go again. Two short lines at most.

**TONE: warm, brief, never mocking.** Someone who just missed their record by a second must not feel teased. « Il te restait 7 s. Tu y étais presque. » — not a punchline at their expense.

Categories live in `DEATH_MESSAGES` (i18n.ts), 2-3 variants each, drawn at random. Thresholds live in `DEATH_MESSAGE` (config.ts). They are indexed on **TIME**, like La Percée — that is what lets the line quote the gap in seconds and stay honest. Fixed priority, first match wins: **1.** `newRecord`, the run beat the stored `bestTime` — **2.** `nearRecord`, duration >= `nearRecordRatio` (0.85) of it without beating it, **the only category that may use `{seconds}`** and the only one unreachable without a record — **3.** `bigCombo`, best combo of the run >= `bigComboThreshold` (8) — **4.** `earlyDeath`, the run lasted less than `earlyDeathSeconds` (10 s) — **5.** `default`, anything else.

**ANTI-CONCATENATION RULE (absolute).** A message is never assembled from fragments. Each variant is a complete sentence written out in full in every language, using only the `{seconds}`, `{combo}` and `{tier}` placeholders. Word order, punctuation and agreement differ per language, so glueing pieces together breaks sentences somewhere. To add a case, add a whole new template — never a fragment. (-> DESIGN.md, "The seam that produced the anti-concatenation rule".)

### Score history
The last `HISTORY.size` (5) scores are kept in `moonwick:history` and shown on the **Scores page**, newest first. Never on the death screen.

### Graze (near-miss)
- Graze zone: a ring 8 < d <= 38 px from the obstacle **surface** (a real point-to-rectangle distance, not centre to centre). Its lower bound is `NEAR_MISS.deathRadius` itself, so lowering the hitbox widens the ring inwards rather than opening a dead band between the two.
- One graze maximum per obstacle (`grazed` flag).
- `onGrazeEnter` -> immediate refill of the combo timer.
- `onGrazeExit` -> score award and combo increment.

### Combo and multiplier
- Combo +1 per graze. Multiplier = 1 + combo/2, capped at **x5 (Full Moon)**.
- **Combo timer** (`MAGIC.max = 4` s): drains continuously, refilled by every graze.
- At 0: `combo = 0`, multiplier x1, **the run continues**. The timer is not a health bar.
- The screen darkening as the timer drops is **pure visual feedback**, with no mechanical effect.

### The Eclipse — the state above Full Moon (`ECLIPSE`, config.ts)
HOLDING the cap for `ECLIPSE.holdSeconds` (6 s of continuous Full Moon — timed, not counted in grazes; the fuse resets the instant the multiplier leaves x5) veils the moon: a shadow disc slides over the face leaving a warm corona, the golden veil gives way to deep indigo, the witch and her trail lift to hot white-gold, a shimmer layer joins the music. Entering and leaving are fades, never cuts. -> DESIGN.md, "The Eclipse".
- **RENDERING + MUSIC + RECORD ONLY. The multiplier stays x5 and no score changes.** Adding pay above the cap is a regression, not a feature (same charter as the omens and La Percée). One mistake still kills: the Eclipse is never a shield.
- **It falls with the combo, whole** — timer at 0 or death, never partially. The combo timer stays the only thing that ends it, and it is still not a health bar. A dev assertion keeps `holdSeconds > 0`: the Eclipse is strictly ABOVE Full Moon, never a synonym for reaching it.
- **Wordless during play.** No announcement; the two allowed non-numeric strings (tier name, `percee`) stay exactly two. The name appears only on the Scores page (`scores.eclipses`).
- **The eclipse veil only touches background and scenery** — drawn at the darkness overlay's depth, under obstacles, halos, thread and witch. It stacks with the combo-loss darkness; a dev assertion caps `ECLIPSE.veilAlpha + MAGIC.darkAlphaEmpty` at 0.8 so the scenery never reaches true black.
- **The halo floor holds under the veil**: the palette assertion also composites every tier sky (both gradient ends, lit and cooled) under the Eclipse veil and refuses anything below `HALO_CONTRAST_MIN` — same floor as the palettes themselves.
- **Nothing in generation, difficulty, MERCY or the daily reads the eclipse flag.** A daily flight can eclipse; the course is untouched.
- Recorded in the lifetime stats (`eclipses`, `eclipseTime`) at the single write-at-death, tolerant-loader rule as always.

### Score
- Graze: **10 x multiplier**. Shown large at the graze position.
- **Graded by closeness** (`GRAZE_TIERS`, judged on the pass's closest surface distance): under `closeBand` (16 px) the graze pays **15 x multiplier** with a gold-violet burst and a sharper chime; under `needleBand` (11 px) the needle-thread flash joins in. **NO WORDS** — the tiers read on feel, the floating gain stays numeric. Bands nest inside the slow-motion threshold: 11 < 16 < 18 < 38. -> DESIGN.md, "The perfect graze".
- Obstacle passed **while the combo is at 0**: `SCORING.darkPointsSequence = [1, 1, 1, 0]` — the Nth obstacle of the current run through the dark awards the Nth value, then **0 beyond that**. Shown small and discreet (nothing is shown when the value is 0).
- The sequence counter **restarts as soon as a graze revives the combo**.
- Obstacle passed while the combo is active: **0 points**. Only grazes score.
- Dark points must **never** grow with survival time or obstacle count: they **fade out**. There is no other passive source of points.

### Beacon
- After `DROUGHT_THRESHOLD = 3` obstacles passed with the combo at 0, the witch's light pulses (~2 Hz) and upcoming obstacle halos pulse in sync.
- Visual aid only: no mechanical effect, no bonus.

### Affordance
- The graze zone is drawn as a translucent violet halo **around every obstacle** (alpha 0.15, -> 0.5 when the witch is inside). It is the main teacher of the rule.
- A "How to play" page (three pictograms: graze scores, touching kills, chaining multiplies) exists in the settings. It is **only ever opened on purpose** — nothing shows it automatically.

### Communicating the reward, not the rule (IMPORTANT — replaced the tutorial)
No tutorial and no instruction: the game shows what grazing pays instead of explaining the rule (`src/rewardCues.ts`). -> DESIGN.md, "Communicating the reward".

**The forest opens with choreography, not text** (`ONBOARDING`, config.ts): on runs before the first graze ever, the first spawns are authored — trunks with the gap widened by `gapScales` (1.45, 1.2), then the real rhythm. Wider is strictly easier, so every generation guarantee (fairness cap, reachability, bot-clearable Edge) holds untouched. It composes with MERCY (both multiply the gap) and disappears forever at the first successful graze. -> DESIGN.md, "The first three trees".
- **NO WORDS DURING PLAY.** The only text visible in a live run is numeric: the score, the multiplier, the floating gains and the value tag. Anything that reads as an instruction is a bug. Two non-numeric strings are allowed, neither of them an instruction: the tier name at a tier change (`announceTier`), and `percee` when the player crosses their own record — at most once per run, and never on a first run.
- **Fireflies are purely visual and never score a point** (a dev assertion keeps them strictly inside the graze ring); the **value tag sits on the obstacle's LEFT**, the side she reads before deciding; both are pooled (`FIREFLIES.poolSize`, `VALUE_TAG.poolSize`), attachment tracked in a `WeakSet` of obstacles and never inferred from live fireflies.
- **READABILITY INVARIANT: obstacles and their graze halos are never darkened or degraded by any visual effect** (combo loss, tier transitions, Full Moon, and so on). The darkness overlay is drawn **under** the gameplay layer and only touches the background and scenery; combo loss is expressed through **desaturation and cooling** of the scenery (overlay capped at 0.5), and the moon rim on the obstacles **strengthens** as the light fades. This is the information the player needs most when at x1 — any future art direction must preserve this invariant.

## Difficulty balance (IMPORTANT — this reversed an earlier pillar)
**Crossing without grazing is possible at EVERY tier**, including The Wall and The Moon's Eye; a dev assertion in config.ts enforces it. What makes grazing worth it is **economic, not geometric**: only grazes score, and dark points decay to zero within a run. -> DESIGN.md, "Difficulty balance".
- **`GLOBAL_SPEED`** (0.85) multiplies the scroll speed and DIVIDES the spawn interval, so the course keeps its spatial layout and only time is stretched. `spawnInterval` values in TIERS are authored *before* the factor, and the fairness assertion checks the **effective** interval.
- **Adaptive easing (`MERCY`) is TOTALLY INVISIBLE** — no message, no icon, no sound. It only touches the generator (`effectiveDiff()`), never `diffCurrent`; its trigger is derived from `moonwick:deaths`, never stored; `MERCY.enabled` turns it off.
- **The tuning readout** (long press 700 ms on the logo) is a DEBUG surface: its labels are technical tokens and stay **out of i18n** — the one documented exception to the no-literal-strings rule. On the logo the tap decision waits for the *release*; everywhere else the tap still starts the run on press.

## La Percée — the record is a PLACE, not a number
The personal best (`bestTime`) is never shown as a figure during play: it stands in the forest as an arch (`src/percee.ts`). -> DESIGN.md, "La Percée".
- **It is purely visual.** No collision shape, no scoring, no effect on generation. The approach touches the SCENERY only — obstacles and halos are never dimmed.
- **Positioned by TIME, not spawned:** `x = WITCH.x + (perceeTime - runDuration) * scrollSpeed`, so it lands on the witch at exactly `bestTime` whatever the speed is doing.
- **Below `PERCEE.minTime` (8 s), or with no record at all: nothing** — no arch, no notch, no caption. Crossing shows the word `percee`: the **one exception** to the no-words-during-play rule, at most once per run and never on a first run.

### The death screen: FIVE THINGS
Its content is closed:
1. **the score**, very large;
2. **one line** — the contextual message, which carries the gap to the record inside its own sentence. Two short lines at most. See "The death screen's one line";
3. **the Replay band** across the bottom;
4. **the progress thread, frozen** where the run ended, with the record's notch still on it — the same thread that ran along the bottom edge during play, simply stopped, lifted clear of the Replay band;
5. **the way home**: an icon, no label, no frame, `DEATH_HOME.alpha` 0.85.

**Nothing else may be added here.** Best scores, run history, cause of death, run summary and the tier road all moved to the Scores page. Adding a number back to this screen is a regression, not a feature. **There is no path to the Scores page from the death screen** — after dying the only two moves are Replay or Home. The replay tap stays live on the very first frame: everything is drawn synchronously in `die()`, with no tween, no timer and no mandatory animation.

**BIG TARGET, LOW PRESENCE.** The home button is a 64 px touch square in the TOP-LEFT corner, the furthest point from Replay. A dev assertion enforces `REPLAY_CLEARANCE` (80 px) between any interactive element and the Replay band, and a touch target of at least 48 px. "Low presence" means quiet next to Replay, **not invisible**: both interface icons (`src/icons.ts`) carry a faint full outline under a thick moon-side rim (`ICON_STROKE`), and Replay stays dominant by AREA, never by starving the icons of contrast. -> DESIGN.md.

### The Scores page (`src/ScoresScene.ts`)
The player's single progression hub — best scores, recent runs, lifetime statistics, share image — reachable **from the home screen only**. -> DESIGN.md, "The Scores page".
- **The displayed name lives in ONE i18n key (`scores`)**; the scene class, its scene key and the file name are deliberately neutral, so the page can be renamed without touching a line of code.
- **It is PAGED**: a page is `{ titleKey, build() }` and adding one means adding an entry. A dev assertion refuses a page whose rows would reach the buttons — splitting a page is the fix, not shrinking the rows.
- `save.ts` and `stats.ts` both track a best combo: the page reads the larger of the two so it can never show them disagreeing.

### The omens (`src/omens.ts`) — the collection page
Twelve signs the forest gives, on the Scores page's "Omens" tab, in journey order (the discovery, the forest, mastery, the moon). -> DESIGN.md, "The omens".
- **PURELY COMMEMORATIVE.** An omen never touches gameplay, generation, scoring or difficulty — no modifier, no unlock-gated content, ever. The forest never changes because of what stands on this page.
- **DERIVED, NEVER STORED.** Lit-or-not is a pure predicate over the lifetime stats (plus `save.ts`'s best combo), recomputed at every page open — no unlock key, no drift, and a veteran's past runs light their omens retroactively. A deed worth a new omen is paid for with a new `LifetimeStats` field (versioned, tolerant), never a stored unlock flag. The one persisted key, `moonwick:omensSeen`, records only which reveals the page has already shown — presentation state; losing it costs one repeated shimmer.
- **No announcement during play or on the death screen.** NO WORDS DURING PLAY holds, and the death screen stays five things: omens are discovered on the Scores page, on purpose. The reveal there is a one-time fade-in with the name in gold for that visit — nothing anywhere else, no popup, no badge.
- **A locked omen is its glyph dimmed (`OMENS.dimAlpha`), with NO name.** The glyph is the riddle and the name is part of the reward; no unlock condition is ever written in prose, in any language. Names are i18n keys (`omen.*`) like any interface string.
- **Glyphs are drawn procedurally** in the interface-icon vocabulary (dark body lifted off black, silver-violet light on the `MOON_ON_RIGHT` side) — no image file. Thresholds that exist only for the collection live in `OMENS` (config.ts); thresholds that are already gameplay constants are read where they live (`GRAZE_TIERS.needleBand` IS the needle omen's band, never duplicated).
- Dev assertions: omen ids are unique, and the grid stays above the share row under the same limit as the row pages.

### The progress thread, bottom edge
A hairline across the full width, ticks at the tier boundaries, a lit notch at the record, one moving point of light. No text, no numbers, no opaque background — scenery, not a HUD. -> DESIGN.md, "The progress thread".
- **It is the exact opposite of the combo timer on every axis** (bottom vs top, hairline vs bar, cold violet vs warm amber, still vs pulsing, "going forward" vs "running out"). They mean opposite things and must never be confused.
- **Priority to the game:** drawn UNDER the obstacles and their halos (depth 2.7 against 3). It disappears completely during a Percée crossing. Its scale is fixed at the start of a run; past the record it stretches rather than pinning the dot to the end.

### `SAFE_BOTTOM` (IMPORTANT)
Every element pinned to the bottom of the screen sits above `SAFE_BOTTOM` (config.ts) — the progress thread, the Replay band, anything added later. That strip belongs to the phone's home indicator: visually occupied *and* a system gesture area. It is a constant, and the single place to widen when real `env(safe-area-inset-bottom)` values arrive in P7. -> DESIGN.md.

### Lifetime statistics (`src/stats.ts`, `moonwick:stats`)
-> DESIGN.md, "Lifetime statistics", for the full list of what is recorded.
- **Written EXACTLY ONCE per run, at death.** Nothing here touches localStorage while the game runs.
- **Versioned and tolerant.** `loadLifetimeStats()` fills in whatever is missing instead of rejecting the payload; it never throws and never wipes. `Infinity` (never grazed) round-trips through `null`, a legitimate state rather than corruption.
- Named `LifetimeStats` / `loadLifetimeStats` so they can never be imported by mistake for `save.ts`'s `Stats` / `loadStats`. `DEBUG_STATS_DUMP` prints them on boot and exposes `window.__moonwickStats`.

### The witch (`src/witchShape.ts`)
Drawn once at boot into a `RenderTexture`, displayed as a sprite. No image file. -> DESIGN.md, "The witch", for the art rules and the posture/cape implementation.
- **HITBOX AT THE BUST.** The 8 px lethal circle (`NEAR_MISS.deathRadius`) is centred on the TORSO, never on the drawing's bounding box. The torso is also the sprite's origin and its rotation pivot, so `witch.x/y` is at once what the collision tests and what the art pivots around — they cannot drift apart. The hat, the cape and the broom's brush all reach well past the circle and **none of them is lethal**.
- **The visual contains the hitbox, never the reverse.** The body is built on a core disc of `WITCH_ART.coreRadius` (> `deathRadius`) centred on the torso, so the guarantee holds by construction; a dev assertion throws if that ever stops being true. `DEBUG_HITBOX` draws the circle *over* the silhouette (debug depth 25 > witch depth 5).
- **She must stay findable at x1**, near-black against a near-black sky: her body is lifted off pure black (`WITCH_ART.bodyColor`) and the rim is strong even idle (`rimAlphaIdle`). Any change here must be checked against **every** tier sky, top and bottom, dimmed and not.
- **The hat's height is bounded by gameplay**: anything more than ~26 px above the torso is clipped at the ceiling, because the torso is clamped to `WITCH.marginTop` (20 px). The same `Witch` class is used by the menu and the death screen, so the character never has two looks.

### Obstacle rendering (`src/obstacleShapes.ts`)
-> DESIGN.md, "Obstacle rendering", for the silhouette principles and the atlas.
- **Collision and visuals are separated.** Detection runs on invisible primitives only; `NEAR_MISS.deathRadius` (8) and `grazeRadius` (38) are what they read. The drawn silhouette has no say in gameplay.
- **The visual may overshoot the hitbox; it may never fall inside it.** No lethal pixel is ever invisible. `coverFloor()` is the single place that arbitrates both threats to that guarantee — narrowing and curvature.
- **Silhouettes must stay inside their own graze halo**, or the art would show "obstacle" where the game scores nothing. A dev assertion throws otherwise.
- **Single light direction.** `MOON` (config.ts) is the scene's only light source and fixes the rim for every obstacle at once — never per obstacle, never depending on where an obstacle sits on screen.
- **One essence per tier** (`Tier.essence`, rendering only — no effect on spacing, width or difficulty); obstacles take the essence in force when they spawn. Under **contrast inversion** (`MOON_EYE.enabled`) the graze halo and the HUD flip to dark-on-light in the same move as the sky — the halo must stay perfectly readable at all times.

### One palette per tier (`Tier.palette`, IMPORTANT)
`TierPalette` (config.ts) carries the sky gradient, the scenery tint, the base saturation and the tier's own graze halo. **RENDERING ONLY, exactly like `essence`** — no effect on spacing, gap width, speed or difficulty. -> DESIGN.md, "The chromatic arc".

- **The hue arc advances in ONE direction AND in even steps** — bottoms 186 -> 238 -> 290 -> 345, then the inversion's pale gold (~38): steps of 52, 51, 55, 53°. Tier changes interpolate the sky in RGB over 2 s, so a palette that doubled back would drag the gradient through a muddy neutral. Two dev assertions: direction with a 140° cap, and `PALETTE_STEP_MIN` (30°) on the **effective** skies.
- **Monotone is not enough — the steps must be SPREAD.** The first version was monotone but lopsided (67, 42, 21, 74°) and two tiers came out at ΔE 3.9 and 5.0 against the violet they replaced, i.e. imperceptible: "one palette per tier" bought nothing on two tiers out of five. Tellability apart is the actual requirement.
- **Luminance stays roughly constant tier to tier; SATURATION carries the difference.** The Edge reads "luminous" through its HUE, not by being brighter: a brighter Edge was measured and rejected — it put the sky on the witch's own luminance and dropped the halo to a contrast of 1.017. With luminance pinned, saturation is the only lever left, which is why the coloured tiers sit at 0.60-0.86 and only The Wall is drained.
- **THE HALO IS PER PALETTE, and its readability is an absolute invariant.** A dev assertion refuses any palette whose halo, composited over its own sky at the real alpha, falls below `HALO_CONTRAST_MIN` (1.14) at either end of the gradient, lit or fully cooled. The floor is calibrated, not invented: the single-halo version measured 1.147 at its worst, so no palette may ever be worse than what already shipped.
- **Saturation reserve.** The combo-loss cooling is spent as desaturation, which needs saturation to spend. A palette below 0.2 saturation must pay it as a luminance drop instead (`coolValueDrop` >= 0.25) — a third dev assertion. The Wall is that case by design: it is the tier where colour drains out, so its loss reads as the sky going darker and the obstacle rim strengthening.
- **The HUD yields, never the palette.** If a sky absorbs the warm combo timer or the cold progress thread, the fix is the HUD: `MOON_EYE` carries inverted colours for both, keeping them at least 90° apart in hue (129° measured, against 139° on the dark palettes).

## Art direction — "Moonlight & ink" (IMPORTANT)
The interface speaks through TYPE, HAIRLINES and SPACE — never through boxes. Two faces defined once in `TYPE` (config.ts) and spoken through the `ui.ts` helpers (`capsText`, `serifText`, `hairline`, `diamondDivider`, `actionBand`); no screen may invent its own vocabulary. **Fonts load in `index.html` and `main.ts` AWAITS them before booting Phaser** (2.5 s fallback so offline still boots): `fitText()` and `buttonWidth()` must measure real glyphs in all four languages, never a swapped fallback. -> DESIGN.md, "Art direction".

**FIVE RULES, non-negotiable:** 1. **No bordered boxes** — one filled band per screen (`actionBand`) for the one action (Replay, Back), everything else a label on a hairline. 2. **Hairlines at 1 px, never 2.** 3. **Labels are small caps, values are serif.** 4. **28 px margins, 8 px rhythm.** 5. **The moon-arc is the motif** (logo, the Percée) — never a frame.

**Gold is rationed**: records, rewards, Full Moon, the active choice. Amber stays the combo timer alone. Violet is hairlines at 12–30 % alpha, no longer a border on everything. Touch targets keep the 44/48 px floors regardless of how quiet the paint is — "no box" changes what is drawn, never what is tappable.

### The mark — "the lit crescent" (`src/logo.ts`, `LOGO` in config.ts)

A waxing crescent with the game's witch flying out of its bay — SHE lights
the wick, the flame above the upper horn. One routine (`drawCrescentMark`)
serves every surface so the mark can never fork; Canvas 2D at boot, no image
file. -> DESIGN.md, "The mark".

- **The lit side follows the moon** (`MOON_ON_RIGHT`), exactly like the
  obstacle rims.
- **TWO-TIER RULE: no witch below `LOGO.witchMinPx` (88 px) of mark.** Full
  lockups (home, share) carry her; small and dense uses (favicon, dense
  chrome) are crescent and flame alone. A smudge is worse than an absence.
- **Small sizes thicken** (`LOGO.small`/`tiny`): the crescent widens and the
  flame rounds into a dot below ~28 px. The favicon is the `tiny` recipe.
- **The stacked lockup** on the home screen is mark / wordmark / flame-diamond
  divider, then ONE line: the best score once it exists, the tagline
  (`menu.tagline`, i18n like any interface string) on a first launch. Never
  both.
- **DON'T:** no outline around the crescent, no second flame, no rotation, no
  gradient across the wordmark, and never a violet flame on a dark ground —
  it stops reading as fire. Only the flame is gold: two golds in one lockup
  and neither reads as light.

## Roadmap
- [x] **P1 — Skeleton**: hold/release flight, one scrolling obstacle, 60 fps.
- [x] **P2 — Procedural**: varied obstacle generation, playable spacing, constant scroll.
- [x] **P3 — Near-miss + death**: hitbox, graze zone, combo, score, instant restart.
- [x] **P4 — Game feel**: combo-driven particles, light screen shake, slow motion on extreme grazes, Full Moon mode, synthesised Web Audio sounds.
- [x] **P5 — Difficulty**: time-based tiers in `TIERS` (config.ts) — **The Edge** (0 s, `gapSize` 250), **The Dark Wood** (30 s, 170), **The Brambles** (55 s, 130), **The Wall** (85 s, 105), **The Moon's Eye** (125 s, 96 — final plateau: difficulty freezes, skill decides run length). Main lever = narrowing; speed rises moderately. **Crossing without grazing is possible at EVERY tier** (see "Difficulty balance"). Transitions: name shown ~1.5 s, parameters and sky interpolated over 2 s. Fairness constraint (`spawnInterval` < `MAGIC.max * 0.6`) guaranteed on every draw plus a dev assertion. `DEBUG_START_TIER` to start at a given tier. Each tier also carries an `essence` (tree species) — see "Obstacle rendering", rendering only.
- [x] **P6 — Light meta**: `MenuScene` (logo, best score, full-screen tap, settings, animated scenery with a looping witch); localStorage persistence; death screen cut back to **five things** (score, one contextual line, the Replay band, the frozen progress thread, the way home — see "The death screen"); **shareable score image** 1080x1920 generated on an off-screen canvas (Web Share API with a file, otherwise a PNG download), triggered from the Scores page and no longer from the death screen; reward cues instead of a tutorial (see "Communicating the reward"); **automatic pause** on `visibilitychange`/blur with resume on tap, and no death possible while away.
- [ ] **P7 — Mobile**: Capacitor, iOS/Android builds, safe areas, haptics.
- [ ] **P8 — Monetisation/analytics**: AdMob rewarded ("continue" once per run), interstitial at most every 3 runs, no-ads IAP.

## Decisions (history — do not revert)
- **Magic gauge as a health bar -> abandoned.** It killed players who were clearing obstacles correctly. It is now the multiplier timer, nothing else. `FLICKER_GRACE` in its original role and death by drained magic are gone.
- **x4 surge after crossing in the dark -> abandoned.** It rewarded deliberately stopping to graze (farming the return bonus). Replaced by `darkPointsSequence` + the visual beacon.
- **Systematic pass-through points -> abandoned.** They diluted readability while the combo was active. Kept only in the dark, and decaying.
- **Timer refill on leaving the zone -> abandoned** in favour of entry, which removed deaths perceived as unfair.
- **Grazing structurally compulsory -> abandoned**, and deliberately reversed: every tier is now crossable without grazing (-> DESIGN.md, "Difficulty balance").
- **The tutorial ("GRAZE" band) -> abandoned** in favour of reward cues (-> DESIGN.md, "Communicating the reward").
- The procedural generator must guarantee that an obstacle always appears within `MAGIC.max * 0.6`: without that constraint, holding a combo sometimes becomes impossible regardless of skill.

## Internationalisation (IMPORTANT)
Supported languages: **English, Français, Español, Italiano**. Everything lives in `src/i18n.ts`.

- **Only exception: the brand name "Moonwick"** (`BRAND.name`), identical in all four languages.
- **ABSOLUTE RULE: no other literal display string in the scenes.** Menu, settings, death screen, pause screen, floating texts, tier names and the share image *all* go through `t("key")`. The only literals allowed in scenes are technical tokens (`"sans-serif"`, `"bold"`, scene keys, texture keys). The tuning readout is the one documented exception — see "Difficulty balance".
- Tier names are keys, not labels: `TIERS[i].nameKey` (`tier.edge`, `tier.darkwood`, `tier.brambles`, `tier.wall`, `tier.moonEye`).
- English is authoritative for keys: `STRINGS.fr/es/it` are typed against it, so **a forgotten key breaks the build**.
- `t(key, params)` interpolates `{parameters}`. `tAll(key)` returns all 4 translations — used for sizing.
- `setLanguage(lang)` persists and notifies subscribers (`onLanguageChange`): scenes refresh **immediately, with no reload**. Any scene displaying text must subscribe in `create()` and unsubscribe on `SHUTDOWN`.
- Detection on first launch via `navigator.language` (primary subtag, falling back to `en`). **The player's explicit choice wins permanently.**
- Settings reachable from the home screen via the gear icon, which carries its **translated label** beside it: language selector (native names) + sound toggle + back button. The hit area is sized from the translated label and never drops under the 44 px touch floor (`refreshGearZone()`).
- `DEBUG_FORCE_LANG` (config.ts) forces a language for testing, without touching the browser or the persisted choice.
- `DEBUG_RESET_TUTORIAL` (config.ts) clears only `moonwick:tutorialDone` on boot, so the first-graze celebration can be replayed without wiping scores, settings or history.
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
| `moonwick:music` | `"1"` (default) / `"0"` — music toggle, separate from the sound toggle |
| `moonwick:daily` | JSON `{ date, best, attempts }` — today's Daily Moon; replaced whole when the UTC date changes. Malformed content degrades to "no daily yet" |
| `moonwick:tutorialDone` | `"1"` after the first successful graze; gates the one-off first-graze celebration so it never fires twice |
| `moonwick:lang` | `"en"` / `"fr"` / `"es"` / `"it"` — explicit choice in the settings, wins permanently over `navigator.language` |
| `moonwick:history` | JSON array of the last `HISTORY.size` scores, oldest first. Malformed or hand-edited content degrades to an empty list, never throws |
| `moonwick:deaths` | JSON array of the last `DEATHS.size` (50) deaths, oldest first: `{ t, tier, cause, grazes }`. Tuning source of truth, and what `MERCY` is derived from. Individual malformed entries are dropped rather than poisoning the list |
| `moonwick:omensSeen` | JSON array of omen ids the Scores page has already revealed. Presentation state ONLY — unlock state is always derived from the stats (see "The omens"). Malformed content degrades to "nothing seen yet" |
| `moonwick:stats` | Versioned lifetime statistics (`version: 1`), written once per run at death. Missing fields degrade to defaults rather than wiping the object. See "Lifetime statistics" |

## The Daily Moon — one shared forest a day

Started from the home row with `scene.start("flight", { daily: true })`; in-place replays stay on the daily, going home leaves it. -> DESIGN.md, "The Daily Moon".

- **The seed is the UTC date** (`hashSeed("moonwick:" + YYYY-MM-DD)`, src/rng.ts): every player on earth flies the SAME forest, no backend. Re-armed on every attempt — unlimited attempts, one course.
- **Seeded means GAMEPLAY draws only** (`ObstacleSpawner.setSeed`): intervals, categories, gap sizes, gap positions, branch sides. Cosmetic silhouette-variant picks stay free — course parity is COLLISION parity.
- **All personalisation is OFF in daily mode**: MERCY easing and the authored onboarding opening both change the course, and the daily exists so nobody's course differs.
- **A daily flight is still a flight**: it feeds the classic records, history, stats and death log as normal, PLUS the day's best under `moonwick:daily` (best-of-day, attempt count; yesterday's record dies with the date, UTC).
- One shared `rng`/`hashSeed` implementation (src/rng.ts) serves the scenery, the music and the daily: "seeded" always means the same thing.
## PWA — the web version is the app (pre-P7)

Web packaging only; Capacitor stays P7. -> DESIGN.md, "The PWA shell".

- **The manifest and every app icon are GENERATED AT BOOT** (`src/pwa.ts`):
  icons drawn by `drawCrescentMark` (the mark cannot fork) onto canvases,
  the manifest linked as a blob URL. No image file — the zero-asset pillar
  covers packaging too. Icon sizes (180/192/512) all exceed
  `LOGO.witchMinPx`, so the witch rides; only the favicon is crescent-only.
- **`public/sw.js` is the one file beside the sources** — it is CODE, not an
  asset. Network-first with runtime cache: a deploy wins on the next online
  visit, offline serves the last good load. Registered in **production
  only** (the dev server must never fight a cache). Bump `CACHE` to force a
  full invalidation.
- **`viewport-fit=cover`**: the game may paint under the notch; the bottom
  stays `SAFE_BOTTOM`'s business (real insets arrive with P7, same as
  before).
- **The rotate guard is a wordless glyph** (index.html): an icon, not an
  instruction — nothing to translate, by construction. It only engages on
  coarse-pointer devices in short-landscape, so desktop windows (always
  landscape) never see it.

## Accessibility and quality (permanent floor)
- `prefers-reduced-motion` honoured for screen shake and slow motion.
- Sound volume low by default, mutable from the settings (choice persists).
- **The music is synthesised, never a file** (`src/music.ts`, `MUSIC` in config.ts), on the SAME AudioContext as the effects — never a second one. Four layers (pad / air — a filtered-noise night wind, stronger at rest and in the cold / rhythm from combo 2 / melody at Full Moon) fade, never cut; tonality follows the tier; patterns come from a scale and a per-run seed, so no fixed loop ever repeats. Its volume sits clearly under the effects, it starts only after the first gesture, and it goes fully silent when the tab loses focus — consistent with the automatic pause. Own toggle in the settings (`settings.music` key, i18n in four languages), persisted as `moonwick:music` via save.ts, separate from the Sound toggle. ONE singleton; scenes set its mode (`run`/`rest`), never own players. -> DESIGN.md, "The music".
- Portrait format, one hand, no text required to understand the game.
- Playable in 4 languages with no text overflow on any screen (see Internationalisation).
- Restart stays **under 300 ms** (in-place reset, no scene reload) and the tap that restarts is never read as a flight input. Same for the tap that resumes after a pause.
- No leaks between runs: obstacles, floating texts, particles and tweens return to identical counts after 20 consecutive runs.
