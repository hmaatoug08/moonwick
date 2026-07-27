# Changelog

Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows [semantic versioning](https://semver.org/).

> The repository currently holds a single commit: the phases below were built
> before it was created, so their individual dates are not tracked. They are
> listed in the order they were built.

## [Unreleased]

Art direction pass: obstacles and the witch stopped being geometric placeholders.
No gameplay, scoring or difficulty change in any of it — the hitbox, the graze
radius, the tier parameters and the generator are untouched.

### Added

**Balance instrumentation**
- Death log in `moonwick:deaths`: the last 50 deaths, each with seconds survived, tier, cause and grazes completed. The tuning source of truth.
- Tuning readout, opened by a long press on the logo: median survival, median grazes, share of deaths under the quick-death threshold, cause split, and the death distribution per tier as bars. A debug surface, deliberately outside i18n.
- Adaptive easing: after 3 consecutive deaths under 12 s the next run quietly gets +15% gap and -10% speed, lifted mid-run once the player passes 20 s. Totally invisible — no message, no icon — and disableable with `MERCY.enabled`. The trigger is derived from the death log rather than stored, so it cannot drift out of sync.

**Death screen**
- Score history: the last five scores are kept in `moonwick:history` and drawn as a mini bar chart, oldest on the left, with the best of the five in gold.
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

- **Collision and visuals are now separated.** Detection still runs on invisible primitives (one rectangle plus one circle per obstacle part; a circle centred on the witch's torso), and the art is built around them. The rule is one-way: the visual may overshoot the hitbox, never fall inside it.
- **The witch's hitbox is centred on her torso**, not on her drawing's bounding box. The torso is also the sprite's origin and its rotation pivot, so art and collision cannot drift apart. Hat, cape and broom brush are never lethal.
- **The witch's body was lifted off pure black.** At near-black her contrast against the sky collapsed as the scene darkened — precisely when the combo is lost and she is hardest to find. Lifted, contrast rises as the light fades.
- The obstacle outline that strengthened in the dark became the moon rim, which now carries that role.
- Help-page pictograms redrawn with the new obstacle vocabulary: near-black body, rim on one side only, never an outline all the way round.
- The replay tap is live on the very first frame of the death screen; the message and the history are drawn synchronously.

### Removed

- The witch's scale-squash deformation, replaced by a real rotation.
- `RESTART.minDeathMs`, the 100 ms guard before the replay tap was accepted: nothing may delay replaying.
- The `death.newRecord` label, folded into the contextual message, which turns gold on a record.

### Fixed

- Silhouettes could be drawn wider than their own graze halo, so part of the tree showed where the game scores nothing and the ring stopped reading as a ring. A development-time assertion now throws if the art exceeds what the halo covers.
- A bowed silhouette left the hitbox exposed on the side opposite the bow: curvature offsets the drawing while the hitbox stays a straight bar, so it now costs extra half-width to pay for itself.
- The rounded end of an obstacle's hitbox was only covered by an antialiased edge; the cap is now inflated by a safety margin, since at the apex the limiting direction is along the axis rather than across it.
- The witch's aura was sized as a multiple of the 256 px light texture, which floodlit the screen at Full Moon instead of rimming her; it is now sized in pixels.
- The witch's hat was clipped by the top of the screen whenever the player held a climb into the ceiling; it is now sized against `WITCH.marginTop`.
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
