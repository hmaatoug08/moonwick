import Phaser from "phaser";
import { ECLIPSE, FULL_MOON, NEAR_MISS, WITCH_ART } from "./config";
import { MOON_ON_RIGHT } from "./obstacleShapes";
import { LIGHT_KEY } from "./textures";

/**
 * The witch's silhouette: drawn with Graphics once at boot, cached in a
 * RenderTexture, then displayed as a sprite. No image file.
 *
 * HITBOX AT THE BUST. The lethal circle (NEAR_MISS.deathRadius) is centred on
 * the TORSO, never on the drawing's bounding box. The torso is the sprite's
 * origin and its rotation pivot, so `witch.x/y` is both what the collision
 * tests and what the art pivots around — they cannot drift apart.
 *
 * The visual is larger than the hitbox, never smaller: the body is built on a
 * core mass of WITCH_ART.coreRadius (> deathRadius) centred on the torso, so
 * the circle is covered by construction. The hat tip, the cape and the broom's
 * brush all extend far past it and are purely decorative — nothing out there
 * can kill.
 *
 * Lighting matches the obstacles: near-black body, silver-violet rim on the
 * side facing the moon (see MOON_ON_RIGHT in obstacleShapes.ts).
 */

export const WITCH_TEXTURE = "witch-silhouette";

/**
 * Design space: x+ points forward (the direction of flight), y+ points down,
 * and the TORSO sits at the origin. Every number below is in design pixels.
 */
/**
 * `minY` is bounded by gameplay, not by taste: the torso is clamped to
 * WITCH.marginTop (20 px) and the hitbox sits on the torso, so anything drawn
 * more than ~26 px above it gets clipped by the top of the screen every time
 * the player holds their climb into the ceiling. The hat is sized to fit.
 */
const DESIGN = {
  minX: -48,
  maxX: 30,
  minY: -36,
  maxY: 24
} as const;

const DESIGN_W = DESIGN.maxX - DESIGN.minX;
const DESIGN_H = DESIGN.maxY - DESIGN.minY;

/** Where the trailing cape and hat tip are pinned, in design space. */
const CAPE_ANCHOR = { x: -6, y: -6 };
const HAT_ANCHOR = { x: -8, y: -27 };

export const WITCH_METRICS = {
  width: DESIGN_W,
  height: DESIGN_H,
  /** Origin as a 0..1 fraction: puts the torso under the sprite's position. */
  originX: (0 - DESIGN.minX) / DESIGN_W,
  originY: (0 - DESIGN.minY) / DESIGN_H,
  capeAnchor: CAPE_ANCHOR,
  hatAnchor: HAT_ANCHOR
} as const;

/**
 * Draws the whole witch in white.
 *
 * Design coordinates are baked into texture pixels here rather than set on the
 * Graphics transform: `RenderTexture.draw()` does not honour a Graphics' own
 * scale/position, so anything relying on it silently lands off the cell.
 * `ox`/`oy` shift the drawing, in design units, to place it in its cell.
 */
