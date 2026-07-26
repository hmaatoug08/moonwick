import { BRAND } from "./config";
import { t } from "./i18n";

/**
 * Image de score partageable, dessinée sur un canvas HORS ÉCRAN en 1080×1920.
 * Zéro dépendance externe, zéro asset : tout est tracé à la main en Canvas 2D,
 * dans la même palette que le jeu. Entièrement localisée (i18n).
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
 * Réduit la police jusqu'à ce que le texte tienne dans `maxWidth`.
 * Même contrainte de débordement que dans les scènes : les libellés
 * espagnols et italiens sont jusqu'à 30 % plus longs que l'anglais.
 */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  basePx: number,
  maxWidth: number,
  weight = ""
): void {
  let px = basePx;
  const font = (size: number) => `${weight} ${size}px sans-serif`.trim();
  ctx.font = font(px);
  while (ctx.measureText(text).width > maxWidth && px > 16) {
    px -= 2;
    ctx.font = font(px);
  }
}

/** Trace l'image et retourne le canvas (réutilisable pour blob ou dataURL). */
function drawCard(data: ShareData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Ciel dégradé, même esprit que La Lisière.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0b0716");
  sky.addColorStop(1, "#241a4a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Lune, en haut à droite.
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

  // Silhouette de la sorcière + traînée dorée, dans le tiers bas : sous le
  // bloc de texte, pour ne jamais chevaucher le palier ni le combo.
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
  // L'orbe elle-même.
  ctx.fillStyle = "#ffe0a0";
  ctx.beginPath();
  ctx.arc(witchX, witchY, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.textAlign = "center";
  const maxTextWidth = W - 120;

  // Mention de record, au-dessus du score.
  if (data.isRecord) {
    ctx.fillStyle = "#ffd27a";
    fitFont(ctx, t("share.newRecord"), 62, maxTextWidth, "bold");
    ctx.fillText(t("share.newRecord"), W / 2, 500);
  }

  // Le score, énorme : c'est le sujet de l'image.
  ctx.fillStyle = "#f5efd8";
  fitFont(ctx, String(data.score), 400, maxTextWidth, "bold");
  ctx.fillText(String(data.score), W / 2, 900);

  // Palier atteint et meilleur combo.
  ctx.fillStyle = "#d9a7ff";
  fitFont(ctx, data.tierName, 56, maxTextWidth);
  ctx.fillText(data.tierName, W / 2, 1030);
  ctx.fillStyle = "#c9a0ff";
  const combo = t("share.bestCombo", { combo: data.bestCombo });
  fitFont(ctx, combo, 44, maxTextWidth);
  ctx.fillText(combo, W / 2, 1110);

  // Marque, discrète, en bas. Non traduite (même traitement que le logo de
  // l'accueil : interlettrage large, jamais passée par i18n).
  ctx.fillStyle = "rgba(217,167,255,0.55)";
  fitFont(ctx, BRAND.name, 42, maxTextWidth);
  ctx.letterSpacing = `${Math.round(BRAND.letterSpacing * 0.6)}px`;
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
 * Partage l'image : Web Share API avec fichier si disponible, sinon
 * téléchargement du PNG. Ne lève jamais — un partage annulé est normal.
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

    // Repli : téléchargement du PNG.
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "moonwick-score.png";
    a.click();
    // Laisser au navigateur le temps de démarrer le téléchargement.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  } catch {
    // Partage annulé par l'utilisateur, ou API indisponible : sans conséquence.
    return "failed";
  }
}
