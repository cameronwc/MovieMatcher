import { useState, useCallback } from 'react';
import { adminLogin, adminGetRooms, adminGetRoomMatches, plexLogout, embyLogout, getMediaServerStatus } from '../api';
import type { Match, MediaServerStatus } from '../api';

interface AdminRoom {
  code: string;
  member_count: number;
  created_at: string;
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  const [serverInfo, setServerInfo] = useState<MediaServerStatus | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const data = await adminGetRooms();
      setRooms(data);
    } catch {
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  const fetchServerInfo = useCallback(async () => {
    try {
      const status = await getMediaServerStatus();
      setServerInfo(status);
    } catch {
      setServerInfo(null);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      await adminLogin(password);
      setAuthed(true);
      setPassword('');
      fetchRooms();
      fetchServerInfo();
    } catch {
      setLoginError('Invalid password');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleRoomClick(code: string) {
    if (expandedRoom === code) {
      setExpandedRoom(null);
      setMatches([]);
      return;
    }
    setExpandedRoom(code);
    setLoadingMatches(true);
    try {
      const data = await adminGetRoomMatches(code);
      setMatches(data);
    } catch {
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      if (serverInfo?.serverType === 'emby') {
        await embyLogout();
      } else {
        await plexLogout();
      }
      setServerInfo({ configured: false });
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'Z');
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  if (!authed) {
    return (
      <div className="admin-page">
        <div className="admin-login">
          <h1 className="admin-title">Admin</h1>
          <form onSubmit={handleLogin} className="admin-login-form">
            <div className="input-group">
              <label className="input-label" htmlFor="admin-pw">Password</label>
              <input
                id="admin-pw"
                className="input"
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            {loginError && <div className="admin-error">{loginError}</div>}
            <button className="btn btn-primary btn-full" type="submit" disabled={loggingIn || !password}>
              {loggingIn ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1 className="admin-title">Admin Dashboard</h1>
      </div>

      <div className="admin-content">
        {/* Media Server Section */}
        <div className="admin-section-header">
          <h2>Media Server</h2>
        </div>
        {serverInfo?.configured ? (
          <div className="landing-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {serverInfo.serverType === 'emby' ? 'Emby' : 'Plex'}: {serverInfo.serverName || 'Unknown'}
                </div>
                {serverInfo.serverUrl && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
                    {serverInfo.serverUrl}
                  </div>
                )}
              </div>
              <button
                className="btn btn-ghost"
                onClick={handleDisconnect}
                disabled={disconnecting}
                style={{ color: '#ef4444' }}
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '12px', marginBottom: 16 }}>
            <p>No media server connected.</p>
          </div>
        )}

        {/* Rooms Section */}
        <div className="admin-section-header">
          <h2>Rooms</h2>
          <button className="btn btn-ghost" onClick={fetchRooms} disabled={loadingRooms}>
            Refresh
          </button>
        </div>

        {loadingRooms ? (
          <div className="empty-state">
            <div className="loading-spinner" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="empty-state">
            <p>No rooms found.</p>
          </div>
        ) : (
          <div className="admin-rooms-list">
            {rooms.map((room) => (
              <div key={room.code} className="admin-room-block">
                <button
                  className={`admin-room-row${expandedRoom === room.code ? ' expanded' : ''}`}
                  onClick={() => handleRoomClick(room.code)}
                >
                  <span className="admin-room-code">{room.code}</span>
                  <span className="admin-room-meta">
                    <span className="admin-room-members">{room.member_count} member{room.member_count !== 1 ? 's' : ''}</span>
                    <span className="admin-room-date">{formatDate(room.created_at)}</span>
                  </span>
                  <span className="admin-room-chevron">{expandedRoom === room.code ? '\u25B2' : '\u25BC'}</span>
                </button>

                {expandedRoom === room.code && (
                  <div className="admin-room-matches">
                    {loadingMatches ? (
                      <div className="empty-state" style={{ padding: '24px' }}>
                        <div className="loading-spinner" />
                      </div>
                    ) : matches.length === 0 ? (
                      <div className="admin-no-matches">No matches yet</div>
                    ) : (
                      <div className="admin-matches-list">
                        {matches.map((match) => (
                          <div key={match.id} className="admin-match-item">
                            <img
                              className="admin-match-poster"
                              src={match.media.poster_url}
                              alt={match.media.title}
                              loading="lazy"
                            />
                            <div className="admin-match-info">
                              <div className="admin-match-title">{match.media.title}</div>
                              <div className="admin-match-sub">
                                {match.media.year && <span>{match.media.year}</span>}
                                {match.media.rating > 0 && (
                                  <span className="admin-match-rating">
                                    &#9733; {match.media.rating.toFixed(1)}
                                  </span>
                                )}
                              </div>
                              <div className="admin-match-date">Matched {formatDate(match.matched_at)}</div>
                            </div>
                            <div className="admin-match-status">
                              {match.watched ? (
                                <span className="admin-watched-badge">&#x2713;</span>
                              ) : (
                                <span className="admin-unwatched-label">unwatched</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
