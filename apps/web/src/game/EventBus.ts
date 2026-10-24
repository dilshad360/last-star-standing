import type {
  CosmicEventState,
  GameSnapshot,
  KillFeedEntry,
  MatchResult,
  RoomInfo,
} from '@lss/shared';

/**
 * Typed event bridge between the Phaser 3 game layer and React UI.
 * The EventBus pattern keeps React state out of the 60 fps render loop.
 */
export interface GameEvents {
  'snapshot:update': GameSnapshot;
  'room:updated': RoomInfo;
  'match:countdown': { startsAt: number; durationMs: number };
  'match:started': { snapshot: GameSnapshot };
  'match:finished': MatchResult;
  'player:eliminated': KillFeedEntry;
  'cosmic:event': CosmicEventState;
  'connection:status': { connected: boolean; latencyMs?: number };
  'error': { message: string };
}

type EventKey = keyof GameEvents;
type Handler<T> = (payload: T) => void;

export class EventBus {
  private readonly handlers = new Map<EventKey, Set<Handler<unknown>>>();

  on<K extends EventKey>(event: K, handler: Handler<GameEvents[K]>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as Handler<unknown>);
    this.handlers.set(event, set);
    return () => this.off(event, handler);
  }

  off<K extends EventKey>(event: K, handler: Handler<GameEvents[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<unknown>);
  }

  emit<K extends EventKey>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as Handler<GameEvents[K]>)(payload);
    }
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}

/** Singleton event bus shared by Phaser scenes and React components. */
export const gameEvents = new EventBus();
