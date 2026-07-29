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
 * An OPEN book: two pages splayed from a central gutter.
 *
 * The closed-book version that shipped first read as a dark rectangle with a
 * pale stripe — it could as easily have been a card or a door. Open is the
 * universal book glyph: the two page panels and the gutter between them are
 * legible at 26 px in a way a slab never is, because the shape itself is
 * distinctive rather than the decoration on it.
 *
 * The gutter sits LOWER than the outer corners, which is how an open book
 * actually sags — that sag is most of what sells it.
 *
 * @param x,y  centre of the icon
 * @param scale 1 = a 30 x 22 px book
 */
export function drawBookIcon(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  scale = 1,
  alpha = 1
): void {
  const w = 15 * scale;
  const h = 9 * scale;
  const sag = 3.5 * scale;
  const side = MOON_ON_RIGHT ? 1 : -1;

  const page = (dir: number): Phaser.Types.Math.Vector2Like[] => [
    { x: x + dir * w, y: y - h },
    { x, y: y - h + sag },
    { x, y: y + h },
    { x: x + dir * w, y: y + h - sag }
  ];

  for (const dir of [-1, 1]) {
    const pts = page(dir);
    g.fillStyle(ICON_BODY, alpha);
    g.fillPoints(pts, true);
    // Faint full outline: a near-black page on a night sky needs an edge or it
    // is not there at all.
    g.lineStyle(1.4, ICON_RIM, alpha * 0.5);
    g.strokePoints(pts, true);
  }

  // The gutter: the single line that says "two pages" rather than "one panel".
  g.lineStyle(1.6 * scale, ICON_RIM, alpha * 0.7);
  g.lineBetween(x, y - h + sag, x, y + h);

  // Moon-facing page: its outer edge takes the full rim, so the light still
  // comes from one place.
  const lit = page(side);
  g.lineStyle(ICON_STROKE, ICON_RIM, alpha);
  g.strokePoints([lit[0], lit[3]], false);
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
