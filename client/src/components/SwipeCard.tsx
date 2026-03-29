import { useState } from 'react';
import type { Media } from '../api';

interface SwipeCardProps {
  media: Media;
  swipeDirection: 'left' | 'right' | null;
}

export default function SwipeCard({ media, swipeDirection }: SwipeCardProps) {
  const [expanded, setExpanded] = useState(false);

  const genres = media.genre ? media.genre.split(',').map((g) => g.trim()).filter(Boolean) : [];

  function handleCardTap() {
    setExpanded((prev) => !prev);
  }

  function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return (
    <div className="swipe-card" onClick={handleCardTap}>
      <img
        className="swipe-card-poster"
        src={media.poster_url}
        alt={media.title}
        draggable={false}
      />

      {/* Direction indicators */}
      <div
        className={`swipe-card-indicator like${swipeDirection === 'right' ? ' visible' : ''}`}
        style={{ opacity: swipeDirection === 'right' ? 1 : 0 }}
      />
      <div
        className={`swipe-card-indicator nope${swipeDirection === 'left' ? ' visible' : ''}`}
        style={{ opacity: swipeDirection === 'left' ? 1 : 0 }}
      />

      {/* Bottom gradient */}
      <div className="swipe-card-gradient" />

      {/* Basic info */}
      <div className="swipe-card-info">
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
      </div>

      {/* Expandable details panel */}
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
      </div>
    </div>
  );
}
