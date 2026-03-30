import { useState, useRef } from 'react';
import type { Media } from '../api';

interface SwipeCardProps {
  media: Media;
  swipeDirection: 'left' | 'right' | null;
  isTop?: boolean;
}

export default function SwipeCard({ media, swipeDirection, isTop = true }: SwipeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const tapStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const genres = media.genre ? media.genre.split(',').map((g) => g.trim()).filter(Boolean) : [];

  function handlePointerDown(e: React.PointerEvent) {
    tapStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!tapStart.current) return;
    const dx = Math.abs(e.clientX - tapStart.current.x);
    const dy = Math.abs(e.clientY - tapStart.current.y);
    const dt = Date.now() - tapStart.current.time;
    tapStart.current = null;

    // Only toggle if it was a tap (small movement, short duration)
    if (dx < 10 && dy < 10 && dt < 300) {
      setExpanded((prev) => !prev);
    }
  }

  function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return (
    <div className="swipe-card" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
      <img
        className="swipe-card-poster"
        src={media.poster_url}
        alt={media.title}
        draggable={false}
      />

      {/* Media type badge */}
      <div className={`swipe-card-badge ${media.type}`}>
        {media.type === 'show' ? 'TV SHOW' : 'MOVIE'}
      </div>

      {/* Direction indicators — top card only */}
      {isTop && (
        <>
          <div
            className={`swipe-card-indicator like${swipeDirection === 'right' ? ' visible' : ''}`}
            style={{ opacity: swipeDirection === 'right' ? 1 : 0 }}
          />
          <div
            className={`swipe-card-indicator nope${swipeDirection === 'left' ? ' visible' : ''}`}
            style={{ opacity: swipeDirection === 'left' ? 1 : 0 }}
          />
        </>
      )}

      {/* Bottom gradient — top card only */}
      {isTop && <div className="swipe-card-gradient" />}

      {/* Basic info — top card only */}
      {isTop && <div className="swipe-card-info">
        <div className="swipe-card-title">{media.title}</div>
        <div className="swipe-card-year">{media.year}</div>
        <div className="swipe-card-meta">
          {media.rating > 0 && (
            <span className="swipe-card-rating">
              <span>&#9733;</span> {media.rating.toFixed(1)}
            </span>
          )}
          {media.type === 'show' && (
            <span className="swipe-card-type">TV Series</span>
          )}
          {genres.slice(0, 3).map((g) => (
            <span key={g} className="genre-pill">{g}</span>
          ))}
        </div>
        {!expanded && (
          <div className="swipe-card-expand-hint">Tap for details</div>
        )}
      </div>}

      {/* Expandable details panel — top card only */}
      {isTop && (
        <div
          className={`swipe-card-details${expanded ? ' open' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="swipe-card-details-header">
            <div>
              <h3>{media.title}</h3>
              <div className="swipe-card-year">{media.year}</div>
            </div>
            <button
              className="swipe-card-details-close"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
            >
              &#x2715;
            </button>
          </div>

          <div className="swipe-card-details-meta">
            {media.rating > 0 && (
              <span className="detail-chip">
                <span style={{ color: '#ffd700' }}>&#9733;</span> {media.rating.toFixed(1)}
              </span>
            )}
            {media.content_rating && (
              <span className="detail-chip">{media.content_rating}</span>
            )}
            {media.type === 'movie' && media.duration > 0 && (
              <span className="detail-chip">{formatDuration(media.duration)}</span>
            )}
            {media.type === 'show' && media.episode_count != null && (
              <span className="detail-chip">{media.episode_count} episodes</span>
            )}
            {media.type === 'show' && (
              <span className="detail-chip" style={{ color: 'var(--accent)' }}>TV Series</span>
            )}
            {genres.map((g) => (
              <span key={g} className="genre-pill">{g}</span>
            ))}
          </div>

          <p className="swipe-card-summary">{media.summary || 'No summary available.'}</p>

          <a
            className="btn btn-secondary trailer-link"
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${media.title} ${media.year || ''} official trailer`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <span>&#9654;</span> Watch Trailer
          </a>
        </div>
      )}
    </div>
  );
}
