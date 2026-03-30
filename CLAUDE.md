# MovieMatcher

## Project Overview
MovieMatcher is a mobile-first web app where groups swipe on movies/TV shows from a Plex library. Matches (everyone swipes right) go to a shared "To Watch" list. Self-hosted via Docker on Unraid.

## Architecture
Single Node.js monolith: Express server serves React frontend as static files + REST API + Socket.IO.

- **Server:** `server/src/` — TypeScript, Express, better-sqlite3, Socket.IO
- **Client:** `client/src/` — React, Vite, TypeScript, react-tinder-card
- **Database:** SQLite file at `DB_PATH` env var or `./data/moviematcher.db`
- **Docker:** Single container, multi-stage build, node:20-alpine, non-root user, multi-arch (amd64 + arm64)
- **CI/CD:** GitHub Actions deploys to `cameronwc/moviematcher` on Docker Hub on merge to main

## Key Commands
```bash
# Server
cd server && npm run dev      # Dev server with hot reload
cd server && npm run build    # TypeScript compile
cd server && npm run lint     # ESLint
cd server && npm test         # Vitest (38 tests)

# Client
cd client && npm run dev      # Vite dev server (proxies API to :3000)
cd client && npm run build    # Production build
cd client && npm run lint     # ESLint

# Docker
docker build -t moviematcher .
docker run -p 3000:3000 -e ADMIN_PASSWORD=changeme -v ./data:/app/data moviematcher

# Docker Hub (always increment version)
docker buildx build --platform linux/amd64,linux/arm64 -t cameronwc/moviematcher:latest -t cameronwc/moviematcher:<version> --push .
```

## Project Structure
```
server/src/
  index.ts              — Entry point, Express + Socket.IO + poster proxy + graceful shutdown
  db.ts                 — SQLite schema and connection (8 tables incl plex_config)
  types.ts              — Shared TypeScript interfaces
  middleware/auth.ts     — Session token cookie auth
  services/rooms.ts     — Room CRUD + membership + input validation
  services/plex.ts      — Plex API client (poster URLs proxied, tokens never exposed)
  services/plexAuth.ts  — Plex OAuth (PIN-based auth + server discovery)
  services/media.ts     — Media sync, swiping, match detection
  routes/rooms.ts       — Room API endpoints
  routes/media.ts       — Media/swipe/match API endpoints
  routes/plex.ts        — Plex OAuth endpoints (config-change routes protected)
  routes/admin.ts       — Admin panel API (password-protected, rate-limited)
  socket.ts             — Socket.IO event handlers (authenticated connections)

server/tests/
  rooms.test.ts         — 16 room API tests
  media.test.ts         — 22 media/swipe/match tests

client/src/
  App.tsx               — Router + layout + socket match popup + auth check
  api.ts                — Typed API client (auto-redirects on 401)
  socket.ts             — Socket.IO client
  pages/Landing.tsx     — Plex sign-in + create/join room
  pages/Swipe.tsx       — Card swiping with batch preloading (20 at a time)
  pages/Matches.tsx     — To Watch list with watched/unwatched tabs
  pages/Room.tsx        — Room info, members, refresh
  pages/Admin.tsx       — Admin panel (rooms + watch lists)
  components/SwipeCard.tsx  — Movie/TV card with poster, details, trailer link, type badge
  components/MatchPopup.tsx — "It's a Match!" overlay
  components/BottomNav.tsx  — Glass-morphism tab bar
```

## Environment Variables
- `ADMIN_PASSWORD` — Required for admin panel at /admin (rate-limited, timing-safe comparison)
- `PORT` — Server port (default: 3000)
- `DB_PATH` — SQLite path (default: ./data/moviematcher.db)
- `PLEX_URL` — Overrides OAuth-discovered Plex URL (recommended for Docker — use local URL)
- `PLEX_TOKEN` — Overrides OAuth token if set
- `SECURE_COOKIES` — Set to 'true' for HTTPS-only cookies (not needed behind reverse proxy)

## Conventions
- TypeScript everywhere, strict mode
- ES modules with .js import extensions in server code
- ESLint with typescript-eslint for both server and client
- Session auth via httpOnly cookies with maxAge expiry (30 days session, 1 day admin)
- Plex tokens never exposed to clients (poster images proxied server-side)
- Mobile-first CSS, dark theme, max-width 480px on desktop
- Input validation on server: room codes (2-20 alphanumeric), nicknames (max 30 chars)
- Fisher-Yates shuffle for random media selection
- Crypto-secure room code generation (crypto.randomInt)
- Always increment Docker version tags when pushing to Docker Hub

## Security Notes
- All SQL queries use parameterized statements (no injection risk)
- Poster images proxied through /api/media/poster with SSRF protection (validates /library/metadata/ prefix)
- Socket.IO connections require valid session cookie
- Plex config changes blocked once configured (admin can reset via /admin)
- Admin login: timing-safe password comparison + rate limiting (5 attempts / 15 min)
- Admin tokens stored in-memory (invalidated on server restart)
- Docker container runs as non-root user with health checks
- Graceful shutdown on SIGTERM/SIGINT (closes HTTP server + SQLite)
- NODE_TLS_REJECT_UNAUTHORIZED=0 in Docker for Plex plex.direct HTTPS certs

## Deployment Notes
- Docker image: `cameronwc/moviematcher` on Docker Hub
- Multi-arch: linux/amd64 + linux/arm64
- Hosted on Unraid behind Nginx Proxy Manager at moviematcher.coop.ninja
- PLEX_URL env var should point to local Plex (http://192.168.x.x:32400) — the OAuth-discovered HTTPS URL may not be reachable from inside the container
- GitHub Actions CI: lint → test → build+push Docker image on merge to main
- Requires DOCKERHUB_USERNAME and DOCKERHUB_TOKEN GitHub secrets for CI

## Design Spec
Full design document: `docs/superpowers/specs/2026-03-29-moviematcher-design.md`
