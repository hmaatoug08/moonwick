import Phaser from "phaser";
import {
  AMBIENT,
  DEBUG_HITBOX,
  DEBUG_START_TIER,
  DEBUG_STATS,
  FEEDBACK,
  FULL_MOON,
  MAGIC,
  NEAR_MISS,
  OBSTACLES,
  RESTART,
  SCORING,
  SHAKE,
  SLOWMO,
  TEACH,
  TIER_FX,
  TIERS,
  TRAIL,
  WITCH,
  WORLD
} from "./config";
import { onLanguageChange, t } from "./i18n";
import { Difficulty, Obstacle, ObstacleSpawner } from "./obstacles";
import { isTutorialDone, markTutorialDone, recordRun } from "./save";
import { shareScoreImage } from "./share";
import { Sfx } from "./sfx";
import { ensureTextures, LIGHT_KEY, LIGHT_SIZE, SPARK_KEY } from "./textures";
import { buttonWidth, fitText } from "./ui";

/** Paramètres interpolés du moment : difficulté + ambiance du ciel. */
type TierParams = Difficulty & { skyTop: number; skyBottom: number };

const MOON_X = WORLD.width - 70;
const MOON_Y = 90;
const MOON_COLOR = 0xf5efd8;

/** Bande libre où se balade la sorcière de l'écran de mort (au-dessus du texte). */
const DEATH_WITCH_Y = 168;

/**
 * Profondeurs — INVARIANT de lisibilité : l'overlay d'assombrissement (2) est
 * SOUS les obstacles et leurs halos (3, voir obstacles.ts), la traînée (4) et
 * la sorcière (5). Il n'assombrit que le fond et le décor (0-1).
 */
const DEPTH_AMBIENT = 1;
const DEPTH_DARKNESS = 2;

/**
 * PHASE 4 — game feel.
 * Le score vient EXCLUSIVEMENT des frôlements. La traînée à particules est
 * l'indicateur principal du multiplicateur (le chiffre du HUD n'est qu'un
 * rappel), le frôlement secoue légèrement la caméra et siffle, un frôlement
 * extrême déclenche un ralenti, et le plafond de combo bascule la scène en
 * Pleine Lune.
 *
 * La jauge de magie NE TUE PAS : c'est le minuteur du multiplicateur, et
 * l'assombrissement qui l'accompagne est du pur retour visuel.
 * On ne meurt qu'en touchant un obstacle.
 */
export class FlightScene extends Phaser.Scene {
  private witch!: Phaser.GameObjects.Arc;
  private velocityY = 0;
  private holding = false;
  /** false = le doigt actuellement posé ne pilote pas (tap de relance). */
  private armed = true;
  private spawner!: ObstacleSpawner;

  private score = 0;
  private combo = 0;
  /** Obstacles dépassés depuis le début de la traversée en obscurité courante. */
  private darkStreak = 0;
  /** Jauge de magie, en secondes restantes. À 0 le multiplicateur retombe. */
  private magic: number = MAGIC.max;
  /** Phase de l'onde de vacillement, avance tant qu'on vacille. */
  private flickerPhase = 0;
  private dead = false;
  private deathAt = 0;

  /** Temps de jeu écoulé (s) — pilote les paliers. Gelé à la mort. */
  private runTime = 0;
  private tierIndex = 0;
  /** Paramètres au moment du dernier changement de palier (départ du lerp). */
  private diffFrom!: TierParams;
  /** Paramètres effectifs du frame courant. */
  private diffCurrent!: TierParams;
  private transitionT: number = TIER_FX.transitionS;

  /** Secondes de ralenti restantes. */
  private slowMoLeft = 0;
  /** Le système demande des animations réduites : ni shake ni ralenti. */
  private reducedMotion = false;
  private fullMoon = false;
  private readonly sfx = new Sfx();

  private trailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambient!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Clé du dernier état d'ambiance appliqué (évite les redessins inutiles). */
  private lastAmbianceKey = "";
  /** Alpha courant du liseré des obstacles (monte quand la lumière baisse). */
  private obstacleStrokeAlpha: number = OBSTACLES.colors.strokeAlphaLit;
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
  private recordText!: Phaser.GameObjects.Text;
  private shareLabel!: Phaser.GameObjects.Text;
  private homeLabel!: Phaser.GameObjects.Text;
  private replayLabel!: Phaser.GameObjects.Text;
  private deathBtnW = 148;
  private pauseTitleText!: Phaser.GameObjects.Text;
  private pauseHintText!: Phaser.GameObjects.Text;
  private shareZone!: Phaser.Geom.Rectangle;
  private homeZone!: Phaser.Geom.Rectangle;

