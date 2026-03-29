# MovieMatcher — Design Spec

A mobile-first web app for groups to swipe on movies/TV shows from a shared Plex library. When everyone in a room swipes right on the same title, it becomes a match and lands on a shared "To Watch" list.

## Architecture

Single Node.js monolith serving everything from one Docker container:

- **Express** server with TypeScript
- **React** (Vite) frontend, built to static files and served by Express
- **SQLite** via `better-sqlite3` for persistence
- **Socket.IO** for real-time match notifications and room sync
- Plex URL + API token configured via environment variables

The server has three responsibilities:
1. REST API for rooms, swiping, and the to-watch list
2. WebSocket server for real-time match events
3. Static file server for the React frontend

Hosted on Unraid as a single Docker container.

## Rooms

- Room-based system where people with the same room code see the same media list
- Room codes can be custom (e.g., "MovieNight") or auto-generated
- No user accounts — members identified by a session token stored as an HTTP-only cookie
- Members provide a nickname when creating or joining a room
- A match requires **all** members in the room to swipe right
- Scalable to groups of any size, though initial use is 2 people

## Plex Integration

- Plex server URL and API token configured globally via environment variables (instance-level, not per-room)
- On room creation or manual refresh:
  1. Fetch the full Plex library index (just IDs and ratings — lightweight)
  2. Filter to items with a rating of 5/10 or higher
  3. Exclude anything already swiped by anyone in the room
  4. Randomly select 50 from the remaining pool
  5. Fetch full metadata (poster, summary, etc.) only for those 50
- When all 50 are swiped through, show "caught up" state with a refresh button to load another random batch
- Supports both movies and TV shows

## Data Model

### Rooms
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Primary key |
| `code` | TEXT | Unique, the join code (custom or generated) |
| `created_at` | DATETIME | |

### Room Members
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Primary key |
| `room_id` | INTEGER | FK → rooms |
| `nickname` | TEXT | Display name in the room |
| `session_token` | TEXT | Random token stored in browser cookie |
| `joined_at` | DATETIME | |

### Media (cached from Plex)
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Primary key |
| `plex_rating_key` | TEXT | Unique ID from Plex |
| `type` | TEXT | "movie" or "show" |
| `title` | TEXT | |
| `year` | INTEGER | |
| `summary` | TEXT | |
| `poster_url` | TEXT | |
| `rating` | REAL | |
| `genre` | TEXT | Comma-separated |
| `duration` | INTEGER | Minutes for movies |
| `content_rating` | TEXT | e.g., PG-13, TV-MA |
| `episode_count` | INTEGER | Nullable, for TV shows |
| `last_synced_at` | DATETIME | |

### Swipes
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Primary key |
| `room_id` | INTEGER | FK → rooms |
| `member_id` | INTEGER | FK → room_members |
| `media_id` | INTEGER | FK → media |
| `direction` | TEXT | "right" (want) or "left" (pass) |
| `created_at` | DATETIME | |

Unique constraint on `(room_id, member_id, media_id)` — one swipe per member per media item per room.

### Matches
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Primary key |
| `room_id` | INTEGER | FK → rooms |
| `media_id` | INTEGER | FK → media |
| `matched_at` | DATETIME | |
| `watched` | BOOLEAN | Default false |
| `watched_at` | DATETIME | Nullable |

## API Design

### REST Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/rooms` | Create room (body: `{ code?, nickname }`) — returns session token cookie |
| `GET` | `/api/rooms/:code` | Get room info + member count |
| `POST` | `/api/rooms/:code/join` | Join room (body: `{ nickname }`) — returns session token cookie |
| `GET` | `/api/rooms/:code/media/next` | Get next unswiped media item for this member |
| `POST` | `/api/rooms/:code/swipe` | Record swipe (body: `{ mediaId, direction }`) — returns match if one occurred |
| `GET` | `/api/rooms/:code/matches` | Get matched to-watch list |
| `PATCH` | `/api/rooms/:code/matches/:id` | Mark as watched |
| `POST` | `/api/rooms/:code/sync` | Trigger Plex library re-fetch for this room |

### WebSocket Events (Socket.IO)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `join-room` | Client → Server | Join a room's WebSocket channel |
| `match` | Server → Client | Notify all room members of a new match (includes media details) |
| `member-joined` | Server → Client | Someone new joined the room |
| `sync-complete` | Server → Client | Plex library refresh finished |

### Auth Flow

Session token set as an HTTP-only cookie when creating or joining a room. All subsequent requests identify the member via that cookie. No passwords, no accounts.

## Frontend Design

Mobile-first React app with 4 views and a bottom tab bar (Swipe, Matches, Room).

### 1. Landing Page
- Clean, centered layout with app title/branding
- "Create Room" button → enter optional custom code + nickname
- "Join Room" field → enter room code + nickname

### 2. Swipe View (main experience)
- Full-screen card stack, one card at a time
- Card shows: large poster image as background, title + year overlaid at bottom
- Scroll/tap to expand for: summary, genres, rating, duration/episode count, content rating
- Swipe right (or tap green button) = want to watch
- Swipe left (or tap red button) = pass
- "It's a match!" popup when all room members have swiped right on the same item
- Room code + member count indicator at top
- "Caught up" state when all items are swiped, with refresh button

### 3. Matches / To Watch List
- Grid or list of matched media with poster thumbnails
- Tap to expand details
- "Mark as watched" button on each item
- Filter tabs: "To Watch" / "Watched"

### 4. Room Info
- Room code (tap to copy/share)
- List of members in the room
- Refresh library button
- Leave room option

### Swipe Library
`react-tinder-card` for card swiping gestures.

### Visual Style
Clean, modern, dark theme. Mobile-first responsive design.

## Docker & Deployment

### Dockerfile
Multi-stage build:
- Stage 1: Build React frontend with Vite
- Stage 2: `node:20-alpine` running Express server, serving built static files + API + WebSocket

### Environment Variables
| Variable | Purpose | Example |
|----------|---------|---------|
| `PLEX_URL` | Plex server URL | `http://192.168.1.100:32400` |
| `PLEX_TOKEN` | Plex API token | `your-plex-token` |
| `PORT` | Server port (default 3000) | `3000` |

### Volume
- `/app/data` → SQLite database file. On Unraid, map to `/mnt/user/appdata/moviematcher`.

### Unraid Setup
1. Build or pull the container image
2. Add `PLEX_URL` and `PLEX_TOKEN` as environment variables in Unraid Docker UI
3. Map `/app/data` to a persistent Unraid path
4. Expose port 3000
