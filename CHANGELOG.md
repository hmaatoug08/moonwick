# Changelog

Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows [semantic versioning](https://semver.org/).

> The repository currently holds a single commit: the phases below were built
> before it was created, so their individual dates are not tracked. They are
> listed in the order they were built.

## [Unreleased]

**A palette per tier** (`TierPalette`/`TIERS`/`MOON_EYE`/`HALO_CONTRAST_MIN` in `src/config.ts`, `src/FlightScene.ts`, `src/obstacles.ts`, `src/scenery.ts`, `src/MenuScene.ts`, `CLAUDE.md`, `DESIGN.md`)

Rendering only, on the same terms as `Tier.essence`: no change to spacing, gap width, speed or difficulty, and every tier's fairness assertion still passes untouched.

- **New `palette` field on every tier** (`TierPalette`): sky gradient, scenery tint, base saturation, per-tier graze halo, and `coolValueDrop`. `tier.skyTop`/`skyBottom` moved inside it, so there is one source of truth for a tier's colour; `tierSky()` and the new `tierHalo()` still arbitrate the `MOON_EYE` inversion.
- **The five palettes.** The Edge indigo->teal (`0x0a141d`/`0x10242a`, was `0x0b0716`/`0x241a4a`); The Dark Wood deep violet (`0x090616`/`0x21113e`); The Brambles wine violet with a warm ember treeline tint `0x2a0d08` — the intrusion; The Wall drained plum-ink at saturation 0.12 (`0x080708`/`0x181316`); The Moon's Eye keeps `MOON_EYE`'s pale gold, its own `0x190d10`/`0x412327` being the fallback if the inversion is switched off.
- **Hue arc held to one direction** (tops ~208 -> 345, bottoms ~194 -> 352, then the inversion's gold), because tier changes interpolate the sky in RGB over 2 s and a palette doubling back would cross a muddy neutral. Dev assertion caps each step at 140 degrees and the sweep at 260.
- **The Edge is not brighter, only cooler** — the reason is measured. A literal reading of "light and luminous" (teal at lightness 0.33) dropped the graze halo to a contrast of **1.017** and put the sky on the witch's own body luminance (**1.03**, against a shipped worst of 1.208). Relative luminance is not lightness: green carries 0.7152 of it. A 369-point sweep found solutions only at equal luminance to the violet it replaces, so the tier reads open through hue alone.
- **Per-tier halo + a contrast floor.** `HALO_CONTRAST_MIN` = 1.14, measured on the halo composited over its own sky at real alpha, at both ends of the gradient, lit and fully cooled. Calibrated rather than invented: the single-halo version measured 1.147 at its worst, so no palette may be worse than what shipped. The five clear it at **1.159** worst. A dev assertion refuses a palette that does not, and was verified to fire with an actionable message.
- **Saturation reserve, and the brightness compensation.** The Wall's cooling moved saturation by **-0.02** — the loss would have been invisible on the one tier where players lose it most. `coolValueDrop` 0.34 pays it in luminance instead, taking lit->cooled contrast from 1.002 to **1.043**, level with the Dark Wood (1.039) and the Brambles (1.051). A third assertion refuses any palette under 0.2 saturation that does not compensate. The Moon's Eye takes 0 (pale gold going blue-grey is already a 0.18 saturation swing, and darkening it cost the inverted rim 4.52 -> 3.69).
- **The witch needed no colour change** once The Edge sat at the right luminance: body 1.22-8.03, applicable rim 4.52-11.28 across all twenty sky states. An earlier "rim collapse at The Moon's Eye" was my own measurement error — it compared the silver-violet rim where the inversion actually uses `MOON_EYE.rimColor`, a dark edge.
- **HUD fixed instead of a palette** (`MOON_EYE`): under inversion the combo timer used to flip to the same dark violet as everything else, leaving it **1 degree of hue** from the progress thread — the warm/cold pair CLAUDE.md says must never be confused had silently collapsed on the last tier. Timer is now burnt amber `0x8a3d0a` (hue 24) against the thread's dark violets (hue 255), **129 degrees** apart; the thread also gains inverted track/tick/notch/dot colours and its dot switches to normal blending, since additive light does nothing on a pale sky. Its contrast goes 2.03 -> 3.93.
- **Known, not introduced:** the Wall -> Moon's Eye transition drops the halo to 1.001 mid-crossing. The shipped single-halo version measures 1.006 in the same window, and interpolating the halo colour makes it marginally worse (1.004). The sky must pass *through* the halo's luminance, where compositing gives contrast 1.000 at any alpha; fixing it needs a halo polarity switch, i.e. an art-direction change. The assertion is therefore scoped to each palette's steady states. -> DESIGN.md.
- `npm run build` green; all three assertion branches verified to throw in dev.

**The perfect graze + the first three trees** (`GRAZE_TIERS`/`ONBOARDING` in `src/config.ts`, `src/FlightScene.ts`, `src/obstacles.ts`, `src/sfx.ts`, `CLAUDE.md`, `DESIGN.md`)

Two changes to the first sixty seconds, both deepening what exists rather than adding a system.

- **Grazing graded by closeness** (GAMEPLAY CHANGE — scoring): judged on the pass's closest surface distance, the measurement the ring/slow-motion/closest-graze stat already used. Under `closeBand` (16 px) a graze pays **15 x multiplier instead of 10**, with a gold-violet burst and a sharper chime (swoosh peak x1.3 — thinner, not louder); under `needleBand` (11 px) the needle-thread flash joins — one breath of light on the witch, no extra points: the flash and the existing slow motion are the reward. Bands nest inside what existed: 11 < 16 < `SLOWMO.thresholdPx` 18 < ring 38; the needle window sits 3 px above the 8 px lethal radius, rare by construction. No words anywhere; the floating gain stays numeric, larger and gold when close. Feedback objects are pooled (one burst emitter, one flash image).
- **The authored opening**: on runs before the first graze ever, the first spawns are trunks with the tier's gap widened by `ONBOARDING.gapScales` (x1.45, then x1.2), then the real rhythm — the forest teaching by choreography, not text. Wider is strictly easier, so the fairness cap, reachability and the bot-clearable Edge hold untouched; it composes with MERCY (both multiply the gap — verified in play: 416/341 px openings with easing active against 287 normal) and disappears forever at the first successful graze.
- **First-graze celebration strengthened** with the opening that now leads to it: `FIRST_GRAZE.slowMoMs` 260 -> 380, `flashAlpha` 0.22 -> 0.3, `sparks` 26 -> 40 (design decision: the click moment happens exactly once).
- Verified live: authored gaps spawn as trunks and scale correctly; needle graze paid 23 at x1.5 (15-base) vs 20 at x2 (10-base) for a normal graze; the flash fired; `tutorialDone` gates the whole opening off.

**Adaptive music, entirely synthesised** (`src/music.ts` new, `MUSIC` in `src/config.ts`, `src/sfx.ts`, `src/save.ts`, `src/i18n.ts`, `src/FlightScene.ts`, `src/MenuScene.ts`, `CLAUDE.md`, `DESIGN.md`)

No audio file — the zero-asset pillar holds, and now says so explicitly in CLAUDE.md ("no asset files, images OR audio"). Built on the effects' own AudioContext (`audioContext()`/`unlockAudio()` extracted from sfx.ts), never a second one.

- **Four layers, faded in and out, never a hard cut**: a permanent ambient pad; an AIR bed of quiet filtered noise (candle smoke / night wind), more present at rest and rising as the run cools or the record nears; a rhythmic layer of soft low pulses entering from combo 2, density following the multiplier; a melodic layer at Full Moon. Losing the combo makes the layers retreat and the lowpass close towards 60 % of its floor — the same impoverishment logic as the scenery's visual cooling.
- **Tonality follows the tier**: one root note per `TIERS` entry (D3, C3, Bb2, G2, then up to E3 at The Moon's Eye — the game's one bright place), gliding with the tier transition. The Percée approach ducks the whole bed 70 % — the same held breath as the swoosh detune — and the slow-motion crossing silences the music entirely.
- **Non-repetitive by construction**: rhythm and melody are drawn per bar from a minor-pentatonic scale and a per-run seed (`reseed()` at every restart). No fixed loop; a 60 s session replayed twenty times never plays the same passage. Why generative rather than composed, and how the music doubles the visual reading of state instead of competing with it: DESIGN.md, "The music".
- **Own switch**: a "Music" row in the settings, separate from the Sound toggle (a player may want the effects without the bed, or the reverse), persisted as `moonwick:music` via save.ts — never localStorage directly. New i18n key `settings.music` in the four languages, sized against the longest translation like every label.
- **Floors respected**: volume clearly under the effects (`MUSIC.masterVolume` 0.055 vs `SFX.masterVolume` 0.12); starts only after the first user gesture (autoplay policy, same unlock as the effects); full silence when the tab loses focus or hides — consistent with the automatic pause; O(1) per frame with one look-ahead beat and no per-frame node allocation, so nothing shows against 60 fps at The Wall.
- The menu and the death screen play the rest variant: half-level pad plus a stray firefly chime every 5–11 s. One singleton carries the bed across menu -> run -> death with no seam inside the 300 ms replay loop.
- **Synthesis-quality pass, still zero files**: a convolution reverb whose stereo impulse response is GENERATED at boot (shaped noise, exponentially decaying and progressively darkening tail — the room every real recording stands in); plucks gain an octave partial, a breath of bandpassed noise at note-on and a pitch that starts a hair sharp and settles (what a plucked string does); the rhythm's voice is a soft drum skin (pitch falling onto the root over 40 ms) instead of a note; the pad gains a third, wider detune pair. The bed sits mostly dry (`reverbBedSend` 0.16); plucks and chimes ride the room openly (`reverbPluckSend` 0.5).
- No gameplay, scoring or difficulty change.

**The mark — "the lit crescent", with the witch** (`src/logo.ts` new, `LOGO` in `src/config.ts`, `src/MenuScene.ts`, `src/share.ts`, `src/i18n.ts`, `index.html`, `CLAUDE.md`, `DESIGN.md`)

Implemented from the Claude Design brand sheet ("Moonwick — logo"). The name is two things — a moon and a wick — so the mark is one shape doing both: a waxing crescent whose upper horn carries a candle flame, and THE WITCH is what lights it: she flies out of the crescent's bay on the game's own tilt (−14°), her golden trail arcing up the inner edge to the horn. Canvas 2D at boot; no image file.

- Her silhouette is transcribed from `witchShape.ts` — the same broom, brush, cape, core-disc and single-hat polygons, rim offset towards the moon — in her own colours (`LOGO.witchBody`/`witchRim`). She is the character the game draws, not a redrawing.
- **Two-tier rule** (`LOGO.witchMinPx` = 88): the witch rides in every full lockup at 88 px of mark or more (home lockup at 96 px, share image at 96 px); below that the mark is crescent and flame alone — at ~30 px of silhouette she is a smudge, and a smudge is worse than an absence.
- One drawing routine (`drawCrescentMark`) serves the Phaser texture and the share image, so the mark cannot fork. The canonical mark is lit-right; the whole buffer mirrors when `MOON_ON_RIGHT` flips — witch, trail and flame as one piece.
- Home screen: the stacked lockup — mark over wordmark, flame-diamond divider (replacing the moon-arc), then one line: the best score once it exists, or the brand tagline on a first launch (`menu.tagline`, new key in the four languages). The long-press debug gesture now covers the whole lockup.
- Small-size recipes (`LOGO.small`/`tiny`): the crescent thickens and the flame rounds to a dot below ~28 px, where a sliver and a teardrop both vanish. The favicon (inline SVG in index.html) is the `tiny` recipe.
- Rules in CLAUDE.md (two-tier rule, lit side, don'ts), reasoning in DESIGN.md ("The mark") — per development rule 9.

**CLAUDE.md split in two: rules here, reasoning in DESIGN.md** (`CLAUDE.md`, `DESIGN.md` new, `CHANGELOG.md`)

Documentation only — no source file was touched and no gameplay, scoring or
difficulty value changed. CLAUDE.md had grown to 495 lines and is re-read at the
start of every session, so the rules that prevent regressions were sitting in
the middle of the history of how each decision was reached. The split is by one
criterion: **if removing a sentence could cause a regression it stays in
CLAUDE.md; if it only explains why a decision was taken or how something is
implemented it moves to DESIGN.md.**

- **`DESIGN.md` (new, 378 lines)** takes the long reasoning: the difficulty-rebalance story, the full rationale for "Communicating the reward", La Percée's positioning-by-time, the witch and obstacle implementation notes, the adaptive easing, the death log and the combo-timer/progress-thread comparison table.
- **`CLAUDE.md` (495 -> 213 lines)** keeps Vision, Stack, Development rules, the factual game rules, Roadmap, Decisions, Internationalisation, the persistence table, the accessibility floor, and every hard invariant — readability invariant, anti-concatenation rule, the death screen's five things, hitbox at the bust, "the visual contains the hitbox", `SAFE_BOTTOM`, `REPLAY_CLEARANCE`.
- Each moved section leaves the rule in one sentence plus a `-> DESIGN.md, "<section>"` pointer. 16 pointers, 11 distinct targets, all verified to resolve to a real heading.
- **New development rule 9**: `CLAUDE.md` carries the rules and the invariants, `DESIGN.md` carries the reasoning; a new design decision goes in `DESIGN.md` and only the constraint it produces comes up into `CLAUDE.md`.
- Two entries added to "Decisions (do not revert)" that were previously only implicit in the prose: grazing structurally compulsory -> abandoned, and the tutorial "GRAZE" band -> abandoned. Both now point at their DESIGN.md section.
- **Nothing was dropped**, and that was checked rather than assumed: all 194 backticked identifiers, all 38 numeric facts and all 55 ALLCAPS invariant markers of the old file appear in the new pair, and of 295 sentence-level units only 18 are not present verbatim — 4 reformattings, 6 rewordings, and 8 that are the deliberate corrections from the documentation consistency pass below (the stale 10 px radius, "four things", the old P6 wording).
- Missed the 180-line aim for CLAUDE.md by 33. The sections that must stay verbatim (game rules, roadmap, decisions, i18n, persistence table, accessibility, vision, stack, development rules) are 147 lines on their own, which leaves 33 for eleven invariant sections; getting under 180 would have meant deleting invariants rather than relocating prose, so the content won.

**Documentation consistency pass** (`CLAUDE.md`, `CHANGELOG.md`)

Documentation only — no source file was touched, and no gameplay, scoring or
difficulty value changed. Four places had kept describing an earlier state of
the game, which matters because CLAUDE.md is the authoritative reference the
next session reads before touching anything.

- **Lethal radius aligned on `NEAR_MISS.deathRadius` = 8** (config.ts is the source of truth; the value has been 8 since the difficulty rebalance, when it went 10 -> 8 for perceived generosity). "The witch" still said "the 10 px lethal circle" and "the player aims a 10 px hitbox"; "Obstacle rendering" still said `deathRadius` (10) "unchanged". The "Death" and "Difficulty balance" sections already read 8 and were left alone — the latter's "Hitbox 8 px (was 10)" is history, not a stale value.
- **Graze ring lower bound corrected**: "a ring 10 < d <= 38 px" -> "8 < d <= 38 px", with a line saying the bound *is* `deathRadius`, so a future hitbox change is understood to move the ring's inner edge with it rather than opening a dead band between the two.
- **Death screen count uniform at five.** The Scores page section still referred to the screen being "cut back to four things" while the reference section is titled "FIVE THINGS" — the fifth (the way home) was added afterwards and that one sentence was missed.
- **Roadmap P6 rewritten** to describe the death screen as it is (score, one contextual line, Replay band, frozen progress thread, way home) instead of the enriched version — tier, best combo of the run, "New record!" — that was removed when the screen was slimmed. The share image entry now says the button lives on the Scores page.
- **Changelog note added** where the score history is described as a bar chart on the death screen, pointing at its migration to the Scores page. The original entry is left intact: it records what shipped that session, and the correction belongs next to it rather than in place of it.

**"Moonlight & ink" — interface redesign** (`src/config.ts` `TYPE`/`BRAND`, `src/ui.ts`, `src/MenuScene.ts`, `src/FlightScene.ts`, `src/ScoresScene.ts`, `src/share.ts`, `src/rewardCues.ts`, `src/i18n.ts`, `index.html`, `src/main.ts`)

Implemented from the Claude Design exploration ("Moonwick — proposed design"). The palette and every readability invariant are unchanged; what changes is the chrome: the bold system sans and the 2 px-bordered boxes are gone, replaced by type, hairlines and space.

- **Two faces.** Cormorant Garamond (light, high-contrast serif) for the logo, titles and every hero numeral; Manrope as SMALL CAPS (uppercase + 0.22 em tracking — canvas has no font-variant) for labels, rows and hints. Fonts load in `index.html` and `main.ts` AWAITS them (2.5 s offline fallback) before booting Phaser, so `fitText()`/`buttonWidth()` measure real glyphs in all four languages.
- **Five rules**, now in `TYPE` (config.ts) and `ui.ts` helpers (`capsText`, `serifText`, `hairline`, `diamondDivider`, `actionBand`): no bordered boxes — one filled band per screen for the one action; hairlines at 1 px never 2; labels caps, values serif; 28 px margins; a moon-arc motif instead of frames.
- **Home.** Serif logo with its moon-arc; "BEST · n" caps+serif pair; concentric-ring settings icon; the blinking "Tap to play" replaced by a STILL serif line ("Hold to fly") over a caps hint ("Tap anywhere") — new keys `menu.hold`/`menu.tap` replacing `menu.play`/`menu.bestScore`; the Scores box became a full-width hairline row with a chevron.
- **In run.** Serif light score with a dark halo; the multiplier as a small gold caps mark; the combo timer slimmed to a hairline of amber (`MAGIC.barWidth/Height` 170x5 -> 110x2 — rendering only, the gauge logic is untouched); floating gains and value tags in serif.
- **Death.** Serif 132 px score, short hairline, serif-italic message, and Replay as THE screen's one filled band (violet gradient, glowing top hairline, letterspaced caps). Same five things, same instant tap.
- **Scores.** ‹ BACK caps top-left; serif title over a gold diamond divider; the dots-and-arrows pager replaced by caps TABS with a gold underline (the `PAGES` model is unchanged — tabs adapt to new pages); hairline rows, caps labels, serif values, gold rationed to records; **"Recent runs" is now five bars** (the string of numbers asked to be compared; bars just are), best of the five in gold. Row rhythm 40 px — the Forest page (11 rows, the densest) must clear the share row, and the boot assertion that catches an overflow did exactly that during this change.
- **Settings / How to play.** Hairline rows, serif language names with a gold diamond on the choice, caps titles over serif captions for the three pictograms (new keys `help.*Title`), and a single BACK band. All hit zones kept at or above the 44/48 px floors and re-verified in Spanish (longest strings).
- **Share image** re-typeset with the same two faces.
- No gameplay, scoring or difficulty change anywhere. `npm run build` green.

**Night scenery pass** (`src/scenery.ts` new, `src/config.ts`, `src/FlightScene.ts`, `src/MenuScene.ts`)
- A shared background module gives the cursed forest an actual forest: a seeded star field (static texture + a few genuinely twinkling stars), a textured moon (craters, limb shade, idle halo) replacing the flat cream circle, two tileable parallax treeline layers along the bottom edge, and two drifting mist bands. Everything is generated once at boot into canvas textures — no image file — drawn WHITE and coloured by tint, so tier changes and the magic cooling retint without redrawing a pixel. All constants in the new `SCENERY` block (config.ts).
- Strictly scenery under the readability invariant: every piece sits below the darkness overlay (depth 2) and the gameplay layer, so it darkens with the sky and never touches obstacles, halos or the witch.
- Parallax follows the same frame clock as the world (slow motion and pause included) at `treeline.parallax` fractions of the scroll speed; on the home and death screens the forest drifts at `SCENERY.menuDriftPxS` instead — a rest, not a run.
- Stars fade out as the sky-top luminance rises (`stars.fadeLum*`): on The Moon's Eye's pale gold they would read as debris, not stars. Verified in play at tier 4.
- The flight scene, the home screen and the death screen all use the same module, so the night never has two looks. The death screen's copy sits at its own depth (28) above the dead world.
- Logo treatment on the home screen: the glyphs carry a soft baked halo (`BRAND.shadowColor/shadowBlur`) so the word glows even at the background glow's dimmest, plus a hairline flourish with a centre diamond under the word (`BRAND.flourish*`). Logo furniture, not interface: no text, no hit area, nothing through i18n.
- No gameplay, scoring or difficulty change: hitbox, graze radii, tiers and generator untouched. `npm run build` green.

Art direction pass: obstacles and the witch stopped being geometric placeholders.
No gameplay, scoring or difficulty change in any of it — the hitbox, the graze
radius, the tier parameters and the generator are untouched.

### Added

**La Percée — the personal record as a place** (`src/percee.ts`, `src/stats.ts`, `src/FlightScene.ts`, `src/config.ts`, `src/i18n.ts`, `src/sfx.ts`, `src/main.ts`)
- Lifetime statistics under `moonwick:stats`, versioned (`version: 1`) and written exactly once per run at death — never mid-run, where a synchronous write would risk a frame hitch. Games played, total play time, best time; per tier reached/cleared/best combo; grazes total and per essence; best combo, Full Moons and time spent in them; closest graze ever; best grazes in one second. Loading is tolerant: missing or malformed fields degrade to defaults instead of wiping the profile.
- A marker standing in the forest at the moment of the record: an arch of frozen fireflies and moonlight across the screen. Purely visual — no collision, no scoring, no effect on generation. Positioned by time (`x = WITCH.x + (bestTime - runDuration) * speed`) so it lands on the witch at exactly the record whatever the scroll speed is doing.
- Approach ramp over `PERCEE.approach` (4 s): the sound detunes downward, the scenery desaturates, the obstacle fireflies lean forward. Scenery only — obstacles and halos are never dimmed.
- Crossing: 400 ms of slow motion, full trail blaze, the arch bursts, and `percee` appears. The one exception to the no-words-during-play rule.
- The gap to the record spelled out as a whole sentence on the death screen (`percee_gap`, `percee_record`, in all four languages), drawn synchronously in `die()` so the replay tap is never delayed. (A full tier-segmented road was built here first and removed when the screen was cut back.)
- `DEBUG_STATS_DUMP` prints the lifetime stats on boot and exposes `window.__moonwickStats` with `dump()` / `reset()`.

**The Scores page** (`src/ScoresScene.ts`, `src/MenuScene.ts`, `src/main.ts`, `src/i18n.ts`)
- A new scene: the player's single progression hub, reachable from the home screen only. Best scores, recent runs and the detailed lifetime statistics, split across three pages — Records, Journal, The forest.
- Paged by design, to take collection pages later: `PAGES` is the whole navigation model, and adding a page means adding a `{ titleKey, build() }` entry. The pager, dots, arrows and back button adapt on their own. A dev assertion refuses a page whose rows would reach the buttons.
- 24 new i18n keys in the four languages, including the tree-species names.
- The share-image button moved here from the death screen; it now shares the best run rather than the last one.

**Progress thread and safe area** (`src/FlightScene.ts`, `src/config.ts`)
- A hairline along the bottom edge: tier-boundary ticks, a lit notch at the record, and one moving point of light for the witch's progress. No text, no numbers, no opaque background.
- `SAFE_BOTTOM = 34` px, applied to every bottom-anchored element including the Replay band. A constant rather than a runtime query until Capacitor lands in P7.

**Reward cues, replacing the tutorial** (`src/rewardCues.ts`)
- Fireflies: two or three per obstacle, floating in the graze ring, collected into the witch with a crystalline chime when she enters it. Purely visual — they never score a point. They are bait placed exactly where the reward is.
- Value tag: what the obstacle is worth at the current multiplier, small, on the edge of its halo, fading in as she approaches.
- Visible loss: an obstacle passed without a graze lets its fireflies drift up and go out over 400 ms. Discreet, never mocking.
- The first graze ever is celebrated once, wordlessly: golden flash, spark burst and a beat of slow motion.
- The home screen now shows the loop instead of describing it — the demo witch grazes a branch repeatedly, the fireflies come to her and the trail catches fire.
- Everything is pooled: obstacles spawn every couple of seconds for a whole run, and per-obstacle allocation would feed the GC inside a 60 fps loop.

**Balance instrumentation**
- Death log in `moonwick:deaths`: the last 50 deaths, each with seconds survived, tier, cause and grazes completed. The tuning source of truth.
- Tuning readout, opened by a long press on the logo: median survival, median grazes, share of deaths under the quick-death threshold, cause split, and the death distribution per tier as bars. A debug surface, deliberately outside i18n.
- Adaptive easing: after 3 consecutive deaths under 12 s the next run quietly gets +15% gap and -10% speed, lifted mid-run once the player passes 20 s. Totally invisible — no message, no icon — and disableable with `MERCY.enabled`. The trigger is derived from the death log rather than stored, so it cannot drift out of sync.

**Death screen**
- Score history: the last five scores are kept in `moonwick:history` and drawn as a mini bar chart, oldest on the left, with the best of the five in gold. *(Superseded: the chart left the death screen when that screen was cut back to five things; the history now lives on the Scores page, newest first.)*
- Contextual game-over message, picked from five situations (new record, near record, big combo, early death, default) with two to three random variants each, written out in full per language — never assembled from fragments.
- "How to play" page reachable from the settings, with three vector pictograms. It is only ever opened on purpose; nothing shows it automatically.
- `DEBUG_RESET_TUTORIAL` to replay the first-run graze hint without wiping scores, settings or history.

**Obstacles (`src/obstacleShapes.ts`)**
- Procedural silhouettes: seeded polygons with a spindle profile, a slight bow, contour noise, a ragged termination and a widened footing. Six variants per species, generated once at boot into a single cached `RenderTexture` atlas (96 frames) and picked at random. No image file.
- Moon rim light: near-black body with a silver-violet edge on the side facing the moon, from a single light direction shared by the whole scene and derived from `MOON`.
- One tree species per tier (`Tier.essence`): birches, gnarled trunks, brambles, dense stand. Obstacles take the species in force when they spawn, so the changeover rolls in with the existing tier transition.
- Contrast inversion at The Moon's Eye behind the `MOON_EYE.enabled` toggle: pale golden sky, absolute black obstacles.

**The witch (`src/witchShape.ts`)**
- Drawn silhouette replacing the placeholder orb: pointed wide-brimmed hat with the point trailing backward, hunched bust, broom held behind with its brush trailing. Cached in a `RenderTexture`, rim obtained by subtraction so it follows the true outline.
- Real rotation proportional to vertical speed, exponentially smoothed, clamped to -30° / +35°.
- Procedural cape and hat tip: two three-point damped spring chains drawn as tapered ribbons. They ripple on the climb and snap on the dive with no animation authored.
- The witch carries the combo: rim opacity and aura grow with the multiplier, up to the golden blaze of Full Moon, so it can be read on the character without looking at the number.
- Graze reaction: a micro-lean away from the grazed obstacle plus a ripple through the cape, over 150 ms.
- The same `Witch` class is used by the menu and the death screen, so the character never has two looks.

### Changed

**Difficulty rebalance** (playtest: too hard). Tuning only, no mechanic changed.
- **Grazing is no longer compulsory.** The game used to guarantee that from The Brambles onwards half the gap was narrower than the graze ring, making a clean crossing structurally impossible. That is deliberately reversed: every tier, including The Wall, can now be crossed without ever entering the ring. The pressure to graze is economic instead — only grazes score, and dark points decay to zero. A dev assertion enforces the new rule, replacing the one that enforced the old one.
- `GLOBAL_SPEED` (0.85) introduced: one knob for the whole game's rhythm. It multiplies the scroll speed and divides the spawn interval, so the course keeps its exact spatial layout and only time is stretched.
- The Edge became a 30 s learning tier (was 25 s), the widest and slowest. A naive bot aiming at the middle of each gap clears it 12/12.
- `gapSize` progression re-spread across all five tiers: 250 / 170 / 130 / 105 / 96 (was 250 / 140 / 70 / 67 / 64).
- Lethal hitbox reduced from 10 px to 8 px, purely for perceived generosity. The graze ring is unchanged.
- The fairness assertion now checks the interval *after* `GLOBAL_SPEED`; otherwise `clampInterval` would silently cap it and the slowdown would stop applying at the widest tiers.

**Death-screen line now carries the gap inside the sentence** (`src/i18n.ts`, `src/FlightScene.ts`). Design decision: the screen shows five things, so the one line has to do two jobs — say what happened AND give a reason to go again.
- All 15 templates rewritten in `en` and `fr`, warm and brief, never at the player's expense. `es` and `it` carry the English text behind `// TODO: écrire en natif`.
- New `{seconds}` placeholder, used only in `nearRecord` — the one category that cannot be reached without a record to measure against. `{score}` dropped from the templates.
- `pickDeathCategory` switched from SCORE to TIME, so it is indexed on the same record as La Percée and the quoted gap is truthful. `nearRecordRatio` (0.85) now applies to duration.
- The gap used to be a separate sentence pasted in front of the message, which is exactly what the anti-concatenation rule forbids; it is now inside each template. `percee_gap`, `percee_record` and `percee_road` are gone from all four languages.
- Every variant verified to render in two short lines at most, with no unresolved placeholder, in all four languages.

**Interface icons made legible** (`src/icons.ts`, `src/FlightScene.ts`, `src/MenuScene.ts`). Dark-on-dark icons at low opacity were findable only if you knew they were there.
- Both icons gained a faint full outline under a thicker moon-side rim: `ICON_STROKE` `2` → `2.8`, plus a new 1.4 px outline at 0.4 alpha.
- Home icon: alpha `0.45` → `0.85`, scale `1` → `1.25`, touch target `60` → `64` px. Book icon: scale `1` → `1.15`, page block alpha `0.85` → `1`, spine `0.35` → `0.55`.
- Replay stays dominant by area, not by keeping the icons dim: its band is over 200x the home target.

**Progression page renamed and given an icon** (`src/ScoresScene.ts`, `src/icons.ts`, `src/MenuScene.ts`, `src/i18n.ts`). It shipped as "Grimoire" and is now "Scores".
- The `grimoire` i18n key is gone; the displayed name is the single key `scores` (Scores / Scores / Puntuaciones / Punteggi), read by both the home button and the page title. The `grimoire.*` keys were renamed `scores.*` so the naming does not lie.
- The scene, its key and its file were renamed to the neutral `ScoresScene` / `"scores"` / `ScoresScene.ts`, so the next rename touches no code at all.
- New `src/icons.ts`: interface icons drawn as vectors, in the game's own visual language — dark silhouette with a silver-violet rim on the moon-facing side, direction from `MOON_ON_RIGHT`. A book for the Scores page, a house for the way home. No image file.
- The book was redrawn OPEN — two page panels splayed from a sagging central gutter (30 x 22 px) — after the closed-book version read as a dark slab with a pale stripe, indistinguishable from a card or a door at 26 px. The shape itself now carries the meaning instead of the decoration on it.

**Death screen cut back** (`src/FlightScene.ts`). It had become a wall of numbers between the player and the replay button. Design decision, following the same playtest thread as the rebalance.
- What remains, five things: the score (font `96px` → `128px`), ONE line of text, the progress thread frozen where the run ended, the Replay band, and the way home.
- The way home became an icon: no label, no frame, alpha 0.45, in the top-left corner — a 60 px touch target with low visual presence. A dev assertion enforces at least 48 px of target and `REPLAY_CLEARANCE` (80 px) between any interactive element and the Replay band: a mis-tap there throws the player out of the replay loop, which is what the screen exists to protect. Measured clearance: 624 px.
- Removed from it: the best-score line, the five-run history bar chart, the cause of death, the run summary, the tier-segmented road and the Share button. All of them now live in the Scores page.
- The single line shows the gap to the record when there is one to chase, and the contextual message otherwise — never both.
- No path to the Scores page from here: after dying the only two moves are Replay or Home.
- The replay tap is unchanged: live on the first frame, everything drawn synchronously in `die()`.

**Combo timer differentiated from the progress thread** (`src/config.ts`, `src/FlightScene.ts`). The two carry opposite meanings — one is running out, the other is going forward — and shared a violet palette, so they read as the same thing.
- `MAGIC.barColor` `0xb98bff` → `0xffb347`: cold violet to warm amber, the colour of something burning down. Design decision, on top of the move below.
- The timer now pulses below `MAGIC.pulseBelow` (0.3 of the gauge), harder as it nears zero: `pulseHz` 3.4, `pulseGrow` 3 px, `pulseAlphaMin` 0.45. It stays short, centred and at the top; the thread stays full-width, cold and still at the bottom.
- Death-screen run summary reduced to the best combo: the tier reached is now shown by the road as a place rather than spelled out as a line.

- **Collision and visuals are now separated.** Detection still runs on invisible primitives (one rectangle plus one circle per obstacle part; a circle centred on the witch's torso), and the art is built around them. The rule is one-way: the visual may overshoot the hitbox, never fall inside it.
- **The witch's hitbox is centred on her torso**, not on her drawing's bounding box. The torso is also the sprite's origin and its rotation pivot, so art and collision cannot drift apart. Hat, cape and broom brush are never lethal.
- **The witch's body was lifted off pure black.** At near-black her contrast against the sky collapsed as the scene darkened — precisely when the combo is lost and she is hardest to find. Lifted, contrast rises as the light fades.
- The obstacle outline that strengthened in the dark became the moon rim, which now carries that role.
- Help-page pictograms redrawn with the new obstacle vocabulary: near-black body, rim on one side only, never an outline all the way round.
- The replay tap is live on the very first frame of the death screen; the message and the history are drawn synchronously.

### Removed

- **The tutorial approach.** The "GRAZE" word beside the first obstacle, its exaggerated halo, and the help repeated every run until the player finally managed one. Instructions explained the rule; the reward cues above show what there is to gain. The `teach.word` string is gone from all four languages.
- **All instruction text during play.** The only text a live run shows is numeric: score, multiplier, floating gains, value tag.
- The witch's scale-squash deformation, replaced by a real rotation.
- `RESTART.minDeathMs`, the 100 ms guard before the replay tap was accepted: nothing may delay replaying.
- The `death.newRecord` label, folded into the contextual message, which turns gold on a record.

### Fixed

- Silhouettes could be drawn wider than their own graze halo, so part of the tree showed where the game scores nothing and the ring stopped reading as a ring. A development-time assertion now throws if the art exceeds what the halo covers.
- A bowed silhouette left the hitbox exposed on the side opposite the bow: curvature offsets the drawing while the hitbox stays a straight bar, so it now costs extra half-width to pay for itself.
- The rounded end of an obstacle's hitbox was only covered by an antialiased edge; the cap is now inflated by a safety margin, since at the apex the limiting direction is along the axis rather than across it.
- The witch's aura was sized as a multiple of the 256 px light texture, which floodlit the screen at Full Moon instead of rimming her; it is now sized in pixels.
- The witch's hat was clipped by the top of the screen whenever the player held a climb into the ceiling; it is now sized against `WITCH.marginTop`.
- The settings gear was an unlabelled icon: it now carries its translated label, with a hit area sized from that label and never under the 44 px touch floor.
- The death screen always said "You hit a branch", even after hitting a trunk: the real cause is now captured at the moment of contact, and `death.causeTrunk` was added in all four languages.
- The "How to play" hit zone overlapped the "Back" button in the settings.
- The settings panel showed through the help page.

## [0.1.0] — 2026-07-26

First complete browser version. Unpublished (`private: true`, no deployment):
playable locally via `npm run dev`.

### Added

**Phase 1 — Skeleton**
- Hold-to-climb, release-to-fall flight, with gentle gravity and a clamped speed.
- Phaser loop in 480 x 854 portrait, scaled to fit the real screen.

**Phase 2 — Procedural generation**
- Three obstacle types: top branch, bottom branch, and a full-height trunk with a hole.
- Time-driven pacing with random variation, and a guarantee that a gap always stays reachable from the current flight line.
- Every gameplay constant gathered into `config.ts`.

**Phase 3 — Near-miss, score and death**
- Lethal hitbox: a 10 px radius circle, smaller than the visual.
- Graze zone: a ring 10 to 38 px from the obstacle **surface**, computed as a real point-to-rectangle distance (a centre-to-centre distance would have made every graze along a trunk wrong).
- One graze maximum per obstacle, confirmed on **leaving** the zone so a graze is never credited just before a death.
- Combo, multiplier capped at x5, score and floating texts.
- Death screen and in-place restart, with no scene reload.
- `DEBUG_HITBOX` to visualise the hitbox, ring and collision shapes.

**Phase 4 — Game feel**
- Particle trail whose density, size, lifespan and tint follow the multiplier: it is the primary combo indicator, the HUD number being only a reminder.
- 2 to 3 px camera shake on a graze, 150 ms slow motion on an extreme graze (under 18 px).
- **Full Moon** mode at the multiplier cap: the moon grows and gains a halo, the palette turns golden, the trail becomes continuous.
- Web Audio synthesised sounds, with no files at all: a graze swoosh whose pitch rises with the combo, and a low impact on death.
- `prefers-reduced-motion` honoured for shake and slow motion.

**Phase 5 — Progressive difficulty**
- Five named time-based tiers: The Edge, The Dark Wood, The Brambles, The Wall, The Moon's Eye.
- Main lever = narrowing the gaps; speed only rises by 30%.
- Tier changes announced on screen, with parameters and mood interpolated over 2 s to avoid a jolt.
- Final plateau: at the last tier difficulty freezes, and skill alone decides how long a run lasts.
- Fairness guarantee applied to every draw — two obstacles are never far enough apart for the combo to break through no fault of the player — backed by a development-time assertion.
- `DEBUG_START_TIER` to test a tier without replaying 80 seconds.

**Phase 6 — Light meta**
- `MenuScene`: title, best score, animated scenery with a looping witch.
- `localStorage` persistence: best score, best combo, furthest tier reached, games played, sound preference.
- Enriched death screen: score, cause of death, tier reached, best combo of the run, a "New record!" mention, and a **Replay** button filling the bottom of the screen.
- Shareable 1080 x 1920 score image, drawn on an off-screen canvas, via the Web Share API with a file or a PNG download as fallback.
- Tutorial-free onboarding on the very first run: an exaggerated halo and a graze word on the first obstacle, both gone for good after the first successful graze.
- Automatic pause when the tab goes to the background, resume on tap, with no death possible while away.
- **Share** and **Home** buttons on the death screen, with scenery of its own.

**Internationalisation**
- Four languages — English, French, Spanish, Italian — in `src/i18n.ts`.
- Detection from `navigator.language` on first launch; the player's explicit choice then wins permanently.
- Settings panel reachable from the home screen via a gear icon: language selector using native names, and a sound toggle, both applied immediately with no reload.
- Layout sized against the longest of the four translations, with automatic font shrinking on overflow — including on the share image.
- `DEBUG_FORCE_LANG` to test a language without touching browser settings.

### Changed

- **The magic timer no longer kills.** It was designed as a health bar and killed players who were clearing obstacles correctly. It became the sole multiplier timer: at zero the combo drops back to x1 and the run continues. You only die by touching an obstacle.
- **The timer refills on entering the graze zone**, no longer on leaving it. Waiting for the exit cost the multiplier to players who were already grazing correctly. The score is still awarded on exit.
- **Score now comes from grazes only.** Systematic pass-through points diluted readability while the combo was active.
- **Dark points made decaying** (`1, 1, 1, 0` within a single run through the dark, reset by a graze) instead of a fixed value: passive survival fades out instead of paying forever.
- **Tiers narrowed**: from The Brambles onwards, half the gap width is smaller than the graze zone, which makes crossing without grazing structurally impossible. The generator places a trunk whenever no branch can be narrowed without becoming unreachable.
- **Darkening from a lost combo no longer degrades readability.** The overlay moved under the gameplay layer, its maximum alpha went from 0.85 to 0.5, a lost combo now reads as desaturation and cooling of the scenery, and the obstacle outline strengthens as the light fades. Readability of obstacles and halos became a documented invariant.
- **Renamed the game to Moonwick**: tab title, package metadata, share image mention and downloaded file name. The name is treated as a logo — large size, wide letter-spacing, slow moon glow — and is never translated.
- **`localStorage` prefix renamed** from `sorciere:` to `moonwick:`, with a silent migration on start: legacy keys are copied then removed, never overwriting a value already present.
- **Source language switched to English**: all code comments, the README and this changelog. Only the French, Spanish and Italian translation strings in `i18n.ts` remain in their own language.

### Removed

- The reprieve before death by drained magic (`FLICKER_GRACE` in its original role) and death by magic itself, both made moot. The flicker remains, but only as a warning that the multiplier is about to break.
- The second combo timer that duplicated the magic gauge.
- Points awarded for simply passing an obstacle while the combo is active.
- The fps debug overlay, now behind `DEBUG_STATS` and off by default.

### Fixed

- Trunk tips overflowed 13 px into the hole: the real gap was narrower than advertised, which skewed graze distances.
- Branches "widened" by the reachability guarantee stayed crossable without grazing at tight tiers, which diluted the whole Phase 5 narrowing.
- Obstacle drawing could produce up to 21 identical obstacles in a row after a narrowing fix; the draw now picks a category, with the side decided afterwards.
- The witch trail overlapped the tier name on the share image.
- The home screen title showed through the settings panel.
- The settings open/closed state survived a scene restart, since Phaser reuses scene instances.
- The death screen's moon glow was a hard-edged disc, replaced by a radial gradient.
