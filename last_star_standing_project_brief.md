> **Note:** This brief describes the original single-device battle royale. The game has pivoted to party mode (host screen + phone controllers, free-for-all with respawns). See `AGENTS.md` and `README.md` for the current rules.

# Last Star Standing --- Project Brief

**Document type:** Product + Technical Specification\
**Project type:** Browser-based real-time multiplayer space arena\
**Primary goal:** Build a polished, playable hackathon MVP in 24 hours\
**Target audience:** Hackathon judges, friends, and casual players\
**Status:** Approved specification --- ready for phased agentic implementation\
**Version:** 1.1 (Updated with AI Bot Pilots, Procedural Neon & Synth Audio, Instant QR Lobby, AI Cosmic Director, and 6-Phase Agentic Workflow)

------------------------------------------------------------------------

## 1. Executive Summary

**Last Star Standing** is a fast-paced, top-down 2D multiplayer space
survival game that runs in a web browser. Players pilot small spaceships
in a shared arena, shoot opponents, destroy asteroids, collect upgrades,
and survive a shrinking safe zone. The last surviving player wins.

The game should be easy to join: a player opens a public URL, creates or
joins a room, and starts playing without installing an application.

The 24-hour version prioritizes a complete, fun match loop over a large
feature set. The essential deliverable is a deployed game that multiple
people can play together from separate browsers.

### One-sentence pitch

> A browser-based space battle royale where players fight, collect
> upgrades, dodge cosmic hazards, and race to become the last surviving
> pilot.

### Core promise

**Join quickly, understand the controls immediately, and reach a
dramatic winner moment within a few minutes.**

------------------------------------------------------------------------

## 2. Product Goals and Non-Goals

### Goals

1.  Deliver a playable game at a public HTTPS URL.
2.  Support a small real-time multiplayer match, targeting 4--8 players
    for the demo.
3.  Provide responsive controls on desktop and mobile browsers.
4.  Complete the full match lifecycle: lobby, countdown, active match,
    elimination, winner, and restart.
5.  Make the game visually compelling through a neon space aesthetic,
    particles, projectiles, explosions, and a shrinking arena.
6.  Keep the deployment affordable, ideally using free hosting for the
    hackathon.
7.  Keep the implementation small enough for one developer to finish and
    test in 24 hours.

### Non-goals for the 24-hour MVP

-   A massive persistent open world.
-   Hundreds of simultaneous players.
-   Ranked matchmaking or a global leaderboard.
-   User accounts, payments, or social login.
-   A sophisticated anti-cheat system.
-   Custom-trained AI or AI-generated gameplay content.
-   Multiple maps, complex ship classes, or a deep progression system.
-   Guaranteed uninterrupted operation on free hosting.
-   Native mobile applications.

------------------------------------------------------------------------

## 3. Target Players and Session Design

### Target players

-   Hackathon judges who need to understand the game quickly.
-   Friends testing a match together.
-   Casual players who enjoy short competitive arena games.

### Session design

-   **Target match duration:** 2--4 minutes.
-   **Target demo lobby:** 4--8 players.
-   **Join method:** Public game URL plus room code or join link.
-   **Desktop controls:** Keyboard and mouse.
-   **Mobile controls:** Touch joystick and action buttons.
-   **Spectating:** Eliminated players can watch the remaining players
    if time permits.

These are design targets, not performance guarantees.

------------------------------------------------------------------------

## 4. Core Gameplay Loop

1.  A player opens the game URL.
2.  The player creates a room or joins an existing room.
3.  Players choose a display name and enter the lobby.
4.  The host starts the match or the countdown begins once the minimum
    player count is reached.
5.  Each player spawns with a ship, health, and a basic weapon.
6.  Players move, aim, fire, dodge hazards, and collect upgrades.
7.  Asteroids can be destroyed for energy or pickups.
8.  The safe zone shrinks as the match progresses.
9.  Players outside the safe zone take damage.
10. When a player is eliminated, they can spectate or return to the
    lobby.
11. The match ends when one player remains, or when a configured
    draw/time-limit condition is reached.
