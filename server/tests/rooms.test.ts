import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Set up temp database BEFORE any app imports
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-rooms-test-'));
const testDbPath = path.join(tmpDir, 'test.db');
process.env.DB_PATH = testDbPath;
process.env.PORT = '0';

// Dynamic import so env vars are set first
const { app, httpServer } = await import('../src/index.js');
import request from 'supertest';

afterAll(() => {
  httpServer.close();
  // Clean up temp files
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe('POST /api/rooms', () => {
  it('creates a room with auto-generated code', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ nickname: 'Alice' })
      .expect(201);

    expect(res.body.room).toBeDefined();
    expect(res.body.room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(res.body.room.member_count).toBe(1);
    expect(res.body.member).toBeDefined();
    expect(res.body.member.nickname).toBe('Alice');

    // Should set session_token cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    expect(cookieStr).toContain('session_token=');
  });

  it('creates a room with a custom code', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ nickname: 'Bob', code: 'CUSTOM' })
      .expect(201);

    expect(res.body.room.code).toBe('CUSTOM');
    expect(res.body.member.nickname).toBe('Bob');
  });

  it('returns 400 without a nickname', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({})
      .expect(400);

    expect(res.body.error).toBe('Nickname is required');
  });

  it('returns 400 with empty nickname', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ nickname: '   ' })
      .expect(400);

    expect(res.body.error).toBe('Nickname is required');
  });

  it('returns 409 for duplicate room code', async () => {
    // Create a room with a specific code
    await request(app)
      .post('/api/rooms')
      .send({ nickname: 'First', code: 'DUPECD' })
      .expect(201);

    // Try to create another room with the same code
    const res = await request(app)
      .post('/api/rooms')
      .send({ nickname: 'Second', code: 'DUPECD' })
      .expect(409);

    expect(res.body.error).toContain('already taken');
  });

  it('lowercases custom code to uppercase', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ nickname: 'Charlie', code: 'lower1' })
      .expect(201);

    expect(res.body.room.code).toBe('LOWER1');
  });
});

describe('POST /api/rooms/:code/join', () => {
  let roomCode: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ nickname: 'Host' })
      .expect(201);
    roomCode = res.body.room.code;
  });

  it('joins an existing room', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({ nickname: 'Guest' })
      .expect(200);

    expect(res.body.room.code).toBe(roomCode);
    expect(res.body.room.member_count).toBe(2);
    expect(res.body.member.nickname).toBe('Guest');

    // Should set session_token cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
  });

  it('returns 404 for nonexistent room', async () => {
    const res = await request(app)
      .post('/api/rooms/ZZZZZZ/join')
      .send({ nickname: 'Nobody' })
      .expect(404);

    expect(res.body.error).toBe('Room not found');
  });

  it('returns 409 for duplicate nickname', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({ nickname: 'Host' })
      .expect(409);

    expect(res.body.error).toBe('Nickname already taken in this room');
  });

  it('returns 400 without nickname', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({})
      .expect(400);

    expect(res.body.error).toBe('Nickname is required');
  });
});

describe('GET /api/rooms/:code', () => {
  let roomCode: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ nickname: 'Viewer' })
      .expect(201);
    roomCode = res.body.room.code;
  });

  it('returns room info and members', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomCode}`)
      .expect(200);

    expect(res.body.room).toBeDefined();
    expect(res.body.room.code).toBe(roomCode);
    expect(res.body.room.member_count).toBe(1);
    expect(res.body.members).toBeDefined();
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].nickname).toBe('Viewer');
  });

  it('returns 404 for nonexistent room', async () => {
    const res = await request(app)
      .get('/api/rooms/NXROOM')
      .expect(404);

    expect(res.body.error).toBe('Room not found');
  });

  it('is case-insensitive for room code', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomCode.toLowerCase()}`)
      .expect(200);

    expect(res.body.room.code).toBe(roomCode);
  });
});

describe('GET /api/rooms/:code/me', () => {
  let roomCode: string;
  let sessionCookie: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ nickname: 'MeUser' })
      .expect(201);
    roomCode = res.body.room.code;
    const cookies = res.headers['set-cookie'];
    const cookieStr = Array.isArray(cookies) ? cookies[0] : cookies;
    sessionCookie = cookieStr.split(';')[0];
  });

  it('returns current member info when authenticated', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomCode}/me`)
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(res.body.member).toBeDefined();
    expect(res.body.member.nickname).toBe('MeUser');
  });

  it('returns 401 without auth cookie', async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomCode}/me`)
      .expect(401);

    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 403 for a member of a different room', async () => {
    // Create a different room
    const otherRes = await request(app)
      .post('/api/rooms')
      .send({ nickname: 'OtherUser' })
      .expect(201);
    const otherCode = otherRes.body.room.code;

    // Try to access the first room with the second user's token
    const otherCookies = otherRes.headers['set-cookie'];
    const otherCookieStr = Array.isArray(otherCookies) ? otherCookies[0] : otherCookies;
    const otherSessionCookie = otherCookieStr.split(';')[0];

    const res = await request(app)
      .get(`/api/rooms/${roomCode}/me`)
      .set('Cookie', otherSessionCookie)
      .expect(403);

    expect(res.body.error).toBe('You are not a member of this room');
  });
});
