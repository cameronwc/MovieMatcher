# MovieMatcher

A mobile-first web app for groups to swipe on movies and TV shows from a shared Plex library. When everyone in a room swipes right on the same title, it becomes a match and lands on a shared "To Watch" list.

## Features

- **Room-based** — Create or join rooms with custom or auto-generated codes
- **Plex integration** — Pulls movies and TV shows from your Plex server
- **Tinder-style swiping** — Swipe right to want, left to pass
- **Real-time matches** — Instant "It's a Match!" notifications via WebSocket
- **To Watch list** — Track matched movies and mark them as watched
- **Smart filtering** — Only shows media rated 5/10 or higher, in random batches of 50
- **Mobile-first** — Designed for phones with touch gestures

## Quick Start (Docker)

```bash
docker build -t moviematcher .
docker run -d \
  --name moviematcher \
  -p 3000:3000 \
  -e PLEX_URL=http://your-plex-server:32400 \
  -e PLEX_TOKEN=your-plex-token \
  -v /path/to/data:/app/data \
  moviematcher
```

Open `http://localhost:3000` on your phone or browser.

## Unraid Setup

1. Build the image or add it from a registry
2. In the Unraid Docker UI, set these environment variables:
   - `PLEX_URL` — Your Plex server URL (e.g., `http://192.168.1.100:32400`)
   - `PLEX_TOKEN` — Your Plex API token
3. Map the volume `/app/data` to `/mnt/user/appdata/moviematcher`
4. Set the container port to `3000`

### Getting Your Plex Token

1. Sign in to Plex Web
2. Open any media item and click "Get Info" → "View XML"
3. The `X-Plex-Token` parameter in the URL is your token

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PLEX_URL` | Yes | — | Plex server URL |
| `PLEX_TOKEN` | Yes | — | Plex API token |
| `PORT` | No | `3000` | Server port |
| `DB_PATH` | No | `./data/moviematcher.db` | SQLite database path |

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
