import Phaser from "phaser";
import { HISTORY, TIERS, TYPE, WORLD } from "./config";
import { onLanguageChange, t, type StringKey } from "./i18n";
import { ESSENCES } from "./obstacleShapes";
import { loadHistory, loadStats } from "./save";
import { shareScoreImage } from "./share";
import { loadLifetimeStats } from "./stats";
import { capsText, diamondDivider, fitText, hairline, serifText, setCaps } from "./ui";

/**
 * The Scores page — the player's single progression hub.
 *
 * The DISPLAYED name lives in one i18n key (`scores`); the scene, its key and
 * this class stay neutral, so renaming the page never touches code.
 *
 * "Moonlight & ink": a typographic table, not a stack of boxes. Caps labels on
 * hairline rows, serif values, GOLD for the records alone. The pager is a row
 * of caps tabs under the title with a gold underline on the active one — the
 * dots and side arrows are gone, the tabs are the navigation.
 *
 * REACHABLE FROM THE HOME SCREEN ONLY. There is deliberately no path here from
 * the death screen: after dying the only two moves are replay or home.
 *
 * BUILT TO GROW. Collection pages are coming, so this is a PAGED scene:
 * `PAGES` is the whole navigation model, and adding a page means adding an
 * entry with a title key and a builder. The tabs adapt on their own.
 */

type Row = { label: string; value: string; gold?: boolean };

/** One page. Add an entry here to add a page. */
type Page = {
  titleKey: StringKey;
  /** Returns the rows to render, newest state each time it is opened. */
  build: () => Row[];
};

// 40 px rows: the Forest page (the densest — 11 rows) must stay above the
// share row, and the guard rail below enforces it at boot.
const FIRST_ROW_Y = 242;
const ROW_HEIGHT = 40;
const MARGIN_X = 28;

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
      // `save.ts` and `stats.ts` both track a best combo, from different eras
      // of the codebase. The page reads the larger of the two so it can never
      // show them disagreeing on the same screen.
      // "Recent runs" is NOT a row any more: the same data draws as five bars
      // under the table (see drawRecentRuns) — read at a glance, gold on the
      // best. A string of five numbers asked to be compared; bars just are.
      return [
        { label: t("scores.best"), value: String(stats.bestScore), gold: true },
        { label: t("scores.bestCombo"), value: String(Math.max(lifetime.bestCombo, stats.bestCombo)) },
        { label: t("scores.bestTime"), value: duration(lifetime.bestTime) }
      ];
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

/** The share row's hairline: rows and the chart must stay above it. */
const SHARE_LINE_Y = 712;
/** Bottom of the last row a page may use before it reaches the share row. */
const ROWS_BOTTOM_LIMIT = SHARE_LINE_Y - 22;

// --- Guard rail (dev only): a page must fit above the share row.
// Pages will be added — collections are the whole reason this scene is paged —
// and a page one row too long silently draws its tail underneath Share, which
// is exactly how the death screen got overloaded in the first place. Split the
// page rather than shrinking the rows.
if (import.meta.env.DEV) {
  for (const page of PAGES) {
    const rows = page.build().length;
    const bottom = FIRST_ROW_Y + rows * ROW_HEIGHT;
    if (bottom > ROWS_BOTTOM_LIMIT) {
      throw new Error(
        `Scores page "${page.titleKey}" has ${rows} rows, reaching y=${bottom} ` +
          `past the ${ROWS_BOTTOM_LIMIT} limit where the share row starts. Split it into two pages.`
      );
    }
  }
}

/** Recent-runs chart geometry (Records page only). */
const CHART = {
  labelY: 396,
  barsTop: 424,
  barsMaxH: 96,
  valueGap: 18,
  gap: 14
} as const;

export class ScoresScene extends Phaser.Scene {
  private page = 0;
  private titleText!: Phaser.GameObjects.Text;
  private emptyText!: Phaser.GameObjects.Text;
  private backLabel!: Phaser.GameObjects.Text;
  private tabLabels: Phaser.GameObjects.Text[] = [];
  private tabZones: Phaser.Geom.Rectangle[] = [];
  private tabUnderline!: Phaser.GameObjects.Rectangle;
  private rowLabels: Phaser.GameObjects.Text[] = [];
  private rowValues: Phaser.GameObjects.Text[] = [];
  private rowLines: Phaser.GameObjects.Rectangle[] = [];
  private chartLabel!: Phaser.GameObjects.Text;
  private chartBars!: Phaser.GameObjects.Graphics;
  private chartValues: Phaser.GameObjects.Text[] = [];
  private shareLabel!: Phaser.GameObjects.Text;
  private shareZone!: Phaser.Geom.Rectangle;
  private backZone!: Phaser.Geom.Rectangle;

