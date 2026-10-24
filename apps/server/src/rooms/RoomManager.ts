import { randomInt } from 'node:crypto';
import { MAX_PLAYERS_PER_ROOM, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@lss/shared';
import { GameRoom, type SimulationFactory, type TypedServer } from './GameRoom.js';

export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();

  constructor(
    private readonly io: TypedServer,
    private readonly simulationFactory?: SimulationFactory,
  ) {}

  get roomCount(): number {
    return this.rooms.size;
  }

  /** Total human players across all rooms. */
  get playerCount(): number {
    let count = 0;
    for (const room of this.rooms.values()) count += room.humans.length;
    return count;
  }

  generateRoomCode(): string {
    for (let attempt = 0; attempt < 64; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Unable to allocate a unique room code.');
  }

  createRoom(options?: { isCustom?: boolean }): GameRoom {
    const code = this.generateRoomCode();
    const room = new GameRoom(
      code,
      this.io,
      (empty) => this.rooms.delete(empty.code),
      this.simulationFactory,
    );
    if (options?.isCustom) {
      room.isCustom = true;
    }
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  /** Finds a non-custom LOBBY room with an open human slot for Quick Play matchmaking. */
  findQuickPlayRoom(): GameRoom | undefined {
    for (const room of this.rooms.values()) {
      if (!room.isCustom && room.status === 'LOBBY' && room.humans.length < MAX_PLAYERS_PER_ROOM) {
        return room;
      }
    }
    return undefined;
  }

  removeRoom(code: string): void {
    this.rooms.delete(code);
  }
}
