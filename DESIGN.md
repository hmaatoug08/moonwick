# Moonwick — design rationale

**[CLAUDE.md](CLAUDE.md) carries the rules and the invariants. This file carries
the reasoning**: why a decision was taken, what it replaced, how something is
implemented, and which earlier version it must not slide back into.

Nothing here is optional reading when you are about to change the thing it
describes — a rule stripped of its reason is a rule that gets "simplified" away
by the next session. But nothing here needs to be read to follow the rules
themselves, which is the whole point of the split.

New design decisions land in this file. Only the constraint that follows from a
decision moves up into CLAUDE.md.

---

## Communicating the reward, not the rule (replaced the tutorial)

The game used to teach with an instruction: a "GRAZE" band beside the first
obstacle, repeated every run until the player finally managed one. That is
**gone**. Telling players what to do explains a rule; showing them what they
gain makes them want it. `src/rewardCues.ts` holds the replacement.

**NO WORDS DURING PLAY.** The only text visible in a live run is numeric: the
score, the multiplier, the floating gains and the value tag. Anything that
reads as an instruction is a bug. Two non-numeric strings are allowed, neither
of them an instruction: the tier name at a tier change (`announceTier`), and
`percee` when the player crosses their own record — at most once per run, and
never on a first run.

- **Fireflies.** Two or three per obstacle, floating in the graze ring with a
  slow drift, collected into the witch with a crystalline chime when she enters
  it. They are **purely visual and never score a point** — bait placed exactly
  where the reward is, so the eye goes there by itself. A dev assertion keeps
  them strictly inside the ring: outside it they would advertise a reward that
  is not there, closer than the lethal radius they would bait her into dying.
- **Value tag.** What this obstacle is worth at the CURRENT multiplier, small,
  on the edge of its halo, fading in as she closes. It is the whole economic
  argument for grazing, which is what carries the game now that the geometry no
  longer forces it (see "Difficulty balance" below). It sits on the obstacle's
  LEFT — obstacles scroll towards her, so that is the side she reads before
  deciding.
- **Visible loss.** An obstacle passed without a graze lets its fireflies drift
  up and go out over ~400 ms. Discreet, never mocking: the loss is shown, not
  commented on.
- **The first graze ever** is celebrated once and wordlessly — golden flash,
  spark burst, a beat of slow motion. `moonwick:tutorialDone` makes sure it
  never happens twice.
- **The home screen shows the loop.** The demo witch grazes a branch on a loop:
  fireflies come to her and the trail catches fire, then dulls again. It uses
  the same point-to-capsule distance as the real game, so what the home screen
  promises is what the game does.

Everything is **pooled** (`FIREFLIES.poolSize`, `VALUE_TAG.poolSize`).
Obstacles spawn every ~2 s for a whole run; allocating sprites per obstacle
would feed the GC in the middle of a 60 fps loop. Attachment is tracked in a
`WeakSet` of obstacles rather than inferred from live fireflies — the moment
they are collected they leave their obstacle, and anything asking "does this
obstacle still have fireflies?" would hand it a fresh set, paying out forever.

Trail density and brightness are the primary indicator of the multiplier — the
player should never have to read a number.

---

## Difficulty balance (this reversed an earlier pillar)

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

---

## La Percée — the record is a PLACE, not a number

The personal best is a duration (`bestTime`), which is what the tiers are
already indexed on. It is not shown as a figure anywhere during play: it stands
in the forest, at that exact moment of the run, as an arch of frozen fireflies
and moonlight spanning the screen (`src/percee.ts`).

**It is purely visual.** No collision shape, no scoring, no effect on
generation. The player flies straight through it — that is the point.

**Positioned by TIME, not spawned:** `x = WITCH.x + (perceeTime - runDuration) *
scrollSpeed`, so it lands on the witch at exactly `bestTime` whatever the speed
is doing. Tier transitions, the adaptive easing and `GLOBAL_SPEED` all change
speed mid-run, and a marker spawned once at a fixed distance would drift off
the record it represents.

- **Approach** (`PERCEE.approach`, 4 s): the sound hollows out, the scenery
  desaturates, the obstacle fireflies lean forward. All of it is atmosphere and
  touches the SCENERY only — obstacles and halos are never dimmed.
- **Crossing:** 400 ms of slow motion, full trail blaze, the arch bursts, and
  the word `percee` appears. This is the **one exception** to the no-words-
  during-play rule; it happens at most once per run and never on a first run.
- **Below `PERCEE.minTime` (8 s), or with no record at all: nothing.** No arch,
  no notch, no caption. The feature appears in one piece at one threshold —
  gating the caption separately would have told a first-time player they "went
  further than ever" on their very first run, which is true and meaningless.

---

## The death screen — why exactly five things

It had grown into a wall of numbers standing between the player and the replay
button. Its content is now closed: score, one line, the Replay band, the frozen
progress thread, the way home.

**BIG TARGET, LOW PRESENCE.** The home button is a 64 px touch square around a
house icon, in the TOP-LEFT corner — the furthest point from Replay,
which owns the bottom band. A mis-tap there does not cost a menu trip, it
throws the player out of the replay loop, which is the one thing this screen
exists to protect. A dev assertion enforces `REPLAY_CLEARANCE` (80 px) between
any interactive element and the Replay band, and a touch target of at least
48 px.

**"Low presence" means quiet next to Replay, not invisible.** Both interface
icons (`src/icons.ts`) are drawn dark-on-dark, which at low opacity made them
findable only if you already knew they were there. They now carry a faint full
outline under a thick moon-side rim (`ICON_STROKE`), and the home icon sits at
alpha 0.85. Replay stays dominant by AREA — its band is over 200x the home
target — not by starving the icons of contrast.

