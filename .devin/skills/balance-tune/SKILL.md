---
name: balance-tune
description: Inspect and tune gameplay balance parameters in packages/shared/src/constants.ts
argument-hint: "[preset: fast-demo | standard | chaotic]"
allowed-tools:
  - read
  - edit
  - grep
  - glob
  - exec
---

Review and tune the centralized gameplay balance configuration in `packages/shared/src/constants.ts`:

1. Read `packages/shared/src/constants.ts` and display a summary table of current values:
   - Arena size (`ARENA_WIDTH`, `ARENA_HEIGHT`)
   - Ship health (`PLAYER_MAX_HEALTH`), speed (`PLAYER_SPEED`), spawn shield (`SPAWN_SHIELD_MS`)
   - Weapon damage (`PROJECTILE_DAMAGE`), cooldown (`FIRE_COOLDOWN_MS`, `RAPID_FIRE_COOLDOWN_MS`), projectile speed & lifetime
   - Safe-zone shrink delay, stage durations, and storm DPS (`STORM_DAMAGE_PER_SEC`)
   - Asteroid count, HP, and pickup drop probabilities
   - AI Cosmic Director event interval and duration
2. Apply the user's requested balance adjustments (or preset such as `fast-demo` for a 90-second judge pitch match).
3. Run `npm run typecheck` and `npm test` to confirm all workspaces remain valid with the updated balance parameters.
