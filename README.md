# Moonwick

A mobile *near-miss* game: a witch on a broomstick flies through a cursed forest at night.
**Grazing obstacles charges her magic** — the trail lights up, the multiplier climbs, all the way to Full Moon (x5). Touching an obstacle kills. You are back in under a second.

Portrait, one hand, 30 to 90 second sessions. No external assets: scenery, particles and sounds are all generated at runtime — the two UI webfonts (Cormorant Garamond, Manrope) are the single exception, awaited before boot.

---

## Getting started

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

```bash
npm run build
```

```bash
npm run preview
```

## Playing

| Action | Effect |
| --- | --- |
| Hold (finger or click) | Climb |
| Release | Descend |
| Tap on the death screen | Replay |

The whole home screen is the "Play" button, except the gear icon in the top left, which opens the settings.

## The rules in thirty seconds

- **You only die by touching an obstacle.** The lethal hitbox is a 10 px radius circle, deliberately smaller than the visual: the player should feel they slipped through, never that they were robbed.
- **Grazing pays**: passing between 10 and 38 px from an obstacle's surface awards `10 x multiplier`. The violet halo around every obstacle draws that zone literally — it is what teaches the rule, with no tutorial.
- **The combo** rises by 1 per graze, capped at x5. A 4-second timer makes it drop, and only a graze refills it. **That timer does not kill**: at zero you lose the multiplier, not the run.
- **In the dark**, while the combo is at zero, obstacles you pass award `1, 1, 1, then 0`. Passivity fades out by itself: it never becomes a strategy.
- **Difficulty rises through named tiers.** From "The Brambles" onwards the gap is narrower than twice the graze zone, so crossing without grazing becomes structurally impossible.

## Layout

```
src/
  main.ts          Phaser bootstrap, scene wiring
  MenuScene.ts     Home: logo, best score, settings (language + sound)
  FlightScene.ts   The game: flight, near-miss, score, tiers, death, sharing
  obstacles.ts     Procedural generation, collision shapes, halos
  config.ts        EVERY gameplay and staging constant
  i18n.ts          Translations (en, fr, es, it) + detection and persistence
  ui.ts            Multilingual layout (fitText, buttonWidth)
  save.ts          localStorage: scores, settings, prefix migration
  share.ts         1080x1920 score image (off-screen canvas) + sharing
  sfx.ts           Web Audio synthesised sounds, no files
  scenery.ts       Night background: stars, textured moon, parallax treelines, mist
  textures.ts      Runtime-generated textures (glow, spark)
```

## Tuning the game

Everything is tuned in [`src/config.ts`](src/config.ts), without reading the scene code:

| Block | What it drives |
| --- | --- |
| `WORLD`, `WITCH` | Logical size, gravity, thrust, max speed |
| `TIERS`, `TIER_FX` | Difficulty tiers: speed, gap width, pacing, sky |
| `OBSTACLES` | Generation: jitter, margins, gap floor, type weights |
| `NEAR_MISS`, `SCORING`, `MAGIC` | Core loop: radii, multiplier, combo timer |
| `TRAIL`, `AMBIENT`, `FEEDBACK`, `FULL_MOON` | Particles, mood, halos, Full Moon mode |
| `SHAKE`, `SLOWMO`, `SFX` | Game feel: shake, slow motion, sounds |
| `TEACH`, `RESTART` | First-run onboarding, replay delay |
| `BRAND` | Brand name and its typographic treatment |

### Debug flags

| Flag | Effect |
| --- | --- |
| `DEBUG_HITBOX` | Draws the lethal hitbox, the graze ring and the collision shapes |
| `DEBUG_STATS` | fps / speed / tier overlay in the top left |
| `DEBUG_START_TIER` | Starts directly at a tier (index) instead of replaying 80 s |
| `DEBUG_FORCE_LANG` | Forces a language without touching the browser or the saved choice |

## Languages

**English · Français · Español · Italiano.** The language is detected from `navigator.language` on first launch; the choice made in the settings then wins permanently.

Every displayed string goes through `t("key")` in [`src/i18n.ts`](src/i18n.ts) — English is authoritative, so **a forgotten key breaks the build**. The only exception is "Moonwick", a brand name, identical in all four languages.

Buttons are sized against the longest of the four translations (gaps reach x2.3: `Replay` -> `Jugar de nuevo`), and any text that is still too long has its font size reduced automatically.

## Local data

Nothing leaves the browser: no backend, no telemetry. Everything lives in `localStorage`, prefixed `moonwick:` and handled solely by [`src/save.ts`](src/save.ts):

`bestScore` · `bestCombo` · `bestTier` · `games` · `sound` · `tutorialDone` · `lang`

Unavailable storage (private browsing, quota) is tolerated: the game then runs without persistence and never throws.

## Accessibility

- `prefers-reduced-motion` disables the camera shake and the slow motion.
- Sound can be muted from the settings, volume is low by default, and the choice persists.
- No text is required to understand the game.
- The readability of obstacles and their halos is an invariant: no visual effect ever degrades it.

## Status

Phases 1 to 6 are done: skeleton, procedural generation, near-miss, game feel, difficulty, light meta. **Phase 7** (Capacitor, iOS/Android builds, safe areas, haptics) and **Phase 8** (monetisation and analytics) remain.

See [CHANGELOG.md](CHANGELOG.md) for the detail, and [CLAUDE.md](CLAUDE.md) for the authoritative game rules and the design decisions not to undo.

## Developing with Claude Code

```bash
cd sorciere
claude
```

`CLAUDE.md` carries the contribution rules: one phase at a time, maximum simplicity, every constant in `config.ts`, comments in English, and a green `npm run build` after each change.

## Stack

Phaser 3.90 · TypeScript 5.9 · Vite 5.4. No backend, no server dependency.
Target: 60 fps on a mid-range phone.