**Nothing else may be added here.** Best scores, run history, cause of death,
run summary and the tier road all moved to the Scores page. Adding a number back
to this screen is a regression, not a feature.

**There is no path to the Scores page from the death screen.** After dying the
only two moves are Replay or Home — reading happens on purpose, from the menu.

### The seam that produced the anti-concatenation rule

The gap to the record used to be a separate sentence pasted in front of the
contextual message. Folding it into the templates is what removed that seam:
word order, punctuation and agreement differ per language, so glueing pieces
together breaks sentences somewhere. That experience is why the rule in
CLAUDE.md is absolute rather than a preference.

The five-score history has the same shape of history: it used to be a mini bar
chart on the death screen, oldest on the left, best of the five in gold. It
moved to the Scores page when the screen was cut back, and it is not one of the
five things.

---

## The Scores page (`src/ScoresScene.ts`)

**The displayed name lives in ONE i18n key (`scores`).** The scene class, its
scene key and the file name are deliberately neutral, so the page can be
renamed — it was called "Grimoire" for exactly one session — without touching a
line of code. The button that opens it and the page title read the same key.

The player's single progression hub, reachable **from the home screen only**.
It holds the best scores, the recent runs and the detailed lifetime statistics,
and it is where the share-image button now lives (it shares the BEST run rather
than the last one).

**It is PAGED, deliberately.** Collection pages are coming, and `PAGES` is the
whole navigation model: a page is `{ titleKey, build() }`, and adding one means
adding an entry. The pager, the dots, the arrows and the back button adapt on
their own; with a single page the pager hides itself.

A dev assertion refuses a page whose rows would reach the buttons — that is
exactly how the death screen got overloaded, and splitting a page is the fix,
not shrinking the rows.

Current pages: **Records** (best score, best combo, longest flight, recent
runs), **Journal** (runs, time, grazes, Full Moons, closest graze), **The
forest** (per tier and per species), **Omens** (the collection — see "The
omens" below; it is the page the paging was built for, and the one page whose
content is a glyph grid rather than label/value rows, which is why `build` is
now optional on a page).

Note: `save.ts` and `stats.ts` both track a best combo, from different eras of
the codebase. The page reads the larger of the two so it can never show
them disagreeing on the same screen.

The gap to the record is spelled out in a whole sentence (`percee_gap`,
`percee_record`) — never assembled from fragments. (An earlier version drew a
full tier-segmented road on the death screen; that road was removed when the
screen was cut back to the five things it now shows. The frozen thread carries
the same idea in a hairline.)

---

## The omens — the collection is a reading, not a ledger

The game needed something to want *between* runs — the Scores page was built
paged for exactly this. What it must not become is a quest log: Moonwick has
one skill and one economy, and a checklist of "do X ten times" tasks would
bolt a second economy onto a game whose whole appeal is that nothing stands
between the player and the next run.

