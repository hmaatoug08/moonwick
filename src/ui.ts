import Phaser from "phaser";
import { Params, StringKey, tAll } from "./i18n";

/**
 * Outils de mise en page multilingue.
 *
 * RÈGLE : un bouton ou une zone de texte se dimensionne sur la chaîne la plus
 * LONGUE des 4 langues (les écarts atteignent +30 %), jamais sur l'anglais.
 * Et si malgré tout un texte dépasse, `fitText` réduit sa police.
 */

/** Réduit la police jusqu'à ce que le texte tienne dans `maxWidth`. */
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
 * Largeur, en pixels, de la plus longue traduction d'une clé — mesurée avec
 * le style réel, via un Text temporaire immédiatement détruit.
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
 * Largeur de bouton qui accueille la plus longue traduction dans toutes les
 * langues, marge intérieure comprise, sans dépasser `maxWidth`.
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