12. The winner screen displays the champion and match statistics.
13. Players can start another match without reloading the entire site.

### Match state machine

`LOBBY → COUNTDOWN → ACTIVE → FINISHED → LOBBY`

The server, not individual clients, controls transitions between match
states.

------------------------------------------------------------------------

## 5. MVP Feature Scope

### P0 --- Required for a successful demo

#### Lobby and joining

-   Landing screen with game title, Quick Play (instant solo/bot-filled match), Create Room, and Join Room actions.
-   Short 4-character room code (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), shareable `?room=CODE` deep link, and an inline SVG QR code in the lobby for instant mobile/judge joining.
-   Display name entry with basic validation.
-   Player list, ready/presence indicators, and Host AI Bot Pilot counter (`0–7` bots) so any match can reach 4–8 ships immediately.
-   Start button or automatic countdown.
-   Clear error messages if a room does not exist or is full.

#### Arena and controls

-   Top-down 2D arena.
-   Ship movement with keyboard controls.
-   Mouse aiming and shooting.
-   Basic mobile touch controls if time permits; desktop playability is
    the first priority.
-   Camera view that keeps the local player and relevant arena area
    visible.
-   Arena boundaries and collision handling.

#### Combat

-   Basic projectile weapon.
-   Projectile lifetime and fire-rate limit.
-   Player health and damage.
-   Server-validated hits and eliminations.
-   Short invulnerability window after spawning, if respawn is enabled
    in development.
-   No respawning during the final battle royale match unless explicitly
    configured.

#### Asteroids and pickups

-   A small number of asteroids.
-   Asteroids have health and can be destroyed.
-   A simple energy or health pickup.
-   One or two upgrades, such as a temporary shield or faster firing.
-   Pickups expire after a configured duration.

#### Battle royale mechanics

-   Safe zone starts large and shrinks over time.
-   Safe-zone boundary is clearly visible.
-   Players outside the safe zone take periodic damage.
-   Last surviving player wins.
-   Match timeout produces a clear result, such as winner by health or a
    draw.

#### Match lifecycle

-   Lobby, countdown, active, and finished states.
-   Elimination notification.
-   Winner screen.
-   Return to lobby or restart match.
-   Handle player disconnects without crashing the match.

#### Presentation & Procedural Assets

-   Coherent neon space visual style rendered 100% procedurally via Phaser `Graphics` and particle emitters (zero external sprite sheet dependencies).
-   HUD showing health, shield, active upgrade timers, alive player count, match timer, kill feed, mini-radar, and safe-zone / cosmic event warnings.
-   Procedural Web Audio API synthesizer (`SoundManager`) for laser shots, impacts, explosions, pickups, storm alarms, and victory fanfare with `M` mute toggle.
-   Visible loading and connection states.
-   Responsive layout for common desktop and mobile browser sizes.

#### AI & Dynamic Gameplay (Hackathon Differentiators)

-   **AI Bot Pilots (`BotController`):** Server-authoritative autonomous ships that fill open lobby slots, navigate toward the safe zone, avoid boundaries, target asteroids/opponents, and collect pickups.
-   **AI Cosmic Director (`CosmicDirector`):** Server-side dynamic pacing system that triggers periodic arena-wide cosmic anomalies (*Meteor Shower*, *Solar Surge*, or *Supply Drop*) with HUD warning banners.

### P1 --- Add only after P0 works

-   Spectator camera for eliminated players.
-   Kill feed.
-   Match statistics: eliminations, damage, survival time.
-   Meteor shower as one special environmental event.
-   More upgrade types.
-   Simple leaderboard for the current match.
-   Touch controls polished for mobile.
-   Short tutorial or control overlay.

### P2 --- Future ideas, not part of the hackathon MVP

-   Persistent accounts and progression.
-   Ranked matchmaking and skill rating.
-   Multiple maps or biomes.
-   Parties and friends lists.
-   Cosmetic skins.
-   Persistent statistics database.
-   Dedicated regional servers.
-   Advanced bot opponents.
-   Procedurally generated missions.
-   AI game master or adaptive events.
-   Replays and spectator broadcasts.
-   Large-scale open-world mode.

