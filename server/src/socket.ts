import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { getMemberByToken } from './services/rooms.js';
import type { Match, Media, RoomMember } from './types.js';

let io: SocketIOServer;

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(pair => {
    const [key, ...vals] = pair.trim().split('=');
    if (key) cookies[key] = decodeURIComponent(vals.join('='));
  });
  return cookies;
}

export function setupSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    },
  });

  // C5: Socket.IO authentication middleware
  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie || '');
    const token = cookies.session_token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const member = getMemberByToken(token);
    if (!member) {
      return next(new Error('Invalid session'));
    }
    socket.data.member = member;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('join-room', (roomCode: string) => {
      if (typeof roomCode === 'string' && roomCode.trim()) {
        const normalized = roomCode.trim().toUpperCase();
        if (socket.data.member?.room_code === normalized) {
          socket.join(normalized);
        }
      }
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO has not been initialized');
  }
  return io;
}

export function emitMatch(roomCode: string, match: Match & { media: Media }): void {
  if (!io) return;
  io.to(roomCode).emit('match', { match });
}

export function emitMemberJoined(roomCode: string, member: Pick<RoomMember, 'id' | 'nickname'>): void {
  if (!io) return;
  io.to(roomCode).emit('member-joined', {
    id: member.id,
    nickname: member.nickname,
  });
}

export function emitSyncComplete(roomCode: string): void {
  if (!io) return;
  io.to(roomCode).emit('sync-complete');
}