function drawBody(g: Phaser.GameObjects.Graphics, ox: number, oy: number): void {
  const ss = WITCH_ART.superSample;
  const X = (x: number) => (x - DESIGN.minX + ox) * ss;
  const Y = (y: number) => (y - DESIGN.minY + oy) * ss;
  const S = (v: number) => v * ss;

  const circle = (x: number, y: number, r: number) => g.fillCircle(X(x), Y(y), S(r));
  const poly = (pts: number[][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(X(x), Y(y)) : g.lineTo(X(x), Y(y))));
    g.closePath();
    g.fillPath();
  };

  const R = WITCH_ART.coreRadius;

  // --- Broom, first so the body sits on top of it. It points BACKWARD, with
  // the brush trailing behind.
  g.fillStyle(0xffffff, 1);
  poly([
    [17, 3],
    [-28, 10],
    [-28, 13],
    [17, 6]
  ]);
  // Brush: a splayed fan of straws, looser as it trails away.
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const spread = (t - 0.5) * 2;
    poly([
      [-27, 10 + t * 3],
      [-42 - t * 3, 9.5 + spread * 8],
      [-42 - t * 3, 12 + spread * 8]
    ]);
  }

  // --- Core mass. This single disc is the whole hitbox guarantee; everything
  // else only ever adds to it.
  circle(0, 0, R);
  // Cloak: pulls the torso out of being a plain disc, down and behind, where
  // the procedural cape then takes over.
  poly([
    [-10, -4],
    [-15, 6],
    [-6, 13],
    [5, 10],
    [9, 1]
  ]);
  // Legs tucked forward along the handle.
  poly([
    [3, 3],
    [16, 0],
    [17, 4.5],
    [4, 10]
  ]);
  // Arm reaching down to the handle.
  poly([
    [5, -7],
    [16, -2],
    [15, 1.5],
    [4, -3]
  ]);

  // --- Head, overlapping the torso so the silhouette stays one mass.
  circle(9, -11, 5.8);

  // --- Hat: the strongest read in the whole silhouette, and therefore ONE
  // polygon — brim and cone together. As separate pieces they read as a slab
  // and a triangle floating over a ball; as one filled wedge they read as a
  // blob. So the path traces the real outline: up the cone's front edge, out
  // along the brim, back underneath, then down the cone's back edge. The
  // underside deliberately bites into the head so nothing can detach.
  poly([
    [HAT_ANCHOR.x, HAT_ANCHOR.y], // point (the procedural tip continues here)
    [10, -19.5], // cone, front edge down to the brim
    [24, -18], // brim, front tip
    [24, -15],
    [-2, -12], // brim underside, dipping over the head
    [-15, -15], // brim, back tip
    [-14, -18],
    [-2, -20] // brim top, back to the cone
  ]);
}

/**
 * Builds the two frames (body, rim) once.
 *
 * The rim is obtained by subtraction rather than by tracing an outline by
 * hand: draw the body, then erase the same body shifted AWAY from the moon.
 * What survives is exactly the crescent of pixels on the lit edge, and it
 * follows the true silhouette however the drawing changes.
 */
export function ensureWitchTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(WITCH_TEXTURE)) return;

  const ss = WITCH_ART.superSample;
  const cellW = Math.ceil(DESIGN_W * ss);
  const cellH = Math.ceil(DESIGN_H * ss);

  const pen = scene.make.graphics({}, false);
  const rt = scene.add.renderTexture(0, 0, cellW, cellH * 2);
  rt.setVisible(false);

  // Row 0: the solid body.
  drawBody(pen, 0, 0);
  rt.draw(pen, 0, 0);

  // Row 1: the rim, obtained by subtraction. Draw the body, then erase the
  // same body shifted AWAY from the moon; what survives is the lit edge, and
  // it tracks the true silhouette however the drawing changes.
  const rowOffset = DESIGN_H;
  const d = WITCH_ART.rimWidth;
  pen.clear();
  drawBody(pen, 0, rowOffset);
  rt.draw(pen, 0, 0);
  pen.clear();
  drawBody(pen, MOON_ON_RIGHT ? -d : d, rowOffset + d);
  rt.erase(pen, 0, 0);

  pen.destroy();

  rt.saveTexture(WITCH_TEXTURE);
  const texture = scene.textures.get(WITCH_TEXTURE);
  texture.add("body", 0, 0, 0, cellW, cellH);
  texture.add("rim", 0, 0, cellH, cellW, cellH);
  rt.destroy();
}

/** One point of a trailing chain: a position plus its velocity. */
type ChainPoint = { x: number; y: number; vx: number; vy: number };

/**
 * A damped spring chain. Each point chases the previous one, offset backward
 * by `segment`, which makes it ripple on the climb and snap on the dive
 * without any animation being authored.
 */
class Chain {
  readonly points: ChainPoint[];

  constructor(
    count: number,
    private readonly stiffness: number,
    private readonly damping: number,
    private readonly segment: number
  ) {
    this.points = Array.from({ length: count }, () => ({ x: 0, y: 0, vx: 0, vy: 0 }));
  }

  reset(x: number, y: number, backX: number, backY: number): void {
    this.points.forEach((p, i) => {
      p.x = x + backX * this.segment * (i + 1);
      p.y = y + backY * this.segment * (i + 1);
      p.vx = 0;
      p.vy = 0;
    });
  }

