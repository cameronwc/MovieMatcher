import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  createRoom,
  joinRoom,
  getPlexStatus,
  createPlexPin,
  getPlexAuthUrl,
  checkPlexPin,
  type PlexStatus,
} from '../api';

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [plexStatus, setPlexStatus] = useState<PlexStatus | null>(null);
  const [plexLoading, setPlexLoading] = useState(true);
  const [plexError, setPlexError] = useState('');
  const [connectingPlex, setConnectingPlex] = useState(false);

  // PIN polling state
  const [pinId, setPinId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [createNickname, setCreateNickname] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const [joinCode, setJoinCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Check Plex status on mount
  useEffect(() => {
    getPlexStatus()
      .then(setPlexStatus)
      .catch(() => setPlexStatus({ configured: false }))
      .finally(() => setPlexLoading(false));
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
            setPlexStatus({
              configured: true,
              serverName: result.serverName,
              serverUrl: result.serverUrl,
            });
          } else if (result.servers && result.servers.length > 0) {
            // Multiple servers — for now auto-select first
            // TODO: server selection UI if needed
            setPlexStatus({
              configured: true,
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

  return (
    <div className="landing">
      <div className="landing-logo">🎬</div>
      <h1 className="landing-title">
        Movie<span className="accent">Matcher</span>
      </h1>
      <p className="landing-tagline">Swipe together, watch together</p>

      <div className="landing-cards">
        {/* Plex Connection Status */}
        {!plexLoading && !plexStatus?.configured && (
          <div className="landing-card plex-card">
            <h2>Connect to Plex</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Sign in with your Plex account to access your media library.
            </p>
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
          </div>
        )}

        {!plexLoading && plexStatus?.configured && (
          <>
            <div className="plex-connected">
              <span className="plex-dot" />
              Connected to {plexStatus.serverName || 'Plex'}
            </div>

            {/* Create Room */}
            <form className="landing-card" onSubmit={handleCreate}>
              <h2>Create Room</h2>
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

        {plexLoading && (
          <div className="empty-state" style={{ padding: '20px' }}>
            <div className="loading-spinner" />
          </div>
        )}
      </div>
    </div>
  );
}
