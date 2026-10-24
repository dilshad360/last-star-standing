import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@lss/shared';
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

  createRoom(): GameRoom {
    const code = this.generateRoomCode();
    const room = new GameRoom(
      code,
      this.io,
      (empty) => this.rooms.delete(empty.code),
      this.simulationFactory,
    );
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  removeRoom(code: string): void {
    this.rooms.delete(code);
  }
}