------------------------------------------------------------------------

## 6. Game Rules and Initial Balance

The following values are **starting placeholders**. Playtest and adjust
them.

  ------------------------------------------------------------------------
  Parameter                           Initial target Notes
  --------------------- ---------------------------- ---------------------
  Players per room                              4--8 Tune for server
                                                     capacity

  Match duration                        2--4 minutes Keep the demo moving

  Starting health                                100 Simple and
                                                     understandable

  Basic shot damage                               20 Approximately five
                                                     clean hits

  Fire cooldown                               300 ms Tune for weapon feel

  Projectile lifetime                    1.2 seconds Prevent old
                                                     projectiles
                                                     accumulating

  Pickup lifetime                     10--15 seconds Prevent clutter

  Safe-zone shrink           Begins after 30 seconds Use a visible warning

  Storm damage               5--10 health per second Tune after testing

  Respawning                     Off in active match May be enabled in a
                                                     separate test mode

  Match timeout                            3 minutes Resolve with an
                                                     explicit rule
  ------------------------------------------------------------------------

Avoid making the match depend on these exact values. Store balance
values in one configuration file so they can be changed quickly.

### Suggested initial upgrades

1.  **Shield:** Absorbs a limited amount of incoming damage for a short
    duration.
2.  **Rapid Fire:** Temporarily reduces weapon cooldown.
3.  **Repair:** Restores a small amount of health, up to the maximum.

Only implement one or two upgrades in the MVP if time is tight.

------------------------------------------------------------------------

## 7. Controls

### Desktop

-   `W`, `A`, `S`, `D` or arrow keys: Move.
-   Mouse: Aim.
-   Left mouse button: Fire.
-   `Esc`: Open pause/settings overlay if supported.
-   `M`: Mute/unmute sound if supported.

### Mobile

-   Virtual joystick: Move.
-   Fire button: Shoot in the current aim direction.
-   Optional aim control: Right-side drag area or second joystick.

Mobile support must be tested on an actual phone. A responsive layout
alone does not guarantee that game controls work well on touch screens.

------------------------------------------------------------------------

## 8. Recommended Technology Stack

### Frontend

-   **Vite + React + TypeScript:** Web application shell, lobby, menus,
    HUD, and results screens.
-   **Phaser 3:** 2D game rendering, input, camera, sprites, particles,
    and local visual effects.
-   **CSS or Tailwind CSS:** Layout and UI styling.
-   **Socket.IO client:** Real-time communication with the game server.

React should manage menus and interface state; Phaser should manage the
actual game canvas and per-frame rendering. Avoid forcing every frame
update through React state.

### Backend

-   **Node.js + TypeScript:** Multiplayer server.
-   **Socket.IO:** Room management, player input transport, and state
    updates.
-   **In-memory state:** Rooms, players, projectiles, asteroids,
    pickups, and match state for the first version.

### Persistence

No database is required for the MVP. Active matches can live in server
memory. This means a server restart loses active rooms and match state.
That is acceptable for a hackathon prototype but not for a production
service.

### Deployment

-   **Frontend:** Cloudflare Pages or another static host that supports
    the built Vite application.
-   **Game server:** A Node.js host that supports persistent WebSocket
    connections, such as Render Web Services.
-   **Public transport:** HTTPS for the site and secure WebSockets
    (`wss://`) for the deployed game server.

Free hosting plans and quotas can change. Verify the host's current
terms before the event. A free server may sleep, restart, or impose
resource limits; do not promise uninterrupted uptime.

### Why this stack?

Phaser handles much of the 2D game rendering and input work, while
Socket.IO makes it practical to connect multiple browser clients.
TypeScript gives shared data types and reduces avoidable client/server
mistakes.

------------------------------------------------------------------------

## 9. High-Level Architecture