So the omens are **signs, not tasks**: twelve procedural glyphs commemorating
deeds the game already cares about, arranged in journey order — the discovery
(the first spark, a hundred sparks, the chain), the forest (the brambles, the
Wall, the Eye), mastery (the needle, the flurry, the long night), the moon
(Full Moon, the Breakthrough, the day's moon). Read left to right, top to
bottom, the grid IS the lore: the witch's whole night, told without a
sentence. That is what "the lore reads wordlessly" means here — not that the
page has no text (names are labels, and labels are allowed), but that the
STORY is carried by glyph order and glyph light, never by prose.

**Derived, never stored — the MERCY precedent.** Whether an omen is lit is a
pure predicate over the lifetime stats, recomputed at every page open. The
alternative — a stored set of unlocked ids — is how every drifted meta system
starts: the flag and the deed go out of sync, a restored save loses trophies
the stats still prove, a new omen ships locked for veterans who earned it
years ago. Deriving kills all three at once, and it is the same shape as
MERCY's trigger ("derived from the death log, never stored") for the same
reason. The corollary is a rule for growth: when a deed worth an omen is not
recorded yet, the fix is a new stats field, never an unlock flag. Two were
added this way — `perceesCrossed` and `dailiesFlown`, both absent because the
Percée and the daily predate the idea that anything would ever read them —
and the versioned, tolerant loader absorbed them for free.

The one thing persisted is `moonwick:omensSeen`: which reveals the page has
already SHOWN. That is presentation state, not game state — corrupt it, wipe
it, hand-edit it, and the only consequence is a shimmer replaying. It exists
because a collection with no reveal moment is a spreadsheet; it is kept
separate because a reveal moment must never be allowed to become the source
of truth.

**Why nothing announces an omen during play.** The no-words rule and the
closed death screen leave no legal surface, and that is not a constraint to
route around — it is the design. An unlock toast mid-run would interrupt the
one thing the game protects (flow into the next attempt); a badge on the
death screen would be the sixth thing. Omens are discovered the way the
Scores page is visited: on purpose, between sessions, in the reading room.
The reveal there is deliberately small — a fade-in and the name in gold for
that visit — because gold is rationed to rewards, and this page is quiet by
charter.

**Why a locked omen shows its glyph but not its name.** Three options were on
the table: show everything (a checklist — tells the player what to grind),
show nothing (empty sockets — mystery, but indistinguishable holes sell no
story), show the glyph dimmed with no name. The third is the riddle posture:
the needle, the eye, the arch of dots are all legible enough to raise "what
is that?" and none of them is an instruction. The name confirms the deed
after the fact — part of the reward, like the tier names that only mean
something once you have flown into them. No unlock condition is ever written
in prose, in any language; the moment one is, the collection becomes a task
list and the anti-quest-log premise dies.

**Thresholds sit on existing measurements.** The needle omen's band IS
`GRAZE_TIERS.needleBand` — same number, read from the same constant, so the
omen can never drift from the graze tier it commemorates. The chain asks 10,
deliberately above the death screen's `bigComboThreshold` (8): the sentence
praises a good chain, the omen marks a great one. The tier omens read
reached/cleared from `perTier` — "Through the Wall" asks *cleared*, the only
omen that does, because the Wall is the tier whose whole identity is being
gotten through.

**The grid, not rows.** Rows are label/value pairs; a collection is objects.
The `PAGES` model gained the smallest possible extension — `build` became
optional, a page without it is the grid — rather than a parallel page system.
The glyphs speak the interface-icon vocabulary (dark mass, moon-side light,
`MOON_ON_RIGHT`), sit free on the page with no sockets and no tiles (no
bordered boxes — rule one), and answer to the same bottom limit as the row
pages, enforced by the same style of boot assertion.

### The bridge (a playtest amendment)

The first shipped version announced nothing anywhere: earn an omen, and
unless you happened to open the page you would never learn it existed. The
playtest verdict was immediate — the reveal is the collection's whole
payoff, and the game's core loop is *built* to never pass through the
Scores page, so the payoff was structurally missable.

Two stronger fixes were considered and rejected. An **in-run announcement**
fails on attention (the moment you earn the needle you are, by definition,
3 px from death) and on redundancy — nearly every omen deed already has its
in-run celebration: the needle its flash, Full Moon its veil, the Percée
its burst. The feeling is delivered at the moment; what was missing was
only the bridge to the page. A **death-screen list of earned omens** is the
exact regression the five-things rule exists to prevent — the screen was
cut back once precisely because things kept accreting onto it.

So the bridge is two quiet layers, and a closed list:

- **The death line carries it.** The screen already owns one sentence whose
  charter is "say what happened, give a reason to go again" — and a new
  omen IS what happened. The `newOmen` category fires when this run's deeds
  lit one: whole templates in four languages, no sixth element, no delay,
  and at most twelve firings in a player's whole life, so it never wears
  out. It ranks just under `newRecord` (rarer than every time band, but a
  record is bigger news and its own line is better). Event-indexed where
  the others are time-indexed — the one exception, accepted because the
  event is rarer than any threshold the bands could express.
- **The trail to the page glows.** A small gold spark beside the home
  screen's Scores label while a lit omen has never been revealed, breathing
  slowly (a coal, not a LED), and the Scores page opens directly on the
  Omens tab in that state so the reveal shimmer cannot hide behind
  Records. Gold, because it points at a reward; wordless, like every icon.

Both layers say only *that* a sign waits — never which, never how many.
The moment a pointer names an omen outside the page, the name stops being
part of the reward and the riddle posture collapses; that is why the rule
in CLAUDE.md is a closed list rather than a tone guideline. Discovery
still happens on purpose, in the reading room — the game now just admits
there is something to read.

---

## The progress thread, bottom edge

A hairline across the full width, small ticks at the tier boundaries, a lit
notch at the record, and one moving point of light: the witch on her road. No
text, no numbers, no opaque background — it is scenery, not a HUD.

**The two readouts are deliberately opposite**, because they mean opposite
things and must never be confused:

| | combo timer | progress thread |
| --- | --- | --- |
| where | top | bottom edge |
| shape | short, centred bar | full-width hairline |
| palette | **warm** amber | **cold** violet |
| motion | pulses harder as it empties | still, except the dot |
| meaning | running out | going forward |

**Priority to the game:** the thread is drawn UNDER the obstacles and their
halos (depth 2.7 against 3), so an obstacle crossing it hides the thread and
never the reverse. It disappears completely during a Percée crossing.

Its scale is fixed at the start of a run so it never slides under the dot; past
the record it stretches rather than pinning the dot to the end.

### Why `SAFE_BOTTOM` is a constant

On a phone the last strip at the bottom belongs to the home indicator: it is
both visually occupied and a system gesture area, so a control there is
half-hidden and half-swallowed. It is a constant rather than a runtime query
because Capacitor lands in P7; this is the single place to widen when real
`env(safe-area-inset-bottom)` values arrive.

---

## Lifetime statistics (`src/stats.ts`, `moonwick:stats`)

What is recorded: games played, total play time, best time; per tier
reached/cleared/best combo; grazes total and per essence; best combo, Full Moons
and time spent in them; closest graze ever and best grazes-in-one-second.

- **Written EXACTLY ONCE per run, at death.** Nothing here touches localStorage
  while the game runs: a synchronous write inside a 60 fps loop is a frame
  hitch waiting to happen, and losing one run's numbers to a crash matters far
  less than a stutter.
- **Versioned and tolerant.** `loadLifetimeStats()` fills in whatever is
  missing instead of rejecting the payload: an older save, a hand-edited file
  or a field added later degrades to defaults for the missing parts and keeps
  everything still understood. It never throws and never wipes.
- `Infinity` (never grazed) round-trips through `null`, which is a legitimate
  state rather than corruption.
- `DEBUG_STATS_DUMP` prints them on boot and exposes `window.__moonwickStats`
  with `dump()` / `reset()`.

Note the naming: `save.ts` already has a small `Stats`/`loadStats` pair for the
score screen. The lifetime ones are `LifetimeStats` / `loadLifetimeStats` so the
two can never be imported by mistake for one another.

---

## The witch (`src/witchShape.ts`)

Drawn with `Graphics` once at boot, cached in a `RenderTexture` (two frames: body and rim), then displayed as a sprite. No image file. Same light as the obstacles: silver-violet rim on the moon-facing side, direction taken from `MOON` — one light source for the whole scene.

**Her body is deliberately lifted off pure black** (`WITCH_ART.bodyColor`), unlike the obstacles. At near-black her contrast against the sky *collapsed* as the scene darkened (down to ~1.05), which is exactly when the combo has been lost and the player most needs to find herself; lifted, contrast *rises* as the light fades (~1.4). It also stops her reading as the same material as the trees. Any change here must be checked against **every** tier sky, top and bottom, dimmed and not — a single flat colour matches the gradient somewhere, which is why the rim and the aura, not the fill, are what guarantee she is findable.

**HITBOX AT THE BUST.** The 8 px lethal circle (`NEAR_MISS.deathRadius`) is centred on the TORSO, never on the drawing's bounding box. The torso is also the sprite's origin and its rotation pivot, so `witch.x/y` is at once what the collision tests and what the art pivots around — they cannot drift apart. The hat, the cape and the broom's brush all reach well past the circle and **none of them is lethal**.

**The visual contains the hitbox, never the reverse.** The body is built on a core disc of `WITCH_ART.coreRadius` (> `deathRadius`) centred on the torso, so the guarantee holds by construction; a dev assertion throws if that ever stops being true. `DEBUG_HITBOX` draws the circle *over* the silhouette (debug depth 25 > witch depth 5).

**The rim is drawn by subtraction**, not traced by hand: draw the body, erase the same body shifted away from the moon, keep the surviving crescent. It follows the true silhouette however the drawing changes.

Other rules the art has to obey:
- **The silhouette is one connected mass.** Hat, head, torso and broom overlap on purpose — as separate pieces the rim reads as scattered floating lines rather than a character. The hat is a single polygon (brim *and* cone) tracing the real outline; drawn as two pieces it reads as a slab hovering over a ball, drawn as one filled wedge it reads as a blob.
- **The hat's height is bounded by gameplay.** The torso is clamped to `WITCH.marginTop` (20 px) and the hitbox sits on the torso, so anything more than ~26 px above it is clipped by the top of the screen every time the player holds a climb into the ceiling.
- **The rim has to be strong even at x1** (`rimAlphaIdle`): she is near-black against a near-black sky, and the player aims an 8 px hitbox with her.

**Posture.** A real rotation proportional to vertical speed, exponentially smoothed (never a jump), clamped to `tiltUpDeg`/`tiltDownDeg` (-30°/+35°). It replaced the old scale squash.

**Cape and hat tip** are procedural: two 3-point damped spring chains trailing the witch, drawn as tapered ribbons through a spline. They ripple on the climb and snap on the dive with no animation authored — stiffness, damping and segment length live in `WITCH_ART`. A hard leash (`chainMaxStretch`) stops a huge `dt` (tab wake-up, slow motion ending) from flinging the cape across the screen.

**She carries the combo.** Rim opacity and aura grow with the multiplier, up to the golden blaze of Full Moon, so the multiplier is readable on the character without looking at the number. The aura is sized in **pixels**, not as a multiple of the 256 px light texture — scaled by ~1 it floodlights the screen instead of rimming her.

**Graze reaction:** a micro-lean away from the obstacle plus a ripple through the cape, eased out over `grazeKickMs` (150 ms). The side is read from the free band — whichever edge of the gap she passed closest to is the material she grazed.

The same `Witch` class is used by the menu and the death screen, so the character never has two looks.

---

## Obstacle rendering (`src/obstacleShapes.ts`)

**Collision and visuals are separated.** Detection still runs on invisible primitives only — per part, one rectangle plus one circle (so 2 shapes for a branch, 4 for a trunk), with `distanceTo()` taking the minimum over the set. `NEAR_MISS.deathRadius` (8) and `grazeRadius` (38) are what they read. The drawn silhouette is built *around* those primitives and has no say in gameplay.

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

---

## The chromatic arc — one palette per tier

Each tier owns a `TierPalette`: sky gradient, scenery tint, base saturation, and
its own graze halo. Rendering only, on exactly the same terms as `essence` — the
forest may change colour, never shape.

### Why the hues only ever move one way

A tier change interpolates the sky in RGB over 2 s. RGB interpolation is a
straight line through the colour cube, so two hues far apart on the wheel meet
somewhere near the grey axis on the way: violet to teal passes through a dead
slate, wine to blue through a brown. Holding the arc to one direction —
~208 -> 251 -> 293 -> 322 -> 345 on the gradient tops, 194 -> 261 -> 303 -> 329
-> 351 on the bottoms — keeps every step short (7° to 43°) and every crossing
inside the same family. The dev assertion caps a step at 140° and the whole
sweep at 260°, so the next palette someone authors cannot quietly reintroduce
the long way round.

### Monotone was not enough: the steps have to be spread

The first version of these palettes advanced in one direction and passed every
assertion — and two tiers out of five still looked exactly like the violet they
replaced. Measured against the original sky: The Dark Wood **ΔE 3.9**, The
Brambles **ΔE 5.0**. Below about 2.3 a difference is imperceptible; at 4 it is
"maybe, side by side, on a good screen". In a game played on a phone at night,
that is nothing. The Moon's Eye, meanwhile, was ΔE **0.0** — unchanged by
construction, since `MOON_EYE` supplies its sky and the palette holds only the
fallback.

The cause was distribution, not direction. The arc ran 194 -> 261 -> 303 -> 324
on the bottoms: steps of 67, 42 and **21** degrees, and 43, 42 and **7** on the
tops. Two tiers sharing a 7-degree step are the same colour. The assertion
checked that every step was forward and under 140; nobody had asked whether the
steps were *even*, so the lopsidedness was invisible to it.

The fix was to re-spread rather than to nudge: an even arc (52, 51, 55, 53
degrees) chosen by searching for the set that maximises the worst of "adjacent
tiers differ" and "each tier differs from what it replaced", subject to every
existing invariant. Results, bottoms, in ΔE:

| | adjacent separation | vs the original sky |
| --- | --- | --- |
| before | 32.9 / 12.6 / 24.2 / 61.0 | 33.3 / 3.9 / 5.0 / 14.1 / 0.0 |
| after | **51.2 / 17.0 / 42.3 / 61.4** | **36.6 / 19.0 / 19.6 / 15.7 / 0.0** |

`PALETTE_STEP_MIN` (30°) now enforces the spacing on the effective skies, and it
was verified to reject the arc that shipped.

Two constraints shaped the search as much as the objective did. **Saturation had
to do the work**, because luminance is pinned (see below) — hence 0.60-0.86 on
the coloured tiers, up from 0.45-0.57. And **the halo had to stay violet**: the
unconstrained search happily proposed an orange halo for The Wall, which would
have read as a reward colour and broken both the Affordance rule ("a translucent
violet halo") and the gold rationing. The Wall was also pinned dark rather than
allowed to brighten for a bigger ΔE: being the blackest tier is half of how it
reads, which is why it is the one palette that still measures only ΔE 15.7
against the original and is fine that way — it is 42.3 from its neighbour.

The order the tiers happen to want — teal, violet, wine, ink, gold — is why the
direction is forced rather than chosen. The Wall was specified as "blue-black",
and blue would have meant going *back* from the Brambles' wine. It is a
plum-ink instead: at saturation 0.12 and that lightness the difference between
plum-black and blue-black is not visible, and keeping the arc intact is worth
more than the word. It also shortens the run into the pale gold that follows.

### Why The Edge is not actually brighter

"Light and luminous" was the brief, and the first attempt took it literally: a
teal bottom at HSL lightness 0.33. Two measurements killed it. The graze halo
composited over that sky came out at a contrast of **1.017** — the halo, which
is the only thing teaching the graze rule, was gone. And the sky landed on the
witch's own body luminance, dropping her body contrast to **1.03** against a
shipped worst of 1.208.

The cause is that relative luminance is not lightness: the green channel carries
0.7152 of it, so a cyan at a given HSL lightness is far brighter than a violet
at the same number. A 369-point sweep of the Edge bottom (hue x saturation x
lightness) found solutions only at lightness 0.10-0.12 — i.e. at the same
*luminance* as the violet it replaces.

So The Edge reads open and airy through HUE alone. That is the general rule the
palettes follow: luminance is held roughly constant tier to tier, because
luminance is what the halo and the witch are measured against, and colour is
free to move.

### Why colour drains at The Wall

Losing the combo cools the scenery: it desaturates towards blue-grey. That
spends saturation, and The Wall has almost none — 0.12, the lowest of the five,
deliberately, because it is the tier where the forest stops having a colour.

Measured, its cooling moves saturation by **-0.02** (it very slightly *gains*):
the one tier where the loss would have been invisible is the tier the player is
most likely to lose it on. `coolValueDrop` is the answer — the fraction of the
cooling paid as a luminance drop instead. At 0.34 the Wall's lit-to-cooled
contrast goes from 1.002 to **1.043**, which puts it in the same band as the
Dark Wood (1.039) and the Brambles (1.051). Same event, same legibility,
different currency. A dev assertion refuses a palette under 0.2 saturation that
does not compensate this way, so "drained" can never quietly mean "silent".

The Moon's Eye is the mirror case and takes `coolValueDrop` 0: pale gold going
blue-grey is a saturation swing of 0.18, plainly visible on its own, and
darkening it would have eaten the contrast of the dark rim the inversion relies
on (measured: 4.52 -> 3.69).

### The contrast checks, and what they found

Every palette was measured with the runtime's own maths — `coolDesat` verbatim,
real alpha compositing, WCAG relative luminance — at both ends of the gradient,
lit and fully cooled. Twenty sky states in all.

- **Halo** (the invariant): worst **1.159**, at the Dark Wood's top when cooled.
  The floor is 1.14, calibrated just under the 1.147 the single-halo version
  measured at its worst, so a palette can never be worse than what shipped.
- **The witch** needed no correction once The Edge sat at the right luminance:
  body 1.22-8.03, and the rim that actually applies 4.52-11.28 (the inverted
  tier uses `MOON_EYE.rimColor`, a dark edge, not the silver-violet glow — the
  first measurement compared the wrong rim and reported a false collapse). Her
  fill is not the guarantee and never was; the rim is.
- **The HUD** was the one real casualty. Under inversion the timer used to flip
  to the same dark violet as everything else, leaving it **1° of hue** from the
  progress thread — the warm/cold pair that CLAUDE.md declares must never be
  confused had silently collapsed on the last tier. The timer is now a burnt
  amber (hue 24) and the thread a dark violet (hue 255): 129° apart, with the
  thread's dot switching from additive to normal blending, since adding light to
  a pale sky does nothing. Requirement met by moving the HUD, not the palette.

### The one thing these palettes do not fix

The Wall -> Moon's Eye transition drops the halo to a contrast of **1.001**
mid-crossing. It is not a regression: the shipped single-halo version measures
**1.006** in the same window, and interpolating the halo colour alongside the sky
makes it marginally worse (1.004).

The reason is structural. As the sky sweeps from near-black to pale gold it must
pass *through* the halo's own luminance, and compositing a colour onto a
background of equal luminance yields that same luminance at any alpha — contrast
1.000, unreachable by tuning. Fixing it needs the halo to switch polarity
part-way through the crossing, keeping it far from the sky's luminance on both
sides, which is a change to the art direction rather than to a palette. Left
alone, deliberately, and the dev assertion is therefore scoped to each palette's
steady states — the property requirement 3 actually describes.

---

## Art direction — "Moonlight & ink"

The interface speaks through TYPE, HAIRLINES and SPACE — never through boxes.
Two faces, two jobs, defined once in `TYPE` (config.ts) and spoken through the
`ui.ts` helpers (`capsText`, `serifText`, `hairline`, `diamondDivider`,
`actionBand`); no screen may invent its own vocabulary.

- **Serif** (Cormorant Garamond, light): the logo, titles, tier names and
  EVERY hero numeral or value.
- **Small caps** (Manrope, uppercase + 0.22 em tracking): labels, rows, hints.
  Canvas has no font-variant — uppercase + `setLetterSpacing` IS the recipe,
  which is why the helpers exist.
- Fonts load in `index.html`, and `main.ts` AWAITS them before booting Phaser
  (2.5 s fallback so offline still boots): `fitText()` and `buttonWidth()`
  must measure real glyphs in all four languages, never a swapped fallback.

**Gold is rationed**: records, rewards, Full Moon, the active choice. Amber
stays the combo timer alone. Violet is hairlines at 12–30 % alpha, no longer a
border on everything. Touch targets keep the 44/48 px floors regardless of how
quiet the paint is — "no box" changes what is drawn, never what is tappable.

### The mark — "the lit crescent"

The name is two things — a MOON and a WICK — so the mark is one shape doing
both: a waxing crescent whose upper horn is lit like a candle. It is built
from two circles and a teardrop (moon r 100; shadow r 92, centre offset 44
towards the dark side; their intersections put the horns at ±91.9, the top
one is the wick, and the flame sits 12 above it on the centre-right axis).
It draws in Canvas 2D in a dozen lines and needs no image file.

**She lights the wick.** The witch flies out of the crescent's bay on the
same tilt the game gives her (−14°), and her golden trail arcs up the inner
edge to the horn. The silhouette is TRANSCRIBED from `witchShape.ts` — the
same broom and brush polygons, the core disc, the single hat polygon (brim
and cone as one outline, never two pieces), and the rim built by offsetting
towards the moon. She is the character the game draws, not a redrawing of
her, and she keeps her colours (`LOGO.witchBody`/`witchRim`).

**Why the two-tier rule.** The witch rides in every full lockup — stacked,
horizontal, app icon, inverted, one-colour — at 88 px of mark or more. At
64 px and below she would be ~30 px of silhouette: a smudge, and a smudge is
worse than an absence, so the mark drops to the crescent and flame alone.
Below ~28 px a hairline sliver and a teardrop also disappear, which is why
the small recipes thicken the crescent and round the flame into a dot: same
construction, three sets of radii.

**Why the light follows `MOON.x`.** The crescent is lit on the right because
the scene's moon is on the right — the mark reads the same constant the
obstacle rims do, so moving the moon in config relights the logo with the
whole forest. The canonical drawing is lit-right; the buffer mirrors as one
piece, witch and all.

### The music

The game had synthesised one-shots (graze, spark, death) and total silence
between them. The fix is deliberately NOT a composed loop, for two reasons
that reinforce each other:

**Repetition on short replayed sessions.** A run lasts 30–90 seconds and the
whole game is built to make you replay it immediately. Any composed loop
short enough to fit a session becomes recognisable within a handful of runs
— and a player on their twentieth attempt of the evening would be hearing
the same passage for the twentieth time, at exactly the moment frustration
is highest. Generative layers dissolve that: rhythm and melody are drawn per
bar from a scale and a per-run seed, so no two runs sound identical and
there is no "passage" to recognise at all.

**Coherence with the zero-file pillar.** Everything visual is generated at
boot; shipping an .ogg would be the first asset file in the project. Layers
of oscillators ARE the native musical form of that pillar — and they run on
the effects' own AudioContext, never a second one, because two contexts is
two audio threads for no benefit.

**The music doubles the visual reading instead of competing with it.** Every
input it listens to already has a visual voice, and the mapping is the same:

| state          | eyes                        | ears                          |
| -------------- | --------------------------- | ----------------------------- |
| tier           | sky colour, tree species    | tonality (root note glides)   |
| multiplier     | trail density, brightness   | rhythm density, filter opens  |
| combo lost     | scenery cools, desaturates  | layers retreat, filter closes, the air rises |
| Full Moon      | golden veil, blazing trail  | melody enters                 |
| Eclipse        | moon veiled to a corona, the witch is the light | shimmer enters, melody lifts an octave |
| Percée approach| scenery desaturates         | the bed hollows out (duck)    |
| crossing       | slow motion owns the screen | silence — the music steps aside |

Nothing in the music carries NEW information — that would make it a HUD for
the ears, something to parse. It says what the screen already says, in a
register the player absorbs without attention. That is also why it sits
clearly under the effects in volume: the swoosh and the chime are feedback
about THIS graze; the music is weather.

**Why layers fade instead of switching.** A layer that starts at combo 2 and
stops at combo 0 would turn the combo timer into a metronome of punishments —
a hard audio cut reads as an event, and losing the combo is already
punished enough. Retreating by fade is the sonic equivalent of the scenery's
desaturation: a mood draining, not a door slamming.

**Why the reverb is generated.** Dry oscillators sound like a test tone
because every recorded instrument stands in a room; the room IS most of the
difference between "oscillator" and "produced". A ConvolverNode needs an
impulse response, which is normally a file — but an IR is just shaped noise,
so it is computed at boot instead: stereo noise under an exponential decay,
low-passed harder as the tail ages so the room darkens the way real rooms
do. The pillar holds even here. The voices got the same treatment: plucks
carry an octave partial, a breath of noise at note-on and a pitch that
settles from a hair sharp (a plucked string does exactly that); the rhythm
is a pitch-falling thump — a drum skin, not a note.

**Mechanics.** One singleton, because the bed must carry across the
menu -> run -> death loop without a seam inside the 300 ms replay rule.
Standing oscillators start once and are mixed (starting nodes clicks; a
60 fps loop must never allocate audio nodes per frame — the scheduled plucks
are the only transients, a handful per second). Levels move through
per-frame exponential smoothing: every toggle, pause, tier change or mode
change is a ramp. The grid schedules one look-ahead beat, so a dropped frame
never drops a note, and the whole engine is O(1) per frame — nothing shows
up against the 60 fps budget at The Wall.

### The perfect graze

Grazing was binary: you did it or you did not. Grading it by closeness turns
the game's ONE skill into a depth ladder without adding a single system —
the same move, done better, pays and feels better, and the player's inner
sentence changes from "I survived" to "I can do better".

The grade is judged on `obstacle.minDistance`, the closest surface distance
reached during the pass — the measurement the ring, the slow motion and the
lifetime "closest graze" stat already used, so no new geometry exists. The
bands NEST inside what was already there: needle (11 px) < close (16) <
slow-motion (18) < the ring (38), and the needle window sits 3 px above the
8 px lethal radius — rare by construction, no rarity logic needed.

Rewards stay wordless (the no-words rule): close pays 15 x multiplier
instead of 10 and announces itself with a gold-violet burst and a SHARPER
chime (the swoosh peak rises 1.3x — thinner, not louder: closeness is heard
before the number is read); needle adds one breath of light on the witch.
The floating gain stays numeric, merely larger and gold. Nothing is added
for the needle's score: the flash and the slow motion ARE the reward, and a
third pay tier would demand a third readable difference no one would parse
at 260 px/s.

### The first three trees

The docs forbid tutorial text, and the first ten seconds are everything —
so the forest teaches with choreography. On runs before the first graze
ever (`moonwick:tutorialDone` unset), the first spawns are authored: trunks
— the most readable shape, hole near the flight line — with the tier's gap
widened by `ONBOARDING.gapScales` (1.45, then 1.2), then the real rhythm
from the third tree. A huge halo the player practically falls through, a
slightly tighter one to confirm the hunch, and the game proper.

Three properties made this safe to author:
- **wider is strictly easier**, so the fairness cap, the reachability logic
  and the bot-clearable Edge guarantee hold without a new assertion;
- **it composes with MERCY** — both multiply the gap, so a struggling first
  player gets both, which is exactly right;
- **it disappears by itself**: the sequence re-arms every run until the
  first successful graze, then never again — the flag that gates the
  first-graze celebration already existed, and this reads the same one.

The celebration itself was strengthened with the choreography (slow motion
260 -> 380 ms, flash 0.22 -> 0.3, sparks 26 -> 40): the moment the game
clicks happens exactly once, and now the opening walks the player to it.

### The Daily Moon

A daily run is the cheapest social hook a backendless game can have: same
forest for everyone, compare scores anywhere people already talk. The seed
is the UTC date hashed — no server, no accounts, and "did you fly today's
moon?" works across the planet because UTC is the same planet-wide.

**What "the same forest" means.** The spawner's gameplay draws — intervals,
categories, gap sizes, gap positions, branch sides — funnel through one
`rand()` that a seed can replace. The cosmetic silhouette-variant picks
deliberately stay free: course parity is COLLISION parity, and two players
may see differently barked trees in the same places. Seeding the bark would
buy nothing and cost the visual variety between attempts.

**Why unlimited attempts.** One-attempt dailies punish the accidental
early tap — brutal in a game whose replay tap is deliberately live
everywhere. Unlimited attempts on a fixed course turn the daily into the
game's only PRACTISABLE run: the forest stops being luck, mastery of a
specific line becomes possible, and the day's best is a claim worth
sharing. The record keeps best-of-day and the attempt count.

**Why MERCY and the authored opening are off.** Both personalise the
course — easing widens gaps for struggling players, the onboarding widens
the first trees for new ones. Admirable in free flight, poison here: a
daily where two players flew different forests is not a daily. This is the
one place the game's kindness steps back, and it steps back silently.

**Why a daily flight still feeds the classic records.** A run is a run:
its grazes, stats and history are real. Splitting daily numbers from
classic ones would double every record surface for no player benefit —
the only daily-specific fact worth keeping is the day's best, and it dies
with the date.
### The PWA shell

Sixty percent of the "mobile app" feel costs nothing at the app stores: an
install banner, a home-screen icon, fullscreen chrome, offline load. Doing
it BEFORE Capacitor (which stays P7) means the web version everyone can
reach today already feels like the app — and everything here carries over
unchanged when the wrapper arrives.

**Why the manifest is a blob.** A manifest normally means a JSON file and a
folder of PNG icons — the first asset files in a project whose pillar is
having none. But a manifest is just JSON and an icon is just pixels, so
both are built at boot: the icons drawn by `drawCrescentMark` (the same
routine as the lockup, the share image and the favicon — the mark cannot
fork into an "app icon variant"), the manifest assembled and linked as an
object URL. Chrome installs from it; iOS takes the same canvas as a data-URI
`apple-touch-icon`. Every icon size is above the 88 px two-tier threshold,
so the witch rides on the home screen too.

**Why network-first, not precache.** Vite hashes every filename, so a
precache manifest would need a build plugin and a version dance. The game
has no backend and no dynamic data: "whatever loaded once" IS the app.
Network-first with runtime caching gets both properties for a page of code:
online you always run the newest deploy, offline you run the last good
load. The fonts cache as they flow past; if a cold offline start misses
them, the boot's 2.5 s font race already degrades to system faces by
design.

**Why the rotate guard has no words.** It is interface shown before the
game exists, so i18n cannot dress it — and it does not need dressing: a
phone outline and a golden arrow rotating is legible in every language,
which is the same bet the game itself makes everywhere. It engages only on
coarse pointers in short-landscape: a desktop browser window is landscape
all day, and a guard that nagged it would be worse than none.
### The impact beat

The death screen used to replace the world on the very same frame the
collision landed. That was the right instinct for replay speed — and it hid
the answer to "what happened?" at the exact moment the player asked it. The
docs' own success criterion is wanting to replay immediately; a death that
reads as arbitrary is the one thing that breaks that want.

So death now has a beat, and it is INFORMATION, not drama:

- **a cold spark at the precise contact point** — `Obstacle.contactPoint`
  computes the closest point on the same collision shapes `distanceTo`
  reads, so the spark can never appear anywhere the collision did not
  happen;
- **the killer's moon-rim flashes bright** for the whole beat — of the
  several trees on screen, THIS one ended the run;
- **the witch recoils off the contact**, a 12 px position-only tween: the
  hitbox is dead, the art tells the story.

The spark is violet-white and never gold. Gold is the reward colour, and a
death that glitters gold for even a frame muddles the game's one economy.

**The hold delays pixels, never input.** `onPointerDown` reads the `dead`
flag, not any visibility, so the replay tap works from the first frame of
the beat exactly as it worked on the first frame of the old screen. A
mid-beat tap restarts instantly; `resetRun` cancels the pending reveal, or
the rest screen would drop onto the new run 420 ms in. The rule in
CLAUDE.md was amended rather than bent: what must be synchronous is the
INPUT and the death-screen content, and both still are.

420 ms is deliberate: long enough to read one spark and one flash, shorter
than the shortest anger. Players who tap through it lose nothing — the
information was for the ones who paused.

### The Eclipse — the state above Full Moon

Full Moon was a ceiling with nothing behind it: the multiplier caps at x5 on
the eighth chained graze, and the ninth felt identical to the eighth. For
the players the whole game is built for — the ones who hold the cap for ten,
twenty seconds — the climax went flat exactly where their skill kept
climbing. The Eclipse is what stands above it: HOLD the cap for
`ECLIPSE.holdSeconds` (6) of continuous Full Moon and the moon is veiled.

**The trigger is timed, not counted.** A graze count was considered and
rejected: the spawn interval shrinks tier by tier, so "four more grazes"
is a faster feat on The Wall than on The Edge, and the state above the
game's climax must mean the same thing everywhere. Holding is also the
actual skill being measured — the combo timer only survives at the cap
through relentless grazing, so a timed fuse counts the grazes implicitly,
weighted exactly the way the game itself weighs them. The fuse resets the
instant the multiplier leaves x5: an Eclipse is one unbroken hold, never
an accumulation.

**It pays nothing, on purpose.** The multiplier stays x5, grazes score
exactly what they scored, and no number anywhere changes. Three precedents
converged on this and none of them bent: the omens are purely commemorative,
La Percée is purely visual, and the perfect graze deliberately refused a
third pay tier because "a third readable difference no one would parse at
260 px/s" is not a reward. What the Eclipse grants is the state itself, plus
one line on the Scores page (`eclipses`, `eclipseTime` — the tolerant stats
fields, per the omens' growth rule). Prestige is the correct currency for
the top of the ladder: past x5 the score is already climbing as fast as the
game allows; what the player holding the cap wants is for the game to
*know*. And it is never a shield — one mistake still kills, unchanged.

**The image is an inversion of light.** At Full Moon the moon blazes and the
world turns gold. At the Eclipse the moon goes dark — a disc of near-sky ink
(the moon's own texture, so the cover is exact by construction) slides over
the face, leaving the strengthened glow spilling past its edge as a corona —
and the WITCH becomes the brightest light in the frame: body, rim, aura and
trail lift to hot white-gold, a notch past the Full Moon tint. She spent the
whole game charging her magic on the moon's light; at the top of the chain
she outshines it. The corona and the witch stay in the GOLD register —
reward language — which is what keeps the Eclipse legible against the death
spark's cold violet-white: both darken the world, but one glitters warm.

**The readability invariant decided the architecture.** The eclipse veil is
deep indigo at `veilAlpha` 0.26, normal blend, drawn on the darkness
overlay's own layer — under obstacles, halos, thread and witch. Darkening
only the background *raises* the halos' contrast (the composited-halo floor
is measured against the bare sky beside it), so the invariant holds by
construction rather than by tuning — and it is still ASSERTED, not assumed:
the palette check also composites every tier sky under the Eclipse veil,
both gradient ends, lit and cooled, against the same `HALO_CONTRAST_MIN`
floor, for the day a palette or the veil goes light. The one real risk is stacking: the
combo timer keeps draining between grazes even inside an Eclipse, so the
combo-loss darkness (up to 0.5) and the eclipse veil can sit on the scenery
together. A dev assertion caps their sum at 0.8 — the forest goes deep,
never void.

**Falling is one piece.** The Eclipse ends only when the combo ends: the
timer hits zero, both states fall together in one release (the shadow slides
back out in `exitMs` 420 ms, faster than it came — the world exhales), or
the run ends and the impact beat freezes the eclipsed world as-is, which is
the most dramatic frame the death screen will ever inherit. There is no
half-eclipse and no decay ladder: a state this rare must be binary to stay
legible.

**Wordless, and not a tier.** No text announces it — the two allowed
non-numeric strings (tier names, `percee`) stay exactly two. The name
"Eclipse" exists only on the Scores page, where words are allowed. In the
music it enters the way every state does, as a layer: a standing SHIMMER
pair (octave + twelfth over the pad's root, riding the same tier glide)
fades in over everything, the melody's seeded walk lifts one octave — the
same tune, thinner air — and one soft low bell marks the instant it engages.
The mapping table gains a row: eyes see the moon veiled and the witch
alight; ears hear the shimmer. Nothing new is *said*; the register rises.

**Interactions it deliberately does not have.** Nothing in generation,
difficulty, MERCY or the daily reads the eclipse flag — a daily flight can
eclipse, and everyone's course is still identical, because the state is
cosmetic by charter. Under The Moon's Eye inversion the veil simply darkens
the pale-gold sky a step (0.26 cannot flip its polarity), and the inverted
HUD keeps its colours: the sky stays the HUD's business, and the HUD yields,
never the palette.