  /** `backX/backY` is the unit vector pointing behind the witch. */
  update(dt: number, anchorX: number, anchorY: number, backX: number, backY: number): void {
    let px = anchorX;
    let py = anchorY;
    for (const p of this.points) {
      const tx = px + backX * this.segment;
      const ty = py + backY * this.segment;
      p.vx += ((tx - p.x) * this.stiffness - p.vx * this.damping) * dt;
      p.vy += ((ty - p.y) * this.stiffness - p.vy * this.damping) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Hard leash: a huge dt (tab wake-up, slow motion ending) must never
      // fling the cape across the screen.
      const ox = p.x - tx;
      const oy = p.y - ty;
      const dist = Math.hypot(ox, oy);
      if (dist > WITCH_ART.chainMaxStretch) {
        const k = WITCH_ART.chainMaxStretch / dist;
        p.x = tx + ox * k;
        p.y = ty + oy * k;
      }
      px = p.x;
      py = p.y;
    }
  }

  kick(vx: number, vy: number): void {
    for (const p of this.points) {
      p.vx += vx;
      p.vy += vy;
    }
  }
}

/**
 * The witch as a display rig: cached silhouette + rim, a procedural cape and
 * hat tip, and an aura that reads the combo.
 *
 * `x`/`y` are the TORSO — the same point the collision uses.
 */
export class Witch {
  private readonly bodyImg: Phaser.GameObjects.Image;
  private readonly rimImg: Phaser.GameObjects.Image;
  private readonly cloth: Phaser.GameObjects.Graphics;
  private readonly aura: Phaser.GameObjects.Image;

  private readonly cape = new Chain(3, WITCH_ART.capeStiffness, WITCH_ART.capeDamping, WITCH_ART.capeSegment);
  private readonly hat = new Chain(3, WITCH_ART.hatStiffness, WITCH_ART.hatDamping, WITCH_ART.hatSegment);

