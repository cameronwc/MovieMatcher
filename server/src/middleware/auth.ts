import type { Request, Response, NextFunction } from 'express';
import { getMemberByToken } from '../services/rooms.js';
import type { AuthenticatedMember } from '../types.js';

// Extend Express Request to include member
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      member?: AuthenticatedMember;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.session_token;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const member = getMemberByToken(token);

  if (!member) {
    res.status(401).json({ error: 'Invalid session token' });
    return;
  }

  req.member = member;
  next();
}