``` text
Browser
├── React UI
│   ├── Landing screen
│   ├── Lobby and room code
│   ├── HUD and settings
│   └── Winner/results screen
├── Phaser game
│   ├── Arena rendering
│   ├── Ship sprites and animation
│   ├── Projectiles and particles
│   ├── Asteroid and pickup visuals
│   └── Camera and input collection
└── Socket.IO client
    ├── Join/leave room
    ├── Send player inputs
    ├── Receive authoritative snapshots
    └── Connection/reconnection status
                │
                │ HTTPS / WSS
                ▼
Node.js game server
├── Room manager
├── Match state machine
├── Input validation
├── Movement and collision rules
├── Weapon cooldowns and projectiles
├── Damage and elimination
├── Pickups and asteroids
├── Safe-zone logic
├── Winner determination
└── State broadcast
```

### Authority model

The server is authoritative for important gameplay decisions.

The client may predict movement locally to improve responsiveness, but
the server validates inputs and determines accepted positions, damage,
eliminations, pickups, and winners.

Clients must not be trusted to report that they hit another player or
collected an item. Clients send intended actions; the server decides
what actually happened.

------------------------------------------------------------------------

## 10. Networking and Simulation Design

### Server loop

A simple initial target is a server simulation running around 20--30
ticks per second. Actual rate should be tested against hosting
performance and player count.

Each tick should:

1.  Read the latest accepted input for each player.
2.  Validate movement and action limits.
3.  Update player movement and arena boundaries.
4.  Advance projectiles and resolve collisions.
5.  Apply damage and elimination.
6.  Update asteroids, pickups, and safe-zone state.
7.  Determine match transitions.
8.  Broadcast a compact state snapshot.

### Client responsibilities

-   Collect keyboard, mouse, or touch input.
-   Render the latest server state.
-   Interpolate remote player movement between snapshots.
-   Optionally predict the local player's movement.
-   Display health, timer, alive count, notifications, and connection
    status.
-   Request to join a room or leave it.
-   Never determine the official winner locally.

### Network efficiency

-   Send input changes or input packets, not the entire game state every
    frame.
-   Broadcast only the state needed by clients.
-   Limit projectile counts and entity lifetimes.
-   Avoid sending large debug objects or image data over Socket.IO.
-   Measure bandwidth and latency during multi-client testing.

### Reconnection behavior

-   Show a clear "connecting/reconnecting" overlay.
-   Give each connection a player/session identifier where practical.
-   If reliable rejoin is implemented, validate the rejoin token on the
    server.
-   If the match cannot be resumed after a restart, explain that the
    match ended and offer a new lobby.

For the MVP, it is acceptable to remove a disconnected player after a
short timeout rather than building complex recovery.

------------------------------------------------------------------------

## 11. Initial Server Data Model

These are conceptual TypeScript-style structures, not a requirement to
use a database.

### Player

-   `id`: server-generated player ID.
-   `displayName`: validated player name.
-   `x`, `y`: server-controlled position.
-   `rotation`: ship facing direction.
-   `health`, `maxHealth`.
-   `alive`: whether the player remains in the match.
-   `kills`: elimination count.
-   `weaponLevel` or active upgrade state.
-   `lastInputSequence`: latest processed input sequence number.

### Room

-   `id`: short room code.
-   `hostPlayerId`.
-   `players`: connected players.
-   `status`: lobby, countdown, active, finished.
-   `createdAt`.
-   `matchStartedAt`.
-   `safeZone`: center, radius, shrink schedule.
-   `winnerPlayerId`, if the match has a winner.

### Projectile

-   `id`.
-   `ownerPlayerId`.
-   `x`, `y`, `velocityX`, `velocityY`.
-   `damage`.
-   `expiresAt`.

### Pickup

-   `id`.
-   `type`.
-   `x`, `y`.
-   `expiresAt`.
-   `collected`, or removal from active state.

### Asteroid

-   `id`.
-   `x`, `y`.
-   `radius`.
-   `health`.
-   `velocityX`, `velocityY`.
-   Optional drop type.

### Match result

-   `roomId`.
-   `winnerPlayerId`, or null for a draw.
-   Match duration.
-   Player elimination statistics.
-   End reason.

------------------------------------------------------------------------

## 12. Suggested API and Socket Events

Exact event names can change during implementation, but keep a
consistent contract.

### Client-to-server events

