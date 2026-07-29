import Phaser from "phaser";
import { TYPE, WORLD } from "./config";
import { Params, StringKey, tAll } from "./i18n";

/**
 * Multilingual layout helpers, plus the small vocabulary of the "Moonlight &
 * ink" art direction: small-caps labels, serif values, hairlines and the one
 * filled band per screen. Every screen speaks through these so the interface
 * cannot drift into having two voices.
 *
 * RULE: a button or text area is sized against the LONGEST of the four
 * translations (gaps reach +130%), never against English alone. And if a
 * string still overflows, `fitText` shrinks its font until it fits.
 */

/**
 * SMALL CAPS label: uppercase Manrope at wide tracking. Canvas has no
 * font-variant, so the recipe is uppercase + letterSpacing — which is also why
 * these helpers exist: the tracking must scale with the size, in one place.
 * The caller passes the string ALREADY TRANSLATED (t() as usual).
 */
export function capsText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  sizePx: number,
  color: string,
  weight: "600" | "700" = "600",
  trackEm: number = TYPE.trackEm
): Phaser.GameObjects.Text {
  const label = scene.add.text(x, y, text.toUpperCase(), {
    fontFamily: TYPE.sans,
    fontStyle: weight,
    fontSize: `${sizePx}px`,
    color
  });
  label.setLetterSpacing(sizePx * trackEm);
  return label;
}

/** Re-apply a translated string to a caps label (language change). */
export function setCaps(label: Phaser.GameObjects.Text, text: string): void {
  label.setText(text.toUpperCase());
}

/** Serif text: the voice of titles, values and hero numerals. */
export function serifText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  sizePx: number,
  color: string,
  weight: "300" | "400" | "500" | "600" = "400",
  italic = false
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, {
    fontFamily: TYPE.serif,
    fontStyle: italic ? `italic ${weight}` : weight,
    fontSize: `${sizePx}px`,
    color
  });
}

/** 1 px hairline. Solid, low alpha — rule 2: never 2 px. */
export function hairline(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  alpha: number = TYPE.hairlineAlpha
): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, width, 1, TYPE.hairline, alpha).setOrigin(0, 0.5);
}

/** Hairline fading out at both ends: the home screen's dividers. */
export function hairlineGradient(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  peakAlpha: number,
  color: number = TYPE.hairline
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.fillGradientStyle(color, color, color, color, 0, peakAlpha, 0, peakAlpha);
  gfx.fillRect(x, y, width / 2, 1);
  gfx.fillGradientStyle(color, color, color, color, peakAlpha, 0, peakAlpha, 0);
  gfx.fillRect(x + width / 2, y, width / 2, 1);
  return gfx;
}

/**
 * Section divider: two hairlines meeting a small rotated diamond. The diamond
 * is gold where the section holds a record, violet elsewhere.
 */
export function diamondDivider(
  scene: Phaser.Scene,
  cx: number,
  y: number,
  width: number,
  diamondColor: number,
  diamondAlpha = 1
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  const half = TYPE.hairlineDiamond / 2 + 4;
  gfx.fillStyle(TYPE.hairline, TYPE.hairlineAlphaStrong);
  gfx.fillRect(cx - width / 2, y, width / 2 - half, 1);
  gfx.fillRect(cx + half, y, width / 2 - half, 1);
  gfx.fillStyle(diamondColor, diamondAlpha);
  gfx.save();
  gfx.translateCanvas(cx, y);
  gfx.rotateCanvas(Math.PI / 4);
  gfx.fillRect(-TYPE.hairlineDiamond / 2, -TYPE.hairlineDiamond / 2, TYPE.hairlineDiamond, TYPE.hairlineDiamond);
  gfx.restore();
  return gfx;
}

/**
 * THE one filled band of a screen (rule 1): full-width violet gradient with a
 * glowing top hairline. Returns the graphics so death/settings/help can attach
 * it to their containers. The caption is the caller's — always a caps label.
 */
export function actionBand(
  scene: Phaser.Scene,
  top: number,
  height: number
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics();
  gfx.fillGradientStyle(
    TYPE.bandColor,
    TYPE.bandColor,
    TYPE.bandColor,
    TYPE.bandColor,
    TYPE.bandAlphaTop,
    TYPE.bandAlphaTop,
    TYPE.bandAlphaBottom,
    TYPE.bandAlphaBottom
  );
  gfx.fillRect(0, top, WORLD.width, height);
  gfx.fillGradientStyle(
    TYPE.bandLine,
    TYPE.bandLine,
    TYPE.bandLine,
    TYPE.bandLine,
    0,
    TYPE.bandLineAlpha,
    0,
    TYPE.bandLineAlpha
  );
  gfx.fillRect(0, top, WORLD.width / 2, 1);
  gfx.fillGradientStyle(
    TYPE.bandLine,
    TYPE.bandLine,
    TYPE.bandLine,
    TYPE.bandLine,
    TYPE.bandLineAlpha,
    0,
    TYPE.bandLineAlpha,
    0
  );
  gfx.fillRect(WORLD.width / 2, top, WORLD.width / 2, 1);
  return gfx;
}

/** Shrinks the font size until the text fits within `maxWidth`. */
export function fitText(
  text: Phaser.GameObjects.Text,
  maxWidth: number,
  basePx: number,
  minPx = 11
): void {
  let px = Math.round(basePx);
  text.setFontSize(px);
  while (text.width > maxWidth && px > minPx) {
    px -= 1;
    text.setFontSize(px);
  }
}

/**
 * Width, in pixels, of the longest translation of a key — measured with the
 * real text style, using a temporary Text that is destroyed immediately.
 */
export function widestTranslation(
  scene: Phaser.Scene,
  key: StringKey,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  params?: Params
): number {
  const probe = scene.make.text({ style }, false);
  let widest = 0;
  for (const candidate of tAll(key, params)) {
    probe.setText(candidate);
    widest = Math.max(widest, probe.width);
  }
  probe.destroy();
  return widest;
}

/**
 * Button width that fits the longest translation in every language, padding
 * included, without exceeding `maxWidth`.
 */
export function buttonWidth(
  scene: Phaser.Scene,
  key: StringKey,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  padding: number,
  minWidth: number,
  maxWidth: number
): number {
  const widest = widestTranslation(scene, key, style, { points: 999, combo: 99, score: 99999 });
  return Phaser.Math.Clamp(Math.ceil(widest + padding * 2), minWidth, maxWidth);
}
