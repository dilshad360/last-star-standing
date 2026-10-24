# Last Star Standing 🚀⚡

> **A fast-paced, browser-based 2D multiplayer space battle royale built with Node.js, Socket.IO, React, Phaser 3, and the Web Audio API.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Phaser 3](https://img.shields.io/badge/Phaser-3.70-yellow.svg)](https://phaser.io/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-black.svg)](https://socket.io/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF.svg)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0-green.svg)](https://vitest.dev/)

---

## 🌌 Overview

**Last Star Standing** is an authoritative, zero-asset-dependency multiplayer space battle royale. Up to 8 pilots battle across a hazardous 2400×2400 arena featuring procedural asteroids, plasma pickups, dynamic safe-zone storm shrinking, autonomous AI bot pilots, and periodic cosmic anomalies (*Meteor Showers*, *Solar Surges*, and *Supply Drops*).

### Key Architectural Highlights
- **100% Procedural Audio & Visuals:** Zero external image or audio files. Procedural neon vector starships with dual dynamic exhaust flames, world-space trailing wake ribbons, and Web Audio API synthesized sound effects.
- **Server Authority:** The Node.js server runs a strict 25 Hz (`40 ms`) simulation loop in memory. Clients only send sanitized input intents (`input:update`).
- **React ↔ Phaser Decoupling:** Phaser 3 renders the 60 fps canvas with snapshot interpolation and shortest-arc angle wrapping, while React renders the HUD and screens via a typed EventBus.
- **Instant Mobile & Judge Onboarding:** Inline SVG QR code and 4-character room codes (`?room=CODE` auto-join link) for instant mobile scanning and testing.
- **Autonomous AI Bot Pilots (`BotController`):** Autonomous AI ships that seek safe zones, collect pickups, dodge boundaries, and engage enemies so games can start instantly with any number of players.

---

## 🏗️ Monorepo Structure

```
DevinHacks/
├── packages/
│   └── shared/          # @lss/shared: Pure TypeScript contracts (types, events, constants)
├── apps/
│   ├── server/          # @lss/server: Express + Socket.IO 25 Hz authoritative game server
│   └── web/             # @lss/web: Vite + React + Phaser 3 client with Web Audio synth
├── phases/              # Step-by-step phased development blueprints (Phases 1-6)
├── render.yaml          # Free-tier cloud deployment blueprint (Render Web Service + Static Site)
└── package.json         # Workspaces root
```

---

## ⚡ Quickstart

### Prerequisites
- Node.js `18+` or `20+`
- npm `9+`

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Typecheck & Tests
```bash
# Typecheck all workspaces (@lss/shared, @lss/server, @lss/web)
npm run typecheck

# Run all unit tests, simulation tests, and Socket.IO E2E tests (52+ tests)
npm test

# Verify production build
npm run build
```

### 3. Start Development Servers
```bash
npm run dev
```
- **Web Client:** http://localhost:5173
- **Game Server:** http://localhost:3001 (Health check: http://localhost:3001/health)

---

## 🎮 Flight Controls

| Action | Desktop / Laptop | Mobile / Touchscreen |
| :--- | :--- | :--- |
| **Thrust Forward** | `W` or `Up Arrow` | Left-side Virtual Joystick (drag up) |
| **Strafe / Turn** | `A` / `D` or `◀` / `▶` | Left-side Virtual Joystick (drag horizontal) |
| **Decelerate / Reverse** | `S` or `Down Arrow` | Left-side Virtual Joystick (drag down) |
| **Aim Direction** | Mouse Cursor (World Space) | Ship Facing Heading |
| **Fire Laser Cannons** | `Left Click` or `Space` | Right-side Screen Touch |
| **Audio Mute Toggle** | `M` Key or HUD button | HUD Audio button |
| **Spectate Switch** | `A` (Prev) / `D` (Next) | `◀ PREV` / `NEXT ▶` buttons |

---

## ⏱️ 2-Minute Hackathon Judge Demo Script

1. **Launch Game:** Run `npm run dev` and open `http://localhost:5173`.
2. **Instant Quick Play:** Enter your callsign (e.g. `Maverick`) and click **QUICK PLAY (5 BOTS)**.
3. **Combat Flight:**
   - Use `WASD` to accelerate and observe the **twin animated rocket exhaust flames** and **glowing plasma wake trails** curving behind your ship.
   - Aim with the mouse and press `Space` or `Left Click` to fire glowing laser bolts.
   - Shatter floating asteroids to collect glowing upgrade pods (`SHIELD`, `RAPID_FIRE`, `REPAIR`, `ENERGY`).
4. **Multiplayer Lobby & QR Code:**
   - Open a second browser tab (or mobile device) at `http://localhost:5173`.
   - In Tab 1, click **Create Room**. Scan the inline SVG QR code or copy the share link into Tab 2.
   - Notice Tab 2 connects to the same room code instantly.
   - Adjust the **AI Bot Pilots slider** (`0–7` bots), click **Ready**, and watch the 3-2-1 countdown launch both players into the arena simultaneously.
5. **Safe Zone & Victory:**
   - Observe the safe-zone storm perimeter shrinking with glowing hazard rings and screen-edge alerts.
   - Battle until one pilot survives to see the **Winner Scoreboard** with placement ranks, kills, damage dealt, and the **Play Again** instant rematch button.

---

## ☁️ Cloud Deployment (Render)

Deploy both the backend Socket.IO server and static web frontend using the included `render.yaml`:

1. Fork or push this repository to GitHub.
2. Log in to [Render.com](https://render.com) and click **New → Blueprint**.
3. Select your repository — Render automatically provisions:
   - `last-star-standing-server` (Node.js Web Service on port `10000`)
   - `last-star-standing-web` (Static Site built from `apps/web/dist`)
4. Done! Your multiplayer battle royale is live with WebSockets and SSL enabled.

---

## 🛡️ License

MIT License. Designed and built with ❤️ for DevinHacks.
