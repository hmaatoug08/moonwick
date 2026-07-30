import Phaser from "phaser";
import {
  AMBIENT,
  DEATH_MESSAGE,
  DEATH_FX,
  DEBUG_HITBOX,
  DEBUG_START_TIER,
  DEBUG_STATS,
  FEEDBACK,
  FIRST_GRAZE,
  FULL_MOON,
  GRAZE_TIERS,
  ONBOARDING,
  GLOBAL_SPEED,
  HISTORY,
  MAGIC,
  MERCY,
  MOON,
  MOON_EYE,
  NEAR_MISS,
  PERCEE,
  PROGRESS_THREAD,
  SAFE_BOTTOM,
  OBSTACLE_ART,
  SCENERY,
  SCORING,
  SHAKE,
  SLOWMO,
  TIER_FX,
  TIERS,
  tierHalo,
  tierSky,
  TRAIL,
  TYPE,
  WITCH,
  WORLD
} from "./config";
import { DeathCategory, deathMessage, onLanguageChange, t } from "./i18n";
import { Difficulty, Obstacle, ObstacleSpawner } from "./obstacles";
import {
  DeathCause,
  isTutorialDone,
  markTutorialDone,
  pushDeath,
  recordDailyRun,
  recordRun,
  shouldEase
} from "./save";
import { hashSeed } from "./rng";
import { ESSENCES, type Essence } from "./obstacleShapes";
import { PerceeMarker, perceeTension } from "./percee";
import { drawHomeIcon } from "./icons";
import { RewardCues } from "./rewardCues";
import { loadLifetimeStats, recordRunStats, type LifetimeStats } from "./stats";
import { music } from "./music";
import { addMoon, NightScenery } from "./scenery";
import { Sfx } from "./sfx";
import { ensureTextures, LIGHT_KEY, LIGHT_SIZE, SPARK_KEY } from "./textures";
import { actionBand, fitText } from "./ui";
import { Witch } from "./witchShape";

/** Current interpolated parameters: difficulty + sky mood. */
type TierParams = Difficulty & {
  skyTop: number;
  skyBottom: number;
  /** Palette fields, rendering only — see TierPalette in config.ts. */
  sceneryTint: number;
  coolValueDrop: number;
};

const MOON_COLOR = 0xf5efd8;

// HUD colours for the normal (dark) palette; MOON_EYE holds the inverted ones.
// Score in cream serif; the multiplier in gold — the reward colour, rationed
// to records, rewards and Full Moon (see TYPE in config.ts).
const HUD_SCORE_COLOR = TYPE.cream;
const HUD_MULT_COLOR = TYPE.gold;

/** Zeroed per-essence counters, for the run's graze breakdown. */
function emptyEssenceCounts(): Record<Essence, number> {
  const out = {} as Record<Essence, number>;
  for (const essence of ESSENCES) out[essence] = 0;
  return out;
}

/** Where the frozen thread sits on the death screen: clear of Replay. */
const THREAD_DEATH_Y = 678;

/**
 * The death screen's way out. Icon only, faint, top-left — the far corner from
 * Replay, which owns the bottom band.
 */
const DEATH_HOME = {
  x: 48,
  y: 54,
  /** Touch target, well past the 48 px floor. */
  touch: 64,
  /** Icon scale. Bigger than it was, still a fraction of the Replay band. */
  scale: 1.25,
  /**
   * Opacity. Raised from 0.45: at that level the icon was legible only if you
   * already knew it was there. It has to be findable — "low presence" means
   * quiet next to Replay, not invisible.
   */
  alpha: 0.85
} as const;

/**
 * Minimum distance between ANY interactive element on the death screen and the
 * Replay band. A mis-tap here does not cost a menu trip — it throws the player
 * out of the replay loop entirely, which is the one thing the screen exists to
 * protect.
 */
const REPLAY_CLEARANCE = 80;
const REPLAY_TOP = 706;

// --- Guard rail (dev only): nothing interactive may crowd Replay.
if (import.meta.env.DEV) {
  const homeBottom = DEATH_HOME.y + DEATH_HOME.touch / 2;
  if (REPLAY_TOP - homeBottom < REPLAY_CLEARANCE) {
    throw new Error(
      `The death screen's Home button reaches y=${homeBottom}, only ` +
        `${REPLAY_TOP - homeBottom}px above the Replay band — under the ` +
        `${REPLAY_CLEARANCE}px clearance. Move it further from Replay.`
    );
  }
  if (DEATH_HOME.touch < 48) {
    throw new Error(`The death screen's Home touch target is ${DEATH_HOME.touch}px, under 48.`);
  }
}

/** Free band where the death-screen witch roams (above all the text). */
const DEATH_WITCH_Y = 168;

/**
 * Depths — readability INVARIANT: the darkening overlay (2) sits UNDER the
 * obstacles and their halos (3, see obstacles.ts), the trail (4) and the
 * witch (5). It only darkens the background and scenery (0-1).
 */
const DEPTH_AMBIENT = 1;
const DEPTH_DARKNESS = 2;

/**
 * The main gameplay scene.
 * Score comes EXCLUSIVELY from grazes. The particle trail is the primary
 * indicator of the multiplier (the HUD number is only a reminder); a graze
 * nudges the camera and whistles, an extreme graze triggers slow motion, and
 * hitting the combo cap flips the scene into Full Moon.
 *
 * The magic gauge DOES NOT KILL: it is the multiplier timer, and the
 * darkening that goes with it is pure visual feedback.
 * You only die by touching an obstacle.
 */
export class FlightScene extends Phaser.Scene {
  private witch!: Witch;
  private velocityY = 0;
  private holding = false;
  /** false = the finger currently down does not steer (it was a replay tap). */
  private armed = true;
  private spawner!: ObstacleSpawner;

  private score = 0;
  private combo = 0;
  /** Obstacles passed since the start of the current run through the dark. */
  private darkStreak = 0;
  /** Magic gauge, in seconds left. At 0 the multiplier drops back. */
  private magic: number = MAGIC.max;
  /** Flicker wave phase; advances for as long as we are flickering. */
  private flickerPhase = 0;
  private dead = false;
  /** Which contextual sentence the death screen is currently showing. */
  private deathCategory: DeathCategory = "default";
  /** Seconds actually flown this run (unaffected by DEBUG_START_TIER). */
  private runDuration = 0;

  /** Elapsed play time (s) — drives the tiers. Frozen on death. */
  private runTime = 0;
  private tierIndex = 0;
  /** Parameters at the last tier change (the lerp's starting point). */
  private diffFrom!: TierParams;
  /** Effective parameters for the current frame. */
  private diffCurrent!: TierParams;
  private transitionT: number = TIER_FX.transitionS;

  /** Seconds of slow motion left. */
  private slowMoLeft = 0;
  /** The system asks for reduced motion: no shake, no slow motion. */
  private reducedMotion = false;
  private fullMoon = false;
  private readonly sfx = new Sfx();

  private trailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambient!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Close-graze burst and needle-thread flash: pooled feedback objects. */
  private grazeBurst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private needleFlash!: Phaser.GameObjects.Image;
  /** Key of the last mood state applied (avoids pointless redraws). */
  private lastAmbianceKey = "";
  /** Current HUD polarity, so colours are only reassigned when it flips. */
  private hudInverted = false;
  /** Current obstacle outline alpha (rises as the light fades). */
  private obstacleStrokeAlpha: number = OBSTACLE_ART.rimAlphaLit;
  private sky!: Phaser.GameObjects.Graphics;
  private scenery!: NightScenery;
  private tierText!: Phaser.GameObjects.Text;
  private moon!: Phaser.GameObjects.Image;
  private moonIdleGlow!: Phaser.GameObjects.Image;
  private moonGlow!: Phaser.GameObjects.Arc;
  private moonVeil!: Phaser.GameObjects.Rectangle;

  private darkness!: Phaser.GameObjects.RenderTexture;
  private lightBrush!: Phaser.GameObjects.Image;
  private magicFill!: Phaser.GameObjects.Rectangle;
  private floaters: Phaser.GameObjects.Text[] = [];

  private scoreText!: Phaser.GameObjects.Text;
  private multiplierText!: Phaser.GameObjects.Text;
  private deathPanel!: Phaser.GameObjects.Container;
  private deathScoreText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  /** Bottom progress thread: static track redrawn per run, plus a moving dot. */
  private threadGfx!: Phaser.GameObjects.Graphics;
  private threadDot!: Phaser.GameObjects.Image;
  /** Seconds the thread spans. Fixed at reset so the scale never slides. */
  private threadSpan: number = PROGRESS_THREAD.minSpan;
  /** True while a Percée crossing owns the screen: the thread steps aside. */
  private perceeSlowMo = false;

  private homeIcon!: Phaser.GameObjects.Graphics;
  private replayLabel!: Phaser.GameObjects.Text;
  private pauseTitleText!: Phaser.GameObjects.Text;
  private pauseHintText!: Phaser.GameObjects.Text;
  private homeZone!: Phaser.Geom.Rectangle;

  /** Animated death-screen scenery: same spirit as the home screen. */
  private deathScene: Array<{ setVisible(v: boolean): void }> = [];
  private deathScenery!: NightScenery;
  private deathWitch!: Witch;
  private deathDust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private deathTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Best combo reached in the current run. */
  private bestComboThisRun = 0;
  /** Grazes completed in the current run — logged for tuning. */
  private grazesThisRun = 0;

