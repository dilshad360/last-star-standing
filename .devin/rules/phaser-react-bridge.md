---
description: "Phaser 3 canvas rendering, snapshot interpolation, Web Audio synth, and React HUD separation rules for apps/web"
trigger: glob
globs:
  - "apps/web/**"
---

# Phaser 3 + React Architecture Rules

When working in `apps/web/**`, follow these frontend and game-loop rules:

1. **Strict React ↔ Phaser Decoupling:**
   - React manages screens (`Landing`, `Lobby`, `HUD`, `EliminatedOverlay`, `WinnerScreen`, `ConnectionBanner`).
   - Phaser (`ArenaScene`) owns the `<canvas>`, 60 fps `update(time, delta)` loop, entity sprites/graphics, particle emitters, and camera follow.
   - Never call React `setState` on every `game:snapshot` (25 times/sec) for the entire world state. Only emit throttled local-player HUD updates (`~10 Hz` or on change) and discrete events (`kill-feed`, `cosmic-event`, `match-finished`) across the typed `EventBus`.

2. **Snapshot Interpolation & Angle Wrapping:**
   - Interpolate ship and asteroid positions smoothly between server snapshots (`Phaser.Math.Linear`).
   - Always use shortest-arc angle interpolation (`Phaser.Math.Angle.RotateTo` or `Wrap`) so ships rotating across `-π` and `+π` do not spin 360 degrees backward.

3. **100% Procedural Neon Visuals:**
   - Background: Deep cosmic navy (`#060814`) with multi-layer parallax stars and a subtle neon coordinate grid.
   - Safe Zone: High-contrast cyan/magenta plasma perimeter ring (`#00f5d4` / `#ff2a85`) with a translucent danger tint outside the safe radius.
   - Ships: Distinct neon vector hulls per slot with thruster flame particles, directional aim nose, floating health/shield bars, and shield bubble aura when active.

4. **Web Audio API Synthesizer (`SoundManager`):**
   - Generate all sound effects with `AudioContext` oscillators and noise buffers (`laser`, `hit`, `explosion`, `pickup`, `stormWarning`, `countdown`, `victory`).
   - Respect browser autoplay policies by resuming `AudioContext` on the first user gesture, and bind the `M` key + UI button to mute/unmute.
