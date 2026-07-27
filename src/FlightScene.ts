import Phaser from "phaser";
import {
  AMBIENT,
  DEATH_MESSAGE,
  DEBUG_HITBOX,
  DEBUG_START_TIER,
  DEBUG_STATS,
  FEEDBACK,
  FULL_MOON,
  GLOBAL_SPEED,
  HISTORY,
  MAGIC,
  MERCY,
  MOON,
  MOON_EYE,
  NEAR_MISS,
  OBSTACLE_ART,
  SCORING,
  SHAKE,
  SLOWMO,
  TEACH,
  TIER_FX,
  TIERS,
  tierSky,
  TRAIL,
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
  recordRun,
  shouldEase
} from "./save";
import { shareScoreImage } from "./share";
import { Sfx } from "./sfx";
import { ensureTextures, LIGHT_KEY, LIGHT_SIZE, SPARK_KEY } from "./textures";
import { buttonWidth, fitText } from "./ui";
import { Witch } from "./witchShape";

/** Current interpolated parameters: difficulty + sky mood. */
type TierParams = Difficulty & { skyTop: number; skyBottom: number };

const MOON_COLOR = 0xf5efd8;

// HUD colours for the normal (dark) palette; MOON_EYE holds the inverted ones.
const HUD_SCORE_COLOR = "#f5efd8";
const HUD_MULT_COLOR = "#d9a7ff";

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
  /** Key of the last mood state applied (avoids pointless redraws). */
  private lastAmbianceKey = "";
  /** Current HUD polarity, so colours are only reassigned when it flips. */
  private hudInverted = false;
  /** Current obstacle outline alpha (rises as the light fades). */
  private obstacleStrokeAlpha: number = OBSTACLE_ART.rimAlphaLit;
  private sky!: Phaser.GameObjects.Graphics;
  private tierText!: Phaser.GameObjects.Text;
  private moon!: Phaser.GameObjects.Arc;
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
  private deathCauseText!: Phaser.GameObjects.Text;
  private deathStatsText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private historyBars!: Phaser.GameObjects.Graphics;
  private historyLabels: Phaser.GameObjects.Text[] = [];
  private shareLabel!: Phaser.GameObjects.Text;
  private homeLabel!: Phaser.GameObjects.Text;
  private replayLabel!: Phaser.GameObjects.Text;
  private deathBtnW = 148;
  private pauseTitleText!: Phaser.GameObjects.Text;
  private pauseHintText!: Phaser.GameObjects.Text;
  private shareZone!: Phaser.Geom.Rectangle;
  private homeZone!: Phaser.Geom.Rectangle;

  /** Animated death-screen scenery: same spirit as the home screen. */
  private deathScene: Array<{ setVisible(v: boolean): void }> = [];
  private deathWitch!: Witch;
  private deathDust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private deathTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Best combo reached in the current run. */
  private bestComboThisRun = 0;
  /** Grazes completed in the current run — logged for tuning. */
  private grazesThisRun = 0;
  /** What actually killed her, captured at the moment of contact. */
  private deathCause: DeathCause = "branch";
  /**
   * Adaptive easing is on for this run. Decided at reset from the death log,
   * lifted mid-run once the player clears MERCY.clearSeconds. Never surfaced
   * to the player in any way.
   */
  private easing = false;
  /** Furthest tier reached in the current run. */
  private bestTierThisRun = 0;
  /** The last run beat the record (used by the share image). */
  private lastRunWasRecord = false;
  private fpsText?: Phaser.GameObjects.Text;
  private debugGfx?: Phaser.GameObjects.Graphics;

  private lastDrawnScore = -1;
  private lastDrawnCombo = -1;

  /** First-run onboarding: active until the first successful graze. */
  private teaching = false;
  private teachText!: Phaser.GameObjects.Text;

  /** Pause (tab in the background): the world is frozen, you cannot die. */
  private paused = false;
  private pausePanel!: Phaser.GameObjects.Container;
  private onVisibilityChange?: () => void;

  constructor() {
    super("flight");
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

    // Moon + its Full Moon halo (invisible until the multiplier hits the cap).
    this.moonGlow = this.add
      .circle(MOON.x, MOON.y, FULL_MOON.glowRadius, FULL_MOON.glowColor, 1)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.moon = this.add.circle(MOON.x, MOON.y, 34, MOON_COLOR, 0.9);

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

    // Tier announcement: name in large type, centred, above the night veil.
    this.tierText = this.add
      .text(WORLD.width / 2, WORLD.height * 0.42, "", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "42px",
        color: "#f5efd8"
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setAlpha(0);

    // Onboarding word: follows the first obstacle of the very first run.
    this.teachText = this.add
      .text(0, 0, "", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: `${TEACH.fontSizePx}px`,
        color: TEACH.color
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false);

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
    this.scoreText = this.add
      .text(WORLD.width / 2, 46, "0", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "64px",
        color: HUD_SCORE_COLOR
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    this.multiplierText = this.add
      .text(WORLD.width / 2, 116, "×1", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "26px",
        color: HUD_MULT_COLOR
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

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
    sky.fillGradientStyle(tier.skyTop, tier.skyTop, tier.skyBottom, tier.skyBottom, 1);
    sky.fillRect(0, 0, WORLD.width, WORLD.height);

    // Soft glow: the radial texture, not a solid circle (ugly hard edge).
    const glow = this.add
      .image(MOON.x, MOON.y, LIGHT_KEY)
      .setDisplaySize(340, 340)
      .setTint(FULL_MOON.glowColor)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(28);
    const moon = this.add.circle(MOON.x, MOON.y, 34, MOON_COLOR, 0.9).setDepth(28);

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

    this.deathScene = [sky, glow, moon, this.deathDust, this.deathTrail, this.deathWitch];
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

    // Contextual game-over line. Word-wrapped rather than shrunk, so a long
    // sentence in any language stays readable instead of turning tiny.
    this.messageText = this.add
      .text(cx, 232, "", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "22px",
        color: "#d9a7ff",
        align: "center",
        wordWrap: { width: WORLD.width - 64 }
      })
      .setOrigin(0.5);

    this.deathScoreText = this.add
      .text(cx, 318, "0", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "96px",
        color: "#f5efd8"
      })
      .setOrigin(0.5);

    // Cause of death: the player must understand at a glance.
    this.deathCauseText = this.add
      .text(cx, 392, "", {
        fontFamily: "sans-serif",
        fontSize: "20px",
        color: "#c9a0ff"
      })
      .setOrigin(0.5);

    // Run summary: tier reached + best combo.
    this.deathStatsText = this.add
      .text(cx, 452, "", {
        fontFamily: "sans-serif",
        fontSize: "22px",
        color: "#d9a7ff",
        align: "center",
        lineSpacing: 8
      })
      .setOrigin(0.5);

    // Score history: a mini bar chart, oldest left, this run right. Bars are
    // redrawn on each death; the labels are created once and reused.
    this.historyBars = this.add.graphics();
    this.historyLabels = [];
    for (let i = 0; i < HISTORY.size; i++) {
      this.historyLabels.push(
        this.add
          .text(0, HISTORY.baselineY + 8, "", {
            fontFamily: "sans-serif",
            fontSize: "12px",
            color: HISTORY.labelColor
          })
          .setOrigin(0.5, 0)
      );
    }

    // Two secondary buttons side by side, above the thumb zone.
    // Shared width sized against the longest translation of BOTH labels across
    // the 4 languages ("Compartir"/"Condividi" are wider than "Share").
    const secondaryStyle = { fontFamily: "sans-serif", fontStyle: "bold", fontSize: "22px" };
    const btnH = 62;
    const btnY = 597;
    const gap = 14;
    const maxSecondary = Math.floor((WORLD.width - 48 - gap) / 2);
    const btnW = Math.max(
      buttonWidth(this, "death.share", secondaryStyle, 22, 130, maxSecondary),
      buttonWidth(this, "death.home", secondaryStyle, 22, 130, maxSecondary)
    );
    const shareCx = cx - (btnW + gap) / 2;
    const homeCx = cx + (btnW + gap) / 2;
    this.shareZone = new Phaser.Geom.Rectangle(shareCx - btnW / 2, btnY - btnH / 2, btnW, btnH);
    this.homeZone = new Phaser.Geom.Rectangle(homeCx - btnW / 2, btnY - btnH / 2, btnW, btnH);

    const shareBg = this.add
      .rectangle(shareCx, btnY, btnW, btnH, 0xffffff, 0.08)
      .setStrokeStyle(2, 0x9b6bff, 0.7);
    this.shareLabel = this.add
      .text(shareCx, btnY, "", { ...secondaryStyle, color: "#d9a7ff" })
      .setOrigin(0.5);
    const homeBg = this.add
      .rectangle(homeCx, btnY, btnW, btnH, 0xffffff, 0.08)
      .setStrokeStyle(2, 0x9b6bff, 0.7);
    this.homeLabel = this.add
      .text(homeCx, btnY, "", { ...secondaryStyle, color: "#d9a7ff" })
      .setOrigin(0.5);

    // Replay: fills the whole bottom of the screen, within thumb reach.
    // No dedicated hit zone: any tap outside "Share"/"Home" restarts.
    const replayTop = 706;
    const replayBg = this.add
      .rectangle(0, replayTop, WORLD.width, WORLD.height - replayTop, 0x9b6bff, 0.16)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x9b6bff, 0.5);
    this.replayLabel = this.add
      .text(cx, replayTop + (WORLD.height - replayTop) / 2, "", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "44px",
        color: "#f2c8ff"
      })
      .setOrigin(0.5);

    // A single container to toggle: restarting never reloads the scene.
    this.deathPanel = this.add
      .container(0, 0, [
        veil,
        this.messageText,
        this.deathScoreText,
        this.deathCauseText,
        this.deathStatsText,
        this.historyBars,
        ...this.historyLabels,
        shareBg,
        this.shareLabel,
        homeBg,
        this.homeLabel,
        replayBg,
        this.replayLabel
      ])
      .setDepth(30)
      .setVisible(false);

    this.deathBtnW = btnW;
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
  }

  private resumeRun(): void {
    this.paused = false;
    this.pausePanel.setVisible(false);
  }

  private buildPausePanel(): void {
    const cx = WORLD.width / 2;
    const veil = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x05030c, 0.7).setOrigin(0, 0);
    this.pauseTitleText = this.add
      .text(cx, WORLD.height * 0.44, "", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "46px",
        color: "#f5efd8"
      })
      .setOrigin(0.5);
    this.pauseHintText = this.add
      .text(cx, WORLD.height * 0.44 + 66, "", {
        fontFamily: "sans-serif",
        fontSize: "24px",
        color: "#d9a7ff"
      })
      .setOrigin(0.5);
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
    this.shareLabel.setText(t("death.share"));
    fitText(this.shareLabel, this.deathBtnW - 20, 22);
    this.homeLabel.setText(t("death.home"));
    fitText(this.homeLabel, this.deathBtnW - 20, 22);
    this.replayLabel.setText(t("death.replay"));
    fitText(this.replayLabel, WORLD.width - 48, 44);

    this.pauseTitleText.setText(t("pause.title"));
    fitText(this.pauseTitleText, WORLD.width - 48, 46);
    this.pauseHintText.setText(t("pause.hint"));
    fitText(this.pauseHintText, WORLD.width - 48, 24);

    this.teachText.setText(t("teach.word"));
    fitText(this.teachText, WORLD.width * 0.6, TEACH.fontSizePx);

    // A tier name currently being announced changes language too.
    if (this.tierText.alpha > 0) {
      this.tierText.setText(t(TIERS[this.tierIndex].nameKey));
      fitText(this.tierText, WORLD.width - 48, 42);
    }

    if (this.dead) this.refreshDeathTexts();
  }

  /** Labels that depend on the run shown on the death screen. */
  private refreshDeathTexts(): void {
    this.deathScoreText.setText(String(this.score));
    fitText(this.deathScoreText, WORLD.width - 48, 96);

    // The message is re-rolled on a language change: same category, a fresh
    // variant in the new language. Never rebuilt from fragments.
    this.messageText.setText(
      deathMessage(this.deathCategory, {
        score: this.score,
        combo: this.bestComboThisRun,
        tier: t(TIERS[this.bestTierThisRun].nameKey)
      })
    );
    this.messageText.setColor(
      this.deathCategory === "newRecord" ? HISTORY.recordLabelColor : "#d9a7ff"
    );

    this.deathCauseText.setText(
      t(this.deathCause === "trunk" ? "death.causeTrunk" : "death.causeBranch")
    );
    fitText(this.deathCauseText, WORLD.width - 48, 20);

    this.deathStatsText.setText(
      `${t("death.tier", { tier: t(TIERS[this.bestTierThisRun].nameKey) })}\n` +
        `${t("death.bestCombo", { combo: this.bestComboThisRun })}`
    );
    fitText(this.deathStatsText, WORLD.width - 48, 22);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // The audio context can only open on a user gesture.
    this.sfx.unlock();

    if (this.paused) {
      // This tap only resumes: it does not steer.
      this.resumeRun();
      return;
    }

    if (this.dead) {
      // No delay guard: the tap is live from the very first frame of the
      // death screen. The message and the history never gate replaying.
      // Only "Share" and "Home" divert the tap; everywhere else restarts, so
      // the urge to replay never runs into a dead zone.
      if (this.shareZone.contains(pointer.x, pointer.y)) {
        void this.shareRun();
        return;
      }
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
    this.spawner.reset();
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
    this.bestTierThisRun = 0;
    this.runDuration = 0;
    // Read once per run, from the death log. Nothing tells the player.
    this.easing = shouldEase();
    this.magic = MAGIC.max;
    this.flickerPhase = 0;
    this.slowMoLeft = 0;
    this.tweens.timeScale = 1;
    this.dead = false;
    this.deathPanel.setVisible(false);
    this.setDeathSceneVisible(false);
    this.trailEmitter.start();
    this.ambient.start();
    this.paused = false;
    this.pausePanel.setVisible(false);
    this.debugGfx?.clear();

    // Starting tier: normal, or forced by DEBUG_START_TIER (testing without
    // replaying 80 s). Parameters are applied at once, with no interpolation
    // carried over from the previous run.
    const startTier = DEBUG_START_TIER >= 0 ? Math.min(DEBUG_START_TIER, TIERS.length - 1) : 0;
    this.runTime = TIERS[startTier].startTime;
    this.tierIndex = startTier;
    this.diffCurrent = this.tierParams(startTier);
    this.diffFrom = { ...this.diffCurrent };
    this.transitionT = TIER_FX.transitionS;
    this.ambient.killAll();
    this.applyAmbiance(true);
    this.announceTier(TIERS[startTier].nameKey);

    // Onboarding: only while the first graze has never succeeded (this
    // persists across runs within the first session).
    this.teaching = !isTutorialDone();
    this.teachText.setVisible(false);

    this.setFullMoon(false, true);
    this.refreshHud();
    this.refreshComboVisuals();
    this.refreshMagic();
  }

  /** Shares the run currently shown on the death screen. */
  private async shareRun(): Promise<void> {
    await shareScoreImage({
      score: this.score,
      tierName: t(TIERS[this.bestTierThisRun].nameKey),
      bestCombo: this.bestComboThisRun,
      isRecord: this.lastRunWasRecord
    });
  }

  /** The obstacle carrying the onboarding: the oldest one still to be grazed. */
  private get teachTarget(): Obstacle | null {
    if (!this.teaching) return null;
    for (const obstacle of this.spawner.all) {
      if (!obstacle.grazed && !obstacle.passed) return obstacle;
    }
    return null;
  }

  /** The graze word follows the target obstacle, centred on its gap. */
  private updateTeach(): void {
    const target = this.teachTarget;
    if (!target) {
      this.teachText.setVisible(false);
      return;
    }
    const bandCenter =
      (Math.max(target.gapTop, 0) + Math.min(target.gapBottom, WORLD.height)) / 2;
    // Clamped against the REAL width of the translated word ("SFIORA" is much
    // wider than "ROZA"): it never leaves the screen, in any language.
    const x = Math.max(this.teachText.width / 2 + 10, target.x + TEACH.offsetX);
    this.teachText.setPosition(x, bandCenter).setVisible(true);
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
      skyTop: sky.top,
      skyBottom: sky.bottom
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
    this.bestTierThisRun = Math.max(this.bestTierThisRun, target);
    if (target !== this.tierIndex) {
      this.diffFrom = { ...this.diffCurrent };
      this.tierIndex = target;
      this.transitionT = 0;
      this.announceTier(TIERS[target].nameKey);
    }

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
        skyTop: lerpColor(this.diffFrom.skyTop, to.skyTop, k),
        skyBottom: lerpColor(this.diffFrom.skyBottom, to.skyBottom, k)
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
    }

    // Cooled and desaturated sky.
    this.sky.clear();
    const top = coolDesat(this.diffCurrent.skyTop, cold);
    const bottom = coolDesat(this.diffCurrent.skyBottom, cold);
    this.sky.fillGradientStyle(top, top, bottom, bottom, 1);
    this.sky.fillRect(0, 0, WORLD.width, WORLD.height);

    // Paler moon.
    this.moon.setFillStyle(lerpColor(MOON_COLOR, MAGIC.coldMoonColor, cold), 0.9);

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
  private pickDeathCategory(newBestScore: boolean, previousBest: number): DeathCategory {
    if (newBestScore) return "newRecord";
    if (previousBest > 0 && this.score >= previousBest * DEATH_MESSAGE.nearRecordRatio) {
      return "nearRecord";
    }
    if (this.bestComboThisRun >= DEATH_MESSAGE.bigComboThreshold) return "bigCombo";
    if (this.runDuration < DEATH_MESSAGE.earlyDeathSeconds) return "earlyDeath";
    return "default";
  }

  /**
   * Mini bar chart of the last runs, oldest left. The best of the five is
   * highlighted. Drawn synchronously here — nothing about it is animated and
   * nothing about it delays the replay tap.
   */
  private drawHistory(history: number[]): void {
    this.historyBars.clear();
    for (const label of this.historyLabels) label.setVisible(false);
    if (history.length === 0) return;

    const best = Math.max(...history);
    const span = HISTORY.barWidth + HISTORY.barGap;
    const totalWidth = history.length * HISTORY.barWidth + (history.length - 1) * HISTORY.barGap;
    const startX = (WORLD.width - totalWidth) / 2 + HISTORY.barWidth / 2;

    history.forEach((score, index) => {
      const x = startX + index * span;
      // Scale against the best of the window; a zero score still shows a sliver.
      const ratio = best > 0 ? score / best : 0;
      const height = Math.max(HISTORY.minBarHeight, Math.round(ratio * HISTORY.maxBarHeight));
      const isBest = score === best;

      this.historyBars.fillStyle(isBest ? HISTORY.recordColor : HISTORY.color, isBest ? 0.95 : 0.5);
      this.historyBars.fillRoundedRect(
        x - HISTORY.barWidth / 2,
        HISTORY.baselineY - height,
        HISTORY.barWidth,
        height,
        3
      );

      const label = this.historyLabels[index];
      label
        .setText(String(score))
        .setPosition(x, HISTORY.baselineY + 6)
        .setColor(isBest ? HISTORY.recordLabelColor : HISTORY.labelColor)
        .setVisible(true);
    });
  }

  private die(): void {
    this.dead = true;
    this.witch.setAlpha(1);
    this.slowMoLeft = 0;
    this.tweens.timeScale = 1;
    this.sfx.death();

    // Persistence: the run is recorded exactly once, here.
    const { newBestScore, history, previousBest } = recordRun(
      this.score,
      this.bestComboThisRun,
      this.bestTierThisRun
    );
    this.lastRunWasRecord = newBestScore;
    this.deathCategory = this.pickDeathCategory(newBestScore, previousBest);

    // Tuning log. `runDuration` is real flown seconds, so DEBUG_START_TIER
    // cannot pollute the measurement.
    pushDeath({
      t: Math.round(this.runDuration * 10) / 10,
      tier: this.bestTierThisRun,
      cause: this.deathCause,
      grazes: this.grazesThisRun
    });

    this.refreshDeathTexts();
    this.drawHistory(history);

    // Resting scenery: hide the lost run and stop the gameplay emitters,
    // which would otherwise keep running behind an opaque sky.
    this.trailEmitter.stop();
    this.ambient.stop();
    this.setDeathSceneVisible(true);
    this.deathPanel.setVisible(true);
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

    // First successful graze ever: the onboarding disappears for good (no
    // text, no popup — it is simply no longer needed).
    if (this.teaching) {
      this.teaching = false;
      this.teachText.setVisible(false);
      markTutorialDone();
    }

    this.bestComboThisRun = Math.max(this.bestComboThisRun, this.combo);
    this.grazesThisRun += 1;

    const points = Math.round(SCORING.grazePoints * this.multiplier);
    this.score += points;
    this.spawnFloater(obstacle.grazeX, obstacle.grazeY, t("float.graze", { points }), {
      fontSize: "30px",
      fontStyle: "bold",
      color: FEEDBACK.grazeColor
    });

    this.sfx.graze(this.combo);

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
    const text = this.add
      .text(x, y, label, { fontFamily: "sans-serif", ...style })
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
        return true;
      }

      const inZone = d <= NEAR_MISS.grazeRadius;
      // Exaggerated halo on the first run's onboarding obstacle.
      const teach = this.teaching && obstacle === this.teachTarget;
      obstacle.halo.setAlpha(
        (inZone
          ? teach
            ? TEACH.haloAlphaActive
            : FEEDBACK.haloAlphaActive
          : teach
            ? TEACH.haloAlpha
            : FEEDBACK.haloAlpha) * obstacle.haloAlphaScale
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
        } else if (!obstacle.grazed && this.combo === 0) {
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

    this.magicFill.setDisplaySize(MAGIC.barWidth * ratio, MAGIC.barHeight);

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

    this.refreshHud();
    this.refreshMagic();
    this.applyAmbiance();
    if (this.teaching) this.updateTeach();
    if (DEBUG_HITBOX) this.drawDebug();
  }
}

/**
 * Desaturates and cools a colour: k=0 -> untouched, k=1 -> blue-grey of the
 * same luminance. This is the "cold" of a lost combo, instead of blackness.
 */
function coolDesat(color: number, k: number): number {
  const c = Phaser.Display.Color.ValueToColor(color);
  const lum = 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
  const r = Phaser.Math.Linear(c.red, lum * 0.8, k);
  const g = Phaser.Math.Linear(c.green, lum * 0.95, k);
  const b = Phaser.Math.Linear(c.blue, Math.min(255, lum * 1.25), k);
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
