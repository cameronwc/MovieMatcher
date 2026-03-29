import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom } from '../api';

export default function Landing() {
  const navigate = useNavigate();

  const [createNickname, setCreateNickname] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const [joinCode, setJoinCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

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
      </div>
    </div>
  );
}
