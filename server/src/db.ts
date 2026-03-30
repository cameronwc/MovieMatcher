import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = process.env.DB_PATH || './data/moviematcher.db';

// Ensure the directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db: DatabaseType = new Database(dbPath);

export function initDb(): void {
  // Enable WAL mode for better concurrent reads
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      created_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      joined_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'plex' CHECK(source IN ('plex', 'emby')),
      source_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('movie', 'show')),
      title TEXT NOT NULL,
      year INTEGER,
      summary TEXT,
      poster_url TEXT,
      rating REAL,
      genre TEXT,
      duration INTEGER,
      content_rating TEXT,
      episode_count INTEGER,
      last_synced_at DATETIME NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source, source_id)
    );

    CREATE TABLE IF NOT EXISTS swipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES room_members(id) ON DELETE CASCADE,
      media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK(direction IN ('right', 'left')),
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      UNIQUE(room_id, member_id, media_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      matched_at DATETIME NOT NULL DEFAULT (datetime('now')),
      watched INTEGER NOT NULL DEFAULT 0,
      watched_at DATETIME,
      UNIQUE(room_id, media_id)
    );

    CREATE TABLE IF NOT EXISTS room_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      batch_number INTEGER NOT NULL,
      UNIQUE(room_id, media_id)
    );

    CREATE TABLE IF NOT EXISTS media_server_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      server_type TEXT NOT NULL CHECK(server_type IN ('plex', 'emby')),
      auth_token TEXT NOT NULL,
      server_name TEXT,
      server_url TEXT NOT NULL,
      machine_id TEXT,
      user_id TEXT,
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
    CREATE INDEX IF NOT EXISTS idx_room_members_session_token ON room_members(session_token);
    CREATE INDEX IF NOT EXISTS idx_swipes_room_member ON swipes(room_id, member_id);
    CREATE INDEX IF NOT EXISTS idx_swipes_room_media ON swipes(room_id, media_id);
    CREATE INDEX IF NOT EXISTS idx_matches_room_id ON matches(room_id);
    CREATE INDEX IF NOT EXISTS idx_room_media_room_id ON room_media(room_id);
    CREATE INDEX IF NOT EXISTS idx_media_source_id ON media(source, source_id);
  `);

  // Migration: move data from old plex_config and media tables if they exist
  migrateFromLegacySchema();
}

function migrateFromLegacySchema(): void {
  // Check if old plex_config table exists and has data
  const hasPlexConfig = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='plex_config'"
  ).get();

  if (hasPlexConfig) {
    const oldConfig = db.prepare('SELECT * FROM plex_config WHERE id = 1').get() as {
      auth_token: string; server_name: string | null; server_url: string; machine_id: string | null;
    } | undefined;

    if (oldConfig) {
      // Migrate to new table
      db.prepare(`
        INSERT OR IGNORE INTO media_server_config (id, server_type, auth_token, server_name, server_url, machine_id, updated_at)
        VALUES (1, 'plex', ?, ?, ?, ?, datetime('now'))
      `).run(oldConfig.auth_token, oldConfig.server_name, oldConfig.server_url, oldConfig.machine_id);
    }
  }

  // Check if media table has old plex_rating_key column and migrate data
  const columns = db.prepare("PRAGMA table_info(media)").all() as Array<{ name: string }>;
  const hasPlexRatingKey = columns.some(c => c.name === 'plex_rating_key');
  const hasSourceId = columns.some(c => c.name === 'source_id');

  if (hasPlexRatingKey && !hasSourceId) {
    // Old schema: rename column and add source
    db.exec(`
      ALTER TABLE media RENAME COLUMN plex_rating_key TO source_id;
      ALTER TABLE media ADD COLUMN source TEXT NOT NULL DEFAULT 'plex' CHECK(source IN ('plex', 'emby'));
    `);
  }
}

export { db };
