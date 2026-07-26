import Phaser from "phaser";
import { WORLD } from "./config";
import { FlightScene } from "./FlightScene";
import { MenuScene } from "./MenuScene";

// Portrait mobile-first : dimensions logiques (config.ts), mises à l'échelle sur l'écran réel.
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

// Poignée de debug/tests (Phaser 3.90 n'expose plus Phaser.GAMES).
(window as unknown as { __moonwick?: Phaser.Game }).__moonwick = game;