-   `room:create`
-   `room:join`
-   `room:leave`
-   `player:ready`
-   `match:start`
-   `input:update`
-   `match:restart`

Validate every event and reject invalid room codes, malformed input,
impossible action rates, and unauthorized match starts.

### Server-to-client events

-   `room:created`
-   `room:joined`
-   `room:playerJoined`
-   `room:playerLeft`
-   `match:countdown`
-   `match:started`
-   `game:snapshot`
-   `player:damaged`
-   `player:eliminated`
-   `zone:updated`
-   `match:finished`
-   `room:error`

Use acknowledgements for create/join requests so the UI can show success
or a useful error. Avoid sending redundant individual events when the
same information is already in a state snapshot.

------------------------------------------------------------------------

## 13. Proposed Project Structure

``` text
last-star-standing/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── game/
│   │   │   │   ├── scenes/
│   │   │   │   ├── entities/
│   │   │   │   ├── input/
│   │   │   │   └── rendering/
│   │   │   ├── networking/
│   │   │   └── styles/
│   │   └── package.json
│   └── server/
│       ├── src/
│       │   ├── index.ts
│       │   ├── rooms/
│       │   ├── game/
│       │   ├── networking/
│       │   └── config/
│       └── package.json
├── packages/
│   └── shared/
│       ├── types.ts
│       ├── events.ts
│       └── constants.ts
├── README.md
└── package.json
```

This is a suggested monorepo structure. If repository setup becomes a
time sink, use two simple projects or one repository with separate
`client` and `server` folders. Keep shared event/type definitions
consistent.

------------------------------------------------------------------------

## 14. Visual and UX Direction

### Art direction

-   Dark navy or near-black space background.
-   Bright cyan, violet, magenta, and orange accents.
-   Simple recognizable ship silhouettes.
-   High-contrast projectiles and pickups.
-   Clear safe-zone ring.
-   Small particle bursts for shooting, damage, and destruction.
-   Restrained glow effects to preserve readability.

### Essential screens

1.  **Landing:** game title, Play, controls, sound toggle.
2.  **Lobby:** room code, copy/share action, player list, ready/start
    status.
3.  **Gameplay:** canvas, health, alive count, timer, safe-zone warning.
4.  **Eliminated:** elimination message and spectate/rejoin options.
5.  **Winner:** champion, match statistics, play-again action.
6.  **Connection issue:** reconnecting, server unavailable, and
    return-to-lobby options.

### Accessibility and usability

-   Controls must be visible before the match starts.
-   Do not communicate health or hazards through color alone.
-   Support mute and reasonable audio defaults.
-   Keep text readable on a typical laptop and phone.
-   Avoid excessive camera shake or flashing.
-   Keep the primary action obvious in every screen.

------------------------------------------------------------------------

## 15. 24-Hour Implementation Plan

### Hours 0--2: Project setup and core experiment

-   Create the repository and install dependencies.
-   Build a Phaser scene with a player ship and arena.
-   Implement movement, aiming, and shooting locally.
-   Confirm the game renders smoothly in the target browser.

**Milestone:** A fun single-player movement/shooting prototype.

### Hours 2--5: Core gameplay

-   Add projectiles, asteroid objects, collisions, health, and damage.
-   Add a minimal HUD.
-   Add a local win/lose state for development.

**Milestone:** The basic combat loop works without networking.

### Hours 5--9: Multiplayer foundation

-   Create the Node.js server and Socket.IO connection.
-   Add room creation/joining and player presence.
-   Implement server-controlled movement and snapshots.
-   Test using multiple browser tabs.

**Milestone:** Two or more browser clients can see one another move.

### Hours 9--13: Combat networking

-   Send movement and firing inputs to the server.
-   Implement server-validated projectile damage and eliminations.
-   Broadcast health, alive count, and match state.
-   Handle joining, leaving, and basic disconnection.

**Milestone:** Multiple players can complete a simple combat round.

### Hours 13--16: Battle royale loop

-   Add lobby/countdown/active/finished states.
-   Implement shrinking safe zone.
-   Add one pickup or upgrade.
-   Add winner determination and match restart.

**Milestone:** A complete match can finish and restart.

