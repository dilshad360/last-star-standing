---
name: simulate-match
description: Run a headless multi-ship battle royale simulation test to verify combat, safe-zone shrinking, AI bots, cosmic events, and winner determination
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

Run and inspect the headless server simulation for **Last Star Standing**:

1. Execute the server test suite (`npm test --workspace=@lss/server`).
2. Verify that:
   - A room transitions cleanly from `LOBBY → COUNTDOWN → ACTIVE → FINISHED`.
   - AI Bot Pilots move, fire projectiles, destroy asteroids, collect upgrades, and stay within the shrinking safe zone.
   - Safe-zone storm damage applies accurately to ships outside the safe radius.
   - Cosmic Director events (*Meteor Shower*, *Solar Surge*, *Supply Drop*) trigger without errors.
   - Eliminated ships cannot fire or deal damage.
   - A winner (or timeout tiebreaker) is deterministically resolved and `MatchResult` statistics are populated.
3. Summarize tick performance, match duration, kill feed events, and any balance anomalies.