  // --- Lifetime-stats accumulators. Held in memory for the whole run and
  // flushed to storage EXACTLY ONCE, in die(): no write ever happens mid-run.
  private grazesByEssenceThisRun: Record<Essence, number> = emptyEssenceCounts();
  private combosByTierThisRun: Record<number, number> = {};
  private closestGrazeThisRun = Infinity;
  private fullMoonTimeThisRun = 0;
  private reachedFullMoonThisRun = false;
  /** Timestamps (run seconds) of recent grazes, for the grazes-per-second peak. */
  private readonly grazeTimes: number[] = [];
  private bestGrazesPerSecondThisRun = 0;
  /** True once the run has left the highest tier it reached. */
  private clearedTierReached = false;
  /** Lifetime stats, re-read at reset and refreshed by the write in die(). */
  private lifetime: LifetimeStats = loadLifetimeStats();
  /**
   * Run seconds at which the Percée marker stands, or 0 when there is none —
   * a first run, or a record too short to be worth a monument.
   */
  private perceeTime = 0;
  private perceeCrossed = false;
  private percee!: PerceeMarker;
  /** 0 outside the approach, 1 at the marker. Atmosphere only. */
  private perceeT = 0;
  /** What actually killed her, captured at the moment of contact. */
  private deathCause: DeathCause = "branch";
  /** The exact contact, for the impact beat. Null once consumed or reset. */
  private deathImpact: { x: number; y: number; obstacle: Obstacle } | null = null;
  /** Pending reveal of the rest screen; cancelled by a mid-beat replay tap. */
  private deathReveal?: Phaser.Time.TimerEvent;
  /**
   * Adaptive easing is on for this run. Decided at reset from the death log,
   * lifted mid-run once the player clears MERCY.clearSeconds. Never surfaced
   * to the player in any way.
   */
  private easing = false;
  /** Furthest tier reached in the current run. */
  private bestTierThisRun = 0;
  private fpsText?: Phaser.GameObjects.Text;
  private debugGfx?: Phaser.GameObjects.Graphics;

  private lastDrawnScore = -1;
  private lastDrawnCombo = -1;

  /** First-run onboarding: active until the first successful graze. */
  /** This run is the player's first ever: the first graze gets celebrated once. */
  private firstGrazeEver = false;
  private cues!: RewardCues;

  /** The run is a Daily Moon attempt: seeded course, no personalisation. */
  private dailyMode = false;
  /** UTC date of the attempt in flight, the daily record's key. */
  private dailyDate = "";

  /** Pause (tab in the background): the world is frozen, you cannot die. */
  private paused = false;
  private pausePanel!: Phaser.GameObjects.Container;
  private onVisibilityChange?: () => void;

  constructor() {
    super("flight");
  }

  /**
   * The Daily Moon: started with `{ daily: true }` from the home screen.
   * The flag lives for the scene's whole life, so in-place replays stay on
   * the daily; going home and tapping play returns to free flight.
   */
  init(data?: { daily?: boolean }): void {
    this.dailyMode = data?.daily === true;
  }

  private get multiplier(): number {
    return Math.min(1 + this.combo * NEAR_MISS.multiplierStep, NEAR_MISS.multiplierMax);
  }

  /** 0 at x1, 1 at the cap: drives every visual intensity. */
  private get comboRatio(): number {
    const span = NEAR_MISS.multiplierMax - 1;
    return span <= 0 ? 1 : Phaser.Math.Clamp((this.multiplier - 1) / span, 0, 1);
  }

  /**
   * Flickering = the final stretch before the multiplier is lost.
   * It is a WARNING, no longer a reprieve before death, so we only trigger it
   * when there actually is a multiplier to lose.
   */
  private get flickering(): boolean {
    return this.combo > 0 && this.magic > 0 && this.magic <= MAGIC.flickerGrace;
  }

  create(): void {
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // Night sky gradient, redrawn on every tier change (mood).
    this.sky = this.add.graphics();

    // Living background — stars, parallax treelines, mist. Added right after
    // the sky so it stays under the moon, the dust (1), the darkness overlay
    // (2) and the whole gameplay layer: pure scenery, per the invariant.
    this.scenery = new NightScenery(this);

    // Moon + its Full Moon halo (invisible until the multiplier hits the cap).
    this.moonGlow = this.add
      .circle(MOON.x, MOON.y, FULL_MOON.glowRadius, FULL_MOON.glowColor, 1)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    const moonPieces = addMoon(this, MOON_COLOR);
    this.moon = moonPieces.moon;
    this.moonIdleGlow = moonPieces.glow;

    ensureTextures(this);

    // Ambient dust: background scenery, under the overlay (it thins out and
    // cools down as magic fades).
    this.ambient = this.add.particles(0, 0, SPARK_KEY, {
      x: { min: 0, max: WORLD.width },
      y: { min: 0, max: WORLD.height },
      lifespan: AMBIENT.lifespanMs,
      speedX: { min: -AMBIENT.driftMax, max: -AMBIENT.driftMin },
      speedY: { min: -8, max: 8 },
      scale: AMBIENT.scale,
      alpha: { start: AMBIENT.alphaLit, end: 0 },
      tint: AMBIENT.colorLit,
      frequency: AMBIENT.frequencyLit,
      blendMode: Phaser.BlendModes.ADD
    });
    this.ambient.setDepth(DEPTH_AMBIENT);

    // Close-graze burst: a pinch of gold and violet at the graze point, and
    // the needle-thread flash for the rarest passes. Pooled, never per-graze.
    this.grazeBurst = this.add.particles(0, 0, SPARK_KEY, {
      speed: { min: 40, max: 150 },
      lifespan: 420,
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.9, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false
    });
    this.grazeBurst.setDepth(6);
    this.needleFlash = this.add
      .image(0, 0, LIGHT_KEY)
      .setDisplaySize(GRAZE_TIERS.flashSizePx, GRAZE_TIERS.flashSizePx)
      .setTint(0xfff6e2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false)
      .setDepth(6);

    // Trail: a single emitter following the witch, tuned by the combo.
    this.trailEmitter = this.add.particles(0, 0, SPARK_KEY, {
      frequency: TRAIL.frequencyIdle,
      lifespan: TRAIL.lifespanIdle,
      speed: { min: TRAIL.driftMin, max: TRAIL.driftMax },
      angle: { min: 180 - TRAIL.spreadDeg, max: 180 + TRAIL.spreadDeg },
      scale: TRAIL.scaleIdle,
      alpha: { start: TRAIL.alphaIdle, end: 0 },
      tint: TRAIL.colorIdle,
      blendMode: Phaser.BlendModes.ADD,
      quantity: 1
    });
    this.trailEmitter.setDepth(4);

    // The witch. `witch.x/y` is her TORSO — the very point the lethal circle
    // is centred on, so art and collision cannot drift apart.
    this.witch = new Witch(this, WITCH.x, WORLD.height / 2, 5);
    this.trailEmitter.startFollow(this.witch.follow, TRAIL.offsetX, 0);

    this.spawner = new ObstacleSpawner(this);

    // Golden Full Moon veil: flips the whole palette in one go.
    this.moonVeil = this.add
      .rectangle(0, 0, WORLD.width, WORLD.height, FULL_MOON.veilColor, 1)
      .setOrigin(0, 0)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(14);

    // Falling night: a black veil pierced by a light hole on the witch.
    // UNDER the obstacles, their halos and the witch (readability invariant):
    // it only darkens the background and the scenery.
    this.darkness = this.add
      .renderTexture(0, 0, WORLD.width, WORLD.height)
      .setOrigin(0, 0)
      .setDepth(DEPTH_DARKNESS);
    this.lightBrush = this.make.image({ key: LIGHT_KEY, add: false }).setOrigin(0.5);

    // Tier announcement: the place's name in serif, centred, above the veil.
    this.tierText = this.add
      .text(WORLD.width / 2, WORLD.height * 0.42, "", {
        fontFamily: TYPE.serif,
        fontStyle: "400",
        fontSize: "42px",
        color: TYPE.cream
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setAlpha(0);

    // Reward cues: fireflies in the graze ring and the value tag. They replaced
    // the onboarding word — no instruction text exists during play any more.
    // Just above the obstacles (3) so the halo does not swallow them, below the
    // trail (4) and the witch (5).
    this.cues = new RewardCues(this, 3.5);

    // The record, standing in the forest. Behind the obstacles (3) so it can
    // never compete with them for readability.
    this.percee = new PerceeMarker(this, 2.5);

    // The progress thread along the bottom edge. Also UNDER the obstacles: an
    // obstacle crossing it must hide the thread, never the other way round.
    this.threadGfx = this.add.graphics().setDepth(2.7);
    this.threadDot = this.add
      .image(0, this.threadY, SPARK_KEY)
      .setDisplaySize(PROGRESS_THREAD.dotSize, PROGRESS_THREAD.dotSize)
      .setTint(PROGRESS_THREAD.dotColor)
      .setAlpha(PROGRESS_THREAD.dotAlpha)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(2.7);

    this.buildHud();
    this.buildDeathScene();
    this.buildDeathPanel();
    this.buildPausePanel();

    if (DEBUG_HITBOX) this.debugGfx = this.add.graphics().setDepth(25);

    // Automatic pause as soon as the tab goes to the background: you cannot
    // die while away. Resuming is done with a tap.
    this.onVisibilityChange = () => {
      if (document.hidden) this.pauseRun();
    };
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.game.events.on(Phaser.Core.Events.BLUR, this.pauseRun, this);
    // Remove the global listeners if the scene stops (returning to the menu).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.onVisibilityChange) {
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
      }
      this.game.events.off(Phaser.Core.Events.BLUR, this.pauseRun, this);
    });

    // Input: pointer held down = upward thrust.
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on("pointerup", () => {
      this.holding = false;
      // The finger is up: the next press steers again.
      this.armed = true;
    });

    this.refreshTexts();
    this.resetRun();

