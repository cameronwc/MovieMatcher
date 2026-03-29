import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type { Match, Media, RoomMember } from './types.js';

let io: SocketIOServer;

export function setupSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('join-room', (roomCode: string) => {
      if (typeof roomCode === 'string' && roomCode.trim()) {
        const normalized = roomCode.trim().toUpperCase();
        socket.join(normalized);
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
