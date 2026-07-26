# Changelog

Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows [semantic versioning](https://semver.org/).

> The repository currently holds a single commit: the phases below were built
> before it was created, so their individual dates are not tracked. They are
> listed in the order they were built.

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