    // Immediate refresh when the language changes, with no reload.
    const unsubscribeLang = onLanguageChange(() => this.refreshTexts());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribeLang);
  }

  private buildHud(): void {
    // Serif light numeral with a dark halo: readable over any sky, and quiet
    // in a way the old 64 px bold sans never was.
    this.scoreText = this.add
      .text(WORLD.width / 2, 44, "0", {
        fontFamily: TYPE.serif,
        fontStyle: "300",
        fontSize: "72px",
        color: HUD_SCORE_COLOR
      })
      .setOrigin(0.5, 0)
      .setDepth(20);
    this.scoreText.setShadow(0, 0, "rgba(5,4,12,0.9)", 22, false, true);

    // The multiplier is a small-caps mark in gold — the reward colour, since
    // the multiplier IS the reward. Letterspaced by hand (canvas has no
    // font-variant), same recipe as every label.
    this.multiplierText = this.add
      .text(WORLD.width / 2, 126, "×1", {
        fontFamily: TYPE.sans,
        fontStyle: "700",
        fontSize: "13px",
        color: HUD_MULT_COLOR
      })
      .setOrigin(0.5, 0)
      .setDepth(20);
    this.multiplierText.setLetterSpacing(13 * 0.3);

    // Magic gauge: thin, discreet bar just below the multiplier.
    const barX = (WORLD.width - MAGIC.barWidth) / 2;
    this.add
      .rectangle(barX, MAGIC.barY, MAGIC.barWidth, MAGIC.barHeight, 0xffffff, MAGIC.barTrackAlpha)
      .setOrigin(0, 0.5)
      .setDepth(20);
    this.magicFill = this.add
      .rectangle(barX, MAGIC.barY, MAGIC.barWidth, MAGIC.barHeight, MAGIC.barColor, 0.9)
      .setOrigin(0, 0.5)
      .setDepth(20);

    // Debug overlay: only created when DEBUG_STATS is on (never in production).
    if (DEBUG_STATS) {
      this.fpsText = this.add
        .text(8, 8, "", { fontFamily: "monospace", fontSize: "12px", color: "#8877aa" })
        .setDepth(20);
    }
  }

  /**
   * Death-screen scenery: an opaque sky that fully hides the lost run, plus
   * the moon, the dust and a roaming witch — the same visual rest as the home
   * screen. Built ONCE (a restart only toggles visibility, so it stays under
   * 300 ms).
   */
  private buildDeathScene(): void {
    const tier = TIERS[0];

    const sky = this.add.graphics().setDepth(28);
    sky.fillGradientStyle(tier.palette.skyTop, tier.palette.skyTop, tier.palette.skyBottom, tier.palette.skyBottom, 1);
    sky.fillRect(0, 0, WORLD.width, WORLD.height);

    // The same living background as the run, lifted above the dead world.
    this.deathScenery = new NightScenery(this).setDepth(28);
    this.deathScenery.setMood(tier.palette.skyTop, tier.palette.skyBottom, tier.palette.sceneryTint);

    // Soft glow: the radial texture, not a solid circle (ugly hard edge).
    const glow = this.add
      .image(MOON.x, MOON.y, LIGHT_KEY)
      .setDisplaySize(340, 340)
      .setTint(FULL_MOON.glowColor)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(28);
    const moonPieces = addMoon(this, MOON_COLOR, 28);
    const moon = moonPieces.moon;

    this.deathDust = this.add
      .particles(0, 0, SPARK_KEY, {
        x: { min: 0, max: WORLD.width },
        y: { min: 0, max: WORLD.height },
        lifespan: AMBIENT.lifespanMs,
        speedX: { min: -AMBIENT.driftMax, max: -AMBIENT.driftMin },
        speedY: { min: -8, max: 8 },
        scale: AMBIENT.scale,
        alpha: { start: AMBIENT.alphaLit, end: 0 },
        tint: AMBIENT.colorLit,
        frequency: AMBIENT.frequencyLit,
        blendMode: Phaser.BlendModes.ADD
      })
      .setDepth(29);

    // Golden "great run" trail, same as on the menu.
    this.deathTrail = this.add
      .particles(0, 0, SPARK_KEY, {
        frequency: 16,
        lifespan: 520,
        speed: { min: TRAIL.driftMin, max: TRAIL.driftMax },
        angle: { min: 180 - TRAIL.spreadDeg, max: 180 + TRAIL.spreadDeg },
        scale: 0.55,
        alpha: { start: 0.65, end: 0 },
        tint: TRAIL.colorMax,
        blendMode: Phaser.BlendModes.ADD
      })
      .setDepth(29);

    this.deathWitch = new Witch(this, WORLD.width / 2, DEATH_WITCH_Y, 29);
    this.deathTrail.startFollow(this.deathWitch.follow, TRAIL.offsetX, 0);

    this.deathScene = [
      sky,
      this.deathScenery,
      glow,
      moonPieces.glow,
      moon,
      this.deathDust,
      this.deathTrail,
      this.deathWitch
    ];
    this.setDeathSceneVisible(false);
  }

  private setDeathSceneVisible(on: boolean): void {
    for (const object of this.deathScene) object.setVisible(on);
    // The emitters only run while the screen is showing.
    if (on) {
      this.deathDust.start();
      this.deathTrail.start();
    } else {
      this.deathDust.stop();
      this.deathDust.killAll();
      this.deathTrail.stop();
      this.deathTrail.killAll();
    }
  }

  /** The death-screen witch roams inside the free band at the top. */
  private updateDeathScene(time: number, dt: number): void {
    this.deathScenery.update(dt, SCENERY.menuDriftPxS);
    const t = time / 1000;
    const y = DEATH_WITCH_Y + Math.sin(t * 1.6) * 26;
    // Her own vertical speed drives the tilt, so she banks through the loop.
    const vy = (y - this.deathWitch.y) / Math.max(dt, 1 / 240);
    this.deathWitch.x = WORLD.width * 0.5 + Math.sin(t * 0.75) * WORLD.width * 0.34;
    this.deathWitch.y = y;
    this.deathWitch.update(dt, vy, WITCH.maxSpeed, 0);
  }

  private buildDeathPanel(): void {
    const cx = WORLD.width / 2;

    // Light veil: the animated scenery stays visible beneath, text stays crisp.
    const veil = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x05030c, 0.34).setOrigin(0, 0);

    // THE SCORE, very large: a serif light numeral, not a poster headline.
    this.deathScoreText = this.add
      .text(cx, 350, "0", {
        fontFamily: TYPE.serif,
        fontStyle: "300",
        fontSize: "132px",
        color: TYPE.cream
      })
      .setOrigin(0.5);

    // A short hairline separates the number from its sentence — the same
    // gesture as the header dividers, without the diamond.
    const messageRule = this.add.rectangle(cx, 434, 68, 1, TYPE.hairline, 0.45);

    // ONE line: the contextual message, or the gap to the record when there is
    // one to chase. Serif italic — spoken, not printed. Word-wrapped rather
    // than shrunk, so a long sentence in any language stays readable.
    this.messageText = this.add
      .text(cx, 496, "", {
        fontFamily: TYPE.serif,
        fontStyle: "italic 400",
        fontSize: "27px",
        color: "#d7cfe8",
        align: "center",
        wordWrap: { width: WORLD.width - 96 }
      })
      .setOrigin(0.5);

    // The way out: icon only, low opacity, no frame. BIG TARGET, LOW PRESENCE.
    //
    // Top-left, as far from Replay as the screen allows. Replay owns the whole
    // bottom band and is what the player is reaching for; an exit anywhere near
    // it gets hit by accident and throws them out of the loop. The gap is
    // asserted below, not just intended.
    this.homeIcon = this.add.graphics().setAlpha(DEATH_HOME.alpha);
    drawHomeIcon(this.homeIcon, DEATH_HOME.x, DEATH_HOME.y, DEATH_HOME.scale, 1);
    this.homeZone = new Phaser.Geom.Rectangle(
      DEATH_HOME.x - DEATH_HOME.touch / 2,
      DEATH_HOME.y - DEATH_HOME.touch / 2,
      DEATH_HOME.touch,
      DEATH_HOME.touch
    );

    // Replay: fills the whole bottom of the screen, within thumb reach.
    // No dedicated hit zone: any tap outside "Share"/"Home" restarts.
    // Stops short of the safe-area inset: on a phone the last strip is the
    // home indicator's, and a button there is half-swallowed by the system.
    const replayTop = REPLAY_TOP;
    const replayBottom = WORLD.height - SAFE_BOTTOM;
    // THE one filled band of this screen (rule 1): violet gradient under a
    // glowing top hairline, and a letterspaced caps word. No border, no box.
    const replayBg = actionBand(this, replayTop, replayBottom - replayTop);
    this.replayLabel = this.add
      .text(cx, (replayTop + replayBottom) / 2, "", {
        fontFamily: TYPE.sans,
        fontStyle: "600",
        fontSize: "15px",
        color: TYPE.cream
      })
      .setOrigin(0.5);
    this.replayLabel.setLetterSpacing(15 * 0.42);

    // FOUR THINGS, and the way home. Everything else — best scores, history,
    // cause of death, run summary, the tier road — moved to the Scores page,
    // reachable from the home screen only. The death screen had become a wall
    // of numbers between the player and the replay button.
    //
    // The Home label is the one addition to that list: without it a death
    // screen offers replay and nothing else, and there would be no way back to
    // the menu at all. It is a bare label, not a boxed button, so it reads as
    // an exit rather than as a fifth thing to look at.
    this.deathPanel = this.add
      .container(0, 0, [
        veil,
        messageRule,
        this.messageText,
        this.deathScoreText,
        this.homeIcon,
        replayBg,
        this.replayLabel
      ])
      .setDepth(30)
      .setVisible(false);

  }

  /** Freezes the run without killing: called when the tab goes background. */
  private pauseRun(): void {
    if (this.dead || this.paused) return;
    this.paused = true;
    this.holding = false;
    // The real finger state is unknown on return, so we disarm until the next
    // release — otherwise a "ghost" finger would make the witch climb.
    this.armed = false;
    this.pausePanel.setVisible(true);
    // Written straight to the param: the update loop is about to freeze.
    music.duck(true);
  }

  private resumeRun(): void {
    this.paused = false;
    this.pausePanel.setVisible(false);
    music.duck(false);
  }

  private buildPausePanel(): void {
    const cx = WORLD.width / 2;
    const veil = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x05030c, 0.7).setOrigin(0, 0);
    this.pauseTitleText = this.add
      .text(cx, WORLD.height * 0.44, "", {
        fontFamily: TYPE.serif,
        fontStyle: "400",
        fontSize: "40px",
        color: TYPE.cream
      })
      .setOrigin(0.5);
    this.pauseHintText = this.add
      .text(cx, WORLD.height * 0.44 + 58, "", {
        fontFamily: TYPE.sans,
        fontStyle: "600",
        fontSize: "11px",
        color: TYPE.violetDim
      })
      .setOrigin(0.5);
    this.pauseHintText.setLetterSpacing(11 * 0.28);
    this.pausePanel = this.add
      .container(0, 0, [veil, this.pauseTitleText, this.pauseHintText])
      .setDepth(31)
      .setVisible(false);
  }

  /**
   * Every static label in the scene, (re)applied and fitted to its area.
   * Called on start and on every language change — dynamic texts (score, run
   * summary) are refreshed by refreshDeathTexts().
   */
  private refreshTexts(): void {
    // The way home is an icon now: nothing to translate, nothing to fit.
    // Caps recipe: uppercase + tracking (canvas has no font-variant).
    this.replayLabel.setText(t("death.replay").toUpperCase());
    fitText(this.replayLabel, WORLD.width - 48, 15);

    this.pauseTitleText.setText(t("pause.title"));
    fitText(this.pauseTitleText, WORLD.width - 48, 40);
    this.pauseHintText.setText(t("pause.hint").toUpperCase());
    fitText(this.pauseHintText, WORLD.width - 48, 11);


    // A tier name currently being announced changes language too.
    if (this.tierText.alpha > 0) {
      this.tierText.setText(t(TIERS[this.tierIndex].nameKey));
      fitText(this.tierText, WORLD.width - 48, 42);
    }

    if (this.dead) this.refreshDeathTexts();
  }

  /** Labels that depend on the run shown on the death screen. */
  /**
   * The death screen's two texts: the score, and the ONE line beneath it.
   *
   * That line is the gap to the record when there is one to chase — the most
   * useful thing the screen can say, and the whole point of La Percée — and
   * the contextual message otherwise. Never both: the screen shows four things
   * and this is one of them.
   *
   * @param previousBestTime the record before this run, 0 when there is none
   */
  private refreshDeathTexts(previousBestTime = this.perceeTime): void {
    this.deathScoreText.setText(String(this.score));
    fitText(this.deathScoreText, WORLD.width - 48, 132);

    // ONE line, doing both jobs: what happened, and a reason to go again.
    // A single template per variant carries both — the gap used to be a
    // separate sentence glued in front, which is exactly what the
    // anti-concatenation rule forbids.
    const gap = Math.max(0, previousBestTime - this.runDuration);
    this.messageText.setText(
      deathMessage(this.deathCategory, {
        seconds: gap.toFixed(1),
        combo: this.bestComboThisRun,
        tier: t(TIERS[this.bestTierThisRun].nameKey)
      })
    );
    this.messageText.setColor(
      this.deathCategory === "newRecord" ? HISTORY.recordLabelColor : "#d9a7ff"
    );
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // The audio contexts can only open on a user gesture.
    this.sfx.unlock();
    music.unlock();

    if (this.paused) {
      // This tap only resumes: it does not steer.
      this.resumeRun();
      return;
    }

    if (this.dead) {
      // No delay guard: the tap is live from the very first frame of the
      // death screen. Nothing drawn there gates replaying.
      // Only "Home" diverts the tap; everywhere else restarts, so the urge to
      // replay never runs into a dead zone.
      if (this.homeZone.contains(pointer.x, pointer.y)) {
        // Back to the home screen: the scene SHUTDOWN removes the global pause
        // listeners, and the menu will re-read the up-to-date stats.
        this.scene.start("menu");
        return;
      }
      this.resetRun();
      // This tap restarts the run: it must not make the witch climb.
      this.armed = false;
      return;
    }
    if (this.armed) this.holding = true;
  }

  /** In-place restart: neither the scene nor the scenery is rebuilt. */
  private resetRun(): void {
    // The bed swells from rest to the run level — no cut, no restart — and
    // the patterns reseed: two runs must never sound identical.
    music.setMode("run");
    music.reseed();
    this.spawner.reset();
    if (this.dailyMode) {
      // The Daily Moon: everyone flies the SAME forest. The seed is the UTC
      // date, re-armed on every attempt — unlimited attempts, one course.
      // No authored opening here either: personalisation of any kind breaks
      // the parity the daily exists for.
      this.dailyDate = new Date().toISOString().slice(0, 10);
      this.spawner.setSeed(hashSeed(`moonwick:${this.dailyDate}`));
    } else if (!isTutorialDone()) {
      // Before the first graze ever, the forest opens with authored trees: a
      // huge readable invitation, then tighter, then the real rhythm. The
      // choreography re-arms every run until the first graze lands.
      this.spawner.setOnboarding(ONBOARDING.gapScales);
    }
    this.trailEmitter.killAll();

    this.witch.reset(WITCH.x, WORLD.height / 2);
    this.velocityY = 0;
    this.holding = false;

    for (const floater of this.floaters) {
      this.tweens.killTweensOf(floater);
      floater.destroy();
    }
    this.floaters.length = 0;

    this.score = 0;
    this.combo = 0;
    this.darkStreak = 0;
    this.bestComboThisRun = 0;
    this.grazesThisRun = 0;
    this.grazesByEssenceThisRun = emptyEssenceCounts();
    this.combosByTierThisRun = {};
    this.closestGrazeThisRun = Infinity;
    this.fullMoonTimeThisRun = 0;
    this.reachedFullMoonThisRun = false;
    this.grazeTimes.length = 0;
    this.bestGrazesPerSecondThisRun = 0;
    this.clearedTierReached = false;
    this.bestTierThisRun = 0;

    // Where the record stands this run. Re-read here so a record set last run
    // has already moved the marker. Below the threshold there is simply none,
    // and nothing anywhere mentions it.
    this.lifetime = loadLifetimeStats();
    this.perceeTime = this.lifetime.bestTime >= PERCEE.minTime ? this.lifetime.bestTime : 0;
    this.perceeCrossed = false;
    this.perceeT = 0;
    this.perceeSlowMo = false;
    this.percee.reset();
    this.sfx.setTension(0);

    // Starting tier, resolved BEFORE anything that draws: the sky, the halo and
    // the progress thread's polarity all read `diffCurrent`, so the tier has to
    // exist first. Drawing the thread ahead of this line threw on every single
    // run start (`diffCurrent.inverted` on an unassigned field) — the field is
    // declared with `!`, so only the runtime could catch it.
    // Pure data, no side effects: the visual side (ambient, ambiance, tier
    // announcement) stays further down, in its original order.
    const startTier = DEBUG_START_TIER >= 0 ? Math.min(DEBUG_START_TIER, TIERS.length - 1) : 0;
    this.runTime = TIERS[startTier].startTime;
    this.tierIndex = startTier;
    this.diffCurrent = this.tierParams(startTier);
    this.diffFrom = { ...this.diffCurrent };
    this.transitionT = TIER_FX.transitionS;

    // The thread's scale is fixed here so it never slides under the dot.
    this.threadSpan = Math.max(
      PROGRESS_THREAD.minSpan,
      this.perceeTime * PROGRESS_THREAD.spanFactor
    );
    this.drawThread();
    this.updateThread();
    this.runDuration = 0;
    // Read once per run, from the death log. Nothing tells the player.
    // MERCY is OFF on the daily: adaptive easing personalises the course,
    // and the daily's whole point is that everyone flies the same one.
    this.easing = this.dailyMode ? false : shouldEase();
    this.magic = MAGIC.max;
    this.flickerPhase = 0;
    this.slowMoLeft = 0;
    this.tweens.timeScale = 1;
    this.dead = false;
    // A mid-beat replay tap: the pending reveal must die with the old run,
    // or the rest screen would drop onto the new one holdMs later.
    this.deathReveal?.remove();
    this.deathReveal = undefined;
    this.deathImpact = null;
    this.deathPanel.setVisible(false);
    this.setDeathSceneVisible(false);
    this.trailEmitter.start();
    this.ambient.start();
    this.paused = false;
    this.pausePanel.setVisible(false);
    this.debugGfx?.clear();

    // The tier's parameters were resolved above, before anything drew. What is
    // left here is the visual side of the changeover, in its original order:
    // applied at once, with no interpolation carried over from the previous run.
    this.ambient.killAll();
    this.applyAmbiance(true);
    this.announceTier(TIERS[startTier].nameKey);

    // Onboarding: only while the first graze has never succeeded (this
    // persists across runs within the first session).
    this.firstGrazeEver = !isTutorialDone();
    this.cues.reset();

    this.setFullMoon(false, true);
    this.refreshHud();
    this.refreshComboVisuals();
    this.refreshMagic();
  }

  /**
   * A tier's authored values turned into effective ones.
   *
   * GLOBAL_SPEED multiplies the speed and DIVIDES the interval, so the course
   * keeps its exact spatial layout and only time is stretched: the distance
   * between two obstacles stays speed x interval. One knob slows the whole
   * game down without redesigning a single tier.
   */
  private tierParams(index: number): TierParams {
    const tier = TIERS[index];
    const sky = tierSky(tier);
    return {
      speed: tier.scrollSpeed * GLOBAL_SPEED,
      gapSize: tier.gapSize,
      spawnInterval: tier.spawnInterval / GLOBAL_SPEED,
      essence: tier.essence,
      inverted: MOON_EYE.enabled && tier.invertContrast === true,
      haloColor: tierHalo(tier),
      skyTop: sky.top,
      skyBottom: sky.bottom,
      sceneryTint: tier.palette.sceneryTint,
      coolValueDrop: tier.palette.coolValueDrop
    };
  }

  /**
   * The parameters the generator actually gets: the current tier, plus the
   * adaptive easing when it is on. Kept apart from `diffCurrent` so the sky,
   * the tier announcement and the debug readout keep showing the real tier,
   * and only the geometry is quietly relaxed.
   */
  private effectiveDiff(): TierParams {
    if (!this.easing) return this.diffCurrent;
    return {
      ...this.diffCurrent,
      gapSize: this.diffCurrent.gapSize * (1 + MERCY.gapBonus),
      speed: this.diffCurrent.speed * (1 - MERCY.speedRelief)
    };
  }

  /** Last tier whose startTime has been reached. */
  private tierIndexFor(time: number): number {
    let index = 0;
    for (let i = 0; i < TIERS.length; i++) {
      if (time >= TIERS[i].startTime) index = i;
    }
    return index;
  }

  /**
   * Play time -> current tier -> effective parameters.
   * On a tier change: announce the name, then interpolate smoothly over
   * TIER_FX.transitionS to avoid a jolt. The last tier is a plateau: once its
   * transition ends, nothing moves any more.
   */
  private updateDifficulty(dt: number): void {
    this.runTime += dt;
    this.runDuration += dt;

    // The adaptive help lifts the moment the player proves they no longer
    // need it. Mid-run is deliberate: only obstacles generated from here on
    // are normal-sized, so nothing changes shape in front of the player.
    if (this.easing && this.runDuration >= MERCY.clearSeconds) this.easing = false;

    const target = this.tierIndexFor(this.runTime);
    if (target > this.bestTierThisRun) {
      // Leaving a tier means it was cleared; the new one has not been yet.
      this.clearedTierReached = false;
      this.bestTierThisRun = target;
    }
    if (target !== this.tierIndex) {
      this.diffFrom = { ...this.diffCurrent };
      this.tierIndex = target;
      this.transitionT = 0;
      this.announceTier(TIERS[target].nameKey);
    }
    // The final tier is a plateau with no exit: surviving into it is clearing
    // it, otherwise it could never be marked cleared at all.
    if (this.bestTierThisRun === TIERS.length - 1) this.clearedTierReached = true;

    if (this.fullMoon) this.fullMoonTimeThisRun += dt;

    if (this.transitionT < TIER_FX.transitionS) {
      this.transitionT = Math.min(TIER_FX.transitionS, this.transitionT + dt);
      const k = this.transitionT / TIER_FX.transitionS;
      const to = this.tierParams(this.tierIndex);
      this.diffCurrent = {
        speed: Phaser.Math.Linear(this.diffFrom.speed, to.speed, k),
        gapSize: Phaser.Math.Linear(this.diffFrom.gapSize, to.gapSize, k),
        spawnInterval: Phaser.Math.Linear(this.diffFrom.spawnInterval, to.spawnInterval, k),
        // Species does not interpolate: obstacles already on screen keep the
        // one they spawned with, so the changeover rolls in as new trees
        // arrive rather than restyling the forest in place.
        essence: to.essence,
        inverted: to.inverted,
        // The halo does not interpolate either, for the same reason as the
        // species: it is baked into each obstacle's Graphics at spawn.
        haloColor: to.haloColor,
        skyTop: lerpColor(this.diffFrom.skyTop, to.skyTop, k),
        skyBottom: lerpColor(this.diffFrom.skyBottom, to.skyBottom, k),
        // The sky's hue arc is monotone precisely so this RGB lerp never
        // crosses a muddy neutral (dev assertion in config.ts).
        sceneryTint: lerpColor(this.diffFrom.sceneryTint, to.sceneryTint, k),
        coolValueDrop: Phaser.Math.Linear(this.diffFrom.coolValueDrop, to.coolValueDrop, k)
      };
      // The sky redraw goes through applyAmbiance (the lerp changes its key).
    }
  }

  /**
   * Mood = scenery only, never the gameplay layer.
   * As magic fades, the world DESATURATES and cools: blue-grey sky, paler
   * moon, sparser and colder dust. In parallel the obstacle outline gets
   * stronger — their readability is an invariant.
   * Only redraws when the quantised state changed (transition or gauge).
   */
  private applyAmbiance(force = false): void {
    const ratio = Phaser.Math.Clamp(this.magic / MAGIC.max, 0, 1);
    const cold = MAGIC.desatMax * (1 - ratio);
    const key = `${Math.round(cold * 64)}|${this.diffCurrent.skyTop}|${this.diffCurrent.skyBottom}`;
    if (!force && key === this.lastAmbianceKey) return;
    this.lastAmbianceKey = key;

    // HUD polarity follows the background: light-on-dark normally, dark-on-light
    // under the contrast inversion, where the default cream score would sit
    // almost invisibly on pale gold.
    if (this.diffCurrent.inverted !== this.hudInverted) {
      this.hudInverted = this.diffCurrent.inverted;
      this.scoreText.setColor(this.hudInverted ? MOON_EYE.scoreColor : HUD_SCORE_COLOR);
      this.multiplierText.setColor(this.hudInverted ? MOON_EYE.multiplierColor : HUD_MULT_COLOR);
      this.magicFill.setFillStyle(this.hudInverted ? MOON_EYE.magicBarColor : MAGIC.barColor, 0.9);
      // The thread's dot is additive, which is invisible on a pale sky: adding
      // light to something already bright changes nothing. Inverted it becomes
      // a normal-blended dark point instead.
      this.threadDot
        .setTint(this.hudInverted ? MOON_EYE.threadDotColor : PROGRESS_THREAD.dotColor)
        .setBlendMode(this.hudInverted ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
      this.drawThread();
    }

    // Cooled and desaturated sky.
    this.sky.clear();
    // The palette decides how much of the cooling is paid in LUMINANCE rather
    // than in saturation. A drained palette (The Wall, saturation 0.12) has no
    // saturation left to spend, so there the combo loss reads as the sky going
    // darker — otherwise it would be invisible on that tier alone.
    const drop = this.diffCurrent.coolValueDrop;
    const top = coolDesat(this.diffCurrent.skyTop, cold, drop);
    const bottom = coolDesat(this.diffCurrent.skyBottom, cold, drop);
    this.sky.fillGradientStyle(top, top, bottom, bottom, 1);
    this.sky.fillRect(0, 0, WORLD.width, WORLD.height);

    // Paler moon (the texture is white art: the tint carries the colour).
    const moonTint = lerpColor(MOON_COLOR, MAGIC.coldMoonColor, cold);
    this.moon.setTint(moonTint);
    this.moonIdleGlow.setTint(moonTint);

    // Treelines, mist and stars follow the same cooled sky.
    this.scenery.setMood(top, bottom, this.diffCurrent.sceneryTint);

    // Sparser, cooler ambient dust.
    this.ambient.frequency = Phaser.Math.Linear(AMBIENT.frequencyCold, AMBIENT.frequencyLit, ratio);
    this.ambient.setParticleAlpha({
      start: Phaser.Math.Linear(AMBIENT.alphaCold, AMBIENT.alphaLit, ratio),
      end: 0
    });
    this.ambient.setParticleTint(lerpColor(AMBIENT.colorCold, AMBIENT.colorLit, ratio));

    // Guaranteed contrast: the moon rim strengthens as the light fades
    // (applied per obstacle in updateNearMiss).
    this.obstacleStrokeAlpha = Phaser.Math.Linear(
      OBSTACLE_ART.rimAlphaDark,
      OBSTACLE_ART.rimAlphaLit,
      ratio
    );
  }

  /** Tier name in large type: fade in, hold, fade out. */
  private announceTier(nameKey: (typeof TIERS)[number]["nameKey"]): void {
    this.tweens.killTweensOf(this.tierText);
    this.tierText.setText(t(nameKey)).setAlpha(0);
    fitText(this.tierText, WORLD.width - 48, 42);
    this.tweens.add({
      targets: this.tierText,
      alpha: 1,
      duration: TIER_FX.announceFadeMs,
      yoyo: true,
      hold: TIER_FX.announceMs - 2 * TIER_FX.announceFadeMs,
      ease: "Quad.easeOut"
    });
  }

  /**
   * Which sentence fits this run. Fixed priority: a record beats everything,
   * then a near miss on the record, then a long chain, then a run that ended
   * before it started. `previousBest` is the record from BEFORE this run.
   */
  private pickDeathCategory(previousBestTime: number): DeathCategory {
    // The record is a TIME (see La Percée), so the categories are measured in
    // seconds too — that is what lets the line quote the gap and stay honest.
    // `nearRecord` is the only category that can quote `{seconds}`, and it can
    // only be reached when a record actually exists.
    const hasRecord = previousBestTime >= PERCEE.minTime;
    if (hasRecord && this.runDuration > previousBestTime) return "newRecord";
    if (hasRecord && this.runDuration >= previousBestTime * DEATH_MESSAGE.nearRecordRatio) {
      return "nearRecord";
    }
    if (this.bestComboThisRun >= DEATH_MESSAGE.bigComboThreshold) return "bigCombo";
    if (this.runDuration < DEATH_MESSAGE.earlyDeathSeconds) return "earlyDeath";
    return "default";
  }

  /**
   * The fourth and last thing on the death screen: the progress thread, frozen
   * where the run ended, with the record's notch still on it.
   *
   * It is the SAME thread that ran along the bottom edge during play, simply
   * stopped — so the death screen shows the run's distance rather than telling
   * it. Nothing is animated and nothing is redrawn: the dot is already in
   * place, so this only lifts it above the death veil.
   */
  private freezeThread(): void {
    // Lifted clear of the Replay band, which owns the bottom of the death
    // screen. The Graphics keeps its absolute coordinates, so it is shifted by
    // the delta rather than redrawn.
    const lift = THREAD_DEATH_Y - this.threadY;
    this.threadGfx.setVisible(true).setDepth(31).setY(lift);
    this.threadDot.setVisible(true).setDepth(31).setY(THREAD_DEATH_Y);
  }

  private die(): void {
    this.dead = true;
    this.witch.setAlpha(1);
    this.slowMoLeft = 0;
    this.tweens.timeScale = 1;
    this.sfx.death();
    // The bed falls back to the rest variant under the death screen — the
    // same audible rest as the home screen, since the screen is the same
    // visual rest. The impact sound stays a one-shot on top.
    music.setMode("rest");

    // Captured BEFORE either write: the record this run was actually chasing.
    // The message is indexed on TIME (see La Percée), not on score.
    const previousBestTime = this.lifetime.bestTime;
    this.deathCategory = this.pickDeathCategory(previousBestTime);

    // Persistence: the run is recorded exactly once, here.
    // `history` is still written for the Scores page; the death screen no
    // longer shows it.
    recordRun(this.score, this.bestComboThisRun, this.bestTierThisRun);

    // Lifetime stats: the ONE write of the run, here and nowhere else.
    this.lifetime = recordRunStats({
      duration: this.runDuration,
      tierReached: this.bestTierThisRun,
      clearedTierReached: this.clearedTierReached,
      combosByTier: this.combosByTierThisRun,
      grazes: this.grazesThisRun,
      grazesByEssence: this.grazesByEssenceThisRun,
      bestCombo: this.bestComboThisRun,
      reachedFullMoon: this.reachedFullMoonThisRun,
      fullMoonTime: this.fullMoonTimeThisRun,
      closestGraze: this.closestGrazeThisRun,
      bestGrazesPerSecond: this.bestGrazesPerSecondThisRun
    });

    // The day's best, kept beside the classic records (which this run also
    // feeds: a daily flight is still a flight).
    if (this.dailyMode) recordDailyRun(this.dailyDate, this.score);

    // Tuning log. `runDuration` is real flown seconds, so DEBUG_START_TIER
    // cannot pollute the measurement.
    pushDeath({
      t: Math.round(this.runDuration * 10) / 10,
      tier: this.bestTierThisRun,
      cause: this.deathCause,
      grazes: this.grazesThisRun
    });

    this.refreshDeathTexts(previousBestTime);
    this.freezeThread();

    this.trailEmitter.stop();
    this.ambient.stop();

    // THE IMPACT BEAT (DEATH_FX): the frozen world holds for holdMs so the
    // player reads WHAT killed her — a cold spark at the exact contact point,
    // the killer's moon-rim flashing bright, the witch recoiling off it —
    // then the rest screen appears as before. The replay tap is live through
    // all of it: the hold delays pixels, never input; a mid-beat tap
    // restarts instantly (resetRun cancels the reveal).
    const impact = this.deathImpact;
    if (impact) {
      this.grazeBurst.setParticleTint(DEATH_FX.sparkColor);
      this.grazeBurst.emitParticleAt(impact.x, impact.y, DEATH_FX.sparks);
      for (const rim of impact.obstacle.rimImages) rim.setTint(DEATH_FX.rimFlashColor);
      const away = Math.atan2(this.witch.y - impact.y, this.witch.x - impact.x);
      this.witch.grazeKick(this.witch.y < impact.y ? -1 : 1);
      this.tweens.add({
        targets: this.witch,
        x: this.witch.x + Math.cos(away) * DEATH_FX.recoilPx,
        y: this.witch.y + Math.sin(away) * DEATH_FX.recoilPx,
        duration: DEATH_FX.recoilMs,
        ease: "Quad.easeOut"
      });
    }
    this.deathReveal = this.time.delayedCall(impact ? DEATH_FX.holdMs : 0, () => {
      // Resting scenery: hide the lost run (the gameplay emitters are already
      // stopped, they would otherwise run on behind an opaque sky).
      this.setDeathSceneVisible(true);
      this.deathPanel.setVisible(true);
    });
  }

  /**
   * ENTERING the graze zone: refill immediately.
   * Refilling on entry (rather than on exit) avoids losing the multiplier
   * while already grazing correctly.
   */
  private onGrazeEnter(): void {
    this.magic = MAGIC.max;
    this.flickerPhase = 0;
    this.witch.setAlpha(1);
  }

  /** LEAVING the zone: this, and only this, is where points are scored. */
  private onGrazeExit(obstacle: Obstacle): void {
    this.combo += 1;
    // The graze revives the combo: the next run through the dark will restart
    // from the beginning of the decaying points sequence.
    this.darkStreak = 0;

    // The very first graze ever: celebrated once, wordlessly. This is the
    // moment the game clicks, and it never happens again.
    if (this.firstGrazeEver) {
      this.firstGrazeEver = false;
      markTutorialDone();
      this.celebrateFirstGraze(obstacle.grazeX, obstacle.grazeY);
    }

    this.bestComboThisRun = Math.max(this.bestComboThisRun, this.combo);
    this.grazesThisRun += 1;

    // --- Lifetime stats, accumulated in memory only.
    this.grazesByEssenceThisRun[this.diffCurrent.essence] += 1;
    this.combosByTierThisRun[this.tierIndex] = Math.max(
      this.combosByTierThisRun[this.tierIndex] ?? 0,
      this.combo
    );
    this.closestGrazeThisRun = Math.min(this.closestGrazeThisRun, obstacle.minDistance);
    // Peak grazes inside any one-second window: keep only the last second.
    this.grazeTimes.push(this.runDuration);
    while (this.grazeTimes.length > 0 && this.runDuration - this.grazeTimes[0] > 1) {
      this.grazeTimes.shift();
    }
    this.bestGrazesPerSecondThisRun = Math.max(
      this.bestGrazesPerSecondThisRun,
      this.grazeTimes.length
    );

    // Grading by closeness (see GRAZE_TIERS): the same move, done better,
    // pays and feels better. No words — the tiers read on the burst, the
    // sharper chime and the needle-thread flash alone.
    const closest = obstacle.minDistance;
    const close = closest <= GRAZE_TIERS.closeBand;
    const needle = closest <= GRAZE_TIERS.needleBand;
    const base = close ? GRAZE_TIERS.closePoints : SCORING.grazePoints;
    const points = Math.round(base * this.multiplier);
    this.score += points;
    this.spawnFloater(obstacle.grazeX, obstacle.grazeY, t("float.graze", { points }), {
      fontSize: close ? "34px" : "30px",
      fontStyle: "bold",
      color: close ? TYPE.gold : FEEDBACK.grazeColor
    });

    if (close) {
      this.grazeBurst.setParticleTint(GRAZE_TIERS.burstColorGold);
      this.grazeBurst.emitParticleAt(obstacle.grazeX, obstacle.grazeY, GRAZE_TIERS.burstSparks);
      this.grazeBurst.setParticleTint(GRAZE_TIERS.burstColorViolet);
      this.grazeBurst.emitParticleAt(obstacle.grazeX, obstacle.grazeY, GRAZE_TIERS.burstSparks);
    }
    if (needle) {
      // The needle thread: one breath of light on the witch, nothing else.
      this.needleFlash
        .setPosition(this.witch.x, this.witch.y)
        .setAlpha(GRAZE_TIERS.flashAlpha)
        .setVisible(true);
      this.tweens.add({
        targets: this.needleFlash,
        alpha: 0,
        duration: GRAZE_TIERS.flashMs,
        ease: "Quad.easeOut",
        onComplete: () => this.needleFlash.setVisible(false)
      });
    }

    this.sfx.graze(this.combo, close);

    // The witch flinches away from what she just brushed: a micro-lean plus a
    // ripple through the cape, gone in 150 ms. The side is read from the free
    // band — whichever edge of the gap she passed closest to is the material
    // she grazed, so she recoils the other way.
    const grazedAbove =
      Math.abs(obstacle.grazeY - obstacle.gapTop) < Math.abs(obstacle.gapBottom - obstacle.grazeY);
    this.witch.grazeKick(grazedAbove ? 1 : -1);

    // Shake proportional to the combo, but always tiny.
    if (!this.reducedMotion) {
      const px = Phaser.Math.Linear(SHAKE.minPx, SHAKE.maxPx, this.comboRatio);
      this.cameras.main.shake(
        SHAKE.durationMs,
        new Phaser.Math.Vector2(px / WORLD.width, px / WORLD.height)
      );
    }

    // Extreme graze: slow motion. Death is at 10 px and the threshold at 18,
    // so the window is narrow and slow motion stays a rare moment.
    if (!this.reducedMotion && obstacle.minDistance < SLOWMO.thresholdPx) {
      this.slowMoLeft = SLOWMO.durationMs / 1000;
    }
  }

  /** Text that rises and fades out, then destroys itself. */
  private spawnFloater(
    x: number,
    y: number,
    label: string,
    style: Phaser.Types.GameObjects.Text.TextStyle
  ): void {
    // Serif, like every numeral: the floating gain is a value, not a label.
    const text = this.add
      .text(x, y, label, { fontFamily: TYPE.serif, fontStyle: "500", ...style })
      .setOrigin(0.5)
      .setDepth(22);
    this.floaters.push(text);

    this.tweens.add({
      targets: text,
      y: y - FEEDBACK.floatRise,
      alpha: 0,
      duration: FEEDBACK.floatMs,
      ease: "Quad.easeOut",
      onComplete: () => {
        const i = this.floaters.indexOf(text);
        if (i >= 0) this.floaters.splice(i, 1);
        text.destroy();
      }
    });
  }

   /**
   * One pass through the ring = one graze, only confirmed when the obstacle
   * leaves the ring or moves behind the witch.
   * Returns true if the witch died.
   */
  private updateNearMiss(): boolean {
    const wx = this.witch.x;
    const wy = this.witch.y;

    for (const obstacle of this.spawner.all) {
      const d = obstacle.distanceTo(wx, wy);

      if (d <= NEAR_MISS.deathRadius) {
        this.deathCause = obstacle.kind === "trunk" ? "trunk" : "branch";
        // Where exactly she hit: the impact beat points the spark, the rim
        // flash and the recoil at this obstacle and this point.
        const contact = obstacle.contactPoint(wx, wy);
        this.deathImpact = { x: contact.x, y: contact.y, obstacle };
        return true;
      }

      const inZone = d <= NEAR_MISS.grazeRadius;
      obstacle.halo.setAlpha(
        (inZone ? FEEDBACK.haloAlphaActive : FEEDBACK.haloAlpha) * obstacle.haloAlphaScale
      );
      // Readability invariant: outline strengthened as the light fades.
      obstacle.setContrast(this.obstacleStrokeAlpha);

      if (inZone) {
        // Rising edge: we just entered the ring -> immediate refill.
        if (!obstacle.inGrazeZone) {
          obstacle.inGrazeZone = true;
          if (!obstacle.grazeEntered) {
            obstacle.grazeEntered = true;
            this.onGrazeEnter();
            // The fireflies she came for rush in. Visual only: no points.
            if (this.cues.collect(obstacle)) this.sfx.spark();
          }
        }
        // Remember the closest point: that is where the text will pop up.
        if (d < obstacle.minDistance) {
          obstacle.minDistance = d;
          obstacle.grazeX = wx;
          obstacle.grazeY = wy;
        }
      } else if (obstacle.inGrazeZone) {
        // Falling edge: left the ring without touching, the score is earned.
        obstacle.inGrazeZone = false;
        if (!obstacle.grazed) {
          obstacle.grazed = true;
          this.onGrazeExit(obstacle);
        }
      }

      if (!obstacle.passed && obstacle.isBehind(wx)) {
        obstacle.passed = true;
        // Safety net: passed while still inside the ring.
        if (obstacle.inGrazeZone && !obstacle.grazed) {
          obstacle.grazed = true;
          this.onGrazeExit(obstacle);
        }
        // Passed without grazing: the fireflies drift off and go out. The loss
        // is shown, never commented on.
        if (!obstacle.grazed) this.cues.release(obstacle);

        if (!obstacle.grazed && this.combo === 0) {
          // Decaying DARK_POINTS: the Nth obstacle of the run through the dark
          // awards the Nth value of the sequence, then 0.
          // Combo active -> nothing: only grazes score.
          const seq = SCORING.darkPointsSequence;
          const points = seq[Math.min(this.darkStreak, seq.length - 1)];
          this.darkStreak += 1;
          if (points > 0) {
            this.score += points;
            this.spawnFloater(obstacle.x, wy, `+${points}`, {
              fontSize: "16px",
              color: FEEDBACK.darkColor
            });
          }
        }
      }
    }

    return false;
  }

  private refreshHud(): void {
    if (this.score !== this.lastDrawnScore) {
      this.scoreText.setText(String(this.score));
      this.lastDrawnScore = this.score;
    }
    if (this.combo !== this.lastDrawnCombo) {
      const m = this.multiplier;
      this.multiplierText.setText(`×${Number.isInteger(m) ? m : m.toFixed(1)}`);
      this.multiplierText.setAlpha(this.combo === 0 ? 0.35 : 1);
      this.lastDrawnCombo = this.combo;
      // The combo changed: this is the only moment the trail needs
      // reconfiguring (doing it every frame would be pointless and costly).
      this.refreshComboVisuals();
    }
  }

  /** Trail + Full Moon: everything that turns the multiplier into an image. */
  private refreshComboVisuals(): void {
    const t = this.comboRatio;
    const emitter = this.trailEmitter;

    emitter.frequency = Phaser.Math.Linear(TRAIL.frequencyIdle, TRAIL.frequencyMax, t);
    emitter.setParticleLifespan(Phaser.Math.Linear(TRAIL.lifespanIdle, TRAIL.lifespanMax, t));
    // Alpha keeps its ramp to 0 (that is what extinguishes the particle);
    // setParticleScale only accepts numbers, so the size stays constant.
    emitter.setParticleAlpha({ start: Phaser.Math.Linear(TRAIL.alphaIdle, TRAIL.alphaMax, t), end: 0 });
    const scale = Phaser.Math.Linear(TRAIL.scaleIdle, TRAIL.scaleMax, t);
    emitter.setParticleScale(scale, scale);
    emitter.setParticleTint(lerpColor(TRAIL.colorIdle, TRAIL.colorMax, t));

    this.setFullMoon(this.multiplier >= NEAR_MISS.multiplierMax);
  }

  /** Full Moon toggle. `instant` is used by the restart. */
  private setFullMoon(on: boolean, instant = false): void {
    if (this.fullMoon === on && !instant) return;
    this.fullMoon = on;
    if (on) this.reachedFullMoonThisRun = true;

    this.witch.setFullMoon(on);

    const duration = instant ? 0 : FULL_MOON.fadeMs;
    this.tweens.killTweensOf([this.moon, this.moonGlow, this.moonVeil]);
    if (instant) {
      this.moon.setScale(on ? FULL_MOON.moonScale : 1);
      this.moonGlow.setAlpha(on ? FULL_MOON.glowAlpha : 0);
      this.moonVeil.setAlpha(on ? FULL_MOON.veilAlpha : 0);
      return;
    }
    this.tweens.add({
      targets: this.moon,
      scale: on ? FULL_MOON.moonScale : 1,
      duration,
      ease: "Back.easeOut"
    });
    this.tweens.add({ targets: this.moonGlow, alpha: on ? FULL_MOON.glowAlpha : 0, duration });
    this.tweens.add({ targets: this.moonVeil, alpha: on ? FULL_MOON.veilAlpha : 0, duration });
  }

  /** Flicker wave, between 0 and 1. */
  private get flickerWave(): number {
    return 0.5 + 0.5 * Math.sin(this.flickerPhase * Math.PI * 2 * MAGIC.flickerPulseHz);
  }

  /** The witch flickers: the "your multiplier is about to break" signal. */
  private updateFlicker(): void {
    if (!this.flickering) {
      this.witch.setAlpha(1);
      return;
    }
    this.witch.setAlpha(this.flickerWave > 0.5 ? 1 : MAGIC.flickerWitchAlpha);
  }

  /** Gauge bar + night veil, both driven by the magic left. */
  private refreshMagic(): void {
    const ratio = Phaser.Math.Clamp(this.magic / MAGIC.max, 0, 1);

    // The combo timer reads as URGENCY: warm, and it pulses as it runs out.
    // The bottom progress thread is its opposite — cold and still — so the two
    // can never be confused for one another.
    let height = MAGIC.barHeight;
    let barAlpha = 0.9;
    if (this.combo > 0 && ratio > 0 && ratio < MAGIC.pulseBelow) {
      const beat = 0.5 + 0.5 * Math.sin(this.time.now / 1000 * Math.PI * 2 * MAGIC.pulseHz);
      // Urgency grows as the gauge empties: the closer to zero, the harder it
      // beats, so it is felt without being read.
      const bite = 1 - ratio / MAGIC.pulseBelow;
      height += MAGIC.pulseGrow * beat * bite;
      barAlpha = Phaser.Math.Linear(0.9, MAGIC.pulseAlphaMin, beat * bite);
    }
    this.magicFill.setDisplaySize(MAGIC.barWidth * ratio, height).setAlpha(barAlpha);

    let alpha = Phaser.Math.Linear(MAGIC.darkAlphaEmpty, MAGIC.darkAlphaFull, ratio);
    // While flickering the veil pulses: the night "breathes" before falling.
    if (this.flickering) {
      alpha = Phaser.Math.Clamp(alpha - MAGIC.flickerDarkSwing * this.flickerWave, 0, 1);
    }
    this.darkness.clear();
    if (alpha <= 0.001) return;

    this.darkness.fill(0x000000, alpha);
    // Pierce the veil around the witch: the hole shrinks with the gauge.
    const radius = Phaser.Math.Linear(MAGIC.lightRadiusEmpty, MAGIC.lightRadiusFull, ratio);
    this.lightBrush.setPosition(this.witch.x, this.witch.y).setScale((radius * 2) / LIGHT_SIZE);
    this.darkness.erase(this.lightBrush);
  }

  private drawDebug(): void {
    const g = this.debugGfx;
    if (!g) return;
    g.clear();

    // The obstacles' actual collision shapes.
    g.lineStyle(1, 0x00d0ff, 0.8);
    for (const obstacle of this.spawner.all) {
      for (const shape of obstacle.shapes) {
        if (shape.type === "rect") {
          g.strokeRect(
            obstacle.x - shape.halfWidth,
            shape.top,
            shape.halfWidth * 2,
            shape.bottom - shape.top
          );
        } else {
          g.strokeCircle(obstacle.x, shape.y, shape.radius);
        }
      }
    }

    // Graze ring, then lethal hitbox, around the witch.
    g.lineStyle(1, 0x4dff9e, 0.6);
    g.strokeCircle(this.witch.x, this.witch.y, NEAR_MISS.grazeRadius);
    g.lineStyle(2, 0xff4d4d, 0.9);
    g.strokeCircle(this.witch.x, this.witch.y, NEAR_MISS.deathRadius);
  }

  /**
   * The frame's slow-motion factor, counted down in REAL time (otherwise slow
   * motion would slow itself down and never end).
   */
  private consumeTimeScale(realDt: number): number {
    if (this.slowMoLeft <= 0) return 1;

    this.slowMoLeft = Math.max(0, this.slowMoLeft - realDt);
    const k = this.slowMoLeft / (SLOWMO.durationMs / 1000);
    // k=1 on trigger -> floor scale, then a gradual climb back to 1.
    return Phaser.Math.Linear(1, SLOWMO.scale, k);
  }

  update(time: number, deltaMs: number): void {
    this.fpsText?.setText(
      `${Math.round(this.game.loop.actualFps)} fps | ` +
        `${Math.round(this.diffCurrent.speed)} px/s | ${t(TIERS[this.tierIndex].nameKey)}`
    );

    // Dead: the world is frozen, only the replay screen's scenery animates.
    if (this.dead) {
      this.updateDeathScene(time, deltaMs / 1000);
      music.update(deltaMs / 1000);
      return;
    }
    // Paused: everything is frozen, no death is possible.
    if (this.paused) return;

    const realDt = deltaMs / 1000;
    const timeScale = this.consumeTimeScale(realDt);
    // Tweens follow the slow motion so floating texts stay consistent.
    this.tweens.timeScale = timeScale;
    const dt = realDt * timeScale;

    // --- Flight: gentle gravity + thrust while held.
    this.velocityY += (this.holding ? WITCH.thrust : WITCH.gravity) * dt;
    this.velocityY = Phaser.Math.Clamp(this.velocityY, -WITCH.maxSpeed, WITCH.maxSpeed);
    this.witch.y = Phaser.Math.Clamp(
      this.witch.y + this.velocityY * dt,
      WITCH.marginTop,
      WORLD.height - WITCH.marginBottom
    );

    // Posture: a real rotation driven by vertical speed, plus the trailing
    // cape and hat tip. Purely visual — the hitbox does not rotate.
    this.witch.update(dt, this.velocityY, WITCH.maxSpeed, this.comboRatio);

    // --- Difficulty: play time, current tier, smooth interpolation.
    this.updateDifficulty(dt);

    // --- Obstacles: generation + scrolling at the tier's pace.
    this.spawner.update(dt, this.effectiveDiff());

    // Parallax scenery follows the same clock as the world (slow motion and
    // pause included, since it shares this frame's dt).
    this.scenery.update(dt, this.diffCurrent.speed);

    // --- Near-miss, score, death. Only a collision can kill.
    if (this.updateNearMiss()) {
      this.die();
      return;
    }

    // --- Magic: it only drains if no graze refilled it this frame.
    this.magic = Math.max(0, this.magic - MAGIC.drainPerSecond * dt);
    // Empty gauge: you lose the multiplier, never the run.
    if (this.magic <= 0) this.combo = 0;

    this.flickerPhase = this.flickering ? this.flickerPhase + dt : 0;
    this.updateFlicker();

    // The crossing's slow motion is over: the thread comes back.
    if (this.perceeSlowMo && this.slowMoLeft <= 0) this.perceeSlowMo = false;

    this.updatePercee(dt, time);
    this.updateThread();

    // Reward cues last: they follow the obstacles and the witch, so they read
    // this frame's positions rather than the previous one's.
    this.cues.sync(this.spawner.all);
    this.cues.update(dt, time, this.witch.x, this.witch.y, this.multiplier, this.perceeT);

    this.refreshHud();
    this.refreshMagic();
    this.applyAmbiance();

    // The music reads the same state the visuals do: the tier picks the
    // tonality, the combo brings the rhythm in and opens the filter, the
    // drained gauge cools it, the record approach hollows it, Full Moon adds
    // the melody, the crossing silences everything. Real dt, not the slowed
    // one: the clock must not slow with time.
    music.update(realDt, {
      combo: this.comboRatio,
      comboCount: this.combo,
      cold: 1 - Phaser.Math.Clamp(this.magic / MAGIC.max, 0, 1),
      tension: this.perceeT,
      crossing: this.perceeSlowMo,
      fullMoon: this.fullMoon,
      tierIndex: this.tierIndex
    });

    if (DEBUG_HITBOX) this.drawDebug();
  }

  /** Where the thread sits: above the safe-area inset, always. */
  private get threadY(): number {
    return WORLD.height - SAFE_BOTTOM - PROGRESS_THREAD.liftAboveSafe;
  }

  private threadX(seconds: number): number {
    const left = PROGRESS_THREAD.marginX;
    const width = WORLD.width - PROGRESS_THREAD.marginX * 2;
    return left + (Phaser.Math.Clamp(seconds, 0, this.threadSpan) / this.threadSpan) * width;
  }

  /**
   * The static part of the thread: the hairline, the tier ticks, and the notch
   * where the record stands. Drawn ONCE per run — only the dot moves, which is
   * what keeps the bottom edge calm next to the urgency of the combo timer.
   */
  private drawThread(): void {
    const th = PROGRESS_THREAD;
    const g = this.threadGfx;
    const y = this.threadY;
    g.clear();

    // The thread flips polarity with the sky, like the score and the timer.
    // Its light violet measured a contrast of 2.03 on pale gold — legible only
    // if you knew where to look — and the timer's inverted colour used to go
    // violet too, leaving the two readouts 1 degree of hue apart. They mean
    // opposite things, so they stay 129 degrees apart instead. See MOON_EYE.
    const inv = this.diffCurrent.inverted;
    const trackColor = inv ? MOON_EYE.threadTrackColor : th.trackColor;
    const tickColor = inv ? MOON_EYE.threadTickColor : th.tickColor;
    const notchColor = inv ? MOON_EYE.threadNotchColor : th.notchColor;

    const left = th.marginX;
    const width = WORLD.width - th.marginX * 2;
    g.fillStyle(trackColor, th.trackAlpha);
    g.fillRect(left, y - th.height / 2, width, th.height);

    // Tier boundaries: the shape of the forest ahead.
    g.fillStyle(tickColor, th.tickAlpha);
    for (const tier of TIERS) {
      if (tier.startTime <= 0 || tier.startTime > this.threadSpan) continue;
      g.fillRect(this.threadX(tier.startTime) - 0.5, y - th.tickHeight / 2, 1, th.tickHeight);
    }

    // The record. Only drawn when there is one worth showing — same threshold
    // as the arch, so the whole Percée appears in one piece.
    if (this.perceeTime > 0 && this.perceeTime <= this.threadSpan) {
      g.fillStyle(notchColor, th.notchAlpha);
      g.fillRect(this.threadX(this.perceeTime) - 1, y - th.notchHeight / 2, 2, th.notchHeight);
    }
  }

  /** The moving point of light: the witch on her road. */
  private updateThread(): void {
    // Back to the bottom edge after a death screen lifted it.
    this.threadGfx.setY(0).setDepth(2.7);
    this.threadDot.setDepth(2.7);

    // A Percée crossing owns the screen; the thread gets out of the way.
    const hidden = this.perceeSlowMo;
    this.threadGfx.setVisible(!hidden);
    this.threadDot.setVisible(!hidden);
    if (hidden) return;

    // Past the record the run is in new country: stretch rather than clamp,
    // so the dot keeps moving instead of sticking to the end.
    if (this.runDuration > this.threadSpan) {
      this.threadSpan = this.runDuration * PROGRESS_THREAD.spanFactor;
      this.drawThread();
    }
    this.threadDot.setPosition(this.threadX(this.runDuration), this.threadY);
  }

  /**
   * The record, standing in the forest.
   *
   * Nothing here has any effect on gameplay: no collision, no scoring, no
   * change to generation. The tension it builds is atmosphere only and touches
   * the SCENERY alone — obstacles and their halos are never dimmed, per the
   * readability invariant.
   */
  private updatePercee(dt: number, time: number): void {
    if (this.perceeTime <= 0) return;

    this.perceeT = this.reducedMotion ? 0 : perceeTension(this.runDuration, this.perceeTime);
    this.percee.update(
      this.runDuration,
      this.perceeTime,
      this.diffCurrent.speed,
      time,
      this.perceeT
    );
    // The world's sound hollows out as she closes on it.
    this.sfx.setTension(this.perceeT);

    if (!this.perceeCrossed && this.runDuration >= this.perceeTime) {
      this.perceeCrossed = true;
      this.crossPercee();
    }
    void dt;
  }

  /** Passing her own record: the one moment a word is allowed on screen. */
  private crossPercee(): void {
    if (!this.reducedMotion) {
      this.slowMoLeft = PERCEE.slowMoMs / 1000;
      this.perceeSlowMo = true;
    }
    this.percee.burst();
    this.sfx.setTension(0);
    this.perceeT = 0;

    // Full trail blaze, whatever the combo is doing.
    this.trailEmitter.setParticleTint(TRAIL.colorMax);
    this.trailEmitter.frequency = TRAIL.frequencyMax;

    this.spawnFloater(WITCH.x + 60, this.witch.y - 40, t("percee"), {
      fontSize: "30px",
      fontStyle: "bold",
      color: "#ffe9a8"
    });
  }

  /**
   * The first graze ever, celebrated once and without a single word: a golden
   * flash, a burst of sparks and a beat of slow motion. It fires on the exact
   * frame the player discovers what the game is about.
   */
  private celebrateFirstGraze(x: number, y: number): void {
    if (!this.reducedMotion) this.slowMoLeft = FIRST_GRAZE.slowMoMs / 1000;

    const flash = this.add
      .rectangle(0, 0, WORLD.width, WORLD.height, FULL_MOON.veilColor, 1)
      .setOrigin(0, 0)
      .setAlpha(FIRST_GRAZE.flashAlpha)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(14);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: FIRST_GRAZE.flashMs,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy()
    });

    const burst = this.add.particles(x, y, SPARK_KEY, {
      speed: { min: 60, max: 240 },
      lifespan: 700,
      scale: 0.5,
      alpha: { start: 0.95, end: 0 },
      tint: FULL_MOON.witchColor,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false
    });
    burst.setDepth(6);
    burst.explode(FIRST_GRAZE.sparks);
    // One-shot: the emitter goes away with its last particle.
    this.time.delayedCall(900, () => burst.destroy());
  }
}

