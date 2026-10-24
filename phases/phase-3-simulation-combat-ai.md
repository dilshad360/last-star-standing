# Phase 3: Server Simulation, Combat, Safe Zone, AI Bots & Cosmic Director (`apps/server`)

**Status:** Completed  
**Command to execute:** `/run-phase 3`  
**Owner Agent:** `netcode-architect`

---

## 1. Objective
Implement the authoritative 25 Hz (`40 ms`) world simulation engine in `apps/server`, including ship physics, projectile firing and hit detection, destructible asteroids, upgrade pickups (`SHIELD`, `RAPID_FIRE`, `REPAIR`, `ENERGY`), the shrinking safe-zone storm ring, **AI Bot Pilots (`BotController`)**, and the **AI Cosmic Director (`CosmicDirector`)**.

---

## 2. Files to Create in Phase 3
- `apps/server/src/game/WorldSimulation.ts`:
  - Radial equidistant spawn points around arena center `(1200, 1200)` with `2.5s` spawn invulnerability shield
  - Ship movement, velocity damping, and arena boundary clamping (`0..2400`)
  - Server-enforced weapon cooldowns (`280 ms` base, `140 ms` with Rapid Fire) and projectile expiration (`1.2s`)
  - Circle-circle collision detection:
    - Projectile ↔ Ship (applies shield absorption first, then health damage, tracks `damageDealt` and `kills`, emits `KillFeedEntry`)
    - Projectile ↔ Asteroid (reduces asteroid HP, shatters asteroid at `<= 0` HP, spawns pickup)
    - Ship ↔ Asteroid (elastic bounce + minor hull collision damage)
    - Ship ↔ Pickup (applies `SHIELD`, `RAPID_FIRE`, `REPAIR`, or `ENERGY` buff)
  - Shrinking Safe Zone (`SafeZoneState`): progresses through shrink stages and applies storm DPS (`8 HP/sec`) outside the ring
  - Match finish resolver: declares the last surviving pilot the winner (or resolves tiebreaker on match timeout) and builds `MatchResult`
- `apps/server/src/game/BotController.ts`:
  - Server-side AI Bot decision loop: steers inside the safe zone, avoids boundaries/asteroids, seeks nearby pickups when damaged, and aims/shoots at nearby targets.
- `apps/server/src/game/CosmicDirector.ts`:
  - Dynamic AI Game Master that triggers periodic cosmic anomalies (*Meteor Shower*, *Solar Surge*, *Supply Drop*) with warning and active phases.
- `apps/server/src/__tests__/simulation.test.ts` — Headless full-match simulation tests + CLI simulation script.

---

## 3. How You Can Test After Phase 3

After Phase 3 finishes, you can run a **full headless Battle Royale match** right in your terminal (or via `/simulate-match`) and watch 6 ships fight, destroy asteroids, dodge the storm, and crown a winner:

```bash
# 1. Run the automated simulation & physics test suite
npm test --workspace=@lss/server

# 2. Or invoke the Devin slash skill to run and inspect a simulated match:
# /simulate-match
```

### Phase 3 Exit Criteria (Definition of Done)
- [x] Projectiles damage ships and asteroids accurately; eliminated ships cannot move or shoot.
- [x] Destroying asteroids spawns pickups (`SHIELD`, `RAPID_FIRE`, `REPAIR`, `ENERGY`) that apply buffs on collection.
- [x] Safe zone shrinks on schedule and damages ships outside the safe radius.
- [x] AI Bot Pilots actively move toward the safe zone and fight until one winner remains.
- [x] AI Cosmic Director triggers cosmic events cleanly during active matches.
- [x] Full headless match completes deterministically and outputs a valid `MatchResult` scoreboard.
