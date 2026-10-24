import Phaser from 'phaser';
import { ArenaScene } from './scenes/ArenaScene.js';

/**
 * Creates and manages the Phaser 3 game instance.
 * Mount to a DOM element via PhaserGame.mount(element).
 */
export class PhaserGame {
  private game: Phaser.Game | null = null;

  mount(parent: HTMLElement, localPlayerId?: string): void {
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

    // Pass local player id once the scene boots
    this.game.events.once(Phaser.Core.Events.READY, () => {
      const scene = this.game?.scene.getScene('ArenaScene') as ArenaScene | undefined;
      scene?.setLocalPlayerId(localPlayerId ?? null);
    });
  }

  setLocalPlayerId(id: string | null): void {
    const scene = this.game?.scene.getScene('ArenaScene') as ArenaScene | undefined;
    scene?.setLocalPlayerId(id);
  }

  unmount(): void {
    // destroy() emits the scene 'shutdown' event → ArenaScene cleans up
    // its EventBus subscriptions and DOM input listeners.
    this.game?.destroy(true);
    this.game = null;
  }

  get scene(): ArenaScene | null {
    return (this.game?.scene.getScene('ArenaScene') as ArenaScene) ?? null;
  }
}

export const phaserGame = new PhaserGame();
