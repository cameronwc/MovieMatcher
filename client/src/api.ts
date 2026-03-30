// ===========================
// MovieMatcher — API Client
// ===========================

const BASE = '/api';

export interface Media {
  id: number;
  plex_rating_key: string;
  type: 'movie' | 'show';
  title: string;
  year: number;
  summary: string;
  poster_url: string;
  rating: number;
  genre: string;
  duration: number;
  content_rating: string;
  episode_count: number | null;
}

export interface Room {
  id: number;
  code: string;
  created_at: string;
  members: RoomMember[];
}

export interface RoomMember {
  id: number;
  nickname: string;
  joined_at: string;
}

export interface Match {
  id: number;
  room_id: number;
  media_id: number;
  matched_at: string;
  watched: boolean;
  watched_at: string | null;
  media: Media;
}

export interface SwipeResult {
  success: boolean;
  match?: Match;
}

export interface CreateRoomResponse {
  room: Room;
}

export interface JoinRoomResponse {
  room: Room;
  member: RoomMember;
}

export interface SyncResponse {
  success: boolean;
  count: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (res.status === 401) {
    // Not authenticated — redirect to landing
    localStorage.removeItem('mm_room_code');
    localStorage.removeItem('mm_nickname');
    window.location.href = '/';
    throw new Error('Not authenticated');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export function createRoom(nickname: string, code?: string): Promise<CreateRoomResponse> {
  return request<CreateRoomResponse>('/rooms', {
    method: 'POST',
    body: JSON.stringify({ nickname, code: code || undefined }),
  });
}

export function joinRoom(code: string, nickname: string): Promise<JoinRoomResponse> {
  return request<JoinRoomResponse>(`/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  });
}

export async function getRoom(code: string): Promise<Room> {
  const data = await request<{ room: { id: number; code: string; created_at: string; member_count: number }; members: RoomMember[] }>(`/rooms/${encodeURIComponent(code)}`);
  return { ...data.room, members: data.members };
}

export function checkRoomAuth(code: string): Promise<{ member: { id: number; nickname: string } }> {
  return request<{ member: { id: number; nickname: string } }>(`/rooms/${encodeURIComponent(code)}/me`);
}

export async function getNextMedia(code: string): Promise<Media | null> {
  const data = await request<{ media: Media | null; caught_up: boolean }>(`/rooms/${encodeURIComponent(code)}/media/next`);
  return data.media;
}

export async function getNextMediaBatch(code: string, count: number = 6): Promise<Media[]> {
  const data = await request<{ media: Media[]; caught_up: boolean }>(`/rooms/${encodeURIComponent(code)}/media/next?count=${count}`);
  return data.media;
}

export function swipe(code: string, mediaId: number, direction: 'left' | 'right'): Promise<SwipeResult> {
  return request<SwipeResult>(`/rooms/${encodeURIComponent(code)}/swipe`, {
    method: 'POST',
    body: JSON.stringify({ mediaId, direction }),
  });
}

export async function getMatches(code: string, watched?: boolean): Promise<Match[]> {
  const params = new URLSearchParams();
  if (watched !== undefined) {
    params.set('watched', String(watched));
  }
  const query = params.toString();
  const data = await request<{ matches: Match[] }>(`/rooms/${encodeURIComponent(code)}/matches${query ? `?${query}` : ''}`);
  return data.matches;
}

export function markWatched(code: string, matchId: number): Promise<Match> {
  return request<Match>(`/rooms/${encodeURIComponent(code)}/matches/${matchId}`, {
    method: 'PATCH',
    body: JSON.stringify({ watched: true }),
  });
}

export function syncLibrary(code: string): Promise<SyncResponse> {
  return request<SyncResponse>(`/rooms/${encodeURIComponent(code)}/sync`, {
    method: 'POST',
  });
}

// Plex OAuth
export interface PlexStatus {
  configured: boolean;
  serverName?: string;
  serverUrl?: string;
}

export function getPlexStatus(): Promise<PlexStatus> {
  return request<PlexStatus>('/plex/status');
}

export function createPlexPin(): Promise<{ id: number; code: string }> {
  return request<{ id: number; code: string }>('/plex/pin', { method: 'POST' });
}

export function getPlexAuthUrl(code: string, forwardUrl: string): Promise<{ authUrl: string }> {
  return request<{ authUrl: string }>(`/plex/auth-url?code=${encodeURIComponent(code)}&forwardUrl=${encodeURIComponent(forwardUrl)}`);
}

export interface PlexCheckPinResult {
  authorized: boolean;
  serverName?: string;
  serverUrl?: string;
  servers?: Array<{ name: string; machineId: string }>;
}

export function checkPlexPin(pinId: number): Promise<PlexCheckPinResult> {
  return request<PlexCheckPinResult>('/plex/check-pin', {
    method: 'POST',
    body: JSON.stringify({ pinId }),
  });
}

export function selectPlexServer(pinId: number, machineId: string): Promise<{ serverName: string; serverUrl: string }> {
  return request<{ serverName: string; serverUrl: string }>('/plex/select-server', {
    method: 'POST',
    body: JSON.stringify({ pinId, machineId }),
  });
}

export function plexLogout(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/plex/logout', { method: 'POST' });
}

// Admin
export function adminLogin(password: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function adminGetRooms(): Promise<Array<{ code: string; member_count: number; created_at: string }>> {
  return request<Array<{ code: string; member_count: number; created_at: string }>>('/admin/rooms');
}

export function adminGetRoomMatches(code: string): Promise<Match[]> {
  return request<Match[]>(`/admin/rooms/${encodeURIComponent(code)}/matches`);
}
