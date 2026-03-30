# MovieMatcher

A mobile-first web app for groups to swipe on movies and TV shows from a shared Plex library. When everyone in a room swipes right on the same title, it becomes a match and lands on a shared "To Watch" list.

## Features

- **Room-based** — Create or join rooms with custom or auto-generated codes
- **Plex OAuth** — Sign in with your Plex account, server auto-discovered
- **Tinder-style swiping** — Swipe right to want, left to pass
- **Real-time matches** — Instant "It's a Match!" notifications via WebSocket
- **To Watch list** — Track matched movies and mark them as watched
- **Smart filtering** — Only shows media rated 5/10 or higher, in random batches of 50
- **Mobile-first** — Designed for phones with touch gestures
- **Admin panel** — View all rooms and watch lists at `/admin`
- **Trailer links** — YouTube trailer search in the details panel

## Quick Start (Docker)

```bash
docker build -t moviematcher .
docker run -d \
  --name moviematcher \
  -p 3000:3000 \
  -e ADMIN_PASSWORD=your-secure-password \
  -v /path/to/data:/app/data \
  moviematcher
```

Open `http://localhost:3000`, click "Sign in with Plex" to connect your server, then create a room and start swiping.

## Unraid Setup

1. Build the Docker image or pull from a registry:
   ```bash
   docker build -t moviematcher .
   ```
2. In the Unraid Docker UI, add a new container:
   - **Repository:** `moviematcher` (or your registry path)
   - **Network Type:** Bridge
   - **Port Mapping:** Container port `3000` → Host port of your choice
3. Add these environment variables:
   - `ADMIN_PASSWORD` — **Required.** Password for the admin panel at `/admin`
4. Add a volume mapping:
   - Container path: `/app/data`
   - Host path: `/mnt/user/appdata/moviematcher`
5. Start the container and navigate to the host IP + port
6. Click "Sign in with Plex" to authenticate and auto-discover your Plex server
7. Create a room, share the code, and start swiping!

**Note:** Plex connection is configured through the web UI via OAuth — no need to manually find your Plex URL or token. You can also set `PLEX_URL` and `PLEX_TOKEN` as environment variables if you prefer manual configuration.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_PASSWORD` | **Yes** | `password` | Password for the admin panel (`/admin`). **Change this!** |
| `PORT` | No | `3000` | Server port |
| `DB_PATH` | No | `/app/data/moviematcher.db` | SQLite database file path |
| `PLEX_URL` | No | — | Plex server URL (alternative to OAuth sign-in) |
| `PLEX_TOKEN` | No | — | Plex API token (alternative to OAuth sign-in) |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin (only needed for dev) |

## How It Works

1. **Connect Plex** — Sign in with your Plex account on the landing page. Your server is auto-discovered.
2. **Create a Room** — Pick a nickname and optional custom room code (or get a random one).
3. **Share the Code** — Give the room code to your group. They join on their own device.
4. **Swipe** — Swipe right on movies/shows you'd watch, left to pass. Cards show poster, title, year, rating, genres, and a trailer link.
5. **Match** — When everyone in the room swipes right on the same title, it's a match! A notification pops up in real-time.
6. **Watch List** — All matches appear in the Matches tab. Mark them as watched when you're done.

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

# Client dev server proxies API requests to localhost:3000
```

## Tech Stack

- **Backend:** Node.js, Express, TypeScript, SQLite (better-sqlite3), Socket.IO
- **Frontend:** React, Vite, TypeScript, react-tinder-card, Socket.IO client
- **Deployment:** Docker (single container), node:20-alpine

## Security

- Session auth via httpOnly cookies with expiry
- Plex tokens never exposed to clients (poster images proxied server-side)
- Admin panel password-protected
- Socket.IO connections authenticated
- Input validation on room codes and nicknames
- Non-root Docker container with health checks
