import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  createRoom,
  joinRoom,
  getMediaServerStatus,
  createPlexPin,
  getPlexAuthUrl,
  checkPlexPin,
  connectEmby,
  selectEmbyUser,
  type MediaServerStatus,
  type EmbyConnectResult,
} from '../api';

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [serverStatus, setServerStatus] = useState<MediaServerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Plex auth state
  const [plexError, setPlexError] = useState('');
  const [connectingPlex, setConnectingPlex] = useState(false);
  const [pinId, setPinId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Emby auth state
  const [showEmbyForm, setShowEmbyForm] = useState(false);
  const [embyUrl, setEmbyUrl] = useState('');
  const [embyApiKey, setEmbyApiKey] = useState('');
  const [embyError, setEmbyError] = useState('');
  const [connectingEmby, setConnectingEmby] = useState(false);
  const [embyUsers, setEmbyUsers] = useState<EmbyConnectResult['users']>(undefined);
  const [pendingEmbyUrl, setPendingEmbyUrl] = useState('');
  const [pendingEmbyKey, setPendingEmbyKey] = useState('');

  // Room state
  const [createNickname, setCreateNickname] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const [joinCode, setJoinCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Check media server status on mount
  useEffect(() => {
    getMediaServerStatus()
      .then(setServerStatus)
      .catch(() => setServerStatus({ configured: false }))
      .finally(() => setStatusLoading(false));
  }, []);

  // If returning from Plex auth (forward URL), poll for the PIN
  useEffect(() => {
    const storedPinId = localStorage.getItem('mm_plex_pin_id');
    if (storedPinId && searchParams.has('plex_auth')) {
      setPinId(parseInt(storedPinId, 10));
      setConnectingPlex(true);
    }
  }, [searchParams]);

  // Poll for PIN authorization
  useEffect(() => {
    if (!pinId || !connectingPlex) return;

    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const result = await checkPlexPin(pinId);
        if (result.authorized) {
          clearInterval(pollRef.current!);
          localStorage.removeItem('mm_plex_pin_id');
          setConnectingPlex(false);
          setPinId(null);

          if (result.serverName) {
            setServerStatus({
              configured: true,
              serverType: 'plex',
              serverName: result.serverName,
              serverUrl: result.serverUrl,
            });
          } else if (result.servers && result.servers.length > 0) {
            setServerStatus({
              configured: true,
              serverType: 'plex',
              serverName: result.servers[0].name,
            });
          }
        }
      } catch {
        // Keep polling
      }
      if (attempts > 60) {
        clearInterval(pollRef.current!);
        setConnectingPlex(false);
        setPlexError('Plex authorization timed out. Please try again.');
        localStorage.removeItem('mm_plex_pin_id');
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pinId, connectingPlex]);

  async function handlePlexSignIn() {
    setPlexError('');
    setConnectingPlex(true);
    try {
      const pin = await createPlexPin();
      setPinId(pin.id);
      localStorage.setItem('mm_plex_pin_id', String(pin.id));

      const forwardUrl = `${window.location.origin}/?plex_auth=1`;
      const { authUrl } = await getPlexAuthUrl(pin.code, forwardUrl);
      window.location.href = authUrl;
    } catch (err) {
      setConnectingPlex(false);
      setPlexError(err instanceof Error ? err.message : 'Failed to start Plex sign-in');
    }
  }

  async function handleEmbyConnect(e: FormEvent) {
    e.preventDefault();
    if (!embyUrl.trim() || !embyApiKey.trim()) return;

    setEmbyError('');
    setConnectingEmby(true);
    try {
      const result = await connectEmby(embyUrl.trim(), embyApiKey.trim());

      if (result.connected) {
        setServerStatus({
          configured: true,
          serverType: 'emby',
          serverName: result.serverName,
          serverUrl: result.serverUrl,
        });
        setShowEmbyForm(false);
      } else if (result.users && result.users.length > 0) {
        // Multiple users — show selection
        setEmbyUsers(result.users);
        setPendingEmbyUrl(embyUrl.trim());
        setPendingEmbyKey(embyApiKey.trim());
      }
    } catch (err) {
      setEmbyError(err instanceof Error ? err.message : 'Failed to connect to Emby');
    } finally {
      setConnectingEmby(false);
    }
  }

  async function handleEmbyUserSelect(userId: string) {
    setEmbyError('');
    setConnectingEmby(true);
    try {
      const result = await selectEmbyUser(pendingEmbyUrl, pendingEmbyKey, userId);
      if (result.connected) {
        setServerStatus({
          configured: true,
          serverType: 'emby',
          serverName: result.serverName,
          serverUrl: result.serverUrl,
        });
        setShowEmbyForm(false);
        setEmbyUsers(undefined);
      }
    } catch (err) {
      setEmbyError(err instanceof Error ? err.message : 'Failed to select user');
    } finally {
      setConnectingEmby(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!createNickname.trim()) return;

    setCreateLoading(true);
    setCreateError('');
    try {
      const { room } = await createRoom(
        createNickname.trim(),
        createCode.trim() || undefined
      );
      localStorage.setItem('mm_room_code', room.code);
      localStorage.setItem('mm_nickname', createNickname.trim());
      navigate(`/room/${encodeURIComponent(room.code)}/swipe`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!joinCode.trim() || !joinNickname.trim()) return;

    setJoinLoading(true);
    setJoinError('');
    try {
      const { room } = await joinRoom(joinCode.trim(), joinNickname.trim());
      localStorage.setItem('mm_room_code', room.code);
      localStorage.setItem('mm_nickname', joinNickname.trim());
      navigate(`/room/${encodeURIComponent(room.code)}/swipe`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setJoinLoading(false);
    }
  }

  const serverLabel = serverStatus?.serverType === 'emby' ? 'Emby' : 'Plex';

  return (
    <div className="landing">
      <div className="landing-logo">🎬</div>
      <h1 className="landing-title">
        Movie<span className="accent">Matcher</span>
      </h1>
      <p className="landing-tagline">Swipe together, watch together</p>

      <div className="landing-cards">
        {/* Media Server Connection */}
        {!statusLoading && !serverStatus?.configured && (
          <div className="landing-card plex-card">
            <h2>Connect Media Server</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Connect your Plex or Emby server to access your media library.
            </p>

            {!showEmbyForm && !embyUsers && (
              <>
                {plexError && <div className="landing-error">{plexError}</div>}
                <button
                  className="btn btn-plex btn-full"
                  onClick={handlePlexSignIn}
                  disabled={connectingPlex}
                >
                  {connectingPlex ? (
                    <>
                      <span className="loading-spinner-sm" />
                      Waiting for Plex...
                    </>
                  ) : (
                    'Sign in with Plex'
                  )}
                </button>
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, margin: '12px 0' }}>
                  or
                </div>
                <button
                  className="btn btn-full"
                  style={{ background: 'var(--color-emby, #52b54b)', color: '#fff' }}
                  onClick={() => setShowEmbyForm(true)}
                >
                  Connect Emby Server
                </button>
              </>
            )}

            {showEmbyForm && !embyUsers && (
              <form onSubmit={handleEmbyConnect}>
                {embyError && <div className="landing-error">{embyError}</div>}
                <div className="input-group">
                  <label className="input-label" htmlFor="emby-url">Emby Server URL</label>
                  <input
                    id="emby-url"
                    className="input"
                    type="url"
                    placeholder="http://192.168.1.100:8096"
                    value={embyUrl}
                    onChange={(e) => setEmbyUrl(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="emby-key">API Key</label>
                  <input
                    id="emby-key"
                    className="input"
                    type="text"
                    placeholder="Your Emby API key"
                    value={embyApiKey}
                    onChange={(e) => setEmbyApiKey(e.target.value)}
                    required
                    autoComplete="off"
                  />
                  <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                    Find this in Emby Dashboard &gt; Advanced &gt; API Keys
                  </p>
                </div>
                <button
                  className="btn btn-primary btn-full"
                  type="submit"
                  disabled={connectingEmby || !embyUrl.trim() || !embyApiKey.trim()}
                >
                  {connectingEmby ? 'Connecting...' : 'Connect'}
                </button>
                <button
                  className="btn btn-ghost btn-full"
                  type="button"
                  onClick={() => { setShowEmbyForm(false); setEmbyError(''); }}
                  style={{ marginTop: 8 }}
                >
                  Back
                </button>
              </form>
            )}

            {embyUsers && (
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>
                  Select a user profile:
                </p>
                {embyError && <div className="landing-error">{embyError}</div>}
                {embyUsers.map((user) => (
                  <button
                    key={user.id}
                    className="btn btn-full"
                    style={{ marginBottom: 8, background: 'var(--color-emby, #52b54b)', color: '#fff' }}
                    onClick={() => handleEmbyUserSelect(user.id)}
                    disabled={connectingEmby}
                  >
                    {user.name}{user.isAdmin ? ' (Admin)' : ''}
                  </button>
                ))}
                <button
                  className="btn btn-ghost btn-full"
                  type="button"
                  onClick={() => { setEmbyUsers(undefined); setEmbyError(''); }}
                  style={{ marginTop: 4 }}
                >
                  Back
                </button>
              </div>
            )}
          </div>
        )}

        {!statusLoading && serverStatus?.configured && (
          <>
            <div className="plex-connected">
              <span className="plex-dot" />
              Connected to {serverStatus.serverName || serverLabel}
            </div>

            {/* Create Room */}
            <form className="landing-card" onSubmit={handleCreate}>
              <h2>Create Room</h2>
              <div className="input-group">
                <label className="input-label" htmlFor="create-nickname">Nickname</label>
                <input
                  id="create-nickname"
                  className="input"
                  type="text"
                  placeholder="Your name"
                  value={createNickname}
                  onChange={(e) => setCreateNickname(e.target.value)}
                  maxLength={30}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="create-code">Room Code (optional)</label>
                <input
                  id="create-code"
                  className="input"
                  type="text"
                  placeholder="e.g. MovieNight"
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value)}
                  maxLength={20}
                  autoComplete="off"
                />
              </div>
              {createError && <div className="landing-error">{createError}</div>}
              <button
                className="btn btn-primary btn-full"
                type="submit"
                disabled={createLoading || !createNickname.trim()}
              >
                {createLoading ? 'Creating...' : 'Create'}
              </button>
            </form>

            {/* Join Room */}
            <form className="landing-card" onSubmit={handleJoin}>
              <h2>Join Room</h2>
              <div className="input-group">
                <label className="input-label" htmlFor="join-code">Room Code</label>
                <input
                  id="join-code"
                  className="input"
                  type="text"
                  placeholder="Enter room code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  maxLength={20}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="join-nickname">Nickname</label>
                <input
                  id="join-nickname"
                  className="input"
                  type="text"
                  placeholder="Your name"
                  value={joinNickname}
                  onChange={(e) => setJoinNickname(e.target.value)}
                  maxLength={30}
                  required
                  autoComplete="off"
                />
              </div>
              {joinError && <div className="landing-error">{joinError}</div>}
              <button
                className="btn btn-primary btn-full"
                type="submit"
                disabled={joinLoading || !joinCode.trim() || !joinNickname.trim()}
              >
                {joinLoading ? 'Joining...' : 'Join'}
              </button>
            </form>
          </>
        )}

        {statusLoading && (
          <div className="empty-state" style={{ padding: '20px' }}>
            <div className="loading-spinner" />
          </div>
        )}
      </div>
    </div>
  );
}
