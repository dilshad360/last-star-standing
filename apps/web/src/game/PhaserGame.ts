import Phaser from 'phaser';
import { ArenaScene } from './scenes/ArenaScene.js';

/**
 * Creates and manages the Phaser 3 game instance on the host screen.
 * Mount to a DOM element via PhaserGame.mount(element).
 */
export class PhaserGame {
  private game: Phaser.Game | null = null;

  mount(parent: HTMLElement): void {
    if (this.game) return;
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: parent.clientWidth || window.innerWidth,
      height: parent.clientHeight || window.innerHeight,
      backgroundColor: '#05050f',
      physics: { default: 'arcade' },
      scene: [ArenaScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        antialias: true,
        pixelArt: false,
      },
    });
  }

  unmount(): void {
    // destroy() emits the scene 'shutdown' event → ArenaScene cleans up
    // its EventBus subscriptions.
    this.game?.destroy(true);
    this.game = null;
  }
}

export const phaserGame = new PhaserGame();
