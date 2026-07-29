import Phaser from "phaser";
import { LOGO } from "./config";
import { MOON_ON_RIGHT } from "./obstacleShapes";

/**
 * The mark — "the lit crescent" (see LOGO in config.ts): a waxing crescent
 * with the game's witch flying out of its bay, her trail arcing up the inner
 * edge to the upper horn, where the flame burns — SHE is what lights the
 * wick. Two circles, a teardrop and the witch's own polygons, drawn in
 * Canvas 2D once at boot; no image file.
 *
 * TWO-TIER SYSTEM (brand sheet): the witch rides in every full lockup at
 * 88 px of mark or more ("full" variant — home screen, share image). At
 * 64 px and below the mark drops to crescent and flame alone ("small",
 * "tiny"): she would be a smudge, and a smudge is worse than an absence.
 *
 * One drawing routine serves every surface, so the mark can never fork. It
 * draws the canonical lit-right mark into a private buffer and mirrors the
 * whole buffer when the moon sits left — the lit side follows `MOON_ON_RIGHT`
 * exactly like the obstacle rims.
 */

export const LOGO_MARK_KEY = "logo-mark";

export type LogoVariant = "full" | "small" | "tiny";

/** Headroom above the crescent square, in units: the flame reaches past it. */
export const LOGO_PAD_UNITS = 24;

/**
 * The witch, TRANSCRIBED from witchShape.ts by the brand sheet — the same
 * broom and brush polygons, the core disc, the single hat polygon, the cape.
 * Coordinates in her own space, torso at (0,0). She is the character the
 * game draws, not a redrawing of her.
 */
type WitchShape = { poly?: number[]; circle?: [number, number, number] };
const WITCH_SHAPES: WitchShape[] = [
  { poly: [17, 3, -28, 10, -28, 13, 17, 6] },
  { poly: [-27, 10, -42, 1.5, -42, 4] },
  { poly: [-27, 10.43, -42.43, 3.79, -42.43, 6.29] },
  { poly: [-27, 10.86, -42.86, 6.07, -42.86, 8.57] },
  { poly: [-27, 11.29, -43.29, 8.36, -43.29, 10.86] },
  { poly: [-27, 11.71, -43.71, 10.64, -43.71, 13.14] },
  { poly: [-27, 12.14, -44.14, 12.93, -44.14, 15.43] },
  { poly: [-27, 12.57, -44.57, 15.21, -44.57, 17.71] },
  { poly: [-27, 13, -45, 17.5, -45, 20] },
  {
    poly: [
      -6, -15.5, -11.25, -13.55, -16.5, -11.46, -21.75, -9.13, -27, -6, -21.75, -2.87, -16.5,
      -0.54, -11.25, 1.55, -6, 3.5
    ]
  },
  { circle: [0, 0, 11.5] },
  { poly: [-10, -4, -15, 6, -6, 13, 5, 10, 9, 1] },
  { poly: [3, 3, 16, 0, 17, 4.5, 4, 10] },
  { poly: [5, -7, 16, -2, 15, 1.5, 4, -3] },
  { circle: [9, -11, 5.8] },
  { poly: [-8, -27, 10, -19.5, 24, -18, 24, -15, -2, -12, -15, -15, -14, -18, -2, -20] },
  { poly: [-8, -30.2, -12.5, -29.32, -17.05, -28.31, -21.5, -27, -17.05, -25.69, -12.5, -24.68, -8, -23.8] }
];

/** Where she sits in the crescent's bay, in mark units (from the sheet). */
const WITCH_POSE = { x: 72, y: 124, scale: 99.8 / 78, tiltDeg: -14, rimOffset: 2.2 };

function fillWitchShapes(ctx: CanvasRenderingContext2D): void {
  for (const shape of WITCH_SHAPES) {
    ctx.beginPath();
    if (shape.circle) {
      ctx.arc(shape.circle[0], shape.circle[1], shape.circle[2], 0, Math.PI * 2);
    } else if (shape.poly) {
      ctx.moveTo(shape.poly[0], shape.poly[1]);
      for (let i = 2; i < shape.poly.length; i += 2) ctx.lineTo(shape.poly[i], shape.poly[i + 1]);
      ctx.closePath();
    }
    ctx.fill();
  }
}

function radialGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string
): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(255,217,160,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * Draws the mark with its crescent square's top-left at (x, y), `size` px
 * wide. The flame extends up to `size * LOGO_PAD_UNITS / LOGO.unit` ABOVE y —
 * callers leave that headroom. `full` carries the witch; use it only at
 * 88 px of mark or more (the two-tier rule).
 */
export function drawCrescentMark(
  target: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  variant: LogoVariant = "full",
  colors: { body?: string; flame?: string; flameTip?: string } = {}
): void {
  const spec = LOGO[variant];
  const body = colors.body ?? LOGO.bodyColor;
  const flame = colors.flame ?? LOGO.flameColor;
  const flameTip = colors.flameTip ?? LOGO.flameTipColor;
  const scale = size / LOGO.unit;
  const pad = LOGO_PAD_UNITS * scale;

  const buffer = document.createElement("canvas");
  buffer.width = Math.ceil(size);
  buffer.height = Math.ceil(size + pad);
  const ctx = buffer.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.translate(0, LOGO_PAD_UNITS);

  const cx = LOGO.unit / 2;

  // Moon circle, then the shadow circle punched out towards the dark side:
  // what survives is the crescent. Canonical mark is lit on the RIGHT; the
  // whole buffer mirrors at composite time when the moon sits left.
  ctx.beginPath();
  ctx.arc(cx, cx, LOGO.moonR, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx - spec.shadowOffset, cx, spec.shadowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  if (variant === "full") {
    // Her trail, arcing up the crescent's inner edge towards the horn.
    ctx.save();
    ctx.translate(6, 139);
    ctx.rotate((-17 * Math.PI) / 180);
    const trail = ctx.createLinearGradient(0, 0, 104, 0);
    trail.addColorStop(0, "rgba(255,217,160,0)");
    trail.addColorStop(1, "rgba(255,217,160,0.55)");
    ctx.fillStyle = trail;
    ctx.filter = "blur(4px)";
    ctx.beginPath();
    ctx.roundRect(0, -7, 104, 14, 7);
    ctx.fill();
    ctx.filter = "none";
    ctx.restore();

    // The witch flying out of the bay, on the game's own tilt. Rim first
    // (offset towards the moon, like witchShape.ts builds hers), body over.
    radialGlow(ctx, WITCH_POSE.x, WITCH_POSE.y, 46, "rgba(255,217,160,0.3)");
    ctx.save();
    ctx.translate(WITCH_POSE.x, WITCH_POSE.y);
    ctx.rotate((WITCH_POSE.tiltDeg * Math.PI) / 180);
    ctx.scale(WITCH_POSE.scale, WITCH_POSE.scale);
    ctx.save();
    ctx.translate(WITCH_POSE.rimOffset, -WITCH_POSE.rimOffset);
    ctx.fillStyle = LOGO.witchRim;
    fillWitchShapes(ctx);
    ctx.restore();
    ctx.fillStyle = LOGO.witchBody;
    fillWitchShapes(ctx);
    ctx.restore();

    radialGlow(ctx, 139, -1, 15, "rgba(255,217,160,0.6)");
  }

  // The flame, above the upper horn on the centre-right axis. A teardrop at
  // full size; a rounding dot in the small recipes, where a point vanishes.
  const fx = 139;
  const fy = -LOGO.flameLift + spec.flameH / 2;
  const gradient = ctx.createLinearGradient(0, fy - spec.flameH / 2, 0, fy + spec.flameH / 2);
  gradient.addColorStop(0, flameTip);
  gradient.addColorStop(1, flame);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  if (spec.teardrop) {
    const r = spec.flameW / 2;
    const tipY = fy - spec.flameH / 2;
    const baseCy = fy + spec.flameH / 2 - r;
    ctx.moveTo(fx, tipY);
    ctx.quadraticCurveTo(fx + r, baseCy - r, fx + r, baseCy);
    ctx.arc(fx, baseCy, r, 0, Math.PI, false);
    ctx.quadraticCurveTo(fx - r, baseCy - r, fx, tipY);
  } else {
    ctx.ellipse(fx, fy, spec.flameW / 2, spec.flameH / 2, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  if (MOON_ON_RIGHT) {
    target.drawImage(buffer, x, y - pad);
  } else {
    target.save();
    target.translate(x + buffer.width, y - pad);
    target.scale(-1, 1);
    target.drawImage(buffer, 0, 0);
    target.restore();
  }
}

/** The mark as a Phaser texture, generated once at boot. Idempotent. */
export function ensureLogoTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(LOGO_MARK_KEY)) return;
  const size = LOGO.unit;
  const pad = LOGO_PAD_UNITS;
  const texture = scene.textures.createCanvas(LOGO_MARK_KEY, size, size + pad);
  if (!texture) return;
  drawCrescentMark(texture.getContext(), 0, pad, size, "full");
  texture.refresh();
}
