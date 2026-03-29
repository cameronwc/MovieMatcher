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
      secure: process.env.NODE_ENV === 'production',
    });

    res.status(201).json({
      room: result.room,
      member: result.member,
    });

    // Fire-and-forget: sync Plex media for the new room
    syncMediaForRoom(result.room.id).catch(() => {});
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
      secure: process.env.NODE_ENV === 'production',
    });

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

export default router;
