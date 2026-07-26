import Phaser from "phaser";
import { AMBIENT, BRAND, TIERS, TRAIL, WITCH, WORLD } from "./config";
import { getLanguage, LANG_NAMES, LANGS, Lang, onLanguageChange, setLanguage, t } from "./i18n";
import { isSoundEnabled, loadStats, setSoundEnabled } from "./save";
import { ensureTextures, LIGHT_KEY, SPARK_KEY } from "./textures";
import { buttonWidth, fitText } from "./ui";

/**
 * Écran d'accueil : titre, meilleur score, « tape pour jouer » (plein écran),
 * et une icône engrenage qui ouvre les réglages (langue + son).
 * Le fond reprend le décor du jeu, avec une sorcière qui vole en boucle.
 *
 * Aucune chaîne littérale affichée ici : tout passe par i18n.
 */
export class MenuScene extends Phaser.Scene {
  private demoWitch!: Phaser.GameObjects.Arc;

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
  private langZones: { lang: Lang; zone: Phaser.Geom.Rectangle }[] = [];

  private settingsTitleText!: Phaser.GameObjects.Text;
  private langLabelText!: Phaser.GameObjects.Text;
  private soundLabelText!: Phaser.GameObjects.Text;
  private soundValueText!: Phaser.GameObjects.Text;
  private backText!: Phaser.GameObjects.Text;
  private langRows: { lang: Lang; bg: Phaser.GameObjects.Rectangle }[] = [];

  /** Largeurs figées, calculées sur la plus longue traduction des 4 langues. */
  private widths: Record<string, number> = {};

  constructor() {
    super("menu");
  }

  create(): void {
    ensureTextures(this);
    const tier = TIERS[0];

    // Décor : même ciel, même lune, mêmes poussières que le jeu.
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

    // Sorcière de démonstration : traînée dorée de « belle partie ».
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
    this.demoWitch = this.add.circle(0, 0, WITCH.radius, 0xd9a7ff).setDepth(5);
    this.demoWitch.setStrokeStyle(2, 0xffffff, 0.6);
    trail.startFollow(this.demoWitch, TRAIL.offsetX, 0);

    this.buildHome();
    this.buildSettings();
    // Phaser réutilise l'instance de scène : l'état d'ouverture doit être
    // remis à zéro ici, sinon il survivrait à un retour au menu.
    this.settingsOpen = false;
    this.settingsPanel.setVisible(false);
    this.refreshTexts();
    this.setHomeVisible(true);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));

    // Rafraîchissement immédiat au changement de langue, sans rechargement.
    const unsubscribe = onLanguageChange(() => this.refreshTexts());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  private buildHome(): void {
    const cx = WORLD.width / 2;

    // Lueur lunaire derrière le logo : respire très lentement, en additif.
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

    // Le titre est un LOGO, pas du texte d'interface : marque non traduite,
    // grande taille, interlettrage large. Il ne passe donc pas par i18n.
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

    // Engrenage, en haut à gauche (la lune occupe la droite). Dessiné en
    // vectoriel : pas d'asset, et rien à traduire.
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
    // Cible tactile généreuse autour de l'icône.
    this.gearZone = new Phaser.Geom.Rectangle(0, 0, 84, 86);
    this.gearIcon = gear;
  }

  /**
   * L'accueil est masqué quand les réglages sont ouverts : un simple voile
   * translucide laissait transparaître le titre derrière les libellés.
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

    // Sélecteur de langue : noms natifs, un par ligne, largeur commune
    // dimensionnée sur le plus long des quatre.
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

    // Toggle son : libellé à gauche, valeur à droite, sur une zone tapable.
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

    // Retour : bouton large en bas, atteignable au pouce.
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
   * Tous les libellés sont (re)posés ici, puis ajustés à leur zone. Appelé au
   * démarrage et à chaque changement de langue.
   */
  private refreshTexts(): void {
    const stats = loadStats();

    // Le titre n'est PAS rafraîchi ici : c'est une marque, pas une chaîne
    // d'interface — elle ne change jamais avec la langue.

    // Pas de « 0 » culpabilisant : le meilleur score n'apparaît qu'une fois établi.
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

    this.refreshLangSelection();
  }

  private refreshSoundValue(): void {
    this.soundValueText.setText(isSoundEnabled() ? t("settings.soundOn") : t("settings.soundOff"));
    fitText(this.soundValueText, 120, 26);
  }

  /** La langue active est surlignée. */
  private refreshLangSelection(): void {
    const active = getLanguage();
    for (const row of this.langRows) {
      const on = row.lang === active;
      row.bg.setFillStyle(0x9b6bff, on ? 0.28 : 0.06);
      row.bg.setStrokeStyle(2, 0x9b6bff, on ? 1 : 0.5);
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
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

  update(time: number): void {
    // Vol de démonstration : lissajous doux, boucle infinie.
    const t2 = time / 1000;
    this.demoWitch.x = WORLD.width * 0.5 + Math.sin(t2 * 0.9) * WORLD.width * 0.3;
    this.demoWitch.y = WORLD.height * 0.47 + Math.sin(t2 * 1.7) * 70;
  }
}
