# MovieMatcher

## Project Overview
MovieMatcher is a mobile-first web app where groups swipe on movies/TV shows from a Plex library. Matches (everyone swipes right) go to a shared "To Watch" list. Self-hosted via Docker on Unraid.

## Architecture
Single Node.js monolith: Express server serves React frontend as static files + REST API + Socket.IO.

- **Server:** `server/src/` — TypeScript, Express, better-sqlite3, Socket.IO
- **Client:** `client/src/` — React, Vite, TypeScript, react-tinder-card
- **Database:** SQLite file at `DB_PATH` env var or `./data/moviematcher.db`
- **Docker:** Single container, multi-stage build, node:20-alpine, non-root user

## Key Commands
```bash
# Server
cd server && npm run dev      # Dev server with hot reload
cd server && npm run build    # TypeScript compile

# Client
cd client && npm run dev      # Vite dev server (proxies API to :3000)
cd client && npm run build    # Production build

# Docker
docker build -t moviematcher .
docker run -p 3000:3000 -e ADMIN_PASSWORD=changeme -v ./data:/app/data moviematcher
```

## Project Structure
```
server/src/
  index.ts              — Entry point, Express + Socket.IO + poster proxy + graceful shutdown
  db.ts                 — SQLite schema and connection (7 tables)
  types.ts              — Shared TypeScript interfaces
  middleware/auth.ts     — Session token cookie auth
  services/rooms.ts     — Room CRUD + membership + input validation
  services/plex.ts      — Plex API client (poster URLs proxied, tokens never exposed)
  services/plexAuth.ts  — Plex OAuth (PIN-based auth + server discovery)
  services/media.ts     — Media sync, swiping, match detection
  routes/rooms.ts       — Room API endpoints
  routes/media.ts       — Media/swipe/match API endpoints
  routes/plex.ts        — Plex OAuth endpoints (config-change routes protected)
  routes/admin.ts       — Admin panel API (password-protected)
  socket.ts             — Socket.IO event handlers (authenticated connections)

client/src/
  App.tsx               — Router + layout + socket match popup
  api.ts                — Typed API client (auto-redirects on 401)
  socket.ts             — Socket.IO client
  pages/Landing.tsx     — Plex sign-in + create/join room
  pages/Swipe.tsx       — Card swiping with batch preloading
  pages/Matches.tsx     — To Watch list with watched/unwatched tabs
  pages/Room.tsx        — Room info, members, refresh
  pages/Admin.tsx       — Admin panel (rooms + watch lists)
  components/SwipeCard.tsx  — Movie/TV card with poster, details, trailer link
  components/MatchPopup.tsx — "It's a Match!" overlay
  components/BottomNav.tsx  — Glass-morphism tab bar
```

## Environment Variables
- `ADMIN_PASSWORD` — Required for admin panel at /admin
- `PORT` — Server port (default: 3000)
- `DB_PATH` — SQLite path (default: ./data/moviematcher.db)
- `PLEX_URL` / `PLEX_TOKEN` — Optional, alternative to OAuth sign-in
- `CORS_ORIGIN` — Allowed CORS origin (default: http://localhost:5173, dev only)

## Conventions
- TypeScript everywhere, strict mode
- ES modules with .js import extensions in server code
- Session auth via httpOnly cookies with maxAge expiry
- Plex tokens never exposed to clients (poster images proxied server-side)
- Mobile-first CSS, dark theme, max-width 480px on desktop
- Input validation on server: room codes (2-20 alphanumeric), nicknames (max 30 chars)
- Fisher-Yates shuffle for random media selection
- Crypto-secure room code generation

## Security Notes
- All SQL queries use parameterized statements (no injection risk)
- Poster images proxied through /api/media/poster (Plex token hidden)
- Socket.IO connections require valid session cookie
- Plex config changes blocked once configured (admin can reset via /admin)
- Admin tokens stored in-memory (invalidated on server restart)
- CORS locked to specific origin in production
- Docker container runs as non-root user

## Design Spec
Full design document: `docs/superpowers/specs/2026-03-29-moviematcher-design.md`
