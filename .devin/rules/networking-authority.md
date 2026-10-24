---
description: "Server authority, Socket.IO validation, and deterministic simulation rules for apps/server and packages/shared"
trigger: glob
globs:
  - "apps/server/**"
  - "packages/shared/**"
---

# Server Authority & Networking Rules

When working in `apps/server/**` or `packages/shared/**`, adhere strictly to these multiplayer engineering rules:

1. **Never Trust Client State:**
   - Phones only send `PlayerInput` (`moveX`/`moveY` clamped to -1..1, `aimAngle`, `shooting`, `boost`, `sequence`) and `controller:join`/`room:leave`. The host screen sends `host:create`, `host:resume`, `room:setBots`, `match:start`, `match:restart`. Reject host commands from any socket other than `room.hostSocketId`.
   - Reject any payload with NaN/Infinity numbers, invalid room codes, or oversized strings (`displayName` trimmed and clamped to 1–16 characters).

2. **Fixed Tick Simulation (25 Hz / 40 ms):**
   - Run the room simulation loop at `TICK_RATE = 25` (`TICK_INTERVAL_MS = 40`).
   - Each tick must process:
     1. AI Bot Pilot decision updates (`BotController`)
     2. Player & Bot movement + velocity damping + arena boundary clamping (`0..ARENA_WIDTH`, `0..ARENA_HEIGHT`)
     3. Weapon cooldown checks + projectile spawning
     4. Projectile advancement + expiration + circle-circle hit detection against asteroids and ships
     5. Asteroid drift + destruction + pickup spawning
     6. Pickup collection (`SHIELD`, `RAPID_FIRE`, `REPAIR`, `ENERGY`) + expiration
     7. Safe-zone shrink progression + outside-zone storm damage
     8. AI Cosmic Director event triggers (*Meteor Shower*, *Solar Surge*, *Supply Drop*)
     9. Respawns (`RESPAWN_DELAY_MS`) & round timer (`MATCH_TIMEOUT_MS`; most kills wins)
     10. `game:snapshot` to the host channel only; `controller:state` to each phone every `CONTROLLER_STATE_EVERY_TICKS`

3. **Spawn Fairness:**
   - Place all ships on an equidistant radial circle around the arena center `(1200, 1200)` at radius `750` with random angular offset.
   - Grant a `2500 ms` spawn invulnerability shield at match start so no ship takes instant spawn damage.

4. **Graceful Disconnection:**
   - A phone that disconnects keeps its slot for `PLAYER_RECONNECT_GRACE_MS` and reclaims it with its `playerToken`; its ship is parked (not killed) while offline. Inputs older than `INPUT_STALE_MS` are treated as released.
   - A host screen that disconnects keeps the room for `HOST_RECONNECT_GRACE_MS` and resumes with its `hostToken`; after that the room closes (`room:closed`) and its simulation stops.
   - Explicit `room:leave` removes a phone immediately and closes the room when sent by the host.