### Hours 16--19: Visual polish

-   Add particles, sound, HUD polish, and responsive lobby.
-   Add clear notifications for damage, elimination, and storm.
-   Add mobile controls only after desktop controls are reliable.

**Milestone:** The game looks and feels presentable.

### Hours 19--21: Deployment

-   Deploy the frontend and server.
-   Configure environment variables and allowed origins.
-   Verify secure WebSocket connections.
-   Test the public URL from a second device or network.

**Milestone:** Judges can access the game from a public link.

### Hours 21--23: Testing and bug fixing

-   Run multiple simultaneous clients.
-   Test a full match and a restart.
-   Test server errors, disconnections, and invalid room codes.
-   Check resource usage and browser console logs.
-   Fix game-breaking issues before cosmetic details.

**Milestone:** A repeatable public demo.

### Hours 23--24: Freeze and rehearse

-   Stop adding new features.
-   Reset the game to a known demo state.
-   Prepare a backup build or recorded clip.
-   Rehearse the pitch and live match.
-   Confirm the URL and QR code work.

**Milestone:** Ready for judging.

### Priority rule

If behind schedule, cut features in this order:

1.  Extra weapons and upgrades.
2.  Spectator mode.
3.  Kill feed and detailed statistics.
4.  Mobile controls beyond basic support.
5.  Environmental events beyond the shrinking zone.

Do **not** cut room joining, core movement, server-authoritative combat,
winner determination, or deployment testing.

------------------------------------------------------------------------

## 16. Testing and Acceptance Criteria

The MVP is complete only when these criteria pass.

### Functional

-   [ ] A player can open the public URL and reach the landing screen.
-   [ ] A room can be created and joined from a second browser/device.
-   [ ] Two or more players can see each other's movement.
-   [ ] Shooting and damage work consistently across clients.
-   [ ] Eliminated players cannot continue damaging others.
-   [ ] The safe zone shrinks and applies damage outside it.
-   [ ] The server identifies a winner or a draw.
-   [ ] Players can start another match without rebuilding the
    deployment.
-   [ ] Invalid room codes and server failures show useful messages.

### Technical

-   [ ] The server, not the client, validates damage and the official
    winner.
-   [ ] Fire rate and movement speed have server-side limits.
-   [ ] Projectiles and pickups expire or are removed.
-   [ ] Disconnecting a player does not crash the server.
-   [ ] The game works over HTTPS/WSS on the deployed URL.
-   [ ] Secrets and API keys are not committed to source control.
-   [ ] No critical console errors occur during a full match.

### Demo quality

-   [ ] A new player can understand the controls in under 20 seconds.
-   [ ] The lobby can be filled quickly for the demo.
-   [ ] A match can be completed in roughly 2--4 minutes.
-   [ ] The winner moment is visually obvious.
-   [ ] A backup plan exists if public hosting is slow or unavailable.

------------------------------------------------------------------------

## 17. Hosting and Cost Assumptions

### Proposed low-cost deployment

-   Static frontend on a free static hosting tier.
-   Node.js multiplayer server on a free or low-cost service that
    supports persistent WebSockets.
-   In-memory game state; no paid database for the first version.
-   No third-party paid game assets or APIs required.

### Important free-hosting caveats

-   Free plans and limits change; check the provider's current
    documentation.
-   Free services may sleep when idle or restart.
-   Cold starts can delay the first match.
-   In-memory matches disappear when the server restarts.
-   Bandwidth and CPU limits may affect game responsiveness.
-   A free-tier URL is not a guarantee of production-grade availability.

### Deployment checklist

-   [ ] Set the server's port from the host-provided environment
    variable.
-   [ ] Configure the frontend's public game-server URL.
-   [ ] Restrict CORS to the deployed frontend origin.
-   [ ] Use `wss://` from the HTTPS frontend.
-   [ ] Confirm the server accepts WebSocket upgrades.
-   [ ] Add a lightweight health endpoint if supported.
-   [ ] Verify logs and restart behavior.
-   [ ] Test the game on a separate network.

------------------------------------------------------------------------

## 18. Security and Abuse Prevention

