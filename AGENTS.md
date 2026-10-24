# Last Star Standing — Agentic Development Rules (`AGENTS.md`)

**Project:** Last Star Standing (party game: one host screen renders the arena, up to 8 phones are controllers, free-for-all with respawns)  
**Specification:** `last_star_standing_project_brief.md` (v1.1) describes the original single-device battle royale. Where it conflicts with this file, the party-mode rules here win.

## Monorepo Architecture & Stack

- **Package Manager:** `npm` workspaces (`packages/shared`, `apps/server`, `apps/web`)
- **`packages/shared` (`@lss/shared`):** Pure TypeScript contracts (`types.ts`, `events.ts`, `constants.ts`). Zero runtime dependencies. Both `apps/server` and `apps/web` import from `@lss/shared`.
- **`apps/server` (`@lss/server`):** Node.js + Express + Socket.IO authoritative game server running a 25 Hz (`40 ms`) simulation tick in memory.
- **`apps/web` (`@lss/web`):** Vite + React + TypeScript + Phaser 3 client with Web Audio API procedural sound synthesis.

## Core Invariants

1. **Server Authority:** The server (`apps/server`) is the single source of truth for positions, velocities, projectile spawns, hit detection, asteroid destruction, pickups, safe-zone damage, respawns, AI bot actions, cosmic events, and winner determination. Phones only send input intents (`input:update`); the host screen only sends room lifecycle actions (`host:create`, `room:setBots`, `match:start`, `match:restart`).
5. **Host vs. Controller Roles:** The host screen owns the room and is not a ship. It alone receives `game:snapshot`, `match:started`, `player:eliminated`, and `cosmic:event`. Each phone receives only its own `controller:state` and `controller:haptic`. Phones never mount Phaser.
2. **React ↔ Phaser Separation:** Never push 60 fps frame state through React state hooks. Phaser (`ArenaScene`) renders directly from the latest interpolated server snapshots (`game:snapshot`), while throttled or event-driven updates (HUD stats, kill feed, match state transitions) pass through a typed `EventBus`.
3. **100% Procedural Visuals & Audio:** Do not depend on external image sprites or audio files that could fail to load. Render ships, thrusters, shields, asteroids, projectiles, and safe-zone rings via Phaser `Graphics`/particles, and synthesize sound effects via the Web Audio API (`SoundManager`).
4. **Centralized Balance Config:** All gameplay balance values (arena size `2400x2400`, ship speed, cooldowns, damage, safe-zone stages, pickup durations) must live in `packages/shared/src/constants.ts`.

## Phased Agentic Workflow & Skills

Each phase has a dedicated blueprint and test checklist in `phases/` and can be executed via `/run-phase <1-6>`:

- `/run-phase 1` — **Phase 1 (`phases/phase-1-monorepo-and-shared.md`):** Monorepo scaffold & `@lss/shared` types, events, balance constants + contract tests
- `/run-phase 2` — **Phase 2 (`phases/phase-2-server-and-rooms.md`):** `@lss/server` Express + Socket.IO room lifecycle, 4-char room codes, ready states, state machine + Socket.IO room tests
- `/run-phase 3` — **Phase 3 (`phases/phase-3-simulation-combat-ai.md`):** `@lss/server` 25 Hz world simulation, collisions, safe zone, `BotController` AI pilots, `CosmicDirector` events + headless match simulation tests
- `/run-phase 4` — **Phase 4 (`phases/phase-4-phaser-arena-and-audio.md`):** `@lss/web` Phaser 3 procedural neon arena, snapshot interpolation, `InputManager`, Web Audio `SoundManager` + playable browser arena test harness
- `/run-phase 5` — **Phase 5 (`phases/phase-5-react-ui-hud-and-qr-lobby.md`):** `@lss/web` React UI screens (Landing, QR Code Lobby, Live HUD, Mini-Radar, Spectator Overlay, Winner Scoreboard) + multi-tab gameplay test
- `/run-phase 6` — **Phase 6 (`phases/phase-6-e2e-testing-and-deployment.md`):** End-to-end integration tests, production build check, deployment configs (`render.yaml`), and `README.md`
- `/simulate-match` — Run an automated headless multi-bot match simulation to verify combat, safe-zone shrink, and winner resolution
- `/balance-tune` — Inspect and adjust gameplay balance parameters in `packages/shared/src/constants.ts`
- `/audit-mvp` — Audit the codebase against all Section 16 Acceptance Criteria in `last_star_standing_project_brief.md`

## Standard Verification Commands

- Install dependencies: `npm install`
- Typecheck all workspaces: `npm run typecheck`
- Run tests across workspaces: `npm test`
- Build all workspaces: `npm run build`
- Start development servers: `npm run dev`
