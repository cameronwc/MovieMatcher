import crypto from 'node:crypto';
import { db } from '../db.js';
import type { Room, RoomMember, RoomResponse, AuthenticatedMember } from '../types.js';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(
  code: string | undefined,
  nickname: string
): { room: RoomResponse; member: Pick<RoomMember, 'id' | 'nickname'>; sessionToken: string } {
  // Generate a code if none was provided
  let roomCode = code?.trim().toUpperCase();
  if (!roomCode) {
    // Generate a unique code, retrying on collision
    for (let i = 0; i < 10; i++) {
      const candidate = generateCode();
      const existing = db.prepare('SELECT id FROM rooms WHERE code = ?').get(candidate);
      if (!existing) {
        roomCode = candidate;
        break;
      }
    }
    if (!roomCode) {
      throw new Error('Failed to generate a unique room code');
    }
  }

  const sessionToken = crypto.randomUUID();

  const insertRoom = db.prepare('INSERT INTO rooms (code) VALUES (?)');
  const insertMember = db.prepare(
    'INSERT INTO room_members (room_id, nickname, session_token) VALUES (?, ?, ?)'
  );

  const txn = db.transaction(() => {
    const roomResult = insertRoom.run(roomCode);
    const roomId = roomResult.lastInsertRowid as number;

    const memberResult = insertMember.run(roomId, nickname, sessionToken);
    const memberId = memberResult.lastInsertRowid as number;

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as Room;

    return {
      room: {
        id: room.id,
        code: room.code,
        created_at: room.created_at,
        member_count: 1,
      },
      member: { id: memberId, nickname },
      sessionToken,
    };
  });

  return txn();
}

export function joinRoom(
  code: string,
  nickname: string
): { room: RoomResponse; member: Pick<RoomMember, 'id' | 'nickname'>; sessionToken: string } {
  const roomCode = code.trim().toUpperCase();
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(roomCode) as Room | undefined;

  if (!room) {
    throw new Error('Room not found');
  }

  // Check if nickname is already taken in this room
  const existingMember = db
    .prepare('SELECT id FROM room_members WHERE room_id = ? AND nickname = ?')
    .get(room.id, nickname) as RoomMember | undefined;

  if (existingMember) {
    throw new Error('Nickname already taken in this room');
  }

  const sessionToken = crypto.randomUUID();

  const insertMember = db.prepare(
    'INSERT INTO room_members (room_id, nickname, session_token) VALUES (?, ?, ?)'
  );
  const memberResult = insertMember.run(room.id, nickname, sessionToken);
  const memberId = memberResult.lastInsertRowid as number;

  const memberCount = (
    db.prepare('SELECT COUNT(*) as count FROM room_members WHERE room_id = ?').get(room.id) as {
      count: number;
    }
  ).count;

  return {
    room: {
      id: room.id,
      code: room.code,
      created_at: room.created_at,
      member_count: memberCount,
    },
    member: { id: memberId, nickname },
    sessionToken,
  };
}

export function getRoom(code: string): RoomResponse | null {
  const roomCode = code.trim().toUpperCase();
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(roomCode) as Room | undefined;

  if (!room) {
    return null;
  }

  const memberCount = (
    db.prepare('SELECT COUNT(*) as count FROM room_members WHERE room_id = ?').get(room.id) as {
      count: number;
    }
  ).count;

  return {
    id: room.id,
    code: room.code,
    created_at: room.created_at,
    member_count: memberCount,
  };
}

export function getMemberByToken(token: string): AuthenticatedMember | null {
  const row = db
    .prepare(
      `SELECT rm.*, r.code as room_code
       FROM room_members rm
       JOIN rooms r ON r.id = rm.room_id
       WHERE rm.session_token = ?`
    )
    .get(token) as (RoomMember & { room_code: string }) | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    room_id: row.room_id,
    nickname: row.nickname,
    session_token: row.session_token,
    joined_at: row.joined_at,
    room_code: row.room_code,
  };
}

export function getRoomMembers(roomId: number): RoomMember[] {
  return db.prepare('SELECT * FROM room_members WHERE room_id = ? ORDER BY joined_at').all(roomId) as RoomMember[];
}
