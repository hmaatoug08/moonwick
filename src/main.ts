import Phaser from "phaser";
import { DEBUG_STATS_DUMP, WORLD } from "./config";
import { FlightScene } from "./FlightScene";
import { ScoresScene } from "./ScoresScene";
import { MenuScene } from "./MenuScene";
import { describeLifetimeStats, loadLifetimeStats, resetLifetimeStats } from "./stats";

// Mobile-first portrait: logical size lives in config.ts and is scaled to fit
// the real screen.
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
