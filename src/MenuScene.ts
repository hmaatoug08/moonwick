import Phaser from "phaser";
import {
  AMBIENT,
  BRAND,
  FEEDBACK,
  DEATHS,
  FIREFLIES,
  FULL_MOON,
  MERCY,
  NEAR_MISS,
  OBSTACLE_ART,
  SAFE_BOTTOM,
  TIERS,
  TRAIL,
  WITCH,
  WORLD
} from "./config";
import { drawBookIcon } from "./icons";
import { MOON_ON_RIGHT } from "./obstacleShapes";
import { Witch } from "./witchShape";
import { getLanguage, LANG_NAMES, LANGS, Lang, onLanguageChange, setLanguage, t } from "./i18n";
import { isSoundEnabled, loadDeaths, loadStats, setSoundEnabled, shouldEase } from "./save";
import { ensureTextures, LIGHT_KEY, SPARK_KEY } from "./textures";
import { buttonWidth, fitText } from "./ui";

/**
 * Home screen: logo, best score, "tap to play" (the whole screen), and a gear
 * icon that opens the settings (language + sound).
 * The background reuses the in-game scenery, with a witch flying on a loop.
 *
 * No literal display string here: everything goes through i18n, except the
 * brand name, which is never translated.
 */
/** How long the logo must be held to open the tuning readout. */
const LONG_PRESS_MS = 700;

/** Minimum touch target, per the usual mobile accessibility floor. */
const MIN_TOUCH_PX = 44;

export class MenuScene extends Phaser.Scene {
  private demoWitch!: Witch;
  /** The branch she grazes on a loop, and the state of that loop. */
  private demoBranch!: { x: number; tipY: number; halfWidth: number };
  private demoTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private demoFlies!: Phaser.GameObjects.Particles.ParticleEmitter;
  private demoGrazing = false;
  /** 1 right after a graze, decaying to 0: drives the trail blaze. */
  private demoBlaze = 0;

  private titleText!: Phaser.GameObjects.Text;
  private brandGlow!: Phaser.GameObjects.Image;
  private bestText!: Phaser.GameObjects.Text;
  private playText!: Phaser.GameObjects.Text;

  private settingsPanel!: Phaser.GameObjects.Container;
  private gearIcon!: Phaser.GameObjects.Graphics;
  private gearLabel!: Phaser.GameObjects.Text;
  private scoresBg!: Phaser.GameObjects.Rectangle;
  private scoresIcon!: Phaser.GameObjects.Graphics;
  private scoresLabel!: Phaser.GameObjects.Text;
  private scoresZone!: Phaser.Geom.Rectangle;
  private settingsOpen = false;
  private gearZone!: Phaser.Geom.Rectangle;
  private backZone!: Phaser.Geom.Rectangle;
  private soundZone!: Phaser.Geom.Rectangle;
  private howToZone!: Phaser.Geom.Rectangle;
  private langZones: { lang: Lang; zone: Phaser.Geom.Rectangle }[] = [];

  /** "How to play" page: reachable only from the settings, never automatic. */
  private helpPanel!: Phaser.GameObjects.Container;
  private helpOpen = false;

  /** Tuning readout: long press on the logo. See buildStats(). */
  private statsOpen = false;
  private statsPanel!: Phaser.GameObjects.Container;
  private statsText!: Phaser.GameObjects.Text;
  private titleZone!: Phaser.Geom.Rectangle;
  private longPress?: Phaser.Time.TimerEvent;
  /** The long press already opened the stats: the release must not start a run. */
  private longPressFired = false;
  private helpBackZone!: Phaser.Geom.Rectangle;
  private helpTitleText!: Phaser.GameObjects.Text;
  private helpBackText!: Phaser.GameObjects.Text;
  private helpCaptions: Phaser.GameObjects.Text[] = [];
  private howToText!: Phaser.GameObjects.Text;

  private settingsTitleText!: Phaser.GameObjects.Text;
  private langLabelText!: Phaser.GameObjects.Text;
  private soundLabelText!: Phaser.GameObjects.Text;
  private soundValueText!: Phaser.GameObjects.Text;
  private backText!: Phaser.GameObjects.Text;
  private langRows: { lang: Lang; bg: Phaser.GameObjects.Rectangle }[] = [];

