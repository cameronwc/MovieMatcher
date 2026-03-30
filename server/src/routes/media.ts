import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  syncMediaForRoom,
  getNextMedia,
  getNextMediaBatch,
  recordSwipe,
  getMatches,
  markWatched,
} from '../services/media.js';
import { emitMatch, emitSyncComplete } from '../socket.js';
import type { SwipeRequest } from '../types.js';

const router = Router();

// All media routes require auth
router.use(requireAuth);

// Helper to validate that the authenticated member belongs to the room in the URL
function validateRoomAccess(req: Request, res: Response): number | null {
  const member = req.member!;
  const rawCode = req.params.code as string;
  const code = rawCode.trim().toUpperCase();

  if (member.room_code !== code) {
    res.status(403).json({ error: 'You are not a member of this room' });
    return null;
  }

  return member.room_id;
}

// GET /api/rooms/:code/media/next — get next unswiped media (supports ?count=N for batch)
router.get('/:code/media/next', (req: Request, res: Response) => {
  try {
    const roomId = validateRoomAccess(req, res);
    if (roomId === null) return;

    const count = Math.min(parseInt(req.query.count as string, 10) || 1, 50);

    if (count > 1) {
      const items = getNextMediaBatch(roomId, req.member!.id, count);
      res.json({ media: items, caught_up: items.length === 0 });
      return;
    }

    const media = getNextMedia(roomId, req.member!.id);
    if (!media) {
      res.json({ media: null, caught_up: true });
      return;
    }
    res.json({ media, caught_up: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get next media';
    res.status(500).json({ error: message });
  }
});

// POST /api/rooms/:code/swipe — record a swipe
router.post('/:code/swipe', (req: Request, res: Response) => {
  try {
    const roomId = validateRoomAccess(req, res);
    if (roomId === null) return;

    const { mediaId, direction } = req.body as SwipeRequest;

    if (!mediaId || !direction) {
      res.status(400).json({ error: 'mediaId and direction are required' });
      return;
    }

    if (direction !== 'right' && direction !== 'left') {
      res.status(400).json({ error: 'direction must be "right" or "left"' });
      return;
    }

    const result = recordSwipe(roomId, req.member!.id, mediaId, direction);

    // If there was a match, emit to all room members via WebSocket
    if (result.match) {
      const code = (req.params.code as string).trim().toUpperCase();
      emitMatch(code, result.match);
    }

    res.json({
      success: true,
      match: result.match ?? undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record swipe';
    // Duplicate swipe
    if (message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Already swiped on this media' });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// GET /api/rooms/:code/matches — get matches list
router.get('/:code/matches', (req: Request, res: Response) => {
  try {
    const roomId = validateRoomAccess(req, res);
    if (roomId === null) return;

    let watched: boolean | undefined;
    if (req.query.watched === 'true') watched = true;
    else if (req.query.watched === 'false') watched = false;

    const matches = getMatches(roomId, watched);
    res.json({ matches });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get matches';
    res.status(500).json({ error: message });
  }
});

// PATCH /api/rooms/:code/matches/:id — mark as watched
router.patch('/:code/matches/:id', (req: Request, res: Response) => {
  try {
    const roomId = validateRoomAccess(req, res);
    if (roomId === null) return;

    const matchId = parseInt(req.params.id as string, 10);
    if (isNaN(matchId)) {
      res.status(400).json({ error: 'Invalid match ID' });
      return;
    }

    const match = markWatched(matchId, roomId);

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    res.json({ match });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to mark as watched';
    res.status(500).json({ error: message });
  }
});

// POST /api/rooms/:code/sync — trigger Plex re-sync for room
router.post('/:code/sync', async (req: Request, res: Response) => {
  try {
    const roomId = validateRoomAccess(req, res);
    if (roomId === null) return;

    const mediaIds = await syncMediaForRoom(roomId);
    const code = (req.params.code as string).trim().toUpperCase();

    emitSyncComplete(code);

    res.json({ success: true, count: mediaIds.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to sync media';
    res.status(500).json({ error: message });
  }
});

export default router;
