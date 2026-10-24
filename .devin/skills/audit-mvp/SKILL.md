---
name: audit-mvp
description: Audit Last Star Standing against all Section 16 Acceptance Criteria and Section 18 Security checks in the project brief
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

Perform a comprehensive MVP readiness audit against `last_star_standing_project_brief.md`:

1. **Build & Type Safety Check:**
   - Run `npm run typecheck`
   - Run `npm test`
   - Run `npm run build`
2. **Functional Checklist (Section 16):**
   - Landing screen, Quick Play, Create/Join Room, `?room=CODE` deep-link, and inline SVG QR code
   - Multi-client movement synchronization and snapshot interpolation
   - Server-validated projectile hits, asteroid destruction, pickup buffs (`SHIELD`, `RAPID_FIRE`, `REPAIR`, `ENERGY`), and eliminations
   - Shrinking safe-zone ring and outside-zone storm damage
   - AI Bot Pilots (`0–7`) and AI Cosmic Director events
   - Winner determination, match statistics leaderboard, and instant rematch (`match:restart`) without page reload
3. **Security & Authority Checklist (Section 18):**
   - Confirm clients cannot spoof damage, kills, pickups, or winners
   - Confirm server-side rate limits on firing and movement speed
   - Confirm display name sanitization and room capacity limits
4. Output a structured Pass/Fail report with file references for every criterion.
