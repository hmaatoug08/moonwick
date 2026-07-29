import Phaser from "phaser";
import { HISTORY, SAFE_BOTTOM, TIERS, WORLD } from "./config";
import { onLanguageChange, t, type StringKey } from "./i18n";
import { drawBookIcon } from "./icons";
import { ESSENCES } from "./obstacleShapes";
import { loadHistory, loadStats } from "./save";
import { shareScoreImage } from "./share";
import { loadLifetimeStats } from "./stats";
import { buttonWidth, fitText } from "./ui";

/**
 * The Scores page — the player's single progression hub.
 *
 * The DISPLAYED name lives in one i18n key (`scores`); the scene, its key and
 * this class stay neutral, so renaming the page never touches code.
 *
 * Everything that is a record, a history or a statistic lives here and nowhere
 * else. The death screen used to carry all of it and had become a wall of
 * numbers between the player and the replay button; it now shows five things,
 * and the reading happens on purpose, from the home screen.
 *
 * REACHABLE FROM THE HOME SCREEN ONLY. There is deliberately no path here from
 * the death screen: after dying the only two moves are replay or home.
 *
 * BUILT TO GROW. Collection pages are coming, so this is a PAGED scene rather
 * than one long list: `PAGES` is the whole navigation model, and adding a page
 * means adding an entry with a title key and a builder. The pager, the dots and
 * the back button adapt on their own.
 */

type Row = { label: string; value: string };

/** One page. Add an entry here to add a page. */
type Page = {
  titleKey: StringKey;
  /** Returns the rows to render, newest state each time it is opened. */
  build: () => Row[];
};

const HEADER_Y = 96;
const FIRST_ROW_Y = 176;
const ROW_HEIGHT = 40;
const MARGIN_X = 30;

