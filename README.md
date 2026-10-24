# Last Star Standing 🚀⚡

> **A fast-paced, browser-based 2D multiplayer space battle royale built with Node.js, Socket.IO, React, Phaser 3, and the Web Audio API.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Phaser 3](https://img.shields.io/badge/Phaser-3.70-yellow.svg)](https://phaser.io/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-black.svg)](https://socket.io/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF.svg)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0-green.svg)](https://vitest.dev/)

---

## 🌌 Overview

**Last Star Standing** is a party game for one big screen and up to 8 phones. The host opens the game on a TV or laptop and creates a room. Everyone scans the QR code and flies their own ship using their phone as a controller (virtual joystick or tilt). It's a free-for-all: destroyed ships respawn after 3 seconds, and whoever has the most kills when the 3-minute timer ends wins.

### Key Architectural Highlights
- **Host screen + phone controllers:** The big screen renders the Phaser arena and is not a ship. Phones only send input and receive a small status update (health, kills, rank, respawn timer) plus vibration cues. Phaser never runs on a phone.
- **Server Authority:** The Node.js server runs a strict 25 Hz (`40 ms`) simulation loop in memory. Phones only send sanitized input intents (`input:update`, analog `moveX`/`moveY`).
- **Reconnect-friendly:** Phones get a player token, so a locked screen or a Wi-Fi blip reclaims the same ship within 60 s. The host screen can resume its room within 30 s.
- **100% Procedural Audio & Visuals:** No external image or audio files. Neon vector ships and Web Audio synthesized effects.
- **Optional AI Bot Pilots (`BotController`):** The host can add 0-7 bots to fill empty slots or to play solo.

---

## 🏗️ Monorepo Structure

```
DevinHacks/
├── packages/
│   └── shared/          # @lss/shared: Pure TypeScript contracts (types, events, constants)
├── apps/
│   ├── server/          # @lss/server: Express + Socket.IO 25 Hz authoritative game server
│   └── web/             # @lss/web: Vite + React + Phaser 3 client with Web Audio synth
├── phases/              # Original single-device build blueprints (historical)
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

# Run all unit tests, simulation tests, and Socket.IO room tests
npm test

# Verify production build
npm run build
```

### 3. Start Development Servers
```bash
npm run dev          # http://localhost:5173
npm run dev:https    # https://<your-LAN-IP>:5173 (needed for tilt + keep-awake on phones)
```
- **Host screen:** open the web client on the TV/laptop, ideally via its LAN IP so the QR code works for phones.
- **Phone controller:** `/play?room=CODE` (this is what the QR code opens).
- **Game Server:** http://localhost:3001 (Health check: http://localhost:3001/health)

Phones only allow tilt (`DeviceOrientation`) and the Screen Wake Lock on HTTPS pages. `npm run dev:https` uses a self-signed certificate, so accept the browser warning once on each phone.

---

## 🎮 Phone Controls

| Action | Phone |
| :--- | :--- |
| **Fly** | Left joystick: the ship turns toward where you push and thrusts harder the further you push |
| **Tilt steering** | Tap **Tilt** and tilt the phone in the direction you want to fly. **Recenter** sets the current pose as neutral |
| **Fire** | Big red button (hold) |
| **Boost** | Amber button (hold) |

---

## ⏱️ 2-Minute Demo Script

1. Run `npm run dev:https` and open `https://<LAN-IP>:5173` on the laptop/TV. Click **HOST A GAME**.
2. Scan the QR code with 2 or more phones, enter names, and tap **JOIN GAME**. Each phone shows its ship color.
3. Optionally add AI pilots, then click **START MATCH** on the big screen.
4. Fly with the joystick or switch to tilt. Shoot asteroids for pickups (`SHIELD`, `RAPID_FIRE`, `REPAIR`, `ENERGY`, `TRIPLE_SHOT`, `EMP_BLAST`).
5. When the timer ends, the big screen shows the scoreboard and each phone shows its placement. **PLAY AGAIN** starts the next round.

---

## ☁️ Cloud Deployment (Render)

Deploy both the backend Socket.IO server and static web frontend using the included `render.yaml`:

1. Fork or push this repository to GitHub.
2. Log in to [Render.com](https://render.com) and click **New → Blueprint**.
3. Select your repository — Render automatically provisions:
   - `last-star-standing-server` (Node.js Web Service on port `10000`)
   - `last-star-standing-web` (Static Site built from `apps/web/dist`)
4. Done! Your party game is live with WebSockets and SSL enabled.

---

## 🛡️ License

MIT License. Designed and built with ❤️ for DevinHacks.
