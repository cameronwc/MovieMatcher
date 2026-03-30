import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';

const router = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password';

// In-memory set of valid admin tokens
const adminTokens = new Set<string>();

// Rate limit admin login: 5 attempts per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Admin auth middleware (exported for use in other routes)
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.admin_token;

  if (!token || !adminTokens.has(token)) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }

  next();
}

// POST /api/admin/login
router.post('/login', loginLimiter, (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };

  // Timing-safe password comparison
  let passwordMatch = false;
  if (password) {
    const expected = Buffer.from(ADMIN_PASSWORD);
    const received = Buffer.from(password);
    if (expected.length === received.length) {
      passwordMatch = crypto.timingSafeEqual(expected, received);
    }
  }

  if (!passwordMatch) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const token = uuidv4();
  adminTokens.add(token);

  res.cookie('admin_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.SECURE_COOKIES === 'true',
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  });

  res.json({ success: true });
});

// GET /api/admin/rooms
router.get('/rooms', requireAdmin, (_req: Request, res: Response) => {
  try {
    const rooms = db.prepare(`
      SELECT r.id, r.code, r.created_at,
             COUNT(rm.id) AS member_count
      FROM rooms r
      LEFT JOIN room_members rm ON rm.room_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `).all() as Array<{ id: number; code: string; created_at: string; member_count: number }>;

    res.json(rooms);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch rooms';
    res.status(500).json({ error: message });
  }
});

// GET /api/admin/rooms/:code/matches
router.get('/rooms/:code/matches', requireAdmin, (req: Request, res: Response) => {
  try {
    const code = (req.params.code as string).trim().toUpperCase();

    const room = db.prepare('SELECT id FROM rooms WHERE UPPER(code) = ?').get(code) as { id: number } | undefined;

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const matches = db.prepare(`
      SELECT m.id, m.room_id, m.media_id, m.matched_at, m.watched, m.watched_at,
             med.plex_rating_key, med.type, med.title, med.year, med.summary,
             med.poster_url, med.rating, med.genre, med.duration,
             med.content_rating, med.episode_count
      FROM matches m
      JOIN media med ON med.id = m.media_id
      WHERE m.room_id = ?
      ORDER BY m.matched_at DESC
    `).all(room.id) as Array<{
      id: number; room_id: number; media_id: number; matched_at: string;
      watched: number; watched_at: string | null;
      plex_rating_key: string; type: string; title: string; year: number | null;
      summary: string | null; poster_url: string | null; rating: number | null;
      genre: string | null; duration: number | null; content_rating: string | null;
      episode_count: number | null;
    }>;

    const result = matches.map((row) => ({
      id: row.id,
      room_id: row.room_id,
      media_id: row.media_id,
      matched_at: row.matched_at,
      watched: row.watched,
      watched_at: row.watched_at,
      media: {
        id: row.media_id,
        plex_rating_key: row.plex_rating_key,
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
      },
    }));

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch matches';
    res.status(500).json({ error: message });
  }
});

export default router;