For the hackathon, use practical safeguards without overengineering.

-   Validate all incoming event payloads.
-   Limit player name length and sanitize displayed text.
-   Limit room capacity.
-   Validate room membership before processing gameplay inputs.
-   Apply movement-speed and fire-rate limits on the server.
-   Do not accept client-reported damage, kills, pickups, or winners.
-   Avoid exposing internal server errors to clients.
-   Rate-limit room creation and connection attempts where practical.
-   Use server-generated IDs and room codes.
-   Keep deployment secrets out of frontend environment variables and
    the repository.

This MVP is not expected to withstand determined attacks. It should
nevertheless establish the right trust boundary.

------------------------------------------------------------------------

## 19. Demo Script for Judges

### 0:00--0:20 --- Introduce the game

"Last Star Standing is a multiplayer space survival game you can play
instantly in your browser. No download, no installation---just join the
room."

Show the landing screen and QR code.

### 0:20--0:45 --- Join the arena

Have judges or teammates join from phones or laptops. Show the player
list and countdown.

### 0:45--1:20 --- Demonstrate combat

Move, aim, shoot, and destroy an asteroid. Pick up an upgrade. Make sure
the audience can see the action clearly.

### 1:20--1:50 --- Trigger the cosmic storm

Show the shrinking safe-zone ring and explain how the arena forces
players together.

### 1:50--2:20 --- Finish the match

Eliminate players until the server declares the winner. Show the winner
screen and play-again flow.

### 2:20--2:40 --- Explain the engineering

Briefly explain the server-authoritative game state, browser-based
deployment, and how the architecture supports multiple players.

### Demo fallback

If there are not enough judges to join, use two prepared browser
clients. If the hosted server fails, use a local test setup or a short
recorded clip while clearly explaining that it is a fallback.

------------------------------------------------------------------------

## 20. Risks and Mitigations

  -----------------------------------------------------------------------
  Risk                                Mitigation
  ----------------------------------- -----------------------------------
  Multiplayer takes longer than       Start networking early; test two
  expected                            clients by hour 9

  The game feels unpolished           Focus on one arena, one weapon, one
                                      upgrade, and one hazard

  Hosting sleeps or restarts          Deploy early, warm the service
                                      before the demo, and prepare a
                                      fallback

  Too many features                   Enforce the P0 scope and time-box
                                      each phase

  Game state becomes inconsistent     Keep the server authoritative and
                                      use compact snapshots

  Lag makes combat frustrating        Limit player count and entities;
                                      test real devices and networks

  Mobile controls are difficult       Prioritize desktop and provide
                                      basic mobile controls only if time
                                      allows

  AI is requested by the hackathon    Do not force AI into the core game;
                                      add a small optional AI-generated
                                      event only after the game is stable
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 21. Post-Hackathon Roadmap

### Phase 1: Stability

-   Better reconnection and match recovery.
-   Improved interpolation and local prediction.
-   Better performance metrics and server logs.
-   Automated gameplay tests.

### Phase 2: More gameplay

-   Additional weapons and ship abilities.
-   Multiple asteroid types and environmental events.
-   Bot opponents to fill empty matches.
-   Spectator mode and improved scoring.

### Phase 3: Community features

-   Persistent player profiles.
-   Match history and leaderboards.
-   Party invitations and friend rooms.
-   Custom ship skins and unlockables.

### Phase 4: Larger multiplayer experience

-   Regional matchmaking.
-   Better anti-cheat controls.
-   Server scaling and persistent storage.
-   Mobile-first UX improvements.
-   Optional AI-driven events or adaptive challenges.

------------------------------------------------------------------------

## 22. Verified Technical Specifications & Decisions (v1.1)

All core architectural and design decisions have been verified:

