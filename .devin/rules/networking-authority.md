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
   - Clients only send `PlayerInput` (`up`, `down`, `left`, `right`, `aimAngle`, `shooting`, `sequence`) and room commands (`room:create`, `room:join`, `player:ready`, `room:setBots`, `match:start`, `match:restart`).
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
     9. Elimination checks & match finish conditions (`alive <= 1` or match timeout)
     10. Compact `game:snapshot` broadcast to room members

3. **Spawn Fairness:**
   - Place all ships on an equidistant radial circle around the arena center `(1200, 1200)` at radius `750` with random angular offset.
   - Grant a `2500 ms` spawn invulnerability shield at match start so no ship takes instant spawn damage.

4. **Graceful Disconnection:**
   - If a player disconnects during `LOBBY` or `COUNTDOWN`, remove them and reassign `hostPlayerId` if needed.
   - If a player disconnects during `ACTIVE`, mark their ship as eliminated and evaluate if a winner now remains.
   - If a room has `0` human players left, stop its interval timer and clean up the room from `RoomManager`.
