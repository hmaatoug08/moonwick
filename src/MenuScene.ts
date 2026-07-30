import Phaser from "phaser";
import {
  AMBIENT,
  BRAND,
  FEEDBACK,
  DEATHS,
  FIREFLIES,
  FULL_MOON,
  MERCY,
  LOGO,
  NEAR_MISS,
  OMENS,
  OBSTACLE_ART,
  SAFE_BOTTOM,
  SCENERY,
  TIERS,
  TRAIL,
  TYPE,
  WITCH,
  WORLD
} from "./config";
import { drawBookIcon } from "./icons";
import { hasUnseenOmens } from "./omens";
import { MOON_ON_RIGHT } from "./obstacleShapes";
import { Witch } from "./witchShape";
import { getLanguage, LANG_NAMES, LANGS, Lang, onLanguageChange, setLanguage, t } from "./i18n";
import {
  isMusicEnabled,
  isSoundEnabled,
  loadDaily,
  loadDeaths,
  loadStats,
  setMusicEnabled,
  setSoundEnabled,
  shouldEase
} from "./save";
import {
  ensureLogoTexture,
  ensureLogoTextureSmall,
  LOGO_MARK_KEY,
  LOGO_MARK_SMALL_KEY,
  LOGO_PAD_UNITS
} from "./logo";
import { music } from "./music";
import { addMoon, NightScenery } from "./scenery";
import { ensureTextures, LIGHT_KEY, SPARK_KEY } from "./textures";
import {
  actionBand,
  capsText,
  diamondDivider,
  fitText,
  hairline,
  hairlineGradient,
  serifText,
  setCaps
} from "./ui";

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
  private scenery!: NightScenery;

  private titleText!: Phaser.GameObjects.Text;
  private brandGlow!: Phaser.GameObjects.Image;
  private logoMark!: Phaser.GameObjects.Image;
  private bestLabel!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private taglineText!: Phaser.GameObjects.Text;
  private playText!: Phaser.GameObjects.Text;
  private tapText!: Phaser.GameObjects.Text;
  /** Home-only furniture (arc, dividers): hidden with the rest of the home. */
  private homeExtras: Array<{ setVisible(v: boolean): unknown }> = [];

  private settingsPanel!: Phaser.GameObjects.Container;
  private gearIcon!: Phaser.GameObjects.Graphics;
  private gearLabel!: Phaser.GameObjects.Text;
  private scoresIcon!: Phaser.GameObjects.Graphics;
  private scoresLabel!: Phaser.GameObjects.Text;
  private scoresChevron!: Phaser.GameObjects.Text;
  private scoresGlint!: Phaser.GameObjects.Graphics;
  private scoresZone!: Phaser.Geom.Rectangle;
  private dailyLabel!: Phaser.GameObjects.Text;
  private dailyValue!: Phaser.GameObjects.Text;
  private dailyZone!: Phaser.Geom.Rectangle;
  private settingsOpen = false;
  private gearZone!: Phaser.Geom.Rectangle;
  private backZone!: Phaser.Geom.Rectangle;
  private soundZone!: Phaser.Geom.Rectangle;
  private musicZone!: Phaser.Geom.Rectangle;
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
  private helpTitles: Phaser.GameObjects.Text[] = [];
  private helpCaptions: Phaser.GameObjects.Text[] = [];
  private howToText!: Phaser.GameObjects.Text;

  private settingsTitleText!: Phaser.GameObjects.Text;
  private langLabelText!: Phaser.GameObjects.Text;
  private soundLabelText!: Phaser.GameObjects.Text;
  private soundValueText!: Phaser.GameObjects.Text;
  private musicLabelText!: Phaser.GameObjects.Text;
  private musicValueText!: Phaser.GameObjects.Text;
  private backText!: Phaser.GameObjects.Text;
  private langRows: {
    lang: Lang;
    marker: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
  }[] = [];

  constructor() {
    super("menu");
  }

  create(): void {
    ensureTextures(this);
    const tier = TIERS[0];

    // Scenery: same sky, same moon, same stars, treelines and mist as the game.
    const sky = this.add.graphics();
    sky.fillGradientStyle(tier.palette.skyTop, tier.palette.skyTop, tier.palette.skyBottom, tier.palette.skyBottom, 1);
    sky.fillRect(0, 0, WORLD.width, WORLD.height);
    this.scenery = new NightScenery(this);
    this.scenery.setMood(tier.palette.skyTop, tier.palette.skyBottom, tier.palette.sceneryTint);
    addMoon(this, 0xf5efd8);

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
    // The home screen paints the first tier's sky, so it takes the first
    // tier's halo too: what it promises has to be what the run delivers.
    drawBar(tier.palette.haloColor, FEEDBACK.haloAlpha, this.demoBranch.halfWidth + NEAR_MISS.grazeRadius);
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

    // The home screen is the audible rest: drone alone, stray firefly
    // chimes. The context itself can only open on the first tap (unlock).
    music.setMode("rest");

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      music.unlock();
      this.onPointerDown(pointer);
    });
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
    // Phaser reuses the scene instance: a restart rebuilds every object, so
    // the list must not keep references to the destroyed ones.
    this.homeExtras = [];

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

    // The stacked lockup: the lit-crescent mark over the wordmark, a flame
    // diamond on a fading hairline beneath. Brand, not interface — only the
    // tagline under it goes through i18n.
    ensureLogoTexture(this);
    const markH = LOGO.homeSize * ((LOGO.unit + LOGO_PAD_UNITS) / LOGO.unit);
    this.logoMark = this.add
      .image(cx, 146, LOGO_MARK_KEY)
      .setDisplaySize(LOGO.homeSize, markH)
      .setDepth(20);
    // The flame and witch glows are baked into the texture (logo.ts); the
    // only glow the scene adds is the big breathing one behind the lockup.

    // The title is a LOGO, not interface text: untranslated brand, serif
    // light, wide letter-spacing. It therefore never goes through i18n.
    this.titleText = this.add
      .text(cx, 262, BRAND.name, {
        fontFamily: TYPE.serif,
        fontStyle: "300",
        color: BRAND.color
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.titleText.setLetterSpacing(BRAND.letterSpacing);
    // The glyphs carry their own soft halo, so the word glows even when the
    // breathing background glow is at its dimmest.
    this.titleText.setShadow(0, 0, BRAND.shadowColor, BRAND.shadowBlur, false, true);
    fitText(this.titleText, WORLD.width - 40, BRAND.fontSizePx);

    // Divider from the lockup: two fading hairlines meeting a flame diamond.
    const divider = this.add.graphics().setDepth(20);
    const divY = 312;
    const divHalf = 120;
    divider.fillGradientStyle(TYPE.bandLine, TYPE.bandLine, TYPE.bandLine, TYPE.bandLine, 0, 0.45, 0, 0.45);
    divider.fillRect(cx - divHalf, divY, divHalf - 10, 1);
    divider.fillGradientStyle(TYPE.bandLine, TYPE.bandLine, TYPE.bandLine, TYPE.bandLine, 0.45, 0, 0.45, 0);
    divider.fillRect(cx + 10, divY, divHalf - 10, 1);
    divider.fillStyle(0xffd9a0, 1);
    divider.save();
    divider.translateCanvas(cx, divY);
    divider.rotateCanvas(Math.PI / 4);
    divider.fillRect(-3, -3, 6, 6);
    divider.restore();
    this.homeExtras.push(divider);
    // Long-press target. Padded well beyond the glyphs — the whole lockup,
    // mark included: this is a hidden gesture, it should not demand precision.
    this.titleZone = new Phaser.Geom.Rectangle(0, 100, WORLD.width, 190);

    // Under the divider, ONE line: "BEST · 1240" (caps label, serif gold
    // value) once a record exists — or the brand tagline on a first launch,
    // when there is nothing to boast yet. Never both.
    this.bestLabel = capsText(this, cx, 344, "", 11, TYPE.label, "700", 0.28)
      .setOrigin(1, 0.5)
      .setDepth(20);
    this.bestText = this.add
      .text(cx, 344, "", { fontFamily: TYPE.serif, fontStyle: "500", fontSize: "19px", color: TYPE.gold })
      .setOrigin(0, 0.5)
      .setDepth(20);
    this.taglineText = capsText(this, cx, 344, "", 11, "", "600", 0.42)
      .setOrigin(0.5)
      .setDepth(20)
      .setColor(TYPE.violetDim);

    // A STILL line: the old "Tap to play" blinked at a player who was reading
    // it. Serif italic states the verb; the caps hint below names the gesture.
    const holdDivider = hairlineGradient(this, 28, 640, WORLD.width - 56, 0.35).setDepth(20);
    this.homeExtras.push(holdDivider);
    this.playText = this.add
      .text(cx, 687, "", {
        fontFamily: TYPE.serif,
        fontStyle: "italic 400",
        fontSize: "30px",
        color: TYPE.cream
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.tapText = capsText(this, cx, 715, "", 11, "", "600", 0.28)
      .setOrigin(0.5)
      .setDepth(20)
      .setColor(TYPE.violetDim);

    // The Daily Moon: one shared forest a day, seeded by the UTC date. A
    // hairline row like Scores below it; today's best rides the right end in
    // gold once an attempt exists, a chevron invites before that.
    ensureLogoTextureSmall(this);
    const dailyY = 760;
    const dailyLine = hairline(this, 28, 736, WORLD.width - 56, 0.18).setDepth(20);
    this.homeExtras.push(dailyLine);
    const dailyIcon = this.add
      .image(43, dailyY, LOGO_MARK_SMALL_KEY)
      .setDisplaySize(22, 22 * ((LOGO.unit + LOGO_PAD_UNITS) / LOGO.unit))
      .setDepth(21);
    this.homeExtras.push(dailyIcon);
    this.dailyLabel = capsText(this, 70, dailyY, "", 12, TYPE.labelBright, "600", 0.24)
      .setOrigin(0, 0.5)
      .setDepth(20);
    this.dailyValue = this.add
      .text(WORLD.width - 28, dailyY, "", {
        fontFamily: TYPE.serif,
        fontStyle: "500",
        fontSize: "19px",
        color: TYPE.gold
      })
      .setOrigin(1, 0.5)
      .setDepth(20);
    this.dailyZone = new Phaser.Geom.Rectangle(16, 736, WORLD.width - 32, 46);

    // Scores: the progression hub, reachable from here and from nowhere else.
    // A hairline row, not a boxed button (rule 1): book icon, caps label, a
    // serif chevron. The label is `t("scores")`; the key stays neutral.
    const scoresY = 812;
    const rowLine = hairline(this, 28, 788, WORLD.width - 56, 0.18).setDepth(20);
    this.homeExtras.push(rowLine);
    this.scoresIcon = this.add.graphics().setDepth(21);
    drawBookIcon(this.scoresIcon, 43, scoresY, 1.05);
    this.scoresLabel = capsText(this, 70, scoresY, "", 12, TYPE.labelBright, "600", 0.24)
      .setOrigin(0, 0.5)
      .setDepth(20);
    this.scoresChevron = this.add
      .text(WORLD.width - 28, scoresY, "›", {
        fontFamily: TYPE.serif,
        fontSize: "22px",
        color: TYPE.violetDim
      })
      .setOrigin(1, 0.5)
      .setDepth(20);
    this.scoresZone = new Phaser.Geom.Rectangle(16, 790, WORLD.width - 32, 50);

    // The glint: a small gold spark beside the label while a lit omen has
    // never been revealed on the page. It says THAT something waits, never
    // which (the bridge — see CLAUDE.md, "The omens"). Wordless, and gold
    // because it points at a reward. Positioned in refreshTexts(), after the
    // translated label's width is known; a slow alpha breath, like a coal.
    this.scoresGlint = this.add.graphics().setDepth(21);
    this.scoresGlint.lineStyle(2, OMENS.glintColor, 1);
    this.scoresGlint.lineBetween(0, -5, 0, 5);
    this.scoresGlint.lineBetween(-3.5, 0, 3.5, 0);
    this.tweens.add({
      targets: this.scoresGlint,
      alpha: { from: 1, to: 0.45 },
      duration: OMENS.glintPulseMs / 2,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // Settings, top left (the moon occupies the right): two concentric moon
    // rings — no asset, nothing to translate in the drawing.
    const gear = this.add.graphics().setDepth(20);
    const gx = 41;
    const gy = 49;
    gear.lineStyle(1, TYPE.hairline, 0.75);
    gear.strokeCircle(gx, gy, 13);
    gear.strokeCircle(gx, gy, 5);
    // The icon alone was ambiguous, so it now carries its label. The text goes
    // through i18n like any interface string; only the drawing does not.
    this.gearLabel = capsText(this, gx + 26, gy, "", 11, TYPE.label, "600", 0.24)
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
    this.logoMark.setVisible(on);
    const hasBest = loadStats().bestScore > 0;
    this.bestLabel.setVisible(on && hasBest);
    this.bestText.setVisible(on && hasBest);
    this.taglineText.setVisible(on && !hasBest);
    this.playText.setVisible(on);
    this.tapText.setVisible(on);
    this.gearIcon.setVisible(on);
    this.gearLabel.setVisible(on);
    this.scoresIcon.setVisible(on);
    this.scoresLabel.setVisible(on);
    this.scoresChevron.setVisible(on);
    this.scoresGlint.setVisible(on && hasUnseenOmens());
    this.dailyLabel.setVisible(on);
    this.dailyValue.setVisible(on);
    for (const piece of this.homeExtras) piece.setVisible(on);
  }

  private buildSettings(): void {
    const cx = WORLD.width / 2;
    const veil = this.add
      .rectangle(0, 0, WORLD.width, WORLD.height, 0x05030c, 0.96)
      .setOrigin(0, 0);

    // Serif title over a diamond divider — the shared header of every page.
    this.settingsTitleText = serifText(this, cx, 135, "", 38, TYPE.cream).setOrigin(0.5);
    const divider = diamondDivider(this, cx, 170, 88, TYPE.hairline, 0.7);
    this.langLabelText = capsText(this, 28, 228, "", 11, TYPE.label, "700", 0.26).setOrigin(0, 0.5);

    const children: Phaser.GameObjects.GameObject[] = [
      veil,
      this.settingsTitleText,
      divider,
      this.langLabelText
    ];

    // Language selector: hairline rows, native serif names, and a gold
    // diamond as the only mark of the current choice. No boxes (rule 1); the
    // rows span the full margin width, so every target is 62 px tall and wide.
    const rowH = 62;
    const firstY = 256;
    this.langZones = [];
    this.langRows = [];
    LANGS.forEach((lang, index) => {
      const top = firstY + index * rowH;
      const mid = top + rowH / 2;
      const marker = this.add.graphics();
      marker.fillStyle(TYPE.hairline, 1);
      marker.save();
      marker.translateCanvas(36, mid);
      marker.rotateCanvas(Math.PI / 4);
      marker.fillRect(-3, -3, 6, 6);
      marker.restore();
      const label = serifText(this, 58, mid, LANG_NAMES[lang], 28, "#9d96b4");
      label.setOrigin(0, 0.5);
      const line = hairline(this, 28, top + rowH, WORLD.width - 56);
      this.langZones.push({
        lang,
        zone: new Phaser.Geom.Rectangle(20, top, WORLD.width - 40, rowH)
      });
      this.langRows.push({ lang, marker, label });
      children.push(marker, label, line);
    });

    // Sound toggle: caps label on the left, serif value on the right. It
    // gates the EFFECTS; the music has its own switch just below.
    const soundTop = 528;
    this.soundLabelText = capsText(this, 28, soundTop + rowH / 2, "", 11, TYPE.label, "700", 0.26).setOrigin(
      0,
      0.5
    );
    this.soundValueText = serifText(this, WORLD.width - 28, soundTop + rowH / 2, "", 26, TYPE.cream).setOrigin(
      1,
      0.5
    );
    const soundLine = hairline(this, 28, soundTop + rowH, WORLD.width - 56);
    this.soundZone = new Phaser.Geom.Rectangle(20, soundTop, WORLD.width - 40, rowH);
    children.push(this.soundLabelText, this.soundValueText, soundLine);

    // Music toggle: its own row and its own persisted choice (moonwick:music)
    // — a player may want the effects without the bed, or the reverse.
    const musicTop = 590;
    this.musicLabelText = capsText(this, 28, musicTop + rowH / 2, "", 11, TYPE.label, "700", 0.26).setOrigin(
      0,
      0.5
    );
    this.musicValueText = serifText(this, WORLD.width - 28, musicTop + rowH / 2, "", 26, TYPE.cream).setOrigin(
      1,
      0.5
    );
    const musicLine = hairline(this, 28, musicTop + rowH, WORLD.width - 56);
    this.musicZone = new Phaser.Geom.Rectangle(20, musicTop, WORLD.width - 40, rowH);
    children.push(this.musicLabelText, this.musicValueText, musicLine);

    // "How to play": opens the help page. Nothing shows it automatically.
    const howToTop = 652;
    this.howToText = capsText(this, 28, howToTop + rowH / 2, "", 11, TYPE.label, "700", 0.26).setOrigin(
      0,
      0.5
    );
    const howToChevron = this.add
      .text(WORLD.width - 28, howToTop + rowH / 2, "›", {
        fontFamily: TYPE.serif,
        fontSize: "22px",
        color: TYPE.violetDim
      })
      .setOrigin(1, 0.5);
    const howToLine = hairline(this, 28, howToTop + rowH, WORLD.width - 56);
    this.howToZone = new Phaser.Geom.Rectangle(20, howToTop, WORLD.width - 40, rowH);
    children.push(this.howToText, howToChevron, howToLine);

    // Back: THE one filled band of this screen, full width, above the safe
    // area. A band is a place to tap, not a box to read.
    const bandTop = 756;
    const bandH = WORLD.height - SAFE_BOTTOM - bandTop;
    const backBand = actionBand(this, bandTop, bandH);
    this.backText = capsText(this, cx, bandTop + bandH / 2, "", 12, TYPE.cream, "600", 0.4).setOrigin(0.5);
    this.backZone = new Phaser.Geom.Rectangle(0, bandTop, WORLD.width, bandH);
    children.push(backBand, this.backText);

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
      .rectangle(0, 0, WORLD.width, WORLD.height, 0x05030c, 0.96)
      .setOrigin(0, 0);

    this.helpTitleText = serifText(this, cx, 135, "", 38, TYPE.cream).setOrigin(0.5);
    const divider = diamondDivider(this, cx, 170, 88, TYPE.hairline, 0.7);

    const children: Phaser.GameObjects.GameObject[] = [veil, this.helpTitleText, divider];

    // Three rows: the pictogram left, a coloured caps title over a serif
    // sentence right, a hairline between rows. Same pictograms as before —
    // they use the game's own vocabulary and must keep matching it.
    const iconX = 76;
    const textX = 160;
    const rowsY = [290, 480, 670];
    const art = this.add.graphics();
    children.push(art);

    const titleColors = [TYPE.gold, "#ff6b6b", "#a08fd0"];
    this.helpTitles = rowsY.map((y, index) => {
      const title = capsText(this, textX, y - 26, "", 11, titleColors[index], "700", 0.26).setOrigin(
        0,
        0.5
      );
      children.push(title);
      return title;
    });
    this.helpCaptions = rowsY.map((y) => {
      const caption = this.add
        .text(textX, y + 12, "", {
          fontFamily: TYPE.serif,
          fontSize: "26px",
          color: TYPE.cream,
          wordWrap: { width: WORLD.width - textX - 32 }
        })
        .setOrigin(0, 0.5);
      children.push(caption);
      return caption;
    });
    rowsY.slice(0, -1).forEach((y) => {
      children.push(hairline(this, 28, y + 88, WORLD.width - 56));
    });

    this.drawHelpArt(art, iconX, rowsY);

    // Back: the screen's one filled band, same geometry as in the settings.
    const bandTop = 756;
    const bandH = WORLD.height - SAFE_BOTTOM - bandTop;
    const backBand = actionBand(this, bandTop, bandH);
    this.helpBackText = capsText(this, cx, bandTop + bandH / 2, "", 12, TYPE.cream, "600", 0.4).setOrigin(
      0.5
    );
    this.helpBackZone = new Phaser.Geom.Rectangle(0, bandTop, WORLD.width, bandH);
    children.push(backBand, this.helpBackText);

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

    // No guilt-inducing "0": the best score only appears once it exists —
    // until then the line under the lockup belongs to the brand tagline.
    // Caps label + serif gold value, centred as a pair around the middle.
    const hasBest = stats.bestScore > 0;
    const homeShowing = !this.settingsOpen && !this.helpOpen && !this.statsOpen;
    this.bestLabel.setVisible(hasBest && homeShowing);
    this.bestText.setVisible(this.bestLabel.visible);
    this.taglineText.setVisible(!hasBest && homeShowing);
    if (hasBest) {
      setCaps(this.bestLabel, t("menu.best"));
      this.bestText.setText(String(stats.bestScore));
      const pairWidth = this.bestLabel.width + 10 + this.bestText.width;
      this.bestLabel.setX(WORLD.width / 2 - pairWidth / 2 + this.bestLabel.width);
      this.bestText.setX(this.bestLabel.x + 10);
    } else {
      setCaps(this.taglineText, t("menu.tagline"));
      fitText(this.taglineText, WORLD.width - 64, 11);
    }

    setCaps(this.scoresLabel, t("scores"));
    fitText(this.scoresLabel, WORLD.width - 140, 12);
    // The glint sits just past the translated label, whatever its width.
    this.scoresGlint.setPosition(
      this.scoresLabel.x + this.scoresLabel.width + 16,
      this.scoresLabel.y
    );
    this.scoresGlint.setVisible(homeShowing && hasUnseenOmens());

    setCaps(this.dailyLabel, t("menu.daily"));
    fitText(this.dailyLabel, WORLD.width - 160, 12);
    // Today's best in gold once an attempt exists; a quiet invitation before.
    const daily = loadDaily(new Date().toISOString().slice(0, 10));
    if (daily) {
      this.dailyValue.setText(String(daily.best)).setFontSize(19).setColor(TYPE.gold);
    } else {
      this.dailyValue.setText("›").setFontSize(22).setColor(TYPE.violetDim);
    }

    this.playText.setText(t("menu.hold"));
    fitText(this.playText, WORLD.width - 48, 30);
    setCaps(this.tapText, t("menu.tap"));
    fitText(this.tapText, WORLD.width - 48, 11);

    setCaps(this.gearLabel, t("settings.title"));
    fitText(this.gearLabel, WORLD.width - this.gearLabel.x - 96, 11);
    this.refreshGearZone();

    this.settingsTitleText.setText(t("settings.title"));
    fitText(this.settingsTitleText, WORLD.width - 48, 38);
    setCaps(this.langLabelText, t("settings.language"));
    fitText(this.langLabelText, WORLD.width - 56, 11);

    setCaps(this.soundLabelText, t("settings.sound"));
    fitText(this.soundLabelText, 220, 11);
    this.refreshSoundValue();

    setCaps(this.musicLabelText, t("settings.music"));
    fitText(this.musicLabelText, 220, 11);
    this.refreshMusicValue();

    setCaps(this.backText, t("settings.back"));
    fitText(this.backText, WORLD.width - 64, 12);

    setCaps(this.howToText, t("settings.howToPlay"));
    fitText(this.howToText, 300, 11);

    this.helpTitleText.setText(t("settings.howToPlay"));
    fitText(this.helpTitleText, WORLD.width - 48, 38);
    setCaps(this.helpBackText, t("settings.back"));
    fitText(this.helpBackText, WORLD.width - 64, 12);

    const helpTitleKeys = ["help.grazeTitle", "help.touchTitle", "help.comboTitle"] as const;
    helpTitleKeys.forEach((key, index) => {
      setCaps(this.helpTitles[index], t(key));
      fitText(this.helpTitles[index], WORLD.width - 160 - 32, 11);
    });
    const helpKeys = ["help.graze", "help.touch", "help.combo"] as const;
    helpKeys.forEach((key, index) => {
      const caption = this.helpCaptions[index];
      // Wrapped rather than shrunk: these are full sentences, not labels.
      caption.setFontSize(26).setText(t(key));
    });

    this.refreshLangSelection();
  }

  private refreshSoundValue(): void {
    this.soundValueText.setText(isSoundEnabled() ? t("settings.soundOn") : t("settings.soundOff"));
    fitText(this.soundValueText, 120, 26);
  }

  private refreshMusicValue(): void {
    this.musicValueText.setText(isMusicEnabled() ? t("settings.soundOn") : t("settings.soundOff"));
    fitText(this.musicValueText, 120, 26);
  }

  /** Gold diamond and cream name on the active row; the rest stays muted. */
  private refreshLangSelection(): void {
    const active = getLanguage();
    for (const row of this.langRows) {
      const on = row.lang === active;
      row.marker.setVisible(on);
      row.marker.setAlpha(1);
      if (on) {
        row.marker.clear();
        row.marker.fillStyle(0xffd9a0, 1);
        row.marker.save();
        row.marker.translateCanvas(36, row.label.y);
        row.marker.rotateCanvas(Math.PI / 4);
        row.marker.fillRect(-3, -3, 6, 6);
        row.marker.restore();
      }
      row.label.setColor(on ? TYPE.cream : "#9d96b4");
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
      if (this.musicZone.contains(pointer.x, pointer.y)) {
        setMusicEnabled(!isMusicEnabled());
        // No restart needed: the bed reads the toggle live and fades.
        this.refreshMusicValue();
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

    if (this.dailyZone.contains(pointer.x, pointer.y)) {
      this.scene.start("flight", { daily: true });
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
    // The forest breathes behind her, far below any tier speed: a rest.
    this.scenery.update(dt, SCENERY.menuDriftPxS);
    // The audible half of that rest — also where the settings sound toggle
    // takes effect live, since the toggle lives on this scene.
    music.update(dt);
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
