// ===========================
// MovieMatcher — Socket.IO Client
// ===========================

import { io, Socket } from 'socket.io-client';
import type { Match, RoomMember } from './api';

export interface MatchEvent {
  match: Match;
}

export interface MemberJoinedEvent {
  member: RoomMember;
}

export interface SyncCompleteEvent {
  count: number;
}

// Auto-detect URL: in dev the proxy handles it, in prod same origin
const socket: Socket = io({
  autoConnect: true,
  withCredentials: true,
});

export function joinRoom(code: string): void {
  socket.emit('join-room', code);
}

export function onMatch(callback: (data: MatchEvent) => void): void {
  socket.on('match', callback);
}

export function offMatch(callback: (data: MatchEvent) => void): void {
  socket.off('match', callback);
}

export function onMemberJoined(callback: (data: MemberJoinedEvent) => void): void {
  socket.on('member-joined', callback);
}

export function offMemberJoined(callback: (data: MemberJoinedEvent) => void): void {
  socket.off('member-joined', callback);
}

export function onSyncComplete(callback: (data: SyncCompleteEvent) => void): void {
  socket.on('sync-complete', callback);
}

export function offSyncComplete(callback: (data: SyncCompleteEvent) => void): void {
  socket.off('sync-complete', callback);
}

export { socket };