/**
 * Desaturates and cools a colour: k=0 -> untouched, k=1 -> blue-grey of the
 * same luminance. This is the "cold" of a lost combo, instead of blackness.
 *
 * @param valueDrop fraction of the cooling paid as a LUMINANCE drop instead
 *                  (TierPalette.coolValueDrop). Desaturation needs saturation
 *                  to spend; on a palette that has almost none it does nothing
 *                  visible, so there the loss is expressed by going darker.
 *                  A dev assertion in config.ts refuses a cold palette that
 *                  does not compensate this way.
 */
function coolDesat(color: number, k: number, valueDrop = 0): number {
  const c = Phaser.Display.Color.ValueToColor(color);
  const lum = 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
  const f = 1 - k * valueDrop;
  const r = Phaser.Math.Linear(c.red, lum * 0.8, k) * f;
  const g = Phaser.Math.Linear(c.green, lum * 0.95, k) * f;
  const b = Phaser.Math.Linear(c.blue, Math.min(255, lum * 1.25), k) * f;
  return Phaser.Display.Color.GetColor(Math.round(r), Math.round(g), Math.round(b));
}

/** Interpolates two integer colours, used for particle tints. */
function lerpColor(from: number, to: number, t: number): number {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(from),
    Phaser.Display.Color.ValueToColor(to),
    100,
    Phaser.Math.Clamp(t, 0, 1) * 100
  );
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}
