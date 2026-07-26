import Phaser from "phaser";
import { WORLD } from "./config";
import { FlightScene } from "./FlightScene";
import { MenuScene } from "./MenuScene";

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
  scene: [MenuScene, FlightScene]
});

// Debug/test handle (Phaser 3.90 no longer exposes Phaser.GAMES).
(window as unknown as { __moonwick?: Phaser.Game }).__moonwick = game;
