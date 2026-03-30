import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import TinderCard from 'react-tinder-card';
import SwipeCard from '../components/SwipeCard';
import { getNextMediaBatch, swipe as apiSwipe, getRoom, syncLibrary } from '../api';
import type { Media, SwipeResult } from '../api';

const BATCH_SIZE = 20;
const VISIBLE_STACK = 3; // How many cards to show in the visual stack

interface SwipePageProps {
  onMatch: (result: SwipeResult) => void;
}

export default function Swipe({ onMatch }: SwipePageProps) {
  const { code } = useParams<{ code: string }>();
  const [cards, setCards] = useState<Media[]>([]);
  const [swipedIds, setSwipedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [_caughtUp, setCaughtUp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);
  const cardRef = useRef<{ swipe: (dir: string) => Promise<void> } | null>(null);
  const fetchingRef = useRef(false);

  const roomCode = code || '';

  // Fetch room info
  useEffect(() => {
    if (!roomCode) return;
    getRoom(roomCode).then((room) => {
      setMemberCount(room.members.length);
    }).catch(() => {});
  }, [roomCode]);

  // Load a batch of cards, syncing from Plex first if needed
  const loadBatch = useCallback(async () => {
    if (!roomCode || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setCaughtUp(false);
    try {
      let items = await getNextMediaBatch(roomCode, BATCH_SIZE);

      // If no cards available, trigger a Plex sync first (new room or empty batch)
      if (items.length === 0) {
        await syncLibrary(roomCode).catch(() => {});
        items = await getNextMediaBatch(roomCode, BATCH_SIZE);
      }

      if (items.length === 0) {
        setCards([]);
        setCaughtUp(true);
      } else {
        setCards(items.reverse());
      }
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [roomCode]);

  useEffect(() => {
    loadBatch();
  }, [loadBatch]);

  // Pre-cache poster images so they're instant when TinderCard mounts
  useEffect(() => {
    cards.forEach(media => {
      if (media.poster_url) {
        const img = new Image();
        img.src = media.poster_url;
      }
    });
  }, [cards]);

  // When cards run low, fetch more
  const refillCards = useCallback(async () => {
    if (!roomCode || fetchingRef.current || cards.length > 2) return;
    fetchingRef.current = true;
    try {
      const items = await getNextMediaBatch(roomCode, BATCH_SIZE);
      if (items.length > 0) {
        setCards(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const newItems = items.filter(i => !existingIds.has(i.id)).reverse();
          return [...newItems, ...prev];
        });
      }
    } catch {
      // ignore
    } finally {
      fetchingRef.current = false;
    }
  }, [roomCode, cards.length]);

  useEffect(() => {
    if (cards.length > 0 && cards.length <= 2 && !loading) {
      refillCards();
    }
  }, [cards.length, loading, refillCards]);

  // Record swipe — mark as swiped immediately so next card promotes to top
  function handleSwipe(direction: string, media: Media) {
    if (!roomCode) return;
    setSwipeDir(null);

    // Mark as swiped so next card becomes top instantly
    setSwipedIds(prev => new Set(prev).add(media.id));

    // Fire API call in background
    apiSwipe(roomCode, media.id, direction as 'left' | 'right')
      .then(result => {
        if (result.match) {
          onMatch(result);
        }
      })
      .catch(() => {});
  }

  // Remove card from DOM after fly-away animation completes
  function handleCardLeftScreen(mediaId: number) {
    setCards(prev => {
      const next = prev.filter(c => c.id !== mediaId);
      if (next.length === 0) {
        setCaughtUp(true);
      }
      return next;
    });
    setSwipedIds(prev => {
      const next = new Set(prev);
      next.delete(mediaId);
      return next;
    });
  }

  function handleButtonSwipe(direction: 'left' | 'right') {
    if (cardRef.current) {
      cardRef.current.swipe(direction);
    }
  }

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    fetchingRef.current = false;

    syncLibrary(roomCode)
      .catch(() => {})
      .then(() => getNextMediaBatch(roomCode, BATCH_SIZE))
      .then((items) => {
        setSwipedIds(new Set());
        if (items.length === 0) {
          setCards([]);
          setCaughtUp(true);
        } else {
          setCards(items.reverse());
          setCaughtUp(false);
        }
      })
      .catch(() => {
        setCaughtUp(true);
      })
      .finally(() => {
        setRefreshing(false);
        fetchingRef.current = false;
      });
  }

  // Active cards = not yet swiped. These determine who is "top".
  const activeCards = cards.filter(c => !swipedIds.has(c.id));
  const topCard = activeCards.length > 0 ? activeCards[activeCards.length - 1] : null;

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

        {!loading && activeCards.length > 0 && (
          <div className="swipe-card-wrapper">
            {cards.map((media) => {
              const isSwiped = swipedIds.has(media.id);
              const activeIndex = activeCards.indexOf(media);
              const stackIndex = activeIndex === -1 ? -1 : activeCards.length - 1 - activeIndex;
              const isTop = media === topCard;

              // Hide cards that aren't in the visible stack (unless animating out)
              if (!isSwiped && (stackIndex < 0 || stackIndex >= VISIBLE_STACK)) return null;

              return (
                <div
                  key={media.id}
                  className="swipe-stack-card"
                  style={{
                    zIndex: isSwiped ? 100 : (cards.length - stackIndex),
                    transform: (!isSwiped && !isTop)
                      ? `scale(${1 - stackIndex * 0.05}) translateY(${stackIndex * 18}px)`
                      : 'none',
                  }}
                >
                  {(isTop || isSwiped) ? (
                    <TinderCard
                      ref={isTop ? cardRef as React.Ref<never> : undefined}
                      key={`tinder-${media.id}`}
                      onSwipe={(dir) => handleSwipe(dir, media)}
                      onCardLeftScreen={() => handleCardLeftScreen(media.id)}
                      onSwipeRequirementFulfilled={(dir) => setSwipeDir(dir as 'left' | 'right')}
                      onSwipeRequirementUnfulfilled={() => setSwipeDir(null)}
                      preventSwipe={['up', 'down']}
                      swipeRequirementType="position"
                      swipeThreshold={80}
                    >
                      <SwipeCard media={media} swipeDirection={isTop ? swipeDir : null} isTop={isTop} />
                    </TinderCard>
                  ) : (
                    <SwipeCard media={media} swipeDirection={null} isTop={false} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Load more */}
      {!loading && activeCards.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🍿</div>
          <h3>All caught up!</h3>
          <p>You've gone through this batch. Load more to keep swiping.</p>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {/* Action buttons */}
      {!loading && topCard && (
        <div className="swipe-actions">
          <button
            className="swipe-btn pass"
            onClick={() => handleButtonSwipe('left')}
            disabled={!topCard}
            aria-label="Pass"
          >
            &#x2715;
          </button>
          <button
            className="swipe-btn want"
            onClick={() => handleButtonSwipe('right')}
            disabled={!topCard}
            aria-label="Want to watch"
          >
            &#x2713;
          </button>
        </div>
      )}
    </div>
  );
}
