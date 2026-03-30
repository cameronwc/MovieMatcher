import { db } from '../db.js';
import { fetchLibrarySections, fetchLibraryItems, fetchItemMetadata } from './plex.js';
import { fetchEmbyLibraries, fetchEmbyLibraryItems, fetchEmbyItemMetadata } from './emby.js';
import { getMediaServerConfig } from './plexAuth.js';
import type { Media, Match, MatchWithMedia, MediaServerType } from '../types.js';

interface NormalizedMetadata {
  source: MediaServerType;
  source_id: string;
  type: 'movie' | 'show';
  title: string;
  year: number | null;
  summary: string | null;
  poster_url: string | null;
  rating: number | null;
  genre: string | null;
  duration: number | null;
  content_rating: string | null;
  episode_count: number | null;
}

/**
 * Fetch all library items from the configured media server.
 * Returns lightweight items with source_id + rating.
 */
async function fetchAllItems(): Promise<Array<{ sourceId: string; rating: number | null; type: string }>> {
  const config = getMediaServerConfig();
  if (!config) throw new Error('No media server configured.');

  const allItems: Array<{ sourceId: string; rating: number | null; type: string }> = [];

  if (config.server_type === 'plex') {
    const sections = await fetchLibrarySections();
    for (const section of sections) {
      const items = await fetchLibraryItems(section.key);
      allItems.push(
        ...items.map((item) => ({
          sourceId: item.ratingKey,
          rating: item.rating ?? null,
          type: item.type,
        }))
      );
    }
  } else {
    const libraries = await fetchEmbyLibraries();
    for (const lib of libraries) {
      const items = await fetchEmbyLibraryItems(lib.id);
      allItems.push(
        ...items.map((item) => ({
          sourceId: item.id,
          rating: item.rating ?? null,
          type: item.type,
        }))
      );
    }
  }

  return allItems;
}

/**
 * Fetch full metadata for a single item from the configured media server.
 */
async function fetchMetadata(sourceId: string): Promise<NormalizedMetadata> {
  const config = getMediaServerConfig();
  if (!config) throw new Error('No media server configured.');

  if (config.server_type === 'plex') {
    return fetchItemMetadata(sourceId);
  } else {
    return fetchEmbyItemMetadata(sourceId);
  }
}

/**
 * Orchestrates media sync for a room: fetches library, filters, picks 50,
 * fetches full metadata, upserts into media table, and associates with room.
 */
export async function syncMediaForRoom(roomId: number): Promise<number[]> {
  const config = getMediaServerConfig();
  if (!config) throw new Error('No media server configured.');

  // 1. Fetch all library items (lightweight)
  const allItems = await fetchAllItems();

  // 2. Filter to rating >= 5.0
  const filtered = allItems.filter((item) => item.rating != null && item.rating >= 5.0);

  // 3. Exclude media already swiped by ANY member in this room
  const swipedKeys = db
    .prepare(
      `SELECT DISTINCT m.source_id
       FROM swipes s
       JOIN media m ON m.id = s.media_id
       WHERE s.room_id = ?`
    )
    .all(roomId) as Array<{ source_id: string }>;

  const swipedKeySet = new Set(swipedKeys.map((r) => r.source_id));
  const available = filtered.filter((item) => !swipedKeySet.has(item.sourceId));

  // 4. Randomly pick 50 (Fisher-Yates shuffle)
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  const selected = available.slice(0, 50);

  if (selected.length === 0) {
    return [];
  }

  // 5. Fetch full metadata for those 50
  const metadataResults = await Promise.allSettled(
    selected.map((item) => fetchMetadata(item.sourceId))
  );

  const metadataList = metadataResults
    .filter((r): r is PromiseFulfilledResult<NormalizedMetadata> => r.status === 'fulfilled')
    .map((r) => r.value);

  // 6. Upsert into media table
  const upsertMedia = db.prepare(`
    INSERT INTO media (source, source_id, type, title, year, summary, poster_url, rating, genre, duration, content_rating, episode_count, last_synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(source, source_id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      year = excluded.year,
      summary = excluded.summary,
      poster_url = excluded.poster_url,
      rating = excluded.rating,
      genre = excluded.genre,
      duration = excluded.duration,
      content_rating = excluded.content_rating,
      episode_count = excluded.episode_count,
      last_synced_at = excluded.last_synced_at
  `);

  // Determine the next batch number for this room
  const maxBatch = db
    .prepare('SELECT COALESCE(MAX(batch_number), 0) as max_batch FROM room_media WHERE room_id = ?')
    .get(roomId) as { max_batch: number };
  const batchNumber = maxBatch.max_batch + 1;

  const insertRoomMedia = db.prepare(
    'INSERT OR IGNORE INTO room_media (room_id, media_id, batch_number) VALUES (?, ?, ?)'
  );

  const mediaIds: number[] = [];

  const txn = db.transaction(() => {
    for (const meta of metadataList) {
      upsertMedia.run(
        meta.source,
        meta.source_id,
        meta.type,
        meta.title,
        meta.year,
        meta.summary,
        meta.poster_url,
        meta.rating,
        meta.genre,
        meta.duration,
        meta.content_rating,
        meta.episode_count
      );

      const mediaRow = db
        .prepare('SELECT id FROM media WHERE source = ? AND source_id = ?')
        .get(meta.source, meta.source_id) as { id: number };

      insertRoomMedia.run(roomId, mediaRow.id, batchNumber);
      mediaIds.push(mediaRow.id);
    }
  });

  txn();

  return mediaIds;
}

