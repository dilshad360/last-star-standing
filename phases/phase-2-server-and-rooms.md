# Phase 2: Multiplayer Server & Room Lifecycle (`apps/server`)

**Status:** Completed  
**Command to execute:** `/run-phase 2`  
**Owner Agent:** `netcode-architect`

---

## 1. Objective
Build the Express + Socket.IO multiplayer backend (`apps/server`) with room creation, 4-character join codes, Quick Play auto-matching, AI Bot slot configuration (`0–7` bots), player ready toggles, disconnect handling, and the authoritative match state machine (`LOBBY → COUNTDOWN → ACTIVE → FINISHED → LOBBY`).

---

## 2. Files to Create in Phase 2
- `apps/server/package.json` — `@lss/server` package with `express`, `socket.io`, `cors`, `tsx`, and `vitest`.
- `apps/server/tsconfig.json` — Server TypeScript config.
- `apps/server/src/config/env.ts` — Server port (`3001` default), CORS origins, and environment config.
- `apps/server/src/rooms/RoomManager.ts` — Room registry, 4-char unambiguous room code generator (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), Quick Play finder, and empty room cleanup.
- `apps/server/src/rooms/GameRoom.ts` — Room state container, player join/leave/ready logic, host reassignment, AI Bot count configuration (`0–7`), and state machine transitions (`LOBBY → COUNTDOWN → ACTIVE → FINISHED → LOBBY`).
- `apps/server/src/networking/socketHandlers.ts` — Socket.IO event listeners with payload validation and rate-limiting.
- `apps/server/src/index.ts` — HTTP + Socket.IO server entrypoint with `/health` endpoint returning active room/player metrics.
- `apps/server/src/__tests__/rooms.test.ts` — Automated Socket.IO room lifecycle tests.

---

## 3. How You Can Test After Phase 2

After Phase 2 finishes, you can test the server both via automated Socket.IO tests and directly in your browser/terminal:

```bash
# 1. Run automated room & Socket.IO lifecycle tests (Create, Join, Bots, Countdown, Disconnect)
npm test --workspace=@lss/server

# 2. Start the server and check the health endpoint
npm run dev --workspace=@lss/server
# Then visit or curl: http://localhost:3001/health
```

### Phase 2 Exit Criteria (Definition of Done)
- [x] `GET http://localhost:3001/health` returns `{ status: "ok", rooms: 0, ... }`.
- [x] Creating a room returns a valid 4-character room code.
- [x] Joining with a second client updates the lobby player list for all connected clients.
- [x] Invalid or full room codes return clear error messages without crashing the server.
- [x] Host can configure AI Bot count (`0–7`) and start the 3-second countdown into `ACTIVE`.
- [x] Disconnecting the host automatically transfers host privileges to the next human player.
