// ──────────────────────────────────────────────
// Shared TypeScript types for MovieMatcher
// ──────────────────────────────────────────────

// ── Database row types ───────────────────────

export interface Room {
  id: number;
  code: string;
  created_at: string;
}

export interface RoomMember {
  id: number;
  room_id: number;
  nickname: string;
  session_token: string;
  joined_at: string;
}

export type MediaServerType = 'plex' | 'emby';

export interface MediaServerConfig {
  server_type: MediaServerType;
  auth_token: string;
  server_name: string | null;
  server_url: string;
  machine_id: string | null;
  user_id: string | null;
}

export interface Media {
  id: number;
  source: MediaServerType;
  source_id: string;
  type: 'movie' | 'show';
  title: string;
  year: number | null;
  summary: string | null;
  poster_url: string | null;
  rating: number | null;
  genre: string | null;
  duration: number | null;
  content_rating: string | null;
  episode_count: number | null;
  last_synced_at: string;
}

export interface Swipe {
  id: number;
  room_id: number;
  member_id: number;
  media_id: number;
  direction: 'right' | 'left';
  created_at: string;
}

export interface Match {
  id: number;
  room_id: number;
  media_id: number;
  matched_at: string;
  watched: number; // SQLite boolean: 0 or 1
  watched_at: string | null;
}

export interface RoomMedia {
  id: number;
  room_id: number;
  media_id: number;
  batch_number: number;
}

// ── API request types ────────────────────────

export interface CreateRoomRequest {
  code?: string;
  nickname: string;
}

export interface JoinRoomRequest {
  nickname: string;
}

export interface SwipeRequest {
  mediaId: number;
  direction: 'right' | 'left';
}

// ── API response types ───────────────────────

export interface RoomResponse {
  id: number;
  code: string;
  created_at: string;
  member_count: number;
}

export interface CreateRoomResponse {
  room: RoomResponse;
  member: Pick<RoomMember, 'id' | 'nickname'>;
}

export interface JoinRoomResponse {
  room: RoomResponse;
  member: Pick<RoomMember, 'id' | 'nickname'>;
}

export interface SwipeResponse {
  success: boolean;
  match?: MatchWithMedia;
}

export interface MatchWithMedia extends Match {
  media: Media;
}

// ── Extended Express Request ─────────────────

export interface AuthenticatedMember extends RoomMember {
  room_code: string;
}