  constructor() {
    super("scores");
  }

  create(): void {
    this.page = 0;
    this.tabLabels = [];
    this.tabZones = [];
    this.rowLabels = [];
    this.rowValues = [];
    this.rowLines = [];
    this.chartValues = [];

    const sky = this.add.graphics();
    sky.fillGradientStyle(0x05040c, 0x05040c, 0x140f2c, 0x140f2c, 1);
    sky.fillRect(0, 0, WORLD.width, WORLD.height);
    // Gentle vignette: the table reads like a page, the edges fall away.
    const vignette = this.add.graphics();
    vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.35, 0.35);
    vignette.fillRect(0, WORLD.height * 0.55, WORLD.width, WORLD.height * 0.45);

    const cx = WORLD.width / 2;

    // ‹ BACK — caps, top left. A label, not a box; the zone is generous.
    this.backLabel = capsText(this, MARGIN_X, 58, "", 11, "", "600", 0.24)
      .setOrigin(0, 0.5)
      .setColor(TYPE.violetDim);
    this.backZone = new Phaser.Geom.Rectangle(0, 30, 170, 56);

    this.titleText = serifText(this, cx, 115, "", 38, TYPE.cream).setOrigin(0.5);
    diamondDivider(this, cx, 152, 88, 0xffd9a0);

    // Tabs: one caps label per page, gold underline on the active one. The
    // tabs ARE the pager — no dots, no arrows. Laid out in refresh(), where
    // the translated widths are known.
    this.tabUnderline = this.add.rectangle(MARGIN_X, 212, 76, 1, 0xffd9a0, 1).setOrigin(0, 0.5);
    PAGES.forEach((_, index) => {
      const label = capsText(this, MARGIN_X, 192, "", 11, TYPE.label, "600", 0.22).setOrigin(0, 0.5);
      this.tabLabels.push(label);
      this.tabZones.push(new Phaser.Geom.Rectangle(0, 0, 0, 0));
      void index;
    });

    // Rows are created once, at the maximum a page can need, and reused: the
    // scene is opened and closed repeatedly and must not accumulate objects.
    const maxRows = Math.max(...PAGES.map((p) => p.build().length));
    for (let i = 0; i < maxRows; i++) {
      const top = FIRST_ROW_Y + i * ROW_HEIGHT;
      const mid = top + ROW_HEIGHT / 2;
      this.rowLabels.push(
        capsText(this, MARGIN_X, mid, "", 11, TYPE.label, "600", 0.22).setOrigin(0, 0.5)
      );
      this.rowValues.push(
        this.add
          .text(WORLD.width - MARGIN_X, mid, "", {
            fontFamily: TYPE.serif,
            fontStyle: "500",
            fontSize: "26px",
            color: TYPE.cream
          })
          .setOrigin(1, 0.5)
      );
      this.rowLines.push(hairline(this, MARGIN_X, top + ROW_HEIGHT, WORLD.width - MARGIN_X * 2));
    }

    // Recent runs: five bars, the record in gold. Records page only.
    this.chartLabel = capsText(this, MARGIN_X, CHART.labelY, "", 11, TYPE.label, "600", 0.22).setOrigin(
      0,
      0.5
    );
    this.chartBars = this.add.graphics();
    for (let i = 0; i < HISTORY.size; i++) {
      this.chartValues.push(
        this.add
          .text(0, CHART.barsTop + CHART.barsMaxH + CHART.valueGap, "", {
            fontFamily: TYPE.serif,
            fontStyle: "500",
            fontSize: "19px",
            color: TYPE.labelBright
          })
          .setOrigin(0.5, 0)
      );
    }

    this.emptyText = this.add
      .text(cx, 330, "", {
        fontFamily: TYPE.serif,
        fontStyle: "italic 400",
        fontSize: "24px",
        color: TYPE.label,
        align: "center",
        wordWrap: { width: WORLD.width - 96 }
      })
      .setOrigin(0.5)
      .setVisible(false);

