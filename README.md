# MovieMatcher

A mobile-first web app for groups to swipe on movies and TV shows from a shared Plex library. When everyone in a room swipes right on the same title, it becomes a match and lands on a shared "To Watch" list.

## Features

- **Room-based** — Create or join rooms with custom or auto-generated codes
- **Plex OAuth** — Sign in with your Plex account, server auto-discovered
- **Tinder-style swiping** — Swipe right to want, left to pass with stacked card UI
- **Real-time matches** — Instant "It's a Match!" notifications via WebSocket
- **To Watch list** — Track matched movies and mark them as watched
- **Smart filtering** — Only shows media rated 5/10 or higher, in random batches of 50
- **Batch preloading** — Loads 20 cards at a time for snappy transitions
- **Mobile-first** — Designed for phones with touch gestures, capped at 480px on desktop
- **Movie & TV show support** — Clear badges distinguish content type
- **Trailer links** — YouTube trailer search in the details panel
- **Admin panel** — View all rooms and watch lists at `/admin`
- **Docker ready** — Single container, multi-arch (amd64 + arm64)

## Quick Start (Docker)

```bash
docker run -d \
  --name moviematcher \
  -p 3000:3000 \
  -e ADMIN_PASSWORD=your-secure-password \
  -v /path/to/data:/app/data \
  cameronwc/moviematcher:latest
```

Open `http://localhost:3000`, click "Sign in with Plex" to connect your server, then create a room and start swiping.

## Unraid Setup

1. In the Unraid Docker UI, add a new container:
   - **Repository:** `cameronwc/moviematcher:latest`
   - **Network Type:** Bridge
   - **Port Mapping:** Container port `3000` → Host port of your choice
2. Add environment variables:
   - `ADMIN_PASSWORD` — **Required.** Password for the admin panel at `/admin`
   - `PLEX_URL` — **Recommended.** Your local Plex URL (e.g., `http://192.168.1.100:32400`). The OAuth flow discovers an external HTTPS URL which may not be reachable from inside the container — setting this overrides it with your local address.
3. Add a volume mapping:
   - Container path: `/app/data`
   - Host path: `/mnt/user/appdata/moviematcher`
4. Start the container and navigate to the host IP + port
5. Click "Sign in with Plex" to authenticate
6. Create a room, share the code, and start swiping!

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_PASSWORD` | **Yes** | `password` | Password for the admin panel (`/admin`). **Change this!** |
| `PLEX_URL` | Recommended | — | Local Plex server URL. Overrides the OAuth-discovered URL which may not work from inside Docker. |
| `PORT` | No | `3000` | Server port |
| `DB_PATH` | No | `/app/data/moviematcher.db` | SQLite database file path |
| `PLEX_TOKEN` | No | — | Plex API token (overrides OAuth token if set) |
| `SECURE_COOKIES` | No | `false` | Set to `true` if serving over HTTPS directly (not needed behind a reverse proxy) |

## How It Works

1. **Connect Plex** — Sign in with your Plex account on the landing page. Your server is auto-discovered.
2. **Create a Room** — Pick a nickname and optional custom room code (or get a random one).
3. **Share the Code** — Give the room code to your group. They join on their own device.
4. **Swipe** — Swipe right on movies/shows you'd watch, left to pass. Tap the poster for details, trailer link, and more info.
5. **Match** — When everyone in the room swipes right on the same title, it's a match! A notification pops up in real-time.
6. **Watch List** — All matches appear in the Matches tab. Mark them as watched when you're done.
7. **Load More** — When you've gone through a batch, tap "Load More" to pull another random set from Plex.

## Reverse Proxy (Nginx Proxy Manager)

If using Nginx Proxy Manager:
- Forward to `http://<unraid-ip>:<host-port>`
- Enable **WebSockets Support**
- SSL works fine — cookies use `sameSite: lax` and don't require the `secure` flag unless you set `SECURE_COOKIES=true`

## Admin Panel

Navigate to `/admin` and log in with your `ADMIN_PASSWORD`. The admin panel shows:
- All rooms with member counts
- Watch lists for each room (matched movies/shows with watched status)

## Local Development

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Run server (from server/)
npm run dev

# Run client (from client/, in another terminal)
npm run dev

# Lint
cd server && npm run lint
cd client && npm run lint

# Test
cd server && npm test
```

## Tech Stack

- **Backend:** Node.js, Express, TypeScript, SQLite (better-sqlite3), Socket.IO
- **Frontend:** React, Vite, TypeScript, react-tinder-card, Socket.IO client
- **Testing:** Vitest, Supertest
- **Linting:** ESLint with TypeScript and React Hooks plugins
- **CI/CD:** GitHub Actions — lint, test, build multi-arch Docker image on merge to main
- **Deployment:** Docker (single container), node:20-alpine, multi-arch (amd64 + arm64)

## Security

- Session auth via httpOnly cookies with 30-day expiry
- Plex tokens never exposed to clients (poster images proxied server-side with SSRF protection)
- Admin panel password-protected with timing-safe comparison and rate limiting
- Socket.IO connections authenticated via session cookie
- Input validation on room codes and nicknames
- Crypto-secure room code generation
- Non-root Docker container with health checks
- Graceful shutdown (closes DB + HTTP on SIGTERM)
