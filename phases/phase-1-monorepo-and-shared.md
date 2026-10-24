# Phase 1: Monorepo Scaffold & Shared Contracts (`packages/shared`)

**Status:** Pending  
**Command to execute:** `/run-phase 1`  
**Owner Agent:** `netcode-architect`

---

## 1. Objective
Set up the `npm` workspaces monorepo (`packages/shared`, `apps/server`, `apps/web`) and build the complete `@lss/shared` package containing all TypeScript data models, balance constants, and Socket.IO event contracts.

---

## 2. Files to Create in Phase 1
- `package.json` — Root workspace configuration (`packages/*`, `apps/*`) with `dev`, `build`, `typecheck`, and `test` scripts.
- `tsconfig.base.json` — Strict shared TypeScript compiler configuration.
- `.gitignore` — Ignore `node_modules`, `dist`, `.env*`, `.devin/*.local.*`.
- `packages/shared/package.json` — `@lss/shared` workspace package.
- `packages/shared/tsconfig.json` — TypeScript config for `@lss/shared`.
- `packages/shared/src/constants.ts` — Centralized gameplay balance config:
  - Arena dimensions (`2400 × 2400`), `TICK_RATE = 25` (`40 ms`)
  - Ship radius (`20`), max health (`100`), speed, acceleration, drag, spawn shield (`2500 ms`)
  - Weapon cooldown (`280 ms` base, `140 ms` Rapid Fire), projectile speed, damage (`20`), lifetime (`1200 ms`)
  - Safe-zone shrink stages, warnings, and storm DPS (`8 HP/sec`)
  - Asteroid count (`18`), radius range (`28–55`), health, and pickup drop probabilities
  - Upgrade durations (`SHIELD`, `RAPID_FIRE`, `REPAIR`, `ENERGY`)
  - AI Cosmic Director timings (`METEOR_SHOWER`, `SOLAR_SURGE`, `SUPPLY_DROP`)
  - Neon color palette for ships, projectiles, and UI
- `packages/shared/src/types.ts` — Shared interfaces (`PlayerState`, `ProjectileState`, `AsteroidState`, `PickupState`, `SafeZoneState`, `CosmicEventState`, `KillFeedEntry`, `GameSnapshot`, `MatchResult`, `PlayerInput`, `RoomInfo`).
- `packages/shared/src/events.ts` — Strictly typed Socket.IO `ClientToServerEvents` and `ServerToClientEvents`.
- `packages/shared/src/index.ts` — Barrel export for all shared contracts.
- `packages/shared/src/__tests__/contracts.test.ts` — Phase 1 unit test verifying constants, shrink schedules, and contract invariants.

---

## 3. How You Can Test After Phase 1

After Phase 1 finishes, you can immediately verify that the monorepo and shared contracts work by running:

```bash
# 1. Verify TypeScript compilation
npm run typecheck --workspace=@lss/shared

# 2. Run Phase 1 contract & balance sanity tests
npm test --workspace=@lss/shared
```

### Phase 1 Exit Criteria (Definition of Done)
- [ ] `npm install` completes with zero errors.
- [ ] `npm run typecheck --workspace=@lss/shared` passes with zero errors.
- [ ] `npm test --workspace=@lss/shared` passes all shared contract and balance validation tests.