-   [x] **Package Manager & Monorepo:** `npm` workspaces (`packages/shared`, `apps/server`, `apps/web`).
-   [x] **Arena & Physics Constants:** `2400 × 2400` world units, radial equidistant spawn ring with `2.5s` spawn invulnerability shield, circle-circle collision detection (`ship: 20px`, `projectile: 5px`, `pickup: 16px`, `asteroid: 28–55px`).
-   [x] **Server Simulation:** `25 Hz` (`40 ms` tick) authoritative loop in Node.js + Socket.IO with client-side snapshot interpolation (`lerp`) and angle wrapping.
-   [x] **React ↔ Phaser Bridge:** Typed `EventBus` so React renders overlays/menus/HUD while Phaser runs the `60 fps` canvas without triggering React state re-renders every frame.
-   [x] **Zero External Assets:** 100% procedural neon vector geometry in Phaser 3 + Web Audio API synthesized sound effects.
-   [x] **Solo & Judge Demo Readiness:** Server-side AI Bot Pilots (`0–7` per room) + `?room=CODE` deep-linking + inline SVG QR code in the lobby.
-   [x] **AI Component:** AI Bot Pilots + AI Cosmic Director triggering dynamic match events (*Meteor Shower*, *Solar Surge*, *Supply Drop*).

------------------------------------------------------------------------

## 25. 6-Phase Agentic Development Workflow

Development is organized into 6 self-contained phases executed via the `.devin/` agentic workflow (`/run-phase 1` through `/run-phase 6`):

1.  **Phase 1 — Monorepo & Shared Contracts (`packages/shared`):** Workspace setup (`package.json`, `tsconfig.base.json`, `.gitignore`) and shared TypeScript types, balance constants, and Socket.IO event interfaces.
2.  **Phase 2 — Multiplayer Server & Room Lifecycle (`apps/server`):** Express + Socket.IO server, `/health` endpoint, `RoomManager`, `GameRoom`, 4-character room codes, ready states, bot slot configuration, and `LOBBY → COUNTDOWN → ACTIVE → FINISHED → LOBBY` state machine.
3.  **Phase 3 — Authoritative Simulation, Combat, Safe Zone, AI Bots & Cosmic Director (`apps/server`):** 25 Hz physics loop, projectile/asteroid/pickup collisions, shrinking storm ring, `BotController` AI pilots, `CosmicDirector` events, and headless simulation tests.
4.  **Phase 4 — Phaser 3 Procedural Neon Arena, Audio Synth & Input (`apps/web`):** `ArenaScene` with starfield, vector ships, thrusters, shields, explosions, snapshot interpolation, `InputManager` (WASD+Mouse & mobile touch joystick), and Web Audio API `SoundManager`.
5.  **Phase 5 — React UI Shell, Instant QR Lobby, HUD, Spectator & Winner Screens (`apps/web`):** Landing screen, Lobby with inline SVG QR code & copy link, live HUD (health/shield, radar, kill feed, storm/cosmic alerts), Eliminated spectator overlay, and Winner scoreboard.
6.  **Phase 6 — End-to-End Verification, Polish & Deployment Blueprints:** Full multi-client/bot integration test suite, production build verification, `render.yaml` + static hosting configs, and `README.md` judge demo guide.

------------------------------------------------------------------------

## 23. Definition of Done

Last Star Standing is ready to submit when:

1.  A public URL opens the game.
2.  Multiple players can join the same room from separate devices.
3.  The players can move, shoot, take damage, and be eliminated.
4.  The safe zone shrinks and influences the match.
5.  The server determines the winner.
6.  A new match can be started after the previous one.
7.  The demo has been rehearsed and a fallback is available.
8.  Known limitations are documented honestly.

**The core success metric is not the number of features. It is whether
judges can join, play, understand the strategy, and witness a complete
match without developer intervention.**

------------------------------------------------------------------------

## 24. Final Product Statement

**Last Star Standing** is a browser-first multiplayer space battle
royale built for quick, accessible competitive play. Players enter a
shared arena, fight with simple weapons, gather upgrades, and survive a
shrinking cosmic safe zone. The project combines a responsive 2D game
client with a server-authoritative real-time multiplayer backend, aiming
to deliver a complete and memorable playable experience within a 24-hour
hackathon.

The initial release deliberately favors a small, stable, well-presented
game loop over a large feature set. Once that loop is reliable, the game
can expand into new weapons, maps, environmental events, player
progression, and larger multiplayer sessions.