/** Seconds as a short human string: 1 m 04 s past a minute, else 12.3 s. */
function duration(seconds: number): string {
  if (seconds < 60) return t("scores.seconds", { value: seconds.toFixed(1) });
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} m ${String(s).padStart(2, "0")} s`;
}

const PAGES: Page[] = [
  {
    titleKey: "scores.records",
    build: () => {
      const stats = loadStats();
      const lifetime = loadLifetimeStats();
      const history = loadHistory();
      // `save.ts` and `stats.ts` both track a best combo, from different eras
      // of the codebase. The lifetime one is the richer record (it also breaks
      // down per tier), so this page reads that one everywhere and the two
      // can never be seen disagreeing on the same screen.
      const rows: Row[] = [
        { label: t("scores.best"), value: String(stats.bestScore) },
        { label: t("scores.bestCombo"), value: String(Math.max(lifetime.bestCombo, stats.bestCombo)) },
        { label: t("scores.bestTime"), value: duration(lifetime.bestTime) }
      ];
      if (history.length > 0) {
        // Newest first: the run just flown is the one being looked for.
        rows.push({
          label: t("scores.recent"),
          value: [...history].reverse().slice(0, HISTORY.size).join("  ·  ")
        });
      }
      return rows;
    }
  },
  {
    titleKey: "scores.journal",
    build: () => {
      const s = loadLifetimeStats();
      return [
        { label: t("scores.games"), value: String(s.gamesPlayed) },
        { label: t("scores.playTime"), value: duration(s.totalPlayTime) },
        { label: t("scores.grazes"), value: String(s.totalGrazes) },
        { label: t("scores.fullMoons"), value: String(s.fullMoons) },
        {
          label: t("scores.closestGraze"),
          value: Number.isFinite(s.closestGraze)
            ? t("scores.pixels", { value: s.closestGraze.toFixed(1) })
            : "—"
        }
      ];
    }
  },
  {
    // Split off from the Journal: the two breakdowns together ran past the
    // buttons. A page is the unit that keeps this readable.
    titleKey: "scores.forest",
    build: () => {
      const s = loadLifetimeStats();
      const rows: Row[] = [{ label: t("scores.byTier"), value: "" }];
      TIERS.forEach((tier, i) => {
        const stat = s.perTier[i];
        rows.push({
          label: `   ${t(tier.nameKey)}`,
          value: `${stat.reached} ${t("scores.reached")} · ${stat.cleared} ${t("scores.cleared")}`
        });
      });
      rows.push({ label: t("scores.byEssence"), value: "" });
      for (const essence of ESSENCES) {
        rows.push({
          label: `   ${t(`essence.${essence}` as StringKey)}`,
          value: String(s.grazesByEssence[essence])
        });
      }
      return rows;
    }
  }
];

/** Bottom of the last row a page may use before it reaches the buttons. */
const ROWS_BOTTOM_LIMIT = WORLD.height - SAFE_BOTTOM - 170;

// --- Guard rail (dev only): a page must fit above the buttons.
// Pages will be added — collections are the whole reason this scene is paged —
// and a page one row too long silently draws its tail underneath Share and
// Back, which is exactly how the death screen got overloaded in the first
// place. Split the page rather than shrinking the rows.
if (import.meta.env.DEV) {
  for (const page of PAGES) {
    const rows = page.build().length;
    const bottom = FIRST_ROW_Y + (rows - 1) * ROW_HEIGHT;
    if (bottom > ROWS_BOTTOM_LIMIT) {
      throw new Error(
        `Scores page "${page.titleKey}" has ${rows} rows, reaching y=${bottom} ` +
          `past the ${ROWS_BOTTOM_LIMIT} limit where the buttons start. Split it into two pages.`
      );
    }
  }
}

export class ScoresScene extends Phaser.Scene {
  private page = 0;
  private titleText!: Phaser.GameObjects.Text;
  private titleIcon!: Phaser.GameObjects.Graphics;
  private pageTitleText!: Phaser.GameObjects.Text;
  private emptyText!: Phaser.GameObjects.Text;
  private backLabel!: Phaser.GameObjects.Text;
  private rowLabels: Phaser.GameObjects.Text[] = [];
  private rowValues: Phaser.GameObjects.Text[] = [];
  private dots: Phaser.GameObjects.Arc[] = [];
  private shareLabel!: Phaser.GameObjects.Text;
  private shareZone!: Phaser.Geom.Rectangle;
  private backZone!: Phaser.Geom.Rectangle;
  private prevZone!: Phaser.Geom.Rectangle;
  private nextZone!: Phaser.Geom.Rectangle;

  constructor() {
    super("scores");
  }

  create(): void {
    this.page = 0;

    const sky = this.add.graphics();
    sky.fillGradientStyle(0x0b0716, 0x0b0716, 0x241a4a, 0x241a4a, 1);
    sky.fillRect(0, 0, WORLD.width, WORLD.height);

    const cx = WORLD.width / 2;
    this.titleText = this.add
      .text(cx + 18, 52, "", { fontFamily: "sans-serif", fontStyle: "bold", fontSize: "30px", color: "#f5efd8" })
      .setOrigin(0.5);
    // The same book that labels the button on the home screen, so the place
    // and the way into it read as one thing.
    this.titleIcon = this.add.graphics();
    this.pageTitleText = this.add
      .text(cx, HEADER_Y, "", { fontFamily: "sans-serif", fontSize: "20px", color: "#d9a7ff" })
      .setOrigin(0.5);

    // Rows are created once, at the maximum a page can need, and reused: the
    // scene is opened and closed repeatedly and must not accumulate objects.
    const maxRows = Math.max(...PAGES.map((p) => p.build().length));
    for (let i = 0; i < maxRows; i++) {
      const y = FIRST_ROW_Y + i * ROW_HEIGHT;
      this.rowLabels.push(
        this.add
          .text(MARGIN_X, y, "", { fontFamily: "sans-serif", fontSize: "17px", color: "#c9a0ff" })
          .setOrigin(0, 0.5)
      );
      this.rowValues.push(
        this.add
          .text(WORLD.width - MARGIN_X, y, "", {
            fontFamily: "sans-serif",
            fontStyle: "bold",
            fontSize: "17px",
            color: "#f5efd8"
          })
          .setOrigin(1, 0.5)
      );
    }

    this.emptyText = this.add
      .text(cx, 300, "", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#8877aa",
        align: "center",
        wordWrap: { width: WORLD.width - 80 }
      })
      .setOrigin(0.5)
      .setVisible(false);

    // Pager. Only drawn when there is more than one page, so a future single
    // page — or a dozen — needs no change here.
    // The dots sit under the page title, NOT above the buttons: down there
    // they end up behind the Share button as pages are added.
    const dotsY = HEADER_Y + 28;
    PAGES.forEach((_, i) => {
      this.dots.push(this.add.circle(cx + (i - (PAGES.length - 1) / 2) * 22, dotsY, 4, 0x9b6bff, 0.4));
    });
    this.dots.forEach((d) => d.setVisible(PAGES.length > 1));
    // The arrows sit level with the rows, where the thumb already is.
    const arrowY = WORLD.height * 0.5;
    const arrowStyle = { fontFamily: "sans-serif", fontStyle: "bold", fontSize: "34px", color: "#9b6bff" };
    if (PAGES.length > 1) {
      this.add.text(MARGIN_X - 12, arrowY, "‹", arrowStyle).setOrigin(0.5);
      this.add.text(WORLD.width - MARGIN_X + 12, arrowY, "›", arrowStyle).setOrigin(0.5);
    }
    this.prevZone = new Phaser.Geom.Rectangle(0, arrowY - 60, 72, 120);
    this.nextZone = new Phaser.Geom.Rectangle(WORLD.width - 72, arrowY - 60, 72, 120);

    // Share moved here from the death screen, which now shows four things and
    // nothing else. It shares the BEST run rather than the last one, which is
    // what a progression hub is about.
    const shareStyle = { fontFamily: "sans-serif", fontStyle: "bold", fontSize: "20px" };
    const shareW = buttonWidth(this, "death.share", shareStyle, 20, 150, WORLD.width - 80);
    const shareY = WORLD.height - SAFE_BOTTOM - 138;
    this.add.rectangle(cx, shareY, shareW, 54, 0xffffff, 0.06).setStrokeStyle(2, 0x9b6bff, 0.5);
    this.shareLabel = this.add.text(cx, shareY, "", { ...shareStyle, color: "#d9a7ff" }).setOrigin(0.5);
    this.shareZone = new Phaser.Geom.Rectangle(cx - shareW / 2, shareY - 27, shareW, 54);

    // Back: same shape and place as everywhere else, above the safe area.
    const backStyle = { fontFamily: "sans-serif", fontStyle: "bold", fontSize: "30px" };
    const backW = buttonWidth(this, "settings.back", backStyle, 44, 200, WORLD.width - 64);
    const backY = WORLD.height - SAFE_BOTTOM - 56;
    this.add.rectangle(cx, backY, backW, 74, 0x9b6bff, 0.16).setStrokeStyle(2, 0x9b6bff, 0.7);
    this.backLabel = this.add.text(cx, backY, "", { ...backStyle, color: "#f2c8ff" }).setOrigin(0.5);
    this.backZone = new Phaser.Geom.Rectangle(cx - backW / 2, backY - 37, backW, 74);

    this.refresh();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p));

    const unsubscribe = onLanguageChange(() => this.refresh());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.backZone.contains(pointer.x, pointer.y)) {
      this.scene.start("menu");
      return;
    }
    if (this.shareZone.contains(pointer.x, pointer.y)) {
      const stats = loadStats();
      void shareScoreImage({
        score: stats.bestScore,
        tierName: t(TIERS[Math.min(stats.bestTier, TIERS.length - 1)].nameKey),
        bestCombo: stats.bestCombo,
        isRecord: false
      });
      return;
    }
    if (PAGES.length > 1 && this.prevZone.contains(pointer.x, pointer.y)) {
      this.page = (this.page + PAGES.length - 1) % PAGES.length;
      this.refresh();
      return;
    }
    if (PAGES.length > 1 && this.nextZone.contains(pointer.x, pointer.y)) {
      this.page = (this.page + 1) % PAGES.length;
      this.refresh();
    }
  }

  /** Redraws the current page. Also the language-change handler. */
  private refresh(): void {
    this.titleText.setText(t("scores"));
    fitText(this.titleText, WORLD.width - 96, 30);
    // Redrawn with the title: the icon sits just left of whatever the label
    // turned out to be, which differs by language.
    this.titleIcon.clear();
    drawBookIcon(this.titleIcon, this.titleText.getBounds().left - 22, 52, 0.85);
    this.backLabel.setText(t("settings.back"));
    fitText(this.backLabel, WORLD.width - 80, 30);
    this.shareLabel.setText(t("death.share"));
    fitText(this.shareLabel, this.shareZone.width - 20, 20);

    const page = PAGES[this.page];
    this.pageTitleText.setText(t(page.titleKey));
    fitText(this.pageTitleText, WORLD.width - 48, 20);

    const rows = page.build();
    const empty = loadLifetimeStats().gamesPlayed === 0;
    this.emptyText.setText(empty ? t("scores.empty") : "").setVisible(empty);

    this.rowLabels.forEach((label, i) => {
      const value = this.rowValues[i];
      const row = empty ? undefined : rows[i];
      label.setVisible(row !== undefined);
      value.setVisible(row !== undefined);
      if (!row) return;
      label.setText(row.label);
      value.setText(row.value);
      // Values can be long ("15 · 0 · 3 · 12 · 7"): the label yields first so
      // the number stays readable, and both are clamped to their half.
      fitText(value, WORLD.width * 0.52 - MARGIN_X, 17);
      fitText(label, WORLD.width - MARGIN_X * 2 - value.width - 12, 17);
    });

    this.dots.forEach((dot, i) => dot.setFillStyle(0x9b6bff, i === this.page ? 1 : 0.3));
  }
}