    // Share moved here from the death screen. It shares the BEST run rather
    // than the last one, which is what a progression hub is about. A caps row
    // over a hairline — the screen's one band belongs to nothing here, so no
    // band: leaving is done with ‹ BACK, sharing is an offer, not the action.
    hairline(this, MARGIN_X, SHARE_LINE_Y, WORLD.width - MARGIN_X * 2, 0.18);
    this.shareLabel = capsText(this, cx, 756, "", 12, TYPE.labelBright, "600", 0.34).setOrigin(0.5);
    this.shareZone = new Phaser.Geom.Rectangle(cx - 160, 726, 320, 60);

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
    for (let i = 0; i < this.tabZones.length; i++) {
      if (i !== this.page && this.tabZones[i].contains(pointer.x, pointer.y)) {
        this.page = i;
        this.refresh();
        return;
      }
    }
  }

  /** Redraws the current page. Also the language-change handler. */
  private refresh(): void {
    setCaps(this.backLabel, `‹  ${t("settings.back")}`);
    this.titleText.setText(t("scores"));
    fitText(this.titleText, WORLD.width - 96, 38);
    setCaps(this.shareLabel, t("death.share"));
    fitText(this.shareLabel, WORLD.width - 96, 12);

    // Tabs, in page order from the left margin. The active one is cream with
    // the gold underline; the rest sit muted. Zones pad the labels to 44 px.
    let tabX = MARGIN_X;
    this.tabLabels.forEach((label, i) => {
      setCaps(label, t(PAGES[i].titleKey));
      fitText(label, 150, 11);
      label.setX(tabX);
      label.setColor(i === this.page ? TYPE.cream : "rgba(160,143,208,0.55)");
      label.setFontStyle(i === this.page ? "700" : "600");
      this.tabZones[i].setTo(tabX - 8, 170, label.width + 24, 48);
      if (i === this.page) {
        this.tabUnderline.setX(tabX).setSize(Math.max(56, label.width), 1);
      }
      tabX += label.width + 30;
    });

    const page = PAGES[this.page];
    const rows = page.build();
    const empty = loadLifetimeStats().gamesPlayed === 0;
    this.emptyText.setText(empty ? t("scores.empty") : "").setVisible(empty);

    this.rowLabels.forEach((label, i) => {
      const value = this.rowValues[i];
      const line = this.rowLines[i];
      const row = empty ? undefined : rows[i];
      label.setVisible(row !== undefined);
      value.setVisible(row !== undefined);
      line.setVisible(row !== undefined);
      if (!row) return;
      setCaps(label, row.label);
      value.setText(row.value);
      // Records in gold, larger; sub-header rows (empty value) in cream caps.
      const isHeader = row.value === "";
      label.setColor(isHeader ? TYPE.cream : TYPE.label);
      value.setColor(row.gold ? TYPE.gold : TYPE.cream);
      value.setFontSize(row.gold ? 32 : 26);
      // Values can be long: the label yields first so the number stays
      // readable, and both are clamped to their half.
      fitText(value, WORLD.width * 0.55 - MARGIN_X, row.gold ? 32 : 26);
      fitText(label, WORLD.width - MARGIN_X * 2 - value.width - 12, 11);
    });

    this.drawRecentRuns(empty);
  }

  /**
   * The last five scores as bars — the design's second content change: the
   * same data the old "Recent runs" row spelled out as a string of numbers,
   * now read at a glance, newest last, the best of the five in gold.
   */
  private drawRecentRuns(hidden: boolean): void {
    const history = loadHistory();
    const show = !hidden && this.page === 0 && history.length > 0;
    this.chartLabel.setVisible(show);
    this.chartBars.clear();
    for (const value of this.chartValues) value.setVisible(false);
    if (!show) return;

    setCaps(this.chartLabel, t("scores.recent"));
    fitText(this.chartLabel, WORLD.width - MARGIN_X * 2, 11);

    const scores = history.slice(-HISTORY.size);
    const max = Math.max(...scores, 1);
    const best = Math.max(...scores);
    const width = WORLD.width - MARGIN_X * 2;
    const slot = (width - CHART.gap * (scores.length - 1)) / scores.length;

    scores.forEach((score, i) => {
      const x = MARGIN_X + i * (slot + CHART.gap);
      const h = Math.max(6, Math.round((score / max) * CHART.barsMaxH));
      const top = CHART.barsTop + CHART.barsMaxH - h;
      const isBest = score === best && score > 0;
      if (isBest) {
        this.chartBars.fillGradientStyle(0xffd9a0, 0xffd9a0, 0xffd9a0, 0xffd9a0, 0.75, 0.75, 0.25, 0.25);
      } else {
        this.chartBars.fillStyle(TYPE.hairline, 0.28);
      }
      this.chartBars.fillRect(x, top, slot, h);

      const value = this.chartValues[i];
      value.setVisible(true);
      value.setX(x + slot / 2);
      value.setText(String(score));
      value.setColor(isBest ? TYPE.gold : TYPE.labelBright);
      fitText(value, slot + CHART.gap - 4, 19);
    });
  }
}
