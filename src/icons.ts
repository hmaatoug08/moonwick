import Phaser from "phaser";
import { OBSTACLE_ART, WITCH_ART } from "./config";
import { MOON_ON_RIGHT } from "./obstacleShapes";

/**
 * Icon body: the witch's lifted colour, NOT the obstacles' near-pure black.
 *
 * Obstacles are large masses read against a lighter sky; an icon is a small
 * shape sitting on the darkest part of the screen, and filled near-black it
 * disappears entirely — only its rim survives, which reads as a stray stroke.
 * Same lesson as the witch's body.
 */
const ICON_BODY = WITCH_ART.bodyColor;
const ICON_RIM = OBSTACLE_ART.rimColor;

/**
 * Stroke weight. Icons here sit on the darkest part of the screen at ~26 px,
 * where a 2 px rim reads as a smudge; this is what makes the shape legible at
 * a glance rather than merely present.
 */
const ICON_STROKE = 2.8;

/**
 * Interface icons, drawn as vectors. No image file, and nothing to translate.
 *
 * They speak the game's visual language rather than a generic UI one: a dark
 * silhouette with a silver-violet rim on the side facing the moon — the exact
 * treatment the obstacles and the witch get. `MOON_ON_RIGHT` is the single
 * source for that direction, so moving the moon relights the icons too.
 */

/** Draws `path` filled dark, then rims only its moon-facing edge. */
function silhouette(
  g: Phaser.GameObjects.Graphics,
  fill: Phaser.Types.Math.Vector2Like[],
  rim: Phaser.Types.Math.Vector2Like[],
  alpha: number
): void {
  g.fillStyle(ICON_BODY, alpha);
  g.fillPoints(fill, true);
  // Faint full outline so the silhouette separates from the sky, then the
  // moon-facing edge on top at full strength: the shape reads, and the light
  // still comes from one place.
  g.lineStyle(1.4, ICON_RIM, alpha * 0.4);
  g.strokePoints(fill, true);
  g.lineStyle(ICON_STROKE, ICON_RIM, alpha);
  g.strokePoints(rim, false);
}

/**
 * A closed book, seen slightly from the side: the cover as a rounded slab and
 * the spine as a band along its moon-facing edge.
 *
 * @param x,y  centre of the icon
 * @param scale 1 = a 26 x 32 px book
 */
export function drawBookIcon(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  scale = 1,
  alpha = 1
): void {
  const w = 11 * scale;
  const h = 14 * scale;
  const side = MOON_ON_RIGHT ? 1 : -1;
  const spineX = x - side * w;
  const edgeX = x + side * w;

  // Cover: a solid slab. Ruled lines were tried and made it read as a list
  // icon rather than a book — the volume has to come from the spine and the
  // page block instead.
  const left = Math.min(spineX, edgeX);
  g.fillStyle(ICON_BODY, alpha);
  g.fillRoundedRect(left, y - h, w * 2, h * 2, 3 * scale);
  // Full outline, faint: without it the dark cover melts into the night sky.
  g.lineStyle(1.4, ICON_RIM, alpha * 0.45);
  g.strokeRoundedRect(left, y - h, w * 2, h * 2, 3 * scale);

  // Page block: a pale sliver along the lit edge, which is what says "book".
  const pageW = 3.6 * scale;
  g.fillStyle(ICON_RIM, alpha);
  g.fillRoundedRect(
    Math.min(edgeX, edgeX - side * pageW),
    y - h + 2 * scale,
    pageW,
    h * 2 - 4 * scale,
    1.5 * scale
  );

  // Spine: a band on the shaded side, and the rim down the lit edge.
  g.fillStyle(ICON_RIM, alpha * 0.55);
  g.fillRect(Math.min(spineX, spineX + side * 2.8 * scale), y - h, 2.8 * scale, h * 2);
  g.lineStyle(ICON_STROKE, ICON_RIM, alpha);
  g.lineBetween(edgeX, y - h + 1.5 * scale, edgeX, y + h - 1.5 * scale);
}

/**
 * A house: the way back to the menu. Same treatment as the book — dark body,
 * rim on the moon side.
 */
export function drawHomeIcon(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  scale = 1,
  alpha = 1
): void {
  const w = 12 * scale;
  const h = 10 * scale;
  const roof = 9 * scale;
  const side = MOON_ON_RIGHT ? 1 : -1;

  const body: Phaser.Types.Math.Vector2Like[] = [
    { x: x - w, y: y - h + roof },
    { x, y: y - h - roof + 4 * scale },
    { x: x + w, y: y - h + roof },
    { x: x + w, y: y + h },
    { x: x - w, y: y + h }
  ];
  const lit: Phaser.Types.Math.Vector2Like[] = [
    { x: x + side * 0, y: y - h - roof + 4 * scale },
    { x: x + side * w, y: y - h + roof },
    { x: x + side * w, y: y + h }
  ];
  silhouette(g, body, lit, alpha);
}