/**
 * Get the next unswiped media item for a member in a room.
 */
export function getNextMedia(roomId: number, memberId: number): Media | null {
  const items = getNextMediaBatch(roomId, memberId, 1);
  return items[0] ?? null;
}

/**
 * Get the next N unswiped media items for a member in a room.
 */
export function getNextMediaBatch(roomId: number, memberId: number, count: number): Media[] {
  const items = db
    .prepare(
      `SELECT m.*
       FROM room_media rm
       JOIN media m ON m.id = rm.media_id
       WHERE rm.room_id = ?
         AND m.id NOT IN (
           SELECT s.media_id
           FROM swipes s
           WHERE s.room_id = ? AND s.member_id = ?
         )
       ORDER BY rm.batch_number ASC, rm.id ASC
       LIMIT ?`
    )
    .all(roomId, roomId, memberId, count) as Media[];

  return items;
}

/**
 * Record a swipe and check for a match.
 */
export function recordSwipe(
  roomId: number,
  memberId: number,
  mediaId: number,
  direction: string
): { match: MatchWithMedia | null } {
  db.prepare(
    `INSERT INTO swipes (room_id, member_id, media_id, direction)
     VALUES (?, ?, ?, ?)`
  ).run(roomId, memberId, mediaId, direction);

  // Only check for match if swiped right
  if (direction === 'right') {
    const match = checkForMatch(roomId, mediaId);
    return { match };
  }

  return { match: null };
}

/**
 * Check if ALL members in a room have swiped right on a media item.
 * If so, create a match record and return it.
 */
export function checkForMatch(roomId: number, mediaId: number): MatchWithMedia | null {
  // Count total members in the room
  const totalMembers = (
    db.prepare('SELECT COUNT(*) as count FROM room_members WHERE room_id = ?').get(roomId) as {
      count: number;
    }
  ).count;

  // Need at least 2 members for a match
  if (totalMembers < 2) {
    return null;
  }

  // Count members who swiped right on this media
  const rightSwipes = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM swipes
         WHERE room_id = ? AND media_id = ? AND direction = 'right'`
      )
      .get(roomId, mediaId) as { count: number }
  ).count;

  if (rightSwipes < totalMembers) {
    return null;
  }

  // Check if match already exists
  const existingMatch = db
    .prepare('SELECT * FROM matches WHERE room_id = ? AND media_id = ?')
    .get(roomId, mediaId) as Match | undefined;

  if (existingMatch) {
    const media = db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId) as Media;
    return { ...existingMatch, media };
  }

  // Create the match
  const result = db
    .prepare('INSERT INTO matches (room_id, media_id) VALUES (?, ?)')
    .run(roomId, mediaId);

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(result.lastInsertRowid) as Match;
  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId) as Media;

  return { ...match, media };
}

/**
 * Get matched media for a room, optionally filtering by watched status.
 */
export function getMatches(roomId: number, watched?: boolean): MatchWithMedia[] {
  let query = `
    SELECT matches.*, media.id as media_id,
           media.source, media.source_id, media.type, media.title, media.year,
           media.summary, media.poster_url, media.rating, media.genre,
           media.duration, media.content_rating, media.episode_count,
           media.last_synced_at
    FROM matches
    JOIN media ON media.id = matches.media_id
    WHERE matches.room_id = ?
  `;

  const params: (number | boolean)[] = [roomId];

  if (watched !== undefined) {
    query += ' AND matches.watched = ?';
    params.push(watched ? 1 : 0);
  }

  query += ' ORDER BY matches.matched_at DESC';

  const rows = db.prepare(query).all(...params) as Array<
    Match & {
      source: 'plex' | 'emby';
      source_id: string;
      type: 'movie' | 'show';
      title: string;
      year: number | null;
      summary: string | null;
      poster_url: string | null;
      rating: number | null;
      genre: string | null;
      duration: number | null;
      content_rating: string | null;
      episode_count: number | null;
      last_synced_at: string;
    }
  >;

  return rows.map((row) => ({
    id: row.id,
    room_id: row.room_id,
    media_id: row.media_id,
    matched_at: row.matched_at,
    watched: row.watched,
    watched_at: row.watched_at,
    media: {
      id: row.media_id,
      source: row.source,
      source_id: row.source_id,
      type: row.type,
      title: row.title,
      year: row.year,
      summary: row.summary,
      poster_url: row.poster_url,
      rating: row.rating,
      genre: row.genre,
      duration: row.duration,
      content_rating: row.content_rating,
      episode_count: row.episode_count,
      last_synced_at: row.last_synced_at,
    },
  }));
}

/**
 * Mark a match as watched.
 */
export function markWatched(matchId: number, roomId: number): Match | null {
  const match = db.prepare('SELECT * FROM matches WHERE id = ? AND room_id = ?').get(matchId, roomId) as Match | undefined;
  if (!match) return null;

  db.prepare(
    `UPDATE matches SET watched = 1, watched_at = datetime('now') WHERE id = ? AND room_id = ?`
  ).run(matchId, roomId);

  return db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as Match;
}
