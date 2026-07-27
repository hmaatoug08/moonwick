import Phaser from "phaser";
import {
  AMBIENT,
  BRAND,
  FEEDBACK,
  FULL_MOON,
  OBSTACLE_ART,
  TIERS,
  TRAIL,
  WITCH,
  WORLD
} from "./config";
import { MOON_ON_RIGHT } from "./obstacleShapes";
import { Witch } from "./witchShape";
import { getLanguage, LANG_NAMES, LANGS, Lang, onLanguageChange, setLanguage, t } from "./i18n";
import { isSoundEnabled, loadStats, setSoundEnabled } from "./save";
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
export class MenuScene extends Phaser.Scene {
  private demoWitch!: Witch;

  private titleText!: Phaser.GameObjects.Text;
  private brandGlow!: Phaser.GameObjects.Image;
  private bestText!: Phaser.GameObjects.Text;
  private playText!: Phaser.GameObjects.Text;

  private settingsPanel!: Phaser.GameObjects.Container;
  private gearIcon!: Phaser.GameObjects.Graphics;
  private settingsOpen = false;
  private gearZone!: Phaser.Geom.Rectangle;
  private backZone!: Phaser.Geom.Rectangle;
  private soundZone!: Phaser.Geom.Rectangle;
  private howToZone!: Phaser.Geom.Rectangle;
  private langZones: { lang: Lang; zone: Phaser.Geom.Rectangle }[] = [];

  /** "How to play" page: reachable only from the settings, never automatic. */
  private helpPanel!: Phaser.GameObjects.Container;
  private helpOpen = false;
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

    // Demo witch, with the golden trail of a great run.
    const trail = this.add.particles(0, 0, SPARK_KEY, {
      frequency: 14,
      lifespan: 520,
      speed: { min: TRAIL.driftMin, max: TRAIL.driftMax },
      angle: { min: 180 - TRAIL.spreadDeg, max: 180 + TRAIL.spreadDeg },
      scale: 0.6,
      alpha: { start: 0.7, end: 0 },
      tint: TRAIL.colorMax,
      blendMode: Phaser.BlendModes.ADD
    });
    trail.setDepth(4);
    this.demoWitch = new Witch(this, WORLD.width * 0.5, WORLD.height * 0.47, 5);
    trail.startFollow(this.demoWitch.follow, TRAIL.offsetX, 0);

    this.buildHome();
    this.buildSettings();
    this.buildHelp();
    // Phaser reuses the scene instance, so the open/closed state must be
    // reset here, otherwise it would survive a return to the menu.
    this.settingsOpen = false;
    this.settingsPanel.setVisible(false);
    this.helpOpen = false;
    this.helpPanel.setVisible(false);
    this.refreshTexts();
    this.setHomeVisible(true);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));

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
    // Generous touch target around the icon.
    this.gearZone = new Phaser.Geom.Rectangle(0, 0, 84, 86);
    this.gearIcon = gear;
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

    this.playText.setText(t("menu.play"));
    fitText(this.playText, WORLD.width - 48, 30);

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

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
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

    if (this.gearZone.contains(pointer.x, pointer.y)) {
      this.settingsOpen = true;
      this.settingsPanel.setVisible(true);
      this.setHomeVisible(false);
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
    this.demoWitch.update(dt, vy, WITCH.maxSpeed, 0);
  }
}
