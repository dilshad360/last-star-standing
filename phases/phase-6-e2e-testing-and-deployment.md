# Phase 6: End-to-End Verification, Multi-Client Integration & Deployment Blueprints

**Status:** Completed  
**Command to execute:** `/run-phase 6`  
**Owner Agent:** `qa-verifier`

---

## 1. Objective
Run end-to-end multi-client Socket.IO integration tests, audit every acceptance criterion in Section 16 & Section 18 of `last_star_standing_project_brief.md`, generate free-tier cloud deployment blueprints (`render.yaml` for the WebSocket server + static frontend config), and write a comprehensive `README.md` with judge demo instructions.

---

## 2. Files to Create in Phase 6
- `apps/server/src/__tests__/e2e-match.test.ts` — Multi-client Socket.IO integration test that connects real `socket.io-client` instances, creates/joins a room, starts a match with bots, sends combat inputs, verifies `game:snapshot` broadcasts, triggers match completion (`match:finished`), and restarts into a second match (`match:restart`).
- `render.yaml` — Render blueprint for deploying the `@lss/server` Node.js WebSocket service.
- `apps/web/.env.example` & `apps/server/.env.example` — Documented environment variables (`VITE_SERVER_URL`, `PORT`, `CORS_ORIGIN`).
- `README.md` — Project overview, architecture diagram, local quickstart, phase testing commands, cloud deployment steps, and the 2-minute hackathon judge demo script.

---

## 3. How You Can Test After Phase 6

After Phase 6 finishes, you can run the complete automated audit and play the finished MVP:

```bash
# 1. Run all unit, simulation, and multi-client E2E tests
npm test

# 2. Run full workspace typecheck and production build
npm run typecheck && npm run build

# 3. Or run the Devin MVP auditor skill:
# /audit-mvp
```

### Phase 6 Exit Criteria (Definition of Done)
- [x] All unit, simulation, and multi-client Socket.IO E2E tests pass (`npm test`).
- [x] Production build (`npm run build`) succeeds for `@lss/shared`, `@lss/server`, and `@lss/web`.
- [x] All Section 16 Functional, Technical, and Demo Quality criteria in `last_star_standing_project_brief.md` are verified.
- [x] Live Browser Preview is running and ready for gameplay testing.
