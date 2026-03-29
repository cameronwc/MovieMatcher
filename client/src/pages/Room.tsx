import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoom, syncLibrary } from '../api';
import type { Room as RoomType, RoomMember } from '../api';

export default function Room() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const roomCode = code || '';

  const [room, setRoom] = useState<RoomType | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchRoom = useCallback(async () => {
    if (!roomCode) return;
    setLoading(true);
    try {
      const data = await getRoom(roomCode);
      setRoom(data);
    } catch {
      setRoom(null);
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: some browsers block clipboard
      setCopied(false);
    }
  }

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncLibrary(roomCode);
    } catch {
      // silent
    } finally {
      setSyncing(false);
    }
  }

  function handleLeave() {
    localStorage.removeItem('mm_room_code');
    localStorage.removeItem('mm_nickname');
    navigate('/');
  }

  function formatJoined(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return '';
    }
  }

  function getInitial(member: RoomMember): string {
    return member.nickname.charAt(0).toUpperCase();
  }

  if (loading) {
    return (
      <div className="room-page">
        <div className="empty-state">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="room-page">
        <div className="empty-state">
          <div className="empty-state-icon">😕</div>
          <h3>Room not found</h3>
          <p>This room may no longer exist.</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="room-page">
      <div className="room-page-content">
        {/* Room code */}
        <div className="room-code-section" onClick={handleCopyCode}>
          <div className="room-code-label">Room Code</div>
          <div className="room-code-value">{roomCode}</div>
          <div className="room-code-hint">
            {copied ? (
              <span className="room-code-copied">Copied!</span>
            ) : (
              'Tap to copy'
            )}
          </div>
        </div>

        {/* Members */}
        <div className="room-section">
          <h3>Members ({room.members.length})</h3>
          <div className="member-list">
            {room.members.map((member) => (
              <div key={member.id} className="member-item">
                <div className="member-avatar">{getInitial(member)}</div>
                <div className="member-info">
                  <div className="member-name">{member.nickname}</div>
                  <div className="member-joined">Joined {formatJoined(member.joined_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sync */}
        <div className="room-section">
          <h3>Library</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Refresh to pull the latest movies and shows from Plex.
          </p>
          <button
            className="btn btn-secondary btn-full"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : 'Refresh Library'}
          </button>
        </div>
      </div>

      {/* Leave room */}
      <div className="room-actions">
        <button className="btn btn-danger btn-full" onClick={handleLeave}>
          Leave Room
        </button>
      </div>
    </div>
  );
}