  /** Fixed widths, computed from the longest of the 4 translations. */
  private widths: Record<string, number> = {};

  constructor() {
    super("menu");
  }

  create(): void {
    ensureTextures(this);
    const tier = TIERS[0];

    // Scenery: same sky, same moon, same dust as the game.
    const sky = this.add.graphics();
    sky.fillGradientStyle(tier.skyTop, tier.skyTop, tier.skyBottom, tier.skyBottom, 1);
    sky.fillRect(0, 0, WORLD.width, WORLD.height);
    this.add.circle(WORLD.width - 70, 90, 34, 0xf5efd8, 0.9);

    this.add
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
      .setDepth(1);

    // A branch for the demo witch to graze, with its halo and its fireflies.
    // The home screen is the first thing a player ever sees, so it shows the
    // reward loop rather than describing it: she skims the ring, the fireflies
    // come to her, the trail blazes.
    // Anchored at the BOTTOM: a top branch would run its halo straight through
    // the logo and the best score. Its tip sits ~20 px under the lowest point
    // of her loop, which is a graze and never a hit.
    this.demoBranch = { x: WORLD.width * 0.63, tipY: WORLD.height * 0.575, halfWidth: 13 };
    const branchArt = this.add.graphics().setDepth(3);
    const drawBar = (color: number, alpha: number, half: number) => {
      branchArt.fillStyle(color, alpha);
      branchArt.fillRoundedRect(
        this.demoBranch.x - half,
        this.demoBranch.tipY - half,
        half * 2,
        WORLD.height - this.demoBranch.tipY + half * 2,
        half
      );
    };
    drawBar(FEEDBACK.haloColor, FEEDBACK.haloAlpha, this.demoBranch.halfWidth + NEAR_MISS.grazeRadius);
    drawBar(OBSTACLE_ART.bodyColor, 1, this.demoBranch.halfWidth);

    this.demoTrail = this.add.particles(0, 0, SPARK_KEY, {
      frequency: TRAIL.frequencyIdle,
      lifespan: TRAIL.lifespanIdle,
      speed: { min: TRAIL.driftMin, max: TRAIL.driftMax },
      angle: { min: 180 - TRAIL.spreadDeg, max: 180 + TRAIL.spreadDeg },
      scale: TRAIL.scaleIdle,
      alpha: { start: TRAIL.alphaIdle, end: 0 },
      tint: TRAIL.colorIdle,
      blendMode: Phaser.BlendModes.ADD
    });
    this.demoTrail.setDepth(4);
    this.demoWitch = new Witch(this, WORLD.width * 0.5, WORLD.height * 0.47, 5);
    this.demoTrail.startFollow(this.demoWitch.follow, TRAIL.offsetX, 0);

    this.demoFlies = this.add.particles(0, 0, SPARK_KEY, {
      speed: { min: 30, max: 90 },
      lifespan: 500,
      scale: 0.4,
      alpha: { start: 0.9, end: 0 },
      tint: FIREFLIES.color,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false
    });
    this.demoFlies.setDepth(4);

    this.buildHome();
    this.buildSettings();
    this.buildHelp();
    this.buildStats();
    // Phaser reuses the scene instance, so the open/closed state must be
    // reset here, otherwise it would survive a return to the menu.
    this.settingsOpen = false;
    this.settingsPanel.setVisible(false);
    this.helpOpen = false;
    this.helpPanel.setVisible(false);
    this.statsOpen = false;
    this.statsPanel.setVisible(false);
    this.refreshTexts();
    this.setHomeVisible(true);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on("pointerup", () => this.onPointerUp());
    this.input.on("pointerupoutside", () => this.onPointerUp());
    // A pending long press must not fire into a scene that is going away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cancelLongPress());

    // Immediate refresh when the language changes, with no reload.
    const unsubscribe = onLanguageChange(() => this.refreshTexts());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  private buildHome(): void {
    const cx = WORLD.width / 2;

    // Moon glow behind the logo: breathes very slowly, additive blend.
    this.brandGlow = this.add
      .image(cx, 210, LIGHT_KEY)
      .setDisplaySize(BRAND.glowSize, BRAND.glowSize * 0.55)
      .setTint(BRAND.glowColor)
      .setAlpha(BRAND.glowAlphaMin)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(19);
    this.tweens.add({
      targets: this.brandGlow,
      alpha: BRAND.glowAlphaMax,
      duration: BRAND.glowPulseMs,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // The title is a LOGO, not interface text: untranslated brand, large size,
    // wide letter-spacing. It therefore never goes through i18n.
    this.titleText = this.add
      .text(cx, 210, BRAND.name, {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: BRAND.color
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.titleText.setLetterSpacing(BRAND.letterSpacing);
    fitText(this.titleText, WORLD.width - 40, BRAND.fontSizePx);
    // Long-press target. Padded well beyond the glyphs: this is a hidden
    // gesture, it should not demand precision.
    this.titleZone = new Phaser.Geom.Rectangle(0, 150, WORLD.width, 130);

    this.bestText = this.add
      .text(cx, 278, "", { fontFamily: "sans-serif", color: "#d9a7ff" })
      .setOrigin(0.5)
      .setDepth(20);

    this.playText = this.add
      .text(cx, WORLD.height * 0.68, "", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#f2c8ff"
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.tweens.add({ targets: this.playText, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });

    // Scores: the progression hub, reachable from here and from nowhere else.
    // A labelled button rather than an icon alone — it is a place, not a toggle.
    // The label is `t("scores")`; the scene and its key stay neutral, so the
    // displayed name can change without touching code.
    const scoresStyle = { fontFamily: "sans-serif", fontStyle: "bold", fontSize: "22px" };
    const iconSpace = 44;
    const scoresW =
      buttonWidth(this, "scores", scoresStyle, 22, 180, WORLD.width - 80) + iconSpace;
    const scoresY = WORLD.height - SAFE_BOTTOM - 74;
    this.scoresBg = this.add
      .rectangle(cx, scoresY, scoresW, 62, 0xffffff, 0.08)
      .setStrokeStyle(2, 0x9b6bff, 0.7)
      .setDepth(20);
    this.scoresIcon = this.add.graphics().setDepth(21);
    drawBookIcon(this.scoresIcon, cx - scoresW / 2 + 32, scoresY, 1.15);
    this.scoresLabel = this.add
      .text(cx + 14, scoresY, "", { ...scoresStyle, color: "#d9a7ff" })
      .setOrigin(0.5)
      .setDepth(20);
    this.scoresZone = new Phaser.Geom.Rectangle(cx - scoresW / 2, scoresY - 31, scoresW, 62);

    // Gear icon, top left (the moon occupies the right). Drawn as vectors:
    // no asset, and nothing to translate.
    const gear = this.add.graphics().setDepth(20);
    const gx = 40;
    const gy = 42;
    gear.lineStyle(3, 0x8877aa, 1);
    gear.strokeCircle(gx, gy, 11);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      gear.beginPath();
      gear.moveTo(gx + Math.cos(a) * 14, gy + Math.sin(a) * 14);
      gear.lineTo(gx + Math.cos(a) * 20, gy + Math.sin(a) * 20);
      gear.strokePath();
    }
    // The icon alone was ambiguous, so it now carries its label. The text goes
    // through i18n like any interface string; only the drawn gear does not.
    this.gearLabel = this.add
      .text(gx + 30, gy, "", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: "18px",
        color: "#8877aa"
      })
      .setOrigin(0, 0.5)
      .setDepth(20);

    // Touch target covering icon AND label, never under the 44 px floor.
    // Sized in refreshTexts(), where the translated label's width is known.
    this.gearZone = new Phaser.Geom.Rectangle(0, 0, 84, 86);
    this.gearIcon = gear;
  }

  /**
   * The settings hit area follows the translated label: "Réglages" and
   * "Impostazioni" are far from the same width, and the zone must cover both
   * without ever dropping under the 44 px touch floor.
   */
  private refreshGearZone(): void {
    const right = this.gearLabel.x + this.gearLabel.width + 14;
    this.gearZone.setTo(0, 0, Math.max(MIN_TOUCH_PX, right), Math.max(MIN_TOUCH_PX, 86));
  }

  /**
   * The home screen is hidden while the settings are open: a plain translucent
   * veil let the title show through behind the labels.
   */
  private setHomeVisible(on: boolean): void {
    this.titleText.setVisible(on);
    this.brandGlow.setVisible(on);
    this.bestText.setVisible(on && loadStats().bestScore > 0);
    this.playText.setVisible(on);
    this.gearIcon.setVisible(on);
    this.gearLabel.setVisible(on);
    this.scoresBg.setVisible(on);
    this.scoresLabel.setVisible(on);
  }

  private buildSettings(): void {
    const cx = WORLD.width / 2;
    const veil = this.add
      .rectangle(0, 0, WORLD.width, WORLD.height, 0x05030c, 0.9)
      .setOrigin(0, 0);

    this.settingsTitleText = this.add
      .text(cx, 150, "", { fontFamily: "sans-serif", fontStyle: "bold", color: "#f5efd8" })
      .setOrigin(0.5);
    this.langLabelText = this.add
      .text(cx, 232, "", { fontFamily: "sans-serif", color: "#8877aa" })
      .setOrigin(0.5);

    const children: Phaser.GameObjects.GameObject[] = [
      veil,
      this.settingsTitleText,
      this.langLabelText
    ];

    // Language selector: native names, one per row, sharing a width sized
    // against the longest of the four.
    const rowStyle = { fontFamily: "sans-serif", fontStyle: "bold", fontSize: "26px" };
    const probe = this.make.text({ style: rowStyle }, false);
    let rowWidth = 0;
    for (const lang of LANGS) {
      probe.setText(LANG_NAMES[lang]);
      rowWidth = Math.max(rowWidth, probe.width);
    }
    probe.destroy();
    rowWidth = Phaser.Math.Clamp(Math.ceil(rowWidth + 56), 220, WORLD.width - 48);
    this.widths.langRow = rowWidth;

    const rowH = 58;
    const gap = 12;
    const firstY = 296;
    this.langZones = [];
    this.langRows = [];
    LANGS.forEach((lang, index) => {
      const y = firstY + index * (rowH + gap);
      const bg = this.add
        .rectangle(cx, y, rowWidth, rowH, 0xffffff, 0.06)
        .setStrokeStyle(2, 0x9b6bff, 0.5);
      const label = this.add
        .text(cx, y, LANG_NAMES[lang], { ...rowStyle, color: "#d9a7ff" })
        .setOrigin(0.5);
      fitText(label, rowWidth - 32, 26);
      this.langZones.push({
        lang,
        zone: new Phaser.Geom.Rectangle(cx - rowWidth / 2, y - rowH / 2, rowWidth, rowH)
      });
      this.langRows.push({ lang, bg });
      children.push(bg, label);
    });

    // Sound toggle: label on the left, value on the right, one tappable row.
    const soundY = firstY + LANGS.length * (rowH + gap) + 34;
    const soundW = WORLD.width - 96;
    const soundBg = this.add
      .rectangle(cx, soundY, soundW, rowH, 0xffffff, 0.06)
      .setStrokeStyle(2, 0x9b6bff, 0.5);
    this.soundLabelText = this.add
      .text(cx - soundW / 2 + 22, soundY, "", { fontFamily: "sans-serif", color: "#d9a7ff" })
      .setOrigin(0, 0.5);
    this.soundValueText = this.add
      .text(cx + soundW / 2 - 22, soundY, "", {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#f2c8ff"
      })
      .setOrigin(1, 0.5);
    this.soundZone = new Phaser.Geom.Rectangle(cx - soundW / 2, soundY - rowH / 2, soundW, rowH);
    children.push(soundBg, this.soundLabelText, this.soundValueText);

    // "How to play": opens the help page. Nothing shows it automatically.
    // Sits between the sound row and the Back button, touching neither: their
    // hit zones must not overlap, since this one is tested first.
    const howToStyle = { fontFamily: "sans-serif", fontStyle: "bold", fontSize: "24px" };
    const howToH = 52;
    const howToY = 670;
    const howToW = buttonWidth(this, "settings.howToPlay", howToStyle, 34, 220, WORLD.width - 64);
    this.widths.howTo = howToW;
    const howToBg = this.add
      .rectangle(cx, howToY, howToW, howToH, 0xffffff, 0.06)
      .setStrokeStyle(2, 0x9b6bff, 0.5);
    this.howToText = this.add
      .text(cx, howToY, "", { ...howToStyle, color: "#d9a7ff" })
      .setOrigin(0.5);
    this.howToZone = new Phaser.Geom.Rectangle(
      cx - howToW / 2,
      howToY - howToH / 2,
      howToW,
      howToH
    );
    children.push(howToBg, this.howToText);

    // Back: wide button at the bottom, within thumb reach.
    const backStyle = { fontFamily: "sans-serif", fontStyle: "bold", fontSize: "30px" };
    const backW = buttonWidth(this, "settings.back", backStyle, 44, 200, WORLD.width - 64);
    this.widths.back = backW;
    const backY = WORLD.height - 110;
    const backBg = this.add
      .rectangle(cx, backY, backW, 74, 0x9b6bff, 0.16)
      .setStrokeStyle(2, 0x9b6bff, 0.6);
    this.backText = this.add
      .text(cx, backY, "", { ...backStyle, color: "#f2c8ff" })
      .setOrigin(0.5);
    this.backZone = new Phaser.Geom.Rectangle(cx - backW / 2, backY - 37, backW, 74);
    children.push(backBg, this.backText);

    this.settingsPanel = this.add.container(0, 0, children).setDepth(30).setVisible(false);
  }

  /**
   * "How to play": three pictograms explaining the whole game — graze scores,
   * touching kills, chaining multiplies. Drawn as vectors, so there is no
   * asset and nothing to translate in the drawings themselves.
   * Only ever opened from the settings.
   */
  private buildHelp(): void {
    const cx = WORLD.width / 2;
    const veil = this.add
      .rectangle(0, 0, WORLD.width, WORLD.height, 0x05030c, 0.94)
      .setOrigin(0, 0);

    this.helpTitleText = this.add
      .text(cx, 140, "", { fontFamily: "sans-serif", fontStyle: "bold", color: "#f5efd8" })
      .setOrigin(0.5);

    const children: Phaser.GameObjects.GameObject[] = [veil, this.helpTitleText];

    const iconX = 96;
    const textX = 156;
    const rowsY = [268, 418, 568];
    const art = this.add.graphics();
    children.push(art);

    this.helpCaptions = rowsY.map((y) => {
      const caption = this.add
        .text(textX, y, "", {
          fontFamily: "sans-serif",
          fontSize: "20px",
          color: "#d9a7ff",
          wordWrap: { width: WORLD.width - textX - 32 }
        })
        .setOrigin(0, 0.5);
      children.push(caption);
      return caption;
    });

    this.drawHelpArt(art, iconX, rowsY);

    // Back button, same shape and place as in the settings.
    const backStyle = { fontFamily: "sans-serif", fontStyle: "bold", fontSize: "30px" };
    const backW = buttonWidth(this, "settings.back", backStyle, 44, 200, WORLD.width - 64);
    this.widths.helpBack = backW;
    const backY = WORLD.height - 110;
    const backBg = this.add
      .rectangle(cx, backY, backW, 74, 0x9b6bff, 0.16)
      .setStrokeStyle(2, 0x9b6bff, 0.6);
    this.helpBackText = this.add.text(cx, backY, "", { ...backStyle, color: "#f2c8ff" }).setOrigin(0.5);
    this.helpBackZone = new Phaser.Geom.Rectangle(cx - backW / 2, backY - 37, backW, 74);
    children.push(backBg, this.helpBackText);

    this.helpPanel = this.add.container(0, 0, children).setDepth(31).setVisible(false);
  }

  /** The three pictograms, using the game's own visual vocabulary. */
  private drawHelpArt(art: Phaser.GameObjects.Graphics, x: number, rowsY: number[]): void {
    const barW = 14;
    const barH = 92;

    /**
     * Same vocabulary as the real obstacles: near-black body, and a moon rim on
     * one side only — never an outline all the way round. If the pictogram and
     * the game disagree, the pictogram is teaching the wrong thing.
     */
    const obstacle = (y: number) => {
      const side = MOON_ON_RIGHT ? 1 : -1;
      art.fillStyle(OBSTACLE_ART.bodyColor, 1);
      art.fillRoundedRect(x - barW / 2, y - barH / 2, barW, barH, barW / 2);
      art.lineStyle(2, OBSTACLE_ART.rimColor, 0.9);
      art.beginPath();
      art.moveTo(x + (side * barW) / 2, y - barH / 2 + barW / 2);
      art.lineTo(x + (side * barW) / 2, y + barH / 2 - barW / 2);
      art.strokePath();
    };

    // 1) Graze scores: the witch passes inside the halo, not touching it.
    let y = rowsY[0];
    art.fillStyle(FEEDBACK.haloColor, 0.28);
    art.fillRoundedRect(x - barW / 2 - 24, y - barH / 2 - 24, barW + 48, barH + 48, 24);
    obstacle(y);
    art.fillStyle(FULL_MOON.witchColorNormal, 1);
    art.fillCircle(x - 30, y, WITCH.radius);

    // 2) Touching kills: the witch is on the bar, struck through.
    y = rowsY[1];
    obstacle(y);
    art.fillStyle(FULL_MOON.witchColorNormal, 1);
    art.fillCircle(x, y, WITCH.radius);
    art.lineStyle(4, 0xff6b6b, 0.95);
    art.beginPath();
    art.moveTo(x - 26, y - 26);
    art.lineTo(x + 26, y + 26);
    art.moveTo(x + 26, y - 26);
    art.lineTo(x - 26, y + 26);
    art.strokePath();

    // 3) Chaining multiplies: three grazes, brighter and bigger each time.
    y = rowsY[2];
    const steps = [
      { dx: -34, radius: 5, color: TRAIL.colorIdle, alpha: 0.5 },
      { dx: 0, radius: 8, color: 0xc79bff, alpha: 0.75 },
      { dx: 34, radius: 12, color: TRAIL.colorMax, alpha: 1 }
    ];
    for (const step of steps) {
      art.fillStyle(step.color, step.alpha);
      art.fillCircle(x + step.dx, y, step.radius);
    }
  }

  /**
   * Every label is (re)applied here, then fitted to its area. Called on start
   * and on every language change.
   */
  private refreshTexts(): void {
    const stats = loadStats();

    // The title is NOT refreshed here: it is a brand, not an interface string
    // — it never changes with the language.

    // No guilt-inducing "0": the best score only appears once it exists.
    this.bestText.setVisible(stats.bestScore > 0);
    if (stats.bestScore > 0) {
      this.bestText.setText(t("menu.bestScore", { score: stats.bestScore }));
      fitText(this.bestText, WORLD.width - 48, 24);
    }

    this.scoresLabel.setText(t("scores"));
    fitText(this.scoresLabel, this.scoresZone.width - 24, 22);

    this.playText.setText(t("menu.play"));
    fitText(this.playText, WORLD.width - 48, 30);

    this.gearLabel.setText(t("settings.title"));
    fitText(this.gearLabel, WORLD.width - this.gearLabel.x - 16, 18);
    this.refreshGearZone();

    this.settingsTitleText.setText(t("settings.title"));
    fitText(this.settingsTitleText, WORLD.width - 48, 44);
    this.langLabelText.setText(t("settings.language"));
    fitText(this.langLabelText, WORLD.width - 48, 22);

    this.soundLabelText.setText(t("settings.sound"));
    fitText(this.soundLabelText, this.widths.langRow * 0.5, 26);
    this.refreshSoundValue();

    this.backText.setText(t("settings.back"));
    fitText(this.backText, this.widths.back - 36, 30);

    this.howToText.setText(t("settings.howToPlay"));
    fitText(this.howToText, this.widths.howTo - 28, 24);

    this.helpTitleText.setText(t("settings.howToPlay"));
    fitText(this.helpTitleText, WORLD.width - 48, 40);
    this.helpBackText.setText(t("settings.back"));
    fitText(this.helpBackText, this.widths.helpBack - 36, 30);

    const helpKeys = ["help.graze", "help.touch", "help.combo"] as const;
    helpKeys.forEach((key, index) => {
      const caption = this.helpCaptions[index];
      // Wrapped rather than shrunk: these are full sentences, not labels.
      caption.setFontSize(20).setText(t(key));
    });

    this.refreshLangSelection();
  }

  private refreshSoundValue(): void {
    this.soundValueText.setText(isSoundEnabled() ? t("settings.soundOn") : t("settings.soundOff"));
    fitText(this.soundValueText, 120, 26);
  }

  /** The active language row is highlighted. */
  private refreshLangSelection(): void {
    const active = getLanguage();
    for (const row of this.langRows) {
      const on = row.lang === active;
      row.bg.setFillStyle(0x9b6bff, on ? 0.28 : 0.06);
      row.bg.setStrokeStyle(2, 0x9b6bff, on ? 1 : 0.5);
    }
  }

  /**
   * Tuning readout, opened by a long press on the logo. Deliberately a DEBUG
   * surface: like the DEBUG_STATS overlay, its labels are technical tokens and
   * stay out of i18n — only tier names, which are keys, go through t().
   * Nothing here is meant for players; it exists to tune difficulty against
   * the recorded deaths rather than against a hunch.
   */
  private buildStats(): void {
    const veil = this.add
      .rectangle(0, 0, WORLD.width, WORLD.height, 0x05030c, 0.96)
      .setOrigin(0, 0);
    this.statsText = this.add
      .text(28, 90, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#cbb9ff",
        lineSpacing: 6
      })
      .setOrigin(0, 0);
    this.statsPanel = this.add
      .container(0, 0, [veil, this.statsText])
      .setDepth(32)
      .setVisible(false);
  }

  private refreshStats(): void {
    const deaths = loadDeaths();
    const lines: string[] = [`DEATHS  ${deaths.length}/${DEATHS.size}`, ""];

    if (deaths.length === 0) {
      lines.push("no runs recorded yet");
      this.statsText.setText(lines.join("\n"));
      return;
    }

    const median = (values: number[]): number => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    lines.push(`MEDIAN SURVIVAL  ${median(deaths.map((d) => d.t)).toFixed(1)}s`);
    lines.push(`MEDIAN GRAZES    ${median(deaths.map((d) => d.grazes)).toFixed(0)}`);
    const quick = deaths.filter((d) => d.t < MERCY.quickDeathSeconds).length;
    lines.push(`UNDER ${MERCY.quickDeathSeconds}s        ${Math.round((quick / deaths.length) * 100)}%`);
    const trunks = deaths.filter((d) => d.cause === "trunk").length;
    lines.push(`CAUSE            ${deaths.length - trunks} branch / ${trunks} trunk`);
    lines.push("");
    lines.push("DEATHS BY TIER");

    TIERS.forEach((tier, index) => {
      const count = deaths.filter((d) => d.tier === index).length;
      const share = count / deaths.length;
      // A bar beats a number for spotting where runs actually end.
      const bar = "#".repeat(Math.round(share * 24)).padEnd(24, ".");
      lines.push(`${t(tier.nameKey).padEnd(14).slice(0, 14)} ${bar} ${count}`);
    });

    lines.push("");
    lines.push(shouldEase(deaths) ? "EASING: ON (next run)" : "EASING: off");
    lines.push("");
    lines.push("tap to close");
    this.statsText.setText(lines.join("\n"));
  }

  private cancelLongPress(): void {
    this.longPress?.remove();
    this.longPress = undefined;
  }

  /** Release: either the long press already fired, or it was a normal tap. */
  private onPointerUp(): void {
    const pending = this.longPress !== undefined;
    this.cancelLongPress();
    if (this.longPressFired) {
      this.longPressFired = false;
      return;
    }
    // A short press on the logo still starts a run — just on release, since
    // that is the only moment we know it was not a long press.
    if (pending && !this.statsOpen && !this.settingsOpen && !this.helpOpen) {
      this.scene.start("flight");
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.statsOpen) {
      this.statsOpen = false;
      this.statsPanel.setVisible(false);
      this.setHomeVisible(true);
      return;
    }

    // Help sits on top of the settings, so it is tested first.
    if (this.helpOpen) {
      if (this.helpBackZone.contains(pointer.x, pointer.y)) {
        this.helpOpen = false;
        this.helpPanel.setVisible(false);
        // Back to the settings, which were left open behind the help page.
        this.settingsPanel.setVisible(this.settingsOpen);
      }
      return;
    }

    if (this.settingsOpen) {
      for (const { lang, zone } of this.langZones) {
        if (zone.contains(pointer.x, pointer.y)) {
          setLanguage(lang);
          this.refreshLangSelection();
          return;
        }
      }
      if (this.soundZone.contains(pointer.x, pointer.y)) {
        setSoundEnabled(!isSoundEnabled());
        this.refreshSoundValue();
        return;
      }
      if (this.howToZone.contains(pointer.x, pointer.y)) {
        this.helpOpen = true;
        this.helpPanel.setVisible(true);
        // The settings stay open underneath, but hidden: a translucent veil
        // alone let their labels show through the help page.
        this.settingsPanel.setVisible(false);
        return;
      }
      if (this.backZone.contains(pointer.x, pointer.y)) {
        this.settingsOpen = false;
        this.settingsPanel.setVisible(false);
        this.setHomeVisible(true);
      }
      return;
    }

    if (this.scoresZone.contains(pointer.x, pointer.y)) {
      this.scene.start("scores");
      return;
    }

    if (this.gearZone.contains(pointer.x, pointer.y)) {
      this.settingsOpen = true;
      this.settingsPanel.setVisible(true);
      this.setHomeVisible(false);
      return;
    }

    // On the logo the decision waits for the release: a short press plays, a
    // long one opens the tuning readout. Everywhere else the tap starts the
    // run immediately, so the game keeps its instant feel.
    if (this.titleZone.contains(pointer.x, pointer.y)) {
      this.longPressFired = false;
      this.longPress = this.time.delayedCall(LONG_PRESS_MS, () => {
        this.longPress = undefined;
        this.longPressFired = true;
        this.statsOpen = true;
        this.refreshStats();
        this.setHomeVisible(false);
        this.statsPanel.setVisible(true);
      });
      return;
    }

    this.scene.start("flight");
  }

  update(time: number, deltaMs: number): void {
    // Demo flight: gentle Lissajous curve, looping forever.
    const t2 = time / 1000;
    const dt = deltaMs / 1000;
    const y = WORLD.height * 0.47 + Math.sin(t2 * 1.7) * 70;
    // Her own vertical speed drives the tilt, so she banks through the loop.
    const vy = (y - this.demoWitch.y) / Math.max(dt, 1 / 240);
    this.demoWitch.x = WORLD.width * 0.5 + Math.sin(t2 * 0.9) * WORLD.width * 0.3;
    this.demoWitch.y = y;

    // Distance to the demo branch's surface, the same point-to-capsule measure
    // the real game uses — so what the home screen shows is what the game does.
    const dx = Math.abs(this.demoWitch.x - this.demoBranch.x);
    // The branch hangs DOWNWARD from its tip, so only being above it counts.
    const dy = Math.max(0, this.demoBranch.tipY - this.demoWitch.y);
    const distance = Math.hypot(Math.max(0, dx - this.demoBranch.halfWidth), dy);
    const grazing = distance <= NEAR_MISS.grazeRadius && distance > NEAR_MISS.deathRadius;

    if (grazing && !this.demoGrazing) {
      // Entering the ring: the fireflies come in and the trail catches fire.
      this.demoFlies.emitParticleAt(this.demoWitch.x, this.demoWitch.y, 8);
      this.demoBlaze = 1;
    }
    this.demoGrazing = grazing;

    // The blaze decays, so the trail is dull between passes and gold on them:
    // the multiplier reads on the trail here exactly as it does in game.
    this.demoBlaze = Math.max(0, this.demoBlaze - dt / 1.6);
    const k = this.demoBlaze;
    this.demoTrail.frequency = Phaser.Math.Linear(TRAIL.frequencyIdle, TRAIL.frequencyMax, k);
    this.demoTrail.setParticleTint(
      Phaser.Display.Color.ObjectToColor(
        Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(TRAIL.colorIdle),
          Phaser.Display.Color.ValueToColor(TRAIL.colorMax),
          100,
          Math.round(k * 100)
        )
      ).color
    );
    this.demoTrail.setParticleAlpha({ start: Phaser.Math.Linear(TRAIL.alphaIdle, TRAIL.alphaMax, k), end: 0 });

    this.demoWitch.update(dt, vy, WITCH.maxSpeed, k);
  }
}
