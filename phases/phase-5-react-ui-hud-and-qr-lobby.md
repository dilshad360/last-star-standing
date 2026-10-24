# Phase 5: React UI Shell, Instant QR Lobby, Live HUD, Spectator & Winner Screens (`apps/web`)

**Status:** Pending  
**Command to execute:** `/run-phase 5`  
**Owner Agent:** `phaser-renderer`

---

## 1. Objective
Build the complete neon space React UI layer over the Phaser 3 canvas: Landing Screen (`?room=CODE` support + Quick Play), Lobby Screen with **inline SVG QR Code** and AI Bot selector, Live Gameplay HUD (health/shield bars, active upgrade timers, kill feed, mini-radar, storm/cosmic alerts), Eliminated Spectator Overlay, Winner Scoreboard Screen, and Reconnection status banner.

---

## 2. Files to Create in Phase 5
- `apps/web/src/styles/index.css` — Neon space arcade theme, glassmorphism cards, glowing borders, HUD animations, and responsive mobile layout.
- `apps/web/src/components/LandingScreen.tsx`:
  - Neon title logo, pilot display name input, **Quick Play (Instant Arena with Bots)**, **Create Room**, **Join Room by Code** (auto-filled when visiting `?room=XXXX`), Controls cheat-sheet, and Sound toggle.
- `apps/web/src/components/LobbyScreen.tsx`:
  - Large 4-character Room Code badge, **Inline SVG QR Code** for instant mobile/judge scanning, **Copy Share Link** button, connected pilot list with Ready badges, Host **AI Bot Count selector (`0–7` bots)**, and **Launch Match** button + 3-2-1 countdown overlay.
- `apps/web/src/components/HudOverlay.tsx`:
  - Top bar: Alive Ships counter, Match Timer, Safe-Zone shrink countdown / **OUTSIDE SAFE ZONE — TAKING STORM DAMAGE** flashing alert, and **AI Cosmic Director Event banner** (*Meteor Shower*, *Solar Surge*, *Supply Drop*).
  - Top-right: Live **Kill Feed** (`Pilot A ⚡ Pilot B`) and latency/mute badges.
  - Bottom-left: Local Ship **Health Bar**, **Shield Bar**, and active **Upgrade Timers** (`SHIELD`, `RAPID_FIRE`, `SOLAR_SURGE`).
  - Bottom-right: Real-time **Mini-Radar Map** showing arena bounds, safe-zone circle, local player, enemies, and supply drops.
- `apps/web/src/components/EliminatedOverlay.tsx`:
  - Placement badge (`#3 / 6`), eliminated-by callout, **Spectate Next / Previous Pilot** camera switcher, and **Return to Lobby** button.
- `apps/web/src/components/WinnerScreen.tsx`:
  - Champion spotlight banner (`LAST STAR STANDING: <WINNER>`), full match statistics table (`Rank`, `Pilot`, `Kills`, `Damage Dealt`, `Survival Time`), and **Play Again (Instant Rematch)** button.
- `apps/web/src/components/ConnectionBanner.tsx` — Connection/reconnecting status toast and error modal.
- `apps/web/src/App.tsx` — Root state orchestrator connecting `SocketClient`, `EventBus`, and UI screens.

---

## 3. How You Can Test After Phase 5

After Phase 5 finishes, the **entire game loop is playable from start to finish** in your browser across multiple tabs or devices:

```bash
# 1. Verify full production build
npm run build

# 2. Launch dev servers and test in multiple browser tabs
npm run dev
```

### Interactive Test Steps After Phase 5
1. Open `http://localhost:5173` in **Tab 1**, enter your name, and click **Create Room** (or **Quick Play**).
2. Copy the `?room=CODE` share link (or scan the QR code) and open it in **Tab 2** — confirm Tab 2 auto-fills the room code and joins the same lobby.
3. Adjust the **AI Bot Pilots** slider (`e.g., 4 bots`), click **Ready / Launch Match**, and play through the 3-2-1 countdown.
4. Verify HUD health/shield bars, mini-radar, kill feed, storm warning, spectator mode when eliminated, the **Winner Screen**, and clicking **Play Again** without reloading the page.
