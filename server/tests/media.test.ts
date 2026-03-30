import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Set up temp database BEFORE any app imports
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-media-test-'));
const testDbPath = path.join(tmpDir, 'test.db');
process.env.DB_PATH = testDbPath;
process.env.PORT = '0';

// Dynamic import so env vars are set first
const { app, httpServer } = await import('../src/index.js');
const { db } = await import('../src/db.js');
import request from 'supertest';

// Helper: insert test media directly into DB
function insertTestMedia(items: Array<{
  plex_rating_key: string;
  type: string;
  title: string;
  year?: number;
  rating?: number;
}>): number[] {
  const stmt = db.prepare(`
    INSERT INTO media (plex_rating_key, type, title, year, rating, last_synced_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  const ids: number[] = [];
  for (const item of items) {
    const result = stmt.run(
      item.plex_rating_key,
      item.type,
      item.title,
      item.year ?? null,
      item.rating ?? null
    );
    ids.push(result.lastInsertRowid as number);
  }
  return ids;
}

// Helper: associate media with a room
function associateMediaWithRoom(roomId: number, mediaIds: number[], batchNumber = 1): void {
  const stmt = db.prepare(
    'INSERT INTO room_media (room_id, media_id, batch_number) VALUES (?, ?, ?)'
  );
  for (const mediaId of mediaIds) {
    stmt.run(roomId, mediaId, batchNumber);
  }
}

// Helper: create a room and return room info + session cookie
async function createTestRoom(nickname: string, code?: string) {
  const body: Record<string, string> = { nickname };
  if (code) body.code = code;

  const res = await request(app)
    .post('/api/rooms')
    .send(body)
    .expect(201);

  const cookies = res.headers['set-cookie'];
  const cookieStr = Array.isArray(cookies) ? cookies[0] : cookies;
  const sessionCookie = cookieStr.split(';')[0];

  return {
    roomId: res.body.room.id as number,
    roomCode: res.body.room.code as string,
    memberId: res.body.member.id as number,
    sessionCookie,
  };
}

// Helper: join a room and return member info + session cookie
async function joinTestRoom(code: string, nickname: string) {
  const res = await request(app)
    .post(`/api/rooms/${code}/join`)
    .send({ nickname })
    .expect(200);

  const cookies = res.headers['set-cookie'];
  const cookieStr = Array.isArray(cookies) ? cookies[0] : cookies;
  const sessionCookie = cookieStr.split(';')[0];

  return {
    memberId: res.body.member.id as number,
    sessionCookie,
  };
}

afterAll(() => {
  httpServer.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe('GET /api/rooms/:code/media/next', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .get('/api/rooms/ANYCODE/media/next')
      .expect(401);

    expect(res.body.error).toBe('Authentication required');
  });

  it('returns null media when no media is loaded for the room', async () => {
    const { roomCode, sessionCookie } = await createTestRoom('Player1', 'EMPTY1');

    const res = await request(app)
      .get(`/api/rooms/${roomCode}/media/next`)
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(res.body.media).toBeNull();
    expect(res.body.caught_up).toBe(true);
  });

  it('returns next unswiped media item', async () => {
    const { roomId, roomCode, sessionCookie } = await createTestRoom('Swiper1', 'MEDIA1');

    const mediaIds = insertTestMedia([
      { plex_rating_key: 'rk-1001', type: 'movie', title: 'Test Movie 1', year: 2023, rating: 8.0 },
      { plex_rating_key: 'rk-1002', type: 'movie', title: 'Test Movie 2', year: 2024, rating: 7.5 },
    ]);
    associateMediaWithRoom(roomId, mediaIds);

    const res = await request(app)
      .get(`/api/rooms/${roomCode}/media/next`)
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(res.body.media).toBeDefined();
    expect(res.body.media.title).toBe('Test Movie 1');
    expect(res.body.caught_up).toBe(false);
  });

  it('returns a batch of media items with ?count=N', async () => {
    const { roomId, roomCode, sessionCookie } = await createTestRoom('Batcher', 'BATCH1');

    const mediaIds = insertTestMedia([
      { plex_rating_key: 'rk-batch-1', type: 'movie', title: 'Batch Movie 1' },
      { plex_rating_key: 'rk-batch-2', type: 'movie', title: 'Batch Movie 2' },
      { plex_rating_key: 'rk-batch-3', type: 'movie', title: 'Batch Movie 3' },
    ]);
    associateMediaWithRoom(roomId, mediaIds);

    const res = await request(app)
      .get(`/api/rooms/${roomCode}/media/next?count=5`)
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(res.body.media).toHaveLength(3);
    expect(res.body.caught_up).toBe(false);
  });

  it('returns 403 when accessing another room', async () => {
    const { sessionCookie } = await createTestRoom('RoomA', 'ROOMAX');
    await createTestRoom('RoomB', 'ROOMBX');

    const res = await request(app)
      .get('/api/rooms/ROOMBX/media/next')
      .set('Cookie', sessionCookie)
      .expect(403);

    expect(res.body.error).toBe('You are not a member of this room');
  });
});

describe('POST /api/rooms/:code/swipe', () => {
  it('records a left swipe', async () => {
    const { roomId, roomCode, sessionCookie } = await createTestRoom('LeftSwiper', 'SWIPE1');

    const mediaIds = insertTestMedia([
      { plex_rating_key: 'rk-sw-1', type: 'movie', title: 'Swipe Movie 1' },
    ]);
    associateMediaWithRoom(roomId, mediaIds);

    const res = await request(app)
      .post(`/api/rooms/${roomCode}/swipe`)
      .set('Cookie', sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'left' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.match).toBeUndefined();
  });

  it('records a right swipe (no match with single member)', async () => {
    const { roomId, roomCode, sessionCookie } = await createTestRoom('RightSwiper', 'SWIPE2');

    const mediaIds = insertTestMedia([
      { plex_rating_key: 'rk-sw-2', type: 'movie', title: 'Swipe Movie 2' },
    ]);
    associateMediaWithRoom(roomId, mediaIds);

    const res = await request(app)
      .post(`/api/rooms/${roomCode}/swipe`)
      .set('Cookie', sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'right' })
      .expect(200);

    expect(res.body.success).toBe(true);
    // Single member => no match possible (need >= 2 members)
    expect(res.body.match).toBeUndefined();
  });

  it('returns 400 when mediaId or direction is missing', async () => {
    const { roomCode, sessionCookie } = await createTestRoom('NoData', 'SWIPE3');

    await request(app)
      .post(`/api/rooms/${roomCode}/swipe`)
      .set('Cookie', sessionCookie)
      .send({ mediaId: 1 })
      .expect(400);

    await request(app)
      .post(`/api/rooms/${roomCode}/swipe`)
      .set('Cookie', sessionCookie)
      .send({ direction: 'right' })
      .expect(400);
  });

  it('returns 400 for invalid direction', async () => {
    const { roomCode, sessionCookie } = await createTestRoom('BadDir', 'SWIPE4');

    const res = await request(app)
      .post(`/api/rooms/${roomCode}/swipe`)
      .set('Cookie', sessionCookie)
      .send({ mediaId: 1, direction: 'up' })
      .expect(400);

    expect(res.body.error).toContain('direction must be');
  });

  it('returns 409 for duplicate swipe', async () => {
    const { roomId, roomCode, sessionCookie } = await createTestRoom('DupSwiper', 'SWIPE5');

    const mediaIds = insertTestMedia([
      { plex_rating_key: 'rk-sw-dup', type: 'movie', title: 'Dup Swipe Movie' },
    ]);
    associateMediaWithRoom(roomId, mediaIds);

    // First swipe
    await request(app)
      .post(`/api/rooms/${roomCode}/swipe`)
      .set('Cookie', sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'right' })
      .expect(200);

    // Duplicate swipe
    const res = await request(app)
      .post(`/api/rooms/${roomCode}/swipe`)
      .set('Cookie', sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'left' })
      .expect(409);

    expect(res.body.error).toContain('Already swiped');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/rooms/ANYCODE/swipe')
      .send({ mediaId: 1, direction: 'right' })
      .expect(401);

    expect(res.body.error).toBe('Authentication required');
  });
});

describe('Match creation (both members swipe right)', () => {
  it('creates a match when all room members swipe right', async () => {
    // Create room with host
    const host = await createTestRoom('MatchHost', 'MATCH1');

    // Join room with guest
    const guest = await joinTestRoom('MATCH1', 'MatchGuest');

    // Insert media and associate with room
    const mediaIds = insertTestMedia([
      { plex_rating_key: 'rk-match-1', type: 'movie', title: 'Match Movie', year: 2025, rating: 9.0 },
    ]);
    associateMediaWithRoom(host.roomId, mediaIds);

    // Host swipes right — no match yet (only 1 of 2)
    const hostSwipe = await request(app)
      .post(`/api/rooms/${host.roomCode}/swipe`)
      .set('Cookie', host.sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'right' })
      .expect(200);

    expect(hostSwipe.body.success).toBe(true);
    expect(hostSwipe.body.match).toBeUndefined();

    // Guest swipes right — match!
    const guestSwipe = await request(app)
      .post(`/api/rooms/${host.roomCode}/swipe`)
      .set('Cookie', guest.sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'right' })
      .expect(200);

    expect(guestSwipe.body.success).toBe(true);
    expect(guestSwipe.body.match).toBeDefined();
    expect(guestSwipe.body.match.media.title).toBe('Match Movie');
    expect(guestSwipe.body.match.watched).toBe(0);
  });

  it('does not create a match when one member swipes left', async () => {
    const host = await createTestRoom('NoMatchHost', 'MATCH2');
    const guest = await joinTestRoom('MATCH2', 'NoMatchGuest');

    const mediaIds = insertTestMedia([
      { plex_rating_key: 'rk-nomatch-1', type: 'movie', title: 'No Match Movie' },
    ]);
    associateMediaWithRoom(host.roomId, mediaIds);

    // Host swipes right
    await request(app)
      .post(`/api/rooms/${host.roomCode}/swipe`)
      .set('Cookie', host.sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'right' })
      .expect(200);

    // Guest swipes left — no match
    const guestSwipe = await request(app)
      .post(`/api/rooms/${host.roomCode}/swipe`)
      .set('Cookie', guest.sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'left' })
      .expect(200);

    expect(guestSwipe.body.success).toBe(true);
    expect(guestSwipe.body.match).toBeUndefined();
  });
});

describe('GET /api/rooms/:code/matches', () => {
  let hostInfo: Awaited<ReturnType<typeof createTestRoom>>;
  let guestInfo: Awaited<ReturnType<typeof joinTestRoom>>;
  let matchedMediaId: number;

  beforeAll(async () => {
    hostInfo = await createTestRoom('MatchListHost', 'MLIST1');
    guestInfo = await joinTestRoom('MLIST1', 'MatchListGuest');

    // Insert multiple media
    const mediaIds = insertTestMedia([
      { plex_rating_key: 'rk-ml-1', type: 'movie', title: 'Matched Movie A', year: 2023 },
      { plex_rating_key: 'rk-ml-2', type: 'show', title: 'Unmatched Show B', year: 2024 },
    ]);
    associateMediaWithRoom(hostInfo.roomId, mediaIds);
    matchedMediaId = mediaIds[0];

    // Both swipe right on first media => match
    await request(app)
      .post(`/api/rooms/${hostInfo.roomCode}/swipe`)
      .set('Cookie', hostInfo.sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'right' });

    await request(app)
      .post(`/api/rooms/${hostInfo.roomCode}/swipe`)
      .set('Cookie', guestInfo.sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'right' });

    // Only host swipes right on second media => no match
    await request(app)
      .post(`/api/rooms/${hostInfo.roomCode}/swipe`)
      .set('Cookie', hostInfo.sessionCookie)
      .send({ mediaId: mediaIds[1], direction: 'right' });
  });

  it('returns matches for the room', async () => {
    const res = await request(app)
      .get(`/api/rooms/${hostInfo.roomCode}/matches`)
      .set('Cookie', hostInfo.sessionCookie)
      .expect(200);

    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0].media.title).toBe('Matched Movie A');
    expect(res.body.matches[0].watched).toBe(0);
  });

  it('returns 401 without auth', async () => {
    await request(app)
      .get(`/api/rooms/${hostInfo.roomCode}/matches`)
      .expect(401);
  });

  it('filters by watched=false', async () => {
    const res = await request(app)
      .get(`/api/rooms/${hostInfo.roomCode}/matches?watched=false`)
      .set('Cookie', hostInfo.sessionCookie)
      .expect(200);

    expect(res.body.matches).toHaveLength(1);
  });

  it('filters by watched=true (none yet)', async () => {
    const res = await request(app)
      .get(`/api/rooms/${hostInfo.roomCode}/matches?watched=true`)
      .set('Cookie', hostInfo.sessionCookie)
      .expect(200);

    expect(res.body.matches).toHaveLength(0);
  });
});

describe('PATCH /api/rooms/:code/matches/:id', () => {
  it('marks a match as watched', async () => {
    const host = await createTestRoom('WatchHost', 'WATCH1');
    const guest = await joinTestRoom('WATCH1', 'WatchGuest');

    const mediaIds = insertTestMedia([
      { plex_rating_key: 'rk-watch-1', type: 'movie', title: 'Watch Movie' },
    ]);
    associateMediaWithRoom(host.roomId, mediaIds);

    // Both swipe right => match
    await request(app)
      .post(`/api/rooms/${host.roomCode}/swipe`)
      .set('Cookie', host.sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'right' });

    const guestSwipe = await request(app)
      .post(`/api/rooms/${host.roomCode}/swipe`)
      .set('Cookie', guest.sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'right' });

    const matchId = guestSwipe.body.match.id;

    // Mark as watched
    const res = await request(app)
      .patch(`/api/rooms/${host.roomCode}/matches/${matchId}`)
      .set('Cookie', host.sessionCookie)
      .expect(200);

    expect(res.body.match.watched).toBe(1);
    expect(res.body.match.watched_at).toBeDefined();
  });

  it('returns 404 for nonexistent match', async () => {
    const host = await createTestRoom('NoMatchW', 'WATCH2');

    const res = await request(app)
      .patch(`/api/rooms/${host.roomCode}/matches/99999`)
      .set('Cookie', host.sessionCookie)
      .expect(404);

    expect(res.body.error).toBe('Match not found');
  });

  it('returns 400 for invalid match ID', async () => {
    const host = await createTestRoom('BadId', 'WATCH3');

    const res = await request(app)
      .patch(`/api/rooms/${host.roomCode}/matches/abc`)
      .set('Cookie', host.sessionCookie)
      .expect(400);

    expect(res.body.error).toBe('Invalid match ID');
  });

  it('returns 401 without auth', async () => {
    await request(app)
      .patch('/api/rooms/ANYCODE/matches/1')
      .expect(401);
  });
});

describe('Media progression after swiping', () => {
  it('skips already-swiped media when requesting next', async () => {
    const { roomId, roomCode, sessionCookie } = await createTestRoom('Progressor', 'PROG01');

    const mediaIds = insertTestMedia([
      { plex_rating_key: 'rk-prog-1', type: 'movie', title: 'First Movie' },
      { plex_rating_key: 'rk-prog-2', type: 'movie', title: 'Second Movie' },
      { plex_rating_key: 'rk-prog-3', type: 'movie', title: 'Third Movie' },
    ]);
    associateMediaWithRoom(roomId, mediaIds);

    // Get first item
    let res = await request(app)
      .get(`/api/rooms/${roomCode}/media/next`)
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(res.body.media.title).toBe('First Movie');

    // Swipe on first item
    await request(app)
      .post(`/api/rooms/${roomCode}/swipe`)
      .set('Cookie', sessionCookie)
      .send({ mediaId: mediaIds[0], direction: 'left' });

    // Get next — should be second
    res = await request(app)
      .get(`/api/rooms/${roomCode}/media/next`)
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(res.body.media.title).toBe('Second Movie');

    // Swipe on second item
    await request(app)
      .post(`/api/rooms/${roomCode}/swipe`)
      .set('Cookie', sessionCookie)
      .send({ mediaId: mediaIds[1], direction: 'right' });

    // Get next — should be third
    res = await request(app)
      .get(`/api/rooms/${roomCode}/media/next`)
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(res.body.media.title).toBe('Third Movie');

    // Swipe on third
    await request(app)
      .post(`/api/rooms/${roomCode}/swipe`)
      .set('Cookie', sessionCookie)
      .send({ mediaId: mediaIds[2], direction: 'left' });

    // No more media
    res = await request(app)
      .get(`/api/rooms/${roomCode}/media/next`)
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(res.body.media).toBeNull();
    expect(res.body.caught_up).toBe(true);
  });
});
