---
name: run-phase
description: Execute and verify a specific development phase (1-6) or "all" for Last Star Standing
argument-hint: "<1|2|3|4|5|6|all>"
allowed-tools:
  - read
  - edit
  - grep
  - glob
  - exec
---

Execute the requested development phase for **Last Star Standing** according to `last_star_standing_project_brief.md`, `AGENTS.md`, and the detailed phase blueprint in `phases/`:

- **Phase 1:** `phases/phase-1-monorepo-and-shared.md`
- **Phase 2:** `phases/phase-2-server-and-rooms.md`
- **Phase 3:** `phases/phase-3-simulation-combat-ai.md`
- **Phase 4:** `phases/phase-4-phaser-arena-and-audio.md`
- **Phase 5:** `phases/phase-5-react-ui-hud-and-qr-lobby.md`
- **Phase 6:** `phases/phase-6-e2e-testing-and-deployment.md`

After completing the requested phase:
1. Run that phase's verification & test commands (`npm run typecheck`, `npm test`, or live dev server preview).
2. Update the phase file's **Status** to `Completed` and check off the completed **Exit Criteria** checkboxes.
3. Show the user the exact test results and how they can test the phase before moving to the next phase.

## Phase Definitions & Deliverables

### Phase 1: Monorepo Scaffold & Shared Contracts (`packages/shared`)
1. Create root `package.json` (npm workspaces: `packages/*`, `apps/*`), `tsconfig.base.json`, and `.gitignore`.
2. Create `packages/shared/package.json` (`@lss/shared`), `tsconfig.json`, and `src/index.ts`.
3. Implement `packages/shared/src/constants.ts`:
   - Arena dimensions (`2400 × 2400`), `TICK_RATE = 25`, ship radius (`20`), speed, acceleration, drag, max health (`100`), spawn shield (`2500 ms`), projectile speed/damage/cooldown/lifetime, asteroid sizes/counts, pickup types/durations (`SHIELD`, `RAPID_FIRE`, `REPAIR`, `ENERGY`), safe-zone shrink stages, and neon ship color palette.
4. Implement `packages/shared/src/types.ts`:
   - `MatchStatus` (`LOBBY | COUNTDOWN | ACTIVE | FINISHED`), `UpgradeType`, `CosmicEventType` (`METEOR_SHOWER | SOLAR_SURGE | SUPPLY_DROP`), `PlayerState`, `ProjectileState`, `AsteroidState`, `PickupState`, `SafeZoneState`, `CosmicEventState`, `KillFeedEntry`, `GameSnapshot`, `PlayerMatchStats`, `MatchResult`, `PlayerInput`, `RoomPlayerInfo`, `RoomInfo`.
5. Implement `packages/shared/src/events.ts`:
   - Typed Socket.IO `ClientToServerEvents` and `ServerToClientEvents` with acknowledgement callbacks.
6. **Verify:** Run `npm install` and `npm run typecheck --workspace=@lss/shared`.

