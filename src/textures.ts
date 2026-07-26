import Phaser from "phaser";

/** Textures générées au runtime, partagées entre scènes : aucun asset externe. */
export const LIGHT_KEY = "magic-light";
export const LIGHT_SIZE = 256;
export const SPARK_KEY = "trail-spark";
const SPARK_SIZE = 32;

/** Dégradé radial blanc -> transparent (halo de nuit, étincelle de traînée). */
function createRadialTexture(
  scene: Phaser.Scene,
  key: string,
  size: number,
  midStop: number,
  midAlpha: number
): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, size, size);
  if (!texture) return;

  const ctx = texture.getContext();
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(midStop, `rgba(255,255,255,${midAlpha})`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  texture.refresh();
}

/** À appeler dans create() de toute scène qui utilise ces textures. */
export function ensureTextures(scene: Phaser.Scene): void {
  createRadialTexture(scene, LIGHT_KEY, LIGHT_SIZE, 0.5, 0.92);
  createRadialTexture(scene, SPARK_KEY, SPARK_SIZE, 0.35, 0.75);
}
