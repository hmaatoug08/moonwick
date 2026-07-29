import Phaser from "phaser";
import { DEBUG_STATS_DUMP, WORLD } from "./config";
import { FlightScene } from "./FlightScene";
import { ScoresScene } from "./ScoresScene";
import { MenuScene } from "./MenuScene";
import { describeLifetimeStats, loadLifetimeStats, resetLifetimeStats } from "./stats";

/**
 * The UI fonts must be ready BEFORE Phaser boots: fitText() and buttonWidth()
 * measure real glyphs, and a fallback font measured at boot then swapped for
 * the webfont would leave every button sized for the wrong face. Offline or on
 * a slow connection the race falls through after 2.5 s and the game boots with
 * the system fallbacks — booting late is worse than booting plain.
 */
async function waitForFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  const faces = [
    '300 66px "Cormorant Garamond"',
    '400 30px "Cormorant Garamond"',
    '500 30px "Cormorant Garamond"',
    'italic 400 27px "Cormorant Garamond"',
    "600 12px Manrope",
    "700 12px Manrope"
  ];
  const loads = Promise.all(faces.map((face) => document.fonts.load(face)));
  await Promise.race([loads, new Promise((resolve) => setTimeout(resolve, 2500))]);
}

// Mobile-first portrait: logical size lives in config.ts and is scaled to fit
// the real screen.
void waitForFonts().then(() => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#0b0716",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: WORLD.width,
      height: WORLD.height
    },
    physics: {
      default: "arcade",
      arcade: { debug: false }
    },
    scene: [MenuScene, FlightScene, ScoresScene]
  });

  // Debug/test handle (Phaser 3.90 no longer exposes Phaser.GAMES).
  (window as unknown as { __moonwick?: Phaser.Game }).__moonwick = game;
});

/**
 * Lifetime stats inspector, behind DEBUG_STATS_DUMP. `reset()` clears
 * `moonwick:stats` and nothing else — scores, settings and history are left
 * alone, so the numbers can be wiped without losing a test profile.
 */
if (DEBUG_STATS_DUMP) {
  // eslint-disable-next-line no-console
  console.log(describeLifetimeStats());
  (
    window as unknown as {
      __moonwickStats?: { dump: () => void; reset: () => void; raw: () => unknown };
    }
  ).__moonwickStats = {
    // eslint-disable-next-line no-console
    dump: () => console.log(describeLifetimeStats()),
    reset: () => resetLifetimeStats(),
    raw: () => loadLifetimeStats()
  };
}
