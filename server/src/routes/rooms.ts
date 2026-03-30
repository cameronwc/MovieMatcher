import { Router, type Request, type Response } from 'express';
import { createRoom, joinRoom, getRoom, getRoomMembers } from '../services/rooms.js';
import { requireAuth } from '../middleware/auth.js';
import { syncMediaForRoom } from '../services/media.js';
import { emitMemberJoined } from '../socket.js';
import type { CreateRoomRequest, JoinRoomRequest } from '../types.js';

const router = Router();

// POST /api/rooms — create a new room
router.post('/', (req: Request, res: Response) => {
  try {
    const { code, nickname } = req.body as CreateRoomRequest;

    if (!nickname || !nickname.trim()) {
      res.status(400).json({ error: 'Nickname is required' });
      return;
    }

    const result = createRoom(code, nickname.trim());

    res.cookie('session_token', result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.SECURE_COOKIES === 'true',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    console.log(`Room created: ${result.room.code} by ${result.member.nickname}`);

    res.status(201).json({
      room: result.room,
      member: result.member,
    });

    // Fire-and-forget: sync Plex media for the new room
    console.log(`Starting initial Plex sync for room ${result.room.code}...`);
    syncMediaForRoom(result.room.id)
      .then((ids) => console.log(`Plex sync complete for room ${result.room.code}: ${ids.length} items loaded`))
      .catch((err) => {
        console.error(`Plex sync failed for room ${result.room.code}:`, err instanceof Error ? err.message : err);
      });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create room';
    // Duplicate code → 409
    if (message.includes('UNIQUE constraint failed') || message.includes('unique')) {
      res.status(409).json({ error: 'Room code already taken' });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// GET /api/rooms/:code — get room info (public, no auth needed)
router.get('/:code', (req: Request, res: Response) => {
  try {
    const room = getRoom(req.params.code as string);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const members = getRoomMembers(room.id).map((m) => ({
      id: m.id,
      nickname: m.nickname,
      joined_at: m.joined_at,
    }));

    res.json({ room, members });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get room';
    res.status(500).json({ error: message });
  }
});

// POST /api/rooms/:code/join — join a room
router.post('/:code/join', (req: Request, res: Response) => {
  try {
    const { nickname } = req.body as JoinRoomRequest;

    if (!nickname || !nickname.trim()) {
      res.status(400).json({ error: 'Nickname is required' });
      return;
    }

    const result = joinRoom(req.params.code as string, nickname.trim());

    res.cookie('session_token', result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.SECURE_COOKIES === 'true',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    console.log(`Member joined room ${result.room.code}: ${result.member.nickname}`);

    res.json({
      room: result.room,
      member: result.member,
    });

    // Emit member-joined event to room
    emitMemberJoined(result.room.code.toUpperCase(), result.member);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to join room';
    if (message === 'Room not found') {
      res.status(404).json({ error: message });
      return;
    }
    if (message === 'Nickname already taken in this room') {
      res.status(409).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// GET /api/rooms/:code/me — check if current user is a member of this room
router.get('/:code/me', requireAuth, (req: Request, res: Response) => {
  const member = req.member!;
  const code = (req.params.code as string).trim().toUpperCase();

  if (member.room_code !== code) {
    res.status(403).json({ error: 'You are not a member of this room' });
    return;
  }

  res.json({ member: { id: member.id, nickname: member.nickname } });
});

export default router;
