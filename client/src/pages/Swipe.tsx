import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import TinderCard from 'react-tinder-card';
import SwipeCard from '../components/SwipeCard';
import { getNextMedia, swipe as apiSwipe, getRoom, syncLibrary } from '../api';
import type { Media, SwipeResult } from '../api';

interface SwipePageProps {
  onMatch: (result: SwipeResult) => void;
}

export default function Swipe({ onMatch }: SwipePageProps) {
  const { code } = useParams<{ code: string }>();
  const [currentMedia, setCurrentMedia] = useState<Media | null>(null);
  const [nextMedia, setNextMedia] = useState<Media | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [caughtUp, setCaughtUp] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);
  const [swiping, setSwiping] = useState(false);
  const cardRef = useRef<{ swipe: (dir: string) => Promise<void> } | null>(null);

  const roomCode = code || '';

  // Fetch room info
  useEffect(() => {
    if (!roomCode) return;
    getRoom(roomCode).then((room) => {
      setMemberCount(room.members.length);
    }).catch(() => {});
  }, [roomCode]);

  // Fetch current card
  const fetchCurrent = useCallback(async () => {
    if (!roomCode) return;
    setLoading(true);
    setCaughtUp(false);
    try {
      const media = await getNextMedia(roomCode);
      if (media) {
        setCurrentMedia(media);
        setCaughtUp(false);
      } else {
        setCurrentMedia(null);
        setCaughtUp(true);
      }
    } catch {
      setCurrentMedia(null);
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  // Pre-fetch next card
  const prefetchNext = useCallback(async () => {
    if (!roomCode) return;
    try {
      const media = await getNextMedia(roomCode);
      setNextMedia(media);
    } catch {
      setNextMedia(null);
    }
  }, [roomCode]);

  useEffect(() => {
    fetchCurrent();
  }, [fetchCurrent]);

  // Pre-fetch next after current loads
  useEffect(() => {
    if (currentMedia && !loading) {
      // Small delay so the "next" call doesn't race with current
      const t = setTimeout(() => prefetchNext(), 300);
      return () => clearTimeout(t);
    }
  }, [currentMedia, loading, prefetchNext]);

  async function handleSwipe(direction: string) {
    if (!currentMedia || !roomCode || swiping) return;

    const dir = direction as 'left' | 'right';
    setSwiping(true);
    setSwipeDir(null);

    try {
      const result = await apiSwipe(roomCode, currentMedia.id, dir);
      if (result.match) {
        onMatch(result);
      }
    } catch {
      // Swipe failed silently, card already gone
    }

    // Advance to next card
    if (nextMedia !== undefined) {
      if (nextMedia) {
        setCurrentMedia(nextMedia);
        setNextMedia(undefined);
        setCaughtUp(false);
      } else {
        setCurrentMedia(null);
        setCaughtUp(true);
      }
    } else {
      await fetchCurrent();
    }

    setSwiping(false);
  }

  function handleSwipeDirection(direction: string) {
    setSwipeDir(direction as 'left' | 'right');
  }

  function handleSwipeReset() {
    setSwipeDir(null);
  }

  function handleButtonSwipe(direction: 'left' | 'right') {
    if (cardRef.current) {
      cardRef.current.swipe(direction);
    }
  }

  async function handleRefresh() {
    setLoading(true);
    setNextMedia(undefined);
    try {
      await syncLibrary(roomCode);
    } catch {
      // Sync may fail if Plex is unreachable
    }
    await fetchCurrent();
  }

  return (
    <div className="swipe-page">
      {/* Top bar */}
      <div className="top-bar">
        <div className="room-badge">
          <span style={{ opacity: 0.5 }}>Room</span>
          <span className="code">{roomCode}</span>
        </div>
        <div className="member-count">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          {memberCount}
        </div>
      </div>

      {/* Card area */}
      <div className="swipe-container">
        {loading && (
          <div className="empty-state">
            <div className="loading-spinner" />
          </div>
        )}

        {!loading && caughtUp && (
          <div className="empty-state">
            <div className="empty-state-icon">🍿</div>
            <h3>All caught up!</h3>
            <p>You've swiped through everything. Refresh to load more from Plex.</p>
            <button className="btn btn-primary" onClick={handleRefresh}>
              Refresh
            </button>
          </div>
        )}

        {!loading && currentMedia && (
          <div className="swipe-card-wrapper">
            <TinderCard
              ref={cardRef as React.Ref<never>}
              key={currentMedia.id}
              onSwipe={handleSwipe}
              onSwipeRequirementFulfilled={handleSwipeDirection}
              onSwipeRequirementUnfulfilled={handleSwipeReset}
              preventSwipe={['up', 'down']}
              swipeRequirementType="position"
              swipeThreshold={80}
            >
              <SwipeCard media={currentMedia} swipeDirection={swipeDir} />
            </TinderCard>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!loading && currentMedia && (
        <div className="swipe-actions">
          <button
            className="swipe-btn pass"
            onClick={() => handleButtonSwipe('left')}
            disabled={swiping}
            aria-label="Pass"
          >
            &#x2715;
          </button>
          <button
            className="swipe-btn want"
            onClick={() => handleButtonSwipe('right')}
            disabled={swiping}
            aria-label="Want to watch"
          >
            &#x2713;
          </button>
        </div>
      )}
    </div>
  );
}
