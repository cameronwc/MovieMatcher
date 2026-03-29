# MovieMatcher

## Project Overview
MovieMatcher is a mobile-first web app where groups swipe on movies/TV shows from a Plex library. Matches (everyone swipes right) go to a shared "To Watch" list.

## Architecture
Single Node.js monolith: Express server serves React frontend as static files + REST API + Socket.IO.

- **Server:** `server/src/` — TypeScript, Express, better-sqlite3, Socket.IO
- **Client:** `client/src/` — React, Vite, TypeScript, react-tinder-card
- **Database:** SQLite file at `DB_PATH` env var or `./data/moviematcher.db`
- **Docker:** Single container, multi-stage build, node:20-alpine

## Key Commands
```bash
# Server
cd server && npm run dev      # Dev server with hot reload
cd server && npm run build    # TypeScript compile
cd server && npm test         # Run tests

# Client
cd client && npm run dev      # Vite dev server (proxies API to :3000)
cd client && npm run build    # Production build

# Docker
docker build -t moviematcher .
docker run -p 3000:3000 -e PLEX_URL=... -e PLEX_TOKEN=... -v ./data:/app/data moviematcher
```

## Project Structure
```
server/src/
  index.ts          — Entry point, Express + Socket.IO setup
  db.ts             — SQLite schema and connection
  types.ts          — Shared TypeScript interfaces
  middleware/auth.ts — Session token cookie auth
  services/rooms.ts — Room CRUD + membership
  services/plex.ts  — Plex API client
  services/media.ts — Media sync, swiping, match detection
  routes/rooms.ts   — Room API endpoints
  routes/media.ts   — Media/swipe/match API endpoints
  socket.ts         — Socket.IO event handlers

client/src/
  App.tsx            — Router + layout
  api.ts             — Typed API client
  socket.ts          — Socket.IO client
  pages/Landing.tsx  — Create/join room
  pages/Swipe.tsx    — Card swiping
  pages/Matches.tsx  — To Watch list
  pages/Room.tsx     — Room info
  components/        — SwipeCard, MatchPopup, BottomNav
```

## Conventions
- TypeScript everywhere, strict mode
- ES modules with .js import extensions in server code
- Session auth via httpOnly cookies (no accounts)
- Mobile-first CSS, dark theme
- Plex credentials via environment variables, never in code

## Design Spec
Full design document: `docs/superpowers/specs/2026-03-29-moviematcher-design.md`
