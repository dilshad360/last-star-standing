# Phase 4: Phaser 3 Procedural Neon Arena, Audio Synth & Input (`apps/web`)

**Status:** Completed  
**Command to execute:** `/run-phase 4`  
**Owner Agent:** `phaser-renderer`

---

## 1. Objective
Scaffold the frontend web app (`apps/web`) and build the **Phaser 3 game engine layer** with 100% procedural neon vector graphics, snapshot interpolation (`25 Hz → 60 fps`), particle effects, desktop (`WASD` + Mouse) & mobile touch controls, and the zero-dependency **Web Audio API Synthesizer (`SoundManager`)**. Include a minimal playable test harness so you can immediately fly, shoot, and fight bots in the browser at the end of Phase 4!

---

## 2. Files to Create in Phase 4
- `apps/web/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- `apps/web/src/game/EventBus.ts` — Typed event bridge between Phaser 3 and React UI.
- `apps/web/src/networking/SocketClient.ts` — Socket.IO client manager with auto-reconnect and latency ping measurement.
- `apps/web/src/game/audio/SoundManager.ts` — Web Audio API procedural sound generator:
  - Laser shot (`pew`), hull hit, asteroid shatter, ship explosion, pickup chime, storm warning pulse, countdown beep, and victory fanfare (`M` key to mute/unmute).
- `apps/web/src/game/input/InputManager.ts` — Captures `WASD`/Arrow keys, mouse world aim angle, left-click/Space firing, and mobile virtual dual-touch joystick + fire button.
- `apps/web/src/game/scenes/ArenaScene.ts` & `apps/web/src/game/PhaserGame.ts`:
  - Deep-space parallax starfield + neon coordinate grid + glowing `2400 × 2400` arena border
  - Procedural neon vector ships with distinct colors, thruster flame particles, shield bubble ring, floating health/shield bars, and pilot name tags
  - Snapshot interpolation buffer (`Phaser.Math.Linear` + shortest-arc angle rotation)
  - Glowing projectiles, polygonal asteroids with crack indicators, rotating upgrade pickups, and the pulsing Safe-Zone plasma ring + red danger overlay outside the zone
  - Camera follow on local ship + spectator target switching when eliminated

---

## 3. How You Can Test After Phase 4

After Phase 4 finishes, you can launch the game in your browser and immediately test **live ship flying, shooting, sound effects, and bot combat** on the Phaser canvas:

```bash
# Start both the server and web client
npm run dev
# Open http://localhost:5173 in your browser (or use the Devin Browser Preview)
```

### Phase 4 Exit Criteria (Definition of Done)
- [x] Browser opens the Phaser 3 neon space arena at 60 fps with zero console errors.
- [x] Ship moves smoothly with `WASD`/Arrows, rotates toward the mouse cursor, and fires glowing projectiles on Left-Click / `Space`.
- [x] Web Audio synth plays laser, hit, explosion, and pickup sounds (`M` toggles mute).
- [x] Asteroids, pickups, AI bots, and the shrinking safe-zone plasma ring render clearly and interpolate smoothly.