  private tilt = 0;
  private grazeKickLeft = 0;
  private grazeKickDir = 0;
  private fullMoon = false;
  private eclipse = false;
  private comboRatio = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, depth: number) {
    ensureWitchTexture(scene);

    this.aura = scene.add
      .image(x, y, LIGHT_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(depth - 1);

    this.cloth = scene.add.graphics().setDepth(depth);

    this.bodyImg = scene.add
      .image(x, y, WITCH_TEXTURE, "body")
      .setOrigin(WITCH_METRICS.originX, WITCH_METRICS.originY)
      .setDisplaySize(WITCH_METRICS.width, WITCH_METRICS.height)
      .setTint(WITCH_ART.bodyColor)
      .setDepth(depth);

    this.rimImg = scene.add
      .image(x, y, WITCH_TEXTURE, "rim")
      .setOrigin(WITCH_METRICS.originX, WITCH_METRICS.originY)
      .setDisplaySize(WITCH_METRICS.width, WITCH_METRICS.height)
      .setTint(WITCH_ART.rimColor)
      .setDepth(depth);

    this.reset(x, y);
  }

  /** The torso: what the hitbox is centred on. */
  get x(): number {
    return this.bodyImg.x;
  }
  set x(v: number) {
    this.bodyImg.x = v;
    this.rimImg.x = v;
  }
  get y(): number {
    return this.bodyImg.y;
  }
  set y(v: number) {
    this.bodyImg.y = v;
    this.rimImg.y = v;
  }

  /** The object emitters should follow. */
  get follow(): Phaser.GameObjects.Image {
    return this.bodyImg;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setAlpha(a: number): this {
    this.bodyImg.setAlpha(a);
    this.rimImg.setAlpha(a * this.rimAlpha());
    this.cloth.setAlpha(a);
    return this;
  }

  setVisible(v: boolean): this {
    this.bodyImg.setVisible(v);
    this.rimImg.setVisible(v);
    this.cloth.setVisible(v);
    this.aura.setVisible(v);
    return this;
  }

  setDepth(depth: number): this {
    this.aura.setDepth(depth - 1);
    this.cloth.setDepth(depth);
    this.bodyImg.setDepth(depth);
    this.rimImg.setDepth(depth);
    return this;
  }

  setFullMoon(on: boolean): this {
    this.fullMoon = on;
    return this.applyStateTints();
  }

  /**
   * The Eclipse: the moon goes dark and SHE becomes the light — hot
   * white-gold, a notch brighter than Full Moon. Only the run scene ever
   * sets this; the menu and death-screen witches never eclipse.
   */
  setEclipse(on: boolean): this {
    this.eclipse = on;
    return this.applyStateTints();
  }

  private applyStateTints(): this {
    this.bodyImg.setTint(
      this.eclipse ? ECLIPSE.witchColor : this.fullMoon ? FULL_MOON.witchColor : WITCH_ART.bodyColor
    );
    this.rimImg.setTint(
      this.eclipse ? ECLIPSE.witchRim : this.fullMoon ? WITCH_ART.rimColorFullMoon : WITCH_ART.rimColor
    );
    this.aura.setTint(
      this.eclipse ? ECLIPSE.witchAura : this.fullMoon ? WITCH_ART.auraColorFullMoon : WITCH_ART.auraColor
    );
    return this;
  }

  /**
   * Brief lean away from a grazed obstacle, plus a ripple through the cape.
   * `awayDir` is where she should recoil TO: -1 upward, +1 downward.
   */
  grazeKick(awayDir: number): void {
    this.grazeKickDir = awayDir;
    this.grazeKickLeft = WITCH_ART.grazeKickMs / 1000;
    this.cape.kick(0, awayDir * WITCH_ART.grazeCapeImpulse);
    this.hat.kick(0, awayDir * WITCH_ART.grazeCapeImpulse * 0.5);
  }

  reset(x: number, y: number): void {
    this.tilt = 0;
    this.grazeKickLeft = 0;
    this.comboRatio = 0;
    this.setPosition(x, y);
    this.bodyImg.setRotation(0);
    this.rimImg.setRotation(0);
    this.setAlpha(1);
    this.eclipse = false;
    this.setFullMoon(false);
    const cape = this.local(WITCH_METRICS.capeAnchor, 0);
    const hat = this.local(WITCH_METRICS.hatAnchor, 0);
    this.cape.reset(cape.x, cape.y, -1, 0);
    this.hat.reset(hat.x, hat.y, -1, 0);
    this.redraw();
  }

  /** A design-space point, rotated by `angle` and placed in the world. */
  private local(p: { x: number; y: number }, angle: number): { x: number; y: number } {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: this.x + p.x * cos - p.y * sin, y: this.y + p.x * sin + p.y * cos };
  }

  private rimAlpha(): number {
    return Phaser.Math.Linear(WITCH_ART.rimAlphaIdle, WITCH_ART.rimAlphaMax, this.comboRatio);
  }

  /**
   * @param velocityY vertical speed, px/s (negative = climbing)
   * @param maxSpeed  the speed the tilt limits are reached at
   * @param comboRatio 0 at x1, 1 at the cap
   */
  update(dt: number, velocityY: number, maxSpeed: number, comboRatio: number): void {
    this.comboRatio = comboRatio;

    // --- Tilt: a real rotation, proportional to vertical speed and smoothed
    // so it never snaps. Climbing tilts the nose up, diving tips it down.
    const t = Phaser.Math.Clamp(velocityY / maxSpeed, -1, 1);
    const target = Phaser.Math.DegToRad(t < 0 ? -t * WITCH_ART.tiltUpDeg : t * WITCH_ART.tiltDownDeg);
    // Frame-rate independent exponential smoothing.
    this.tilt += (target - this.tilt) * (1 - Math.exp(-WITCH_ART.tiltSmoothing * dt));

    if (this.grazeKickLeft > 0) {
      this.grazeKickLeft = Math.max(0, this.grazeKickLeft - dt);
      // Ease out over the kick's lifetime: present immediately, gone by 150 ms.
      const k = this.grazeKickLeft / (WITCH_ART.grazeKickMs / 1000);
      this.grazeKickDir !== 0 &&
        (this.tilt += Phaser.Math.DegToRad(WITCH_ART.grazeKickDeg) * this.grazeKickDir * k * k);
    }

    this.bodyImg.setRotation(this.tilt);
    this.rimImg.setRotation(this.tilt);

    // --- Trailing cape and hat tip.
    const backX = -Math.cos(this.tilt);
    const backY = -Math.sin(this.tilt);
    const capeAnchor = this.local(WITCH_METRICS.capeAnchor, this.tilt);
    const hatAnchor = this.local(WITCH_METRICS.hatAnchor, this.tilt);
    this.cape.update(dt, capeAnchor.x, capeAnchor.y, backX, backY);
    this.hat.update(dt, hatAnchor.x, hatAnchor.y, backX, backY);

    // --- Aura: the combo, readable on the character itself.
    const auraSize = Phaser.Math.Linear(WITCH_ART.auraSizeIdle, WITCH_ART.auraSizeMax, comboRatio);
    this.aura
      .setPosition(this.x, this.y)
      .setAlpha(Phaser.Math.Linear(WITCH_ART.auraAlphaIdle, WITCH_ART.auraAlphaMax, comboRatio))
      .setDisplaySize(auraSize, auraSize);
    this.rimImg.setAlpha(this.bodyImg.alpha * this.rimAlpha());

    this.redraw();
  }

  /** Cape and hat tip, as tapered ribbons through their chain points. */
  private redraw(): void {
    const g = this.cloth;
    g.clear();
    const bodyColor = this.eclipse
      ? ECLIPSE.witchColor
      : this.fullMoon
        ? FULL_MOON.witchColor
        : WITCH_ART.bodyColor;
    const rimColor = this.eclipse
      ? ECLIPSE.witchRim
      : this.fullMoon
        ? WITCH_ART.rimColorFullMoon
        : WITCH_ART.rimColor;

    const capeAnchor = this.local(WITCH_METRICS.capeAnchor, this.tilt);
    const hatAnchor = this.local(WITCH_METRICS.hatAnchor, this.tilt);
    this.ribbon(g, capeAnchor, this.cape, WITCH_ART.capeWidth, bodyColor, rimColor);
    this.ribbon(g, hatAnchor, this.hat, WITCH_ART.hatWidth, bodyColor, rimColor);
  }

  private ribbon(
    g: Phaser.GameObjects.Graphics,
    anchor: { x: number; y: number },
    chain: Chain,
    width: number,
    bodyColor: number,
    rimColor: number
  ): void {
    const spline = new Phaser.Curves.Spline([
      new Phaser.Math.Vector2(anchor.x, anchor.y),
      ...chain.points.map((p) => new Phaser.Math.Vector2(p.x, p.y))
    ]);
    const steps = 12;
    const pts = spline.getPoints(steps);
    const left: Phaser.Types.Math.Vector2Like[] = [];
    const right: Phaser.Types.Math.Vector2Like[] = [];

    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let tx = next.x - prev.x;
      let ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      // Taper to a point at the free end.
      const w = width * (1 - i / (pts.length - 1)) ** 0.8;
      left.push({ x: pts[i].x + ty * w, y: pts[i].y - tx * w });
      right.push({ x: pts[i].x - ty * w, y: pts[i].y + tx * w });
    }

    g.fillStyle(bodyColor, 1);
    g.fillPoints([...left, ...right.reverse()], true);

    // Rim on the moon-facing edge only — the same single light direction the
    // obstacles use, so the whole scene stays lit from one place.
    g.lineStyle(1.6, rimColor, this.rimAlpha() * this.bodyImg.alpha);
    g.strokePoints(MOON_ON_RIGHT ? left : right, false);
  }

  destroy(): void {
    this.bodyImg.destroy();
    this.rimImg.destroy();
    this.cloth.destroy();
    this.aura.destroy();
  }
}

// --- Guard rail (dev only): the drawn body must contain the lethal circle.
// The core disc is the whole guarantee; if it ever shrinks below the hitbox,
// lethal pixels would sit outside the silhouette.
if (import.meta.env.DEV && WITCH_ART.coreRadius <= NEAR_MISS.deathRadius) {
  throw new Error(
    `WITCH_ART.coreRadius (${WITCH_ART.coreRadius}) must exceed ` +
      `NEAR_MISS.deathRadius (${NEAR_MISS.deathRadius}): the visual may never be smaller than the hitbox.`
  );
}