  /** Décor animé de l'écran de mort : même esprit que l'accueil. */
  private deathScene: Phaser.GameObjects.GameObject[] = [];
  private deathWitch!: Phaser.GameObjects.Arc;
  private deathDust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private deathTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Meilleur combo atteint dans la run courante. */
  private bestComboThisRun = 0;
  /** Palier le plus loin atteint dans la run courante. */
  private bestTierThisRun = 0;
  /** La dernière run a battu le record (pour l'image de partage). */
  private lastRunWasRecord = false;
  private fpsText?: Phaser.GameObjects.Text;
  private debugGfx?: Phaser.GameObjects.Graphics;

  private lastDrawnScore = -1;
  private lastDrawnCombo = -1;

  /** Apprentissage première partie : actif tant qu'aucun frôlement réussi. */
  private teaching = false;
  private teachText!: Phaser.GameObjects.Text;

  /** Pause (onglet en arrière-plan) : le monde est gelé, on ne meurt pas. */
  private paused = false;
  private pausePanel!: Phaser.GameObjects.Container;
  private onVisibilityChange?: () => void;

  constructor() {
    super("flight");
  }

  private get multiplier(): number {
    return Math.min(1 + this.combo * NEAR_MISS.multiplierStep, NEAR_MISS.multiplierMax);
  }

  /** 0 à ×1, 1 au plafond : pilote toute l'intensité visuelle. */
  private get comboRatio(): number {
    const span = NEAR_MISS.multiplierMax - 1;
    return span <= 0 ? 1 : Phaser.Math.Clamp((this.multiplier - 1) / span, 0, 1);
  }

  /**
   * Vacillement = dernière ligne droite avant la perte du multiplicateur.
   * C'est un AVERTISSEMENT, plus un sursis avant la mort : on ne le déclenche
   * donc que s'il y a effectivement un multiplicateur à perdre.
   */
  private get flickering(): boolean {
    return this.combo > 0 && this.magic > 0 && this.magic <= MAGIC.flickerGrace;
  }