### Phase 2: Multiplayer Server & Room Lifecycle (`apps/server`)
1. Create `apps/server/package.json` (`@lss/server`), `tsconfig.json`, and Express + Socket.IO entrypoint `src/index.ts` with `/health` endpoint and CORS support.
2. Implement `src/rooms/RoomManager.ts` and `src/rooms/GameRoom.ts`:
   - 4-character unambiguous room codes (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
   - Quick Play room finder/creator (`room:quickPlay`)
   - Create/Join/Leave room handlers, ready toggle (`player:ready`), Host AI Bot slot control (`room:setBots`, 0–7 bots), and `match:start` / `match:restart`
   - State machine transitions: `LOBBY → COUNTDOWN (3s) → ACTIVE → FINISHED → LOBBY`
   - Graceful player disconnect handling and host reassignment
3. **Verify:** Run `npm run typecheck --workspace=@lss/server`.

### Phase 3: Server Simulation, Combat, Safe Zone, AI Bots & Cosmic Director (`apps/server`)
1. Implement `src/game/WorldSimulation.ts`:
   - 25 Hz (`40 ms`) authoritative physics tick, radial spawn points with `2.5s` spawn invulnerability shield
   - Movement, velocity drag, boundary clamping, weapon fire cooldowns (`280 ms` normal, `140 ms` Rapid Fire)
   - Circle-circle collision detection for projectiles vs. ships, projectiles vs. asteroids, ships vs. asteroids, and ships vs. pickups
   - Destructible asteroids that spawn pickups (`SHIELD`, `RAPID_FIRE`, `REPAIR`, `ENERGY`)
   - Multi-stage shrinking safe zone + storm damage outside the safe radius
   - Winner & timeout resolution + `MatchResult` leaderboard statistics
2. Implement `src/game/BotController.ts`:
   - Autonomous AI Bot Pilots that steer toward the safe zone, avoid boundaries, seek nearby pickups/asteroids, and aim/shoot at opposing ships.
3. Implement `src/game/CosmicDirector.ts`:
   - Dynamic AI Game Master that triggers periodic cosmic anomalies (*Meteor Shower*, *Solar Surge*, *Supply Drop*) during active matches.
4. Create automated headless simulation tests in `apps/server/src/__tests__/simulation.test.ts`.
5. **Verify:** Run `npm test --workspace=@lss/server` and confirm headless matches complete and produce a valid winner.

### Phase 4: Phaser 3 Procedural Neon Arena, Audio Synth & Input (`apps/web`)
1. Scaffold `apps/web` (`@lss/web`) with Vite, React, TypeScript, Phaser 3, and `socket.io-client`.
2. Implement `src/game/EventBus.ts` and `src/networking/SocketClient.ts`.
3. Implement `src/game/audio/SoundManager.ts` (Web Audio API synth for laser, hit, asteroid crunch, pickup, storm alarm, countdown, elimination, victory; `M` key mute toggle).
4. Implement `src/game/input/InputManager.ts` (WASD/Arrows + Mouse aim/fire + Mobile dual-touch virtual joystick & fire zone).
5. Implement `src/game/scenes/ArenaScene.ts` and `src/game/PhaserGame.ts`:
   - Deep space starfield + neon grid + arena boundary glow
   - Procedural vector ships, thruster particles, shield bubble rings, health bars, floating names
   - Snapshot interpolation (`lerp` + shortest-arc angle rotation)
   - Projectiles, asteroid polygons, glowing pickups, safe-zone plasma ring, hit sparks, death explosions, camera shake, and spectator target switching.
6. **Verify:** Run `npm run typecheck --workspace=@lss/web`.

### Phase 5: React UI Shell, Instant QR Lobby, HUD, Spectator & Winner Screens (`apps/web`)
1. Implement `src/components/LandingScreen.tsx` (Display name, Quick Play with Bots, Create Room, Join by Code, `?room=CODE` auto-fill, Controls modal, Mute toggle).
2. Implement `src/components/LobbyScreen.tsx` (Room code badge, inline **SVG QR Code generator**, Copy Join Link button, player list with Ready status, Host AI Bot Pilot selector `0–7`, Start Match button).
3. Implement `src/components/HudOverlay.tsx` (Health & Shield bars, active upgrade timers, Alive count, Match timer, Safe-Zone storm warning, AI Cosmic Event banner, Kill Feed, Mini-Radar map, Mobile touch overlay).
4. Implement `src/components/EliminatedOverlay.tsx` (Placement banner, killer info, Spectate next/prev pilot camera controls, Return to Lobby button).
5. Implement `src/components/WinnerScreen.tsx` (Champion spotlight, full match stats table: Placement, Kills, Damage, Survival Time, and Play Again rematch button).
6. **Verify:** Run `npm run build` across all workspaces.

### Phase 6: End-to-End Verification, Polish & Deployment Blueprints
1. Run full workspace test suite and multi-client Socket.IO integration tests.
2. Create deployment blueprints (`render.yaml` for the WebSocket server, Vite static config) and comprehensive `README.md` with quickstart and judge demo script.
3. Start development servers and verify in live browser preview.
