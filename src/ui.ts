import Phaser from "phaser";
import { Params, StringKey, tAll } from "./i18n";

/**
 * Multilingual layout helpers.
 *
 * RULE: a button or text area is sized against the LONGEST of the four
 * translations (gaps reach +130%), never against English alone. And if a
 * string still overflows, `fitText` shrinks its font until it fits.
 */

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
