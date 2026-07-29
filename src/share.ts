import { BRAND, TYPE } from "./config";
import { t } from "./i18n";
import { drawCrescentMark } from "./logo";

/**
 * Shareable score image, drawn on an OFF-SCREEN 1080x1920 canvas.
 * Zero external dependencies, zero assets: everything is hand-drawn in
 * Canvas 2D, in the same palette as the game. Fully localised (i18n).
 */
const W = 1080;
const H = 1920;

export type ShareData = {
  score: number;
  tierName: string;
  bestCombo: number;
  isRecord: boolean;
};

/**
 * Shrinks the font size until the text fits within `maxWidth`.
 * Same overflow constraint as in the scenes: Spanish and Italian labels run
 * up to 30% longer than English.
 */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  basePx: number,
  maxWidth: number,
  weight = "",
  family: string = TYPE.serif
): void {
  let px = basePx;
  const font = (size: number) => `${weight} ${size}px ${family}`.trim();
  ctx.font = font(px);
  while (ctx.measureText(text).width > maxWidth && px > 16) {
    px -= 2;
    ctx.font = font(px);
  }
}

/** Draws the card and returns the canvas (reusable for a blob or a data URL). */
function drawCard(data: ShareData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Gradient sky, same spirit as The Edge.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0b0716");
  sky.addColorStop(1, "#241a4a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Moon, top right.
  const moonX = W - 210;
  const moonY = 300;
  const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 300);
  glow.addColorStop(0, "rgba(255,233,168,0.35)");
  glow.addColorStop(1, "rgba(255,233,168,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(moonX - 300, moonY - 300, 600, 600);
  ctx.fillStyle = "#f5efd8";
  ctx.beginPath();
  ctx.arc(moonX, moonY, 96, 0, Math.PI * 2);
  ctx.fill();

  // Witch silhouette and golden trail, in the lower third: below the text
  // block, so it never overlaps the tier name or the combo.
  const witchX = W * 0.68;
  const witchY = H * 0.74;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const x = witchX - t * 560;
    const y = witchY + Math.sin(t * 2.4) * 70;
    const r = 34 * (1 - t) + 4;
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, `rgba(255,210,122,${0.5 * (1 - t)})`);
    g2.addColorStop(1, "rgba(255,210,122,0)");
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // The orb itself.
  ctx.fillStyle = "#ffe0a0";
  ctx.beginPath();
  ctx.arc(witchX, witchY, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.textAlign = "center";
  const maxTextWidth = W - 120;

  // Record mention, above the score: caps recipe, gold — the record colour.
  if (data.isRecord) {
    ctx.fillStyle = TYPE.gold;
    const record = t("share.newRecord").toUpperCase();
    fitFont(ctx, record, 48, maxTextWidth, "700", TYPE.sans);
    ctx.letterSpacing = "12px";
    ctx.fillText(record, W / 2, 500);
    ctx.letterSpacing = "0px";
  }

  // The score, huge, serif light: it is the subject of the image.
  ctx.fillStyle = TYPE.cream;
  fitFont(ctx, String(data.score), 420, maxTextWidth, "300");
  ctx.fillText(String(data.score), W / 2, 900);

  // Tier reached (serif italic — a place name) and best combo.
  ctx.fillStyle = "#d7cfe8";
  fitFont(ctx, data.tierName, 64, maxTextWidth, "italic 400");
  ctx.fillText(data.tierName, W / 2, 1030);
  ctx.fillStyle = TYPE.label;
  const combo = t("share.bestCombo", { combo: data.bestCombo }).toUpperCase();
  fitFont(ctx, combo, 30, maxTextWidth, "600", TYPE.sans);
  ctx.letterSpacing = "8px";
  ctx.fillText(combo, W / 2, 1110);
  ctx.letterSpacing = "0px";

  // Brand at the bottom: the lit-crescent mark over the wordmark — the same
  // stacked lockup as the home screen, discreet. Never translated.
  const markSize = 96;
  drawCrescentMark(ctx, W / 2 - markSize / 2, H - 300, markSize);
  ctx.fillStyle = "rgba(244,238,224,0.55)";
  fitFont(ctx, BRAND.name, 52, maxTextWidth, "300");
  ctx.letterSpacing = `${Math.round(BRAND.letterSpacing * 0.9)}px`;
  ctx.fillText(BRAND.name, W / 2, H - 110);
  ctx.letterSpacing = "0px";

  return canvas;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b), "image/png");
    else resolve(null);
  });
}

/**
 * Shares the image: Web Share API with a file when available, otherwise a PNG
 * download. Never throws — a cancelled share is normal.
 */
export async function shareScoreImage(data: ShareData): Promise<"shared" | "downloaded" | "failed"> {
  try {
    const canvas = drawCard(data);
    const blob = await toBlob(canvas);
    if (!blob) return "failed";

    const file = new File([blob], "moonwick-score.png", { type: "image/png" });
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    };

    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({
        files: [file],
        title: BRAND.name,
        text: `${data.score} · ${data.tierName}`
      });
      return "shared";
    }

    // Fallback: download the PNG.
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "moonwick-score.png";
    a.click();
    // Give the browser time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  } catch {
    // Share cancelled by the user, or API unavailable: harmless.
    return "failed";
  }
}