  create(): void {
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // Ciel dégradé nuit, redessiné à chaque changement de palier (ambiance).
    this.sky = this.add.graphics();

    // Lune + son halo de Pleine Lune (invisible tant qu'on n'est pas au plafond).
    this.moonGlow = this.add
      .circle(MOON_X, MOON_Y, FULL_MOON.glowRadius, FULL_MOON.glowColor, 1)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.moon = this.add.circle(MOON_X, MOON_Y, 34, MOON_COLOR, 0.9);

    ensureTextures(this);

    // Poussières d'ambiance : décor de fond, sous l'overlay (elles se
    // raréfient et se refroidissent quand la magie baisse).
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

    // Traînée : émetteur unique qui suit la sorcière, réglé par le combo.
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

    // La sorcière (placeholder : orbe). Le visuel est plus gros que la hitbox.
    this.witch = this.add.circle(WITCH.x, WORLD.height / 2, WITCH.radius, FULL_MOON.witchColorNormal);
    this.witch.setStrokeStyle(2, 0xffffff, 0.6);
    this.witch.setDepth(5);
    this.trailEmitter.startFollow(this.witch, TRAIL.offsetX, 0);

    this.spawner = new ObstacleSpawner(this);

    // Voile doré de Pleine Lune : bascule toute la palette d'un coup.
    this.moonVeil = this.add
      .rectangle(0, 0, WORLD.width, WORLD.height, FULL_MOON.veilColor, 1)
      .setOrigin(0, 0)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(14);

    // Nuit qui tombe : voile noir percé d'un halo de lumière sur la sorcière.
    // SOUS les obstacles, leurs halos et la sorcière (invariant de lisibilité) :
    // il n'assombrit que le fond et le décor.
    this.darkness = this.add
      .renderTexture(0, 0, WORLD.width, WORLD.height)
      .setOrigin(0, 0)
      .setDepth(DEPTH_DARKNESS);
    this.lightBrush = this.make.image({ key: LIGHT_KEY, add: false }).setOrigin(0.5);

    // Annonce de palier : nom en grand au centre, au-dessus du voile de nuit.
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

    // Mot d'apprentissage : suit le premier obstacle de la première partie.
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

    // Pause automatique dès que l'onglet passe en arrière-plan : on ne peut
    // pas mourir pendant une absence. La reprise se fait au tap.
    this.onVisibilityChange = () => {
      if (document.hidden) this.pauseRun();
    };
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.game.events.on(Phaser.Core.Events.BLUR, this.pauseRun, this);
    // Retrait des écouteurs globaux si la scène est arrêtée (retour menu).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.onVisibilityChange) {
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
      }
      this.game.events.off(Phaser.Core.Events.BLUR, this.pauseRun, this);
    });

    // Input : pointeur maintenu = poussée vers le haut.
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on("pointerup", () => {
      this.holding = false;
      // Le doigt est relâché : le prochain appui pilotera de nouveau.
      this.armed = true;
    });

    this.refreshTexts();
    this.resetRun();

    // Rafraîchissement immédiat au changement de langue, sans rechargement.
    const unsubscribeLang = onLanguageChange(() => this.refreshTexts());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribeLang);
  }

  private buildHud(): void {
    this.scoreText = this.add
      .text(WORLD.width / 2, 46, "0", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "64px",
        color: "#f5efd8"
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    this.multiplierText = this.add
      .text(WORLD.width / 2, 116, "×1", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "26px",
        color: "#d9a7ff"
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    // Jauge de magie : barre fine, discrète, juste sous le multiplicateur.
    const barX = (WORLD.width - MAGIC.barWidth) / 2;
    this.add
      .rectangle(barX, MAGIC.barY, MAGIC.barWidth, MAGIC.barHeight, 0xffffff, MAGIC.barTrackAlpha)
      .setOrigin(0, 0.5)
      .setDepth(20);
    this.magicFill = this.add
      .rectangle(barX, MAGIC.barY, MAGIC.barWidth, MAGIC.barHeight, MAGIC.barColor, 0.9)
      .setOrigin(0, 0.5)
      .setDepth(20);

    // Overlay de debug : créé uniquement si DEBUG_STATS (jamais en production).
    if (DEBUG_STATS) {
      this.fpsText = this.add
        .text(8, 8, "", { fontFamily: "monospace", fontSize: "12px", color: "#8877aa" })
        .setDepth(20);
    }
  }

  /**
   * Décor de l'écran de mort : un ciel opaque qui masque complètement la
   * partie perdue, plus la lune, les poussières et une sorcière qui se
   * balade — le même repos visuel que l'accueil. Créé UNE fois (le restart
   * ne fait que basculer des visibilités, il reste sous 300 ms).
   */
  private buildDeathScene(): void {
    const tier = TIERS[0];

    const sky = this.add.graphics().setDepth(28);
    sky.fillGradientStyle(tier.skyTop, tier.skyTop, tier.skyBottom, tier.skyBottom, 1);
    sky.fillRect(0, 0, WORLD.width, WORLD.height);

    // Halo doux : la texture radiale, pas un cercle plein (bord dur affreux).
    const glow = this.add
      .image(MOON_X, MOON_Y, LIGHT_KEY)
      .setDisplaySize(340, 340)
      .setTint(FULL_MOON.glowColor)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(28);
    const moon = this.add.circle(MOON_X, MOON_Y, 34, MOON_COLOR, 0.9).setDepth(28);

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

    // Traînée dorée « de belle partie », comme au menu.
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

    this.deathWitch = this.add
      .circle(WORLD.width / 2, DEATH_WITCH_Y, WITCH.radius, FULL_MOON.witchColorNormal)
      .setDepth(29);
    this.deathWitch.setStrokeStyle(2, 0xffffff, 0.6);
    this.deathTrail.startFollow(this.deathWitch, TRAIL.offsetX, 0);

    this.deathScene = [sky, glow, moon, this.deathDust, this.deathTrail, this.deathWitch];
    this.setDeathSceneVisible(false);
  }

  private setDeathSceneVisible(on: boolean): void {
    for (const object of this.deathScene) {
      (object as unknown as { setVisible(v: boolean): void }).setVisible(on);
    }
    // Les émetteurs ne tournent que quand l'écran est affiché.
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

  /** La sorcière de l'écran de mort se balade dans la bande libre du haut. */
  private updateDeathScene(time: number): void {
    const t = time / 1000;
    this.deathWitch.x = WORLD.width * 0.5 + Math.sin(t * 0.75) * WORLD.width * 0.34;
    this.deathWitch.y = DEATH_WITCH_Y + Math.sin(t * 1.6) * 26;
  }

  private buildDeathPanel(): void {
    const cx = WORLD.width / 2;

    // Voile léger : le décor animé reste visible dessous, le texte reste net.
    const veil = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x05030c, 0.34).setOrigin(0, 0);

    this.recordText = this.add
      .text(cx, 236, "", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "28px",
        color: "#ffd27a"
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

    // Cause de la mort : le joueur doit comprendre en un coup d'œil.
    this.deathCauseText = this.add
      .text(cx, 392, "", {
        fontFamily: "sans-serif",
        fontSize: "20px",
        color: "#c9a0ff"
      })
      .setOrigin(0.5);

    // Bilan de la run : palier atteint + meilleur combo.
    this.deathStatsText = this.add
      .text(cx, 452, "", {
        fontFamily: "sans-serif",
        fontSize: "22px",
        color: "#d9a7ff",
        align: "center",
        lineSpacing: 8
      })
      .setOrigin(0.5);

    // Deux boutons secondaires côte à côte, au-dessus de la zone du pouce.
    // Largeur commune calée sur la plus longue traduction des DEUX libellés
    // dans les 4 langues (« Compartir »/« Condividi » dépassent « Share »).
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

    // Rejouer : occupe tout le bas de l'écran, atteignable au pouce.
    // Pas de zone de test dédiée : tout tap hors « Partager » relance.
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

    // Un seul conteneur à basculer : la relance ne recharge jamais la scène.
    this.deathPanel = this.add
      .container(0, 0, [
        veil,
        this.recordText,
        this.deathScoreText,
        this.deathCauseText,
        this.deathStatsText,
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

  /** Gèle la partie sans tuer : appelée quand l'onglet part en arrière-plan. */
  private pauseRun(): void {
    if (this.dead || this.paused) return;
    this.paused = true;
    this.holding = false;
    // Le doigt réel n'est plus connu au retour : on désarme jusqu'au prochain
    // relâchement, sinon un doigt « fantôme » ferait monter la sorcière.
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
   * Tous les libellés statiques de la scène, (re)posés puis ajustés à leur
   * zone. Appelé au démarrage et à chaque changement de langue — les textes
   * dynamiques (score, bilan) sont rafraîchis par refreshDeathTexts().
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

    // Le nom du palier en cours d'annonce change aussi de langue.
    if (this.tierText.alpha > 0) {
      this.tierText.setText(t(TIERS[this.tierIndex].nameKey));
      fitText(this.tierText, WORLD.width - 48, 42);
    }

    if (this.dead) this.refreshDeathTexts();
  }

  /** Libellés dépendant de la run affichée sur l'écran de mort. */
  private refreshDeathTexts(): void {
    this.deathScoreText.setText(String(this.score));
    fitText(this.deathScoreText, WORLD.width - 48, 96);

    this.recordText.setText(t("death.newRecord"));
    fitText(this.recordText, WORLD.width - 48, 28);

    this.deathCauseText.setText(t("death.causeBranch"));
    fitText(this.deathCauseText, WORLD.width - 48, 20);

    this.deathStatsText.setText(
      `${t("death.tier", { tier: t(TIERS[this.bestTierThisRun].nameKey) })}\n` +
        `${t("death.bestCombo", { combo: this.bestComboThisRun })}`
    );
    fitText(this.deathStatsText, WORLD.width - 48, 22);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Le contexte audio ne peut s'ouvrir que sur un geste utilisateur.
    this.sfx.unlock();

    if (this.paused) {
      // Ce tap ne fait que reprendre : il ne pilote pas.
      this.resumeRun();
      return;
    }

    if (this.dead) {
      if (this.time.now - this.deathAt < RESTART.minDeathMs) return;
      // Seuls « Partager » et « Accueil » détournent le tap ; partout ailleurs
      // on relance, pour que l'envie de rejouer ne bute jamais sur une zone morte.
      if (this.shareZone.contains(pointer.x, pointer.y)) {
        void this.shareRun();
        return;
      }
      if (this.homeZone.contains(pointer.x, pointer.y)) {
        // Retour à l'accueil : le SHUTDOWN de la scène retire les écouteurs
        // globaux de pause, et le menu relira les stats à jour.
        this.scene.start("menu");
        return;
      }
      this.resetRun();
      // Ce tap relance la partie : il ne doit pas faire monter la sorcière.
      this.armed = false;
      return;
    }
    if (this.armed) this.holding = true;
  }

  /** Restart en place : on ne recrée ni la scène ni le décor. */
  private resetRun(): void {
    this.spawner.reset();
    this.trailEmitter.killAll();

    this.witch.setPosition(WITCH.x, WORLD.height / 2);
    this.witch.setScale(1, 1);
    this.witch.setAlpha(1);
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
    this.bestTierThisRun = 0;
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

    // Palier de départ : normal, ou forcé par DEBUG_START_TIER (test sans
    // rejouer 80 s). Les paramètres sont posés d'un coup, sans interpolation
    // depuis la partie précédente.
    const startTier = DEBUG_START_TIER >= 0 ? Math.min(DEBUG_START_TIER, TIERS.length - 1) : 0;
    this.runTime = TIERS[startTier].startTime;
    this.tierIndex = startTier;
    this.diffCurrent = this.tierParams(startTier);
    this.diffFrom = { ...this.diffCurrent };
    this.transitionT = TIER_FX.transitionS;
    this.ambient.killAll();
    this.applyAmbiance(true);
    this.announceTier(TIERS[startTier].nameKey);

    // Apprentissage : uniquement tant que le premier frôlement n'a jamais
    // été réussi (persiste entre les runs de la première session).
    this.teaching = !isTutorialDone();
    this.teachText.setVisible(false);

    this.setFullMoon(false, true);
    this.refreshHud();
    this.refreshComboVisuals();
    this.refreshMagic();
  }

  /** Partage de la run affichée sur l'écran de mort. */
  private async shareRun(): Promise<void> {
    await shareScoreImage({
      score: this.score,
      tierName: t(TIERS[this.bestTierThisRun].nameKey),
      bestCombo: this.bestComboThisRun,
      isRecord: this.lastRunWasRecord
    });
  }

  /** L'obstacle porteur de l'apprentissage : le plus ancien encore à frôler. */
  private get teachTarget(): Obstacle | null {
    if (!this.teaching) return null;
    for (const obstacle of this.spawner.all) {
      if (!obstacle.grazed && !obstacle.passed) return obstacle;
    }
    return null;
  }

  /** Le mot « FRÔLE » suit l'obstacle cible, au centre de son passage. */
  private updateTeach(): void {
    const target = this.teachTarget;
    if (!target) {
      this.teachText.setVisible(false);
      return;
    }
    const bandCenter =
      (Math.max(target.gapTop, 0) + Math.min(target.gapBottom, WORLD.height)) / 2;
    // Clampé sur la largeur RÉELLE du mot traduit (« SFIORA » est bien plus
    // large que « ROZA ») : il ne sort jamais de l'écran, dans aucune langue.
    const x = Math.max(this.teachText.width / 2 + 10, target.x + TEACH.offsetX);
    this.teachText.setPosition(x, bandCenter).setVisible(true);
  }

  private tierParams(index: number): TierParams {
    const tier = TIERS[index];
    return {
      speed: tier.scrollSpeed,
      gapSize: tier.gapSize,
      spawnInterval: tier.spawnInterval,
      skyTop: tier.skyTop,
      skyBottom: tier.skyBottom
    };
  }

  /** Dernier palier dont le startTime est atteint. */
  private tierIndexFor(time: number): number {
    let index = 0;
    for (let i = 0; i < TIERS.length; i++) {
      if (time >= TIERS[i].startTime) index = i;
    }
    return index;
  }

  /**
   * Temps de jeu -> palier courant -> paramètres effectifs.
   * Au changement de palier : annonce du nom, puis interpolation douce sur
   * TIER_FX.transitionS pour éviter l'à-coup. Le dernier palier est un
   * plateau : une fois sa transition finie, plus rien ne bouge.
   */
  private updateDifficulty(dt: number): void {
    this.runTime += dt;

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
        skyTop: lerpColor(this.diffFrom.skyTop, to.skyTop, k),
        skyBottom: lerpColor(this.diffFrom.skyBottom, to.skyBottom, k)
      };
      // Le redessin du ciel passe par applyAmbiance (clé changée par le lerp).
    }
  }

  /**
   * Ambiance = décor uniquement, jamais la couche de jeu.
   * Quand la magie baisse, le monde se DÉSATURE et se refroidit : ciel gris
   * bleuté, lune pâlie, poussières raréfiées et froides. En parallèle, le
   * liseré des obstacles se renforce — leur lisibilité est un invariant.
   * Ne redessine que si l'état quantifié a changé (transition ou jauge).
   */
  private applyAmbiance(force = false): void {
    const ratio = Phaser.Math.Clamp(this.magic / MAGIC.max, 0, 1);
    const cold = MAGIC.desatMax * (1 - ratio);
    const key = `${Math.round(cold * 64)}|${this.diffCurrent.skyTop}|${this.diffCurrent.skyBottom}`;
    if (!force && key === this.lastAmbianceKey) return;
    this.lastAmbianceKey = key;

    // Ciel refroidi et désaturé.
    this.sky.clear();
    const top = coolDesat(this.diffCurrent.skyTop, cold);
    const bottom = coolDesat(this.diffCurrent.skyBottom, cold);
    this.sky.fillGradientStyle(top, top, bottom, bottom, 1);
    this.sky.fillRect(0, 0, WORLD.width, WORLD.height);

    // Lune pâlie.
    this.moon.setFillStyle(lerpColor(MOON_COLOR, MAGIC.coldMoonColor, cold), 0.9);

    // Poussières d'ambiance raréfiées et refroidies.
    this.ambient.frequency = Phaser.Math.Linear(AMBIENT.frequencyCold, AMBIENT.frequencyLit, ratio);
    this.ambient.setParticleAlpha({
      start: Phaser.Math.Linear(AMBIENT.alphaCold, AMBIENT.alphaLit, ratio),
      end: 0
    });
    this.ambient.setParticleTint(lerpColor(AMBIENT.colorCold, AMBIENT.colorLit, ratio));

    // Contraste garanti : liseré renforcé quand la lumière baisse
    // (appliqué à chaque obstacle dans updateNearMiss).
    this.obstacleStrokeAlpha = Phaser.Math.Linear(
      OBSTACLES.colors.strokeAlphaDark,
      OBSTACLES.colors.strokeAlphaLit,
      ratio
    );
  }

  /** Nom du palier en grand : fondu entrant, maintien, fondu sortant. */
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

  private die(): void {
    this.dead = true;
    this.deathAt = this.time.now;
    this.witch.setAlpha(1);
    this.slowMoLeft = 0;
    this.tweens.timeScale = 1;
    this.sfx.death();

    // Persistance : la run est enregistrée une seule fois, ici.
    const { newBestScore } = recordRun(this.score, this.bestComboThisRun, this.bestTierThisRun);
    this.lastRunWasRecord = newBestScore;

    this.refreshDeathTexts();
    this.recordText.setVisible(newBestScore);

    // Décor de repos : on masque la partie perdue et on coupe les émetteurs
    // du jeu, qui continueraient sinon à tourner derrière un ciel opaque.
    this.trailEmitter.stop();
    this.ambient.stop();
    this.setDeathSceneVisible(true);
    this.deathPanel.setVisible(true);
  }

  /**
   * ENTRÉE dans la zone de frôlement : on recharge tout de suite.
   * Recharger dès l'entrée (et non à la sortie) évite de perdre le
   * multiplicateur alors qu'on est déjà en train de frôler correctement.
   */
  private onGrazeEnter(): void {
    this.magic = MAGIC.max;
    this.flickerPhase = 0;
    this.witch.setAlpha(1);
  }

  /** SORTIE de la zone : c'est là, et seulement là, qu'on marque des points. */
  private onGrazeExit(obstacle: Obstacle): void {
    this.combo += 1;
    // Le frôlement relance le combo : la prochaine traversée en obscurité
    // repartira du début de la séquence de points dégressifs.
    this.darkStreak = 0;

    // Premier frôlement réussi de tous les temps : l'apprentissage disparaît
    // définitivement (aucun texte, aucune popup, juste plus besoin de lui).
    if (this.teaching) {
      this.teaching = false;
      this.teachText.setVisible(false);
      markTutorialDone();
    }

    this.bestComboThisRun = Math.max(this.bestComboThisRun, this.combo);

    const points = Math.round(SCORING.grazePoints * this.multiplier);
    this.score += points;
    this.spawnFloater(obstacle.grazeX, obstacle.grazeY, t("float.graze", { points }), {
      fontSize: "30px",
      fontStyle: "bold",
      color: FEEDBACK.grazeColor
    });

    this.sfx.graze(this.combo);

    // Secousse proportionnelle au combo, mais toujours minuscule.
    if (!this.reducedMotion) {
      const px = Phaser.Math.Linear(SHAKE.minPx, SHAKE.maxPx, this.comboRatio);
      this.cameras.main.shake(
        SHAKE.durationMs,
        new Phaser.Math.Vector2(px / WORLD.width, px / WORLD.height)
      );
    }

    // Frôlement extrême : ralenti. La mort est à 10 px, le seuil à 18 :
    // la fenêtre est étroite, donc le ralenti reste un moment rare.
    if (!this.reducedMotion && obstacle.minDistance < SLOWMO.thresholdPx) {
      this.slowMoLeft = SLOWMO.durationMs / 1000;
    }
  }

  /** Texte qui monte et s'efface, puis se détruit. */
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
   * Un passage dans l'anneau = un frôlement, validé seulement quand
   * l'obstacle ressort de l'anneau ou passe derrière la sorcière.
   * Retourne true si la sorcière est morte.
   */
  private updateNearMiss(): boolean {
    const wx = this.witch.x;
    const wy = this.witch.y;

    for (const obstacle of this.spawner.all) {
      const d = obstacle.distanceTo(wx, wy);

      if (d <= NEAR_MISS.deathRadius) return true;

      const inZone = d <= NEAR_MISS.grazeRadius;
      // Halo exagéré sur l'obstacle d'apprentissage de la première partie.
      const teach = this.teaching && obstacle === this.teachTarget;
      obstacle.halo.setAlpha(
        inZone
          ? teach
            ? TEACH.haloAlphaActive
            : FEEDBACK.haloAlphaActive
          : teach
            ? TEACH.haloAlpha
            : FEEDBACK.haloAlpha
      );
      // Invariant de lisibilité : liseré renforcé quand la lumière baisse.
      obstacle.setContrast(this.obstacleStrokeAlpha);

      if (inZone) {
        // Front montant : on vient d'entrer dans l'anneau -> recharge immédiate.
        if (!obstacle.inGrazeZone) {
          obstacle.inGrazeZone = true;
          if (!obstacle.grazeEntered) {
            obstacle.grazeEntered = true;
            this.onGrazeEnter();
          }
        }
        // On retient le point le plus proche : c'est là qu'on affichera le texte.
        if (d < obstacle.minDistance) {
          obstacle.minDistance = d;
          obstacle.grazeX = wx;
          obstacle.grazeY = wy;
        }
      } else if (obstacle.inGrazeZone) {
        // Front descendant : sorti de l'anneau sans toucher, le score est acquis.
        obstacle.inGrazeZone = false;
        if (!obstacle.grazed) {
          obstacle.grazed = true;
          this.onGrazeExit(obstacle);
        }
      }

      if (!obstacle.passed && obstacle.isBehind(wx)) {
        obstacle.passed = true;
        // Filet de sécurité : dépassé alors qu'on est encore dans l'anneau.
        if (obstacle.inGrazeZone && !obstacle.grazed) {
          obstacle.grazed = true;
          this.onGrazeExit(obstacle);
        } else if (!obstacle.grazed && this.combo === 0) {
          // DARK_POINTS dégressifs : le Nième obstacle de la traversée en
          // obscurité rapporte la Nième valeur de la séquence, puis 0.
          // Combo actif -> rien : seuls les frôlements marquent.
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
      // Le combo a bougé : c'est le seul moment où la traînée doit être
      // reconfigurée (inutile et coûteux de le faire à chaque frame).
      this.refreshComboVisuals();
    }
  }

  /** Traînée + Pleine Lune : tout ce qui traduit le multiplicateur en image. */
  private refreshComboVisuals(): void {
    const t = this.comboRatio;
    const emitter = this.trailEmitter;

    emitter.frequency = Phaser.Math.Linear(TRAIL.frequencyIdle, TRAIL.frequencyMax, t);
    emitter.setParticleLifespan(Phaser.Math.Linear(TRAIL.lifespanIdle, TRAIL.lifespanMax, t));
    // L'alpha garde sa rampe vers 0 (c'est lui qui éteint la particule) ;
    // setParticleScale n'accepte que des nombres, donc la taille reste fixe.
    emitter.setParticleAlpha({ start: Phaser.Math.Linear(TRAIL.alphaIdle, TRAIL.alphaMax, t), end: 0 });
    const scale = Phaser.Math.Linear(TRAIL.scaleIdle, TRAIL.scaleMax, t);
    emitter.setParticleScale(scale, scale);
    emitter.setParticleTint(lerpColor(TRAIL.colorIdle, TRAIL.colorMax, t));

    this.setFullMoon(this.multiplier >= NEAR_MISS.multiplierMax);
  }

  /** Bascule de la Pleine Lune. `instant` sert au restart. */
  private setFullMoon(on: boolean, instant = false): void {
    if (this.fullMoon === on && !instant) return;
    this.fullMoon = on;

    this.witch.setFillStyle(on ? FULL_MOON.witchColor : FULL_MOON.witchColorNormal);

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

  /** Onde du vacillement, entre 0 et 1. */
  private get flickerWave(): number {
    return 0.5 + 0.5 * Math.sin(this.flickerPhase * Math.PI * 2 * MAGIC.flickerPulseHz);
  }

  /** La sorcière clignote : signal « ton multiplicateur va sauter ». */
  private updateFlicker(): void {
    if (!this.flickering) {
      this.witch.setAlpha(1);
      return;
    }
    this.witch.setAlpha(this.flickerWave > 0.5 ? 1 : MAGIC.flickerWitchAlpha);
  }

  /** Barre de jauge + voile de nuit, tous deux pilotés par la magie restante. */
  private refreshMagic(): void {
    const ratio = Phaser.Math.Clamp(this.magic / MAGIC.max, 0, 1);

    this.magicFill.setDisplaySize(MAGIC.barWidth * ratio, MAGIC.barHeight);

    let alpha = Phaser.Math.Linear(MAGIC.darkAlphaEmpty, MAGIC.darkAlphaFull, ratio);
    // Pendant le sursis, le voile pulse : la nuit « respire » avant de tomber.
    if (this.flickering) {
      alpha = Phaser.Math.Clamp(alpha - MAGIC.flickerDarkSwing * this.flickerWave, 0, 1);
    }
    this.darkness.clear();
    if (alpha <= 0.001) return;

    this.darkness.fill(0x000000, alpha);
    // On perce le voile autour de la sorcière : le halo rétrécit avec la jauge.
    const radius = Phaser.Math.Linear(MAGIC.lightRadiusEmpty, MAGIC.lightRadiusFull, ratio);
    this.lightBrush.setPosition(this.witch.x, this.witch.y).setScale((radius * 2) / LIGHT_SIZE);
    this.darkness.erase(this.lightBrush);
  }

  private drawDebug(): void {
    const g = this.debugGfx;
    if (!g) return;
    g.clear();

    // Formes de collision réelles des obstacles.
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

    // Anneau de frôlement puis hitbox mortelle, autour de la sorcière.
    g.lineStyle(1, 0x4dff9e, 0.6);
    g.strokeCircle(this.witch.x, this.witch.y, NEAR_MISS.grazeRadius);
    g.lineStyle(2, 0xff4d4d, 0.9);
    g.strokeCircle(this.witch.x, this.witch.y, NEAR_MISS.deathRadius);
  }

  /**
   * Facteur de ralenti du frame, et décompte du ralenti en temps RÉEL
   * (sinon le ralenti se ralentirait lui-même et ne finirait jamais).
   */
  private consumeTimeScale(realDt: number): number {
    if (this.slowMoLeft <= 0) return 1;

    this.slowMoLeft = Math.max(0, this.slowMoLeft - realDt);
    const k = this.slowMoLeft / (SLOWMO.durationMs / 1000);
    // k=1 au déclenchement -> scale plancher, puis remontée progressive vers 1.
    return Phaser.Math.Linear(1, SLOWMO.scale, k);
  }

  update(time: number, deltaMs: number): void {
    this.fpsText?.setText(
      `${Math.round(this.game.loop.actualFps)} fps | ` +
        `${Math.round(this.diffCurrent.speed)} px/s | ${t(TIERS[this.tierIndex].nameKey)}`
    );

    // Mort : le monde est gelé, seul le décor de l'écran de rejeu s'anime.
    if (this.dead) {
      this.updateDeathScene(time);
      return;
    }
    // En pause : tout est gelé, aucune mort possible.
    if (this.paused) return;

    const realDt = deltaMs / 1000;
    const timeScale = this.consumeTimeScale(realDt);
    // Les tweens suivent le ralenti pour que les textes flottants restent cohérents.
    this.tweens.timeScale = timeScale;
    const dt = realDt * timeScale;

    // --- Vol : gravité douce + poussée au maintien.
    this.velocityY += (this.holding ? WITCH.thrust : WITCH.gravity) * dt;
    this.velocityY = Phaser.Math.Clamp(this.velocityY, -WITCH.maxSpeed, WITCH.maxSpeed);
    this.witch.y = Phaser.Math.Clamp(
      this.witch.y + this.velocityY * dt,
      WITCH.marginTop,
      WORLD.height - WITCH.marginBottom
    );

    // Légère inclinaison visuelle selon la vitesse (feel).
    this.witch.setScale(1, 1 - Math.abs(this.velocityY) / 2400);

    // --- Difficulté : temps de jeu, palier courant, interpolation douce.
    this.updateDifficulty(dt);

    // --- Obstacles : génération + défilement au rythme du palier.
    this.spawner.update(dt, this.diffCurrent);

    // --- Near-miss, score, mort. Seule une collision peut tuer.
    if (this.updateNearMiss()) {
      this.die();
      return;
    }

    // --- Magie : elle ne descend que si aucun frôlement n'a rechargé ce frame.
    this.magic = Math.max(0, this.magic - MAGIC.drainPerSecond * dt);
    // Jauge vide : on perd le multiplicateur, jamais la partie.
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
 * Désature et refroidit une couleur : k=0 -> intacte, k=1 -> gris bleuté de
 * même luminance. C'est le « froid » de la perte de combo, à la place du noir.
 */
function coolDesat(color: number, k: number): number {
  const c = Phaser.Display.Color.ValueToColor(color);
  const lum = 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
  const r = Phaser.Math.Linear(c.red, lum * 0.8, k);
  const g = Phaser.Math.Linear(c.green, lum * 0.95, k);
  const b = Phaser.Math.Linear(c.blue, Math.min(255, lum * 1.25), k);
  return Phaser.Display.Color.GetColor(Math.round(r), Math.round(g), Math.round(b));
}

/** Interpolation de deux couleurs entières, pour la teinte des particules. */
function lerpColor(from: number, to: number, t: number): number {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(from),
    Phaser.Display.Color.ValueToColor(to),
    100,
    Phaser.Math.Clamp(t, 0, 1) * 100
  );
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}
