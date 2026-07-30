import { drawCrescentMark } from "./logo";

/**
 * PWA packaging, ZERO FILES beyond the service worker's code: the app icons
 * are drawn on a canvas at boot (the same `drawCrescentMark` as the home
 * lockup, the share image and the favicon — the mark cannot fork), and the
 * manifest is built as a JSON blob and linked by object URL. Nothing is
 * fetched, nothing ships as an image.
 *
 * The app icon follows the brand sheet: night gradient, a few stars, the
 * full mark WITH the witch — every icon size here is far above the 88 px
 * two-tier threshold (the favicon, the one below it, stays crescent-only).
 *
 * The service worker (public/sw.js) is registered in PRODUCTION ONLY: the
 * dev server must never fight a cache.
 */

/** One app icon, sized; maskable shrinks the art into the OS-safe zone. */
function makeIcon(size: number, maskable: boolean): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const sky = ctx.createLinearGradient(0, 0, 0, size);
  sky.addColorStop(0, "#0a0718");
  sky.addColorStop(1, "#241a4a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);

  // A few stars, fixed positions: an icon must be identical on every boot.
  ctx.fillStyle = "rgba(244,238,224,0.55)";
  for (const [sx, sy, r] of [
    [0.15, 0.2, 0.008],
    [0.8, 0.84, 0.006],
    [0.27, 0.75, 0.006],
    [0.85, 0.3, 0.007]
  ]) {
    ctx.beginPath();
    ctx.arc(sx * size, sy * size, Math.max(1, r * size), 0, Math.PI * 2);
    ctx.fill();
  }

  const mark = size * (maskable ? 0.5 : 0.62);
  drawCrescentMark(ctx, (size - mark) / 2, (size - mark) / 2 + size * 0.04, mark, "full");

  return canvas.toDataURL("image/png");
}

/** Build and attach the manifest, the touch icon and the service worker. */
export function initPwa(): void {
  const icon192 = makeIcon(192, false);
  const icon512 = makeIcon(512, false);
  const iconMask = makeIcon(512, true);

  const manifest = {
    name: "Moonwick",
    short_name: "Moonwick",
    start_url: ".",
    scope: ".",
    display: "fullscreen",
    orientation: "portrait",
    background_color: "#05040c",
    theme_color: "#05040c",
    icons: [
      { src: icon192, sizes: "192x192", type: "image/png" },
      { src: icon512, sizes: "512x512", type: "image/png" },
      { src: iconMask, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };

  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = URL.createObjectURL(
    new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" })
  );
  document.head.appendChild(link);

  // iOS reads this link at "Add to Home Screen" time, from the live DOM.
  const touch = document.createElement("link");
  touch.rel = "apple-touch-icon";
  touch.href = makeIcon(180, false);
  document.head.appendChild(touch);

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    // After load: registration must never compete with the game's boot.
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("./sw.js");
    });
  }
}
