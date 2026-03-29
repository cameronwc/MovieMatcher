import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getMatches, markWatched as apiMarkWatched } from '../api';
import type { Match } from '../api';

export default function Matches() {
  const { code } = useParams<{ code: string }>();
  const roomCode = code || '';

  const [tab, setTab] = useState<'towatch' | 'watched'>('towatch');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [markingWatched, setMarkingWatched] = useState(false);

  const fetchMatches = useCallback(async () => {
    if (!roomCode) return;
    setLoading(true);
    try {
      const data = await getMatches(roomCode, tab === 'watched' ? true : false);
      setMatches(data);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [roomCode, tab]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  async function handleMarkWatched(match: Match) {
    if (markingWatched) return;
    setMarkingWatched(true);
    try {
      const updated = await apiMarkWatched(roomCode, match.id);
      setMatches((prev) => prev.filter((m) => m.id !== match.id));
      setSelectedMatch(updated);
      // Auto-close after short delay when marking watched from "To Watch" tab
      if (tab === 'towatch') {
        setTimeout(() => setSelectedMatch(null), 1200);
      }
    } catch {
      // silent fail
    } finally {
      setMarkingWatched(false);
    }
  }

  const genres = selectedMatch?.media.genre
    ? selectedMatch.media.genre.split(',').map((g) => g.trim()).filter(Boolean)
    : [];

  function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return (
    <div className="matches-page">
      {/* Tabs */}
      <div className="matches-tabs">
        <button
          className={`matches-tab${tab === 'towatch' ? ' active' : ''}`}
          onClick={() => setTab('towatch')}
        >
          To Watch
        </button>
        <button
          className={`matches-tab${tab === 'watched' ? ' active' : ''}`}
          onClick={() => setTab('watched')}
        >
          Watched
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="empty-state">
          <div className="loading-spinner" />
        </div>
      ) : matches.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🍿</div>
          <h3>{tab === 'towatch' ? 'No matches yet' : 'Nothing watched yet'}</h3>
          <p>
            {tab === 'towatch'
              ? 'Keep swiping! Matches appear when everyone in the room swipes right.'
              : 'Mark matches as watched and they will show up here.'}
          </p>
          <button className="btn btn-secondary" onClick={fetchMatches}>
            Refresh
          </button>
        </div>
      ) : (
        <div className="matches-grid">
          {matches.map((match) => (
            <div
              key={match.id}
              className="match-card"
              onClick={() => setSelectedMatch(match)}
            >
              {match.watched && <div className="match-card-watched">&#x2713;</div>}
              <img
                className="match-card-poster"
                src={match.media.poster_url}
                alt={match.media.title}
                loading="lazy"
              />
              <div className="match-card-info">
                <div className="match-card-title">{match.media.title}</div>
                <div className="match-card-sub">
                  <span>{match.media.year}</span>
                  {match.media.rating > 0 && (
                    <span className="match-card-rating">
                      &#9733; {match.media.rating.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedMatch && (
        <div className="match-detail-overlay" onClick={() => setSelectedMatch(null)}>
          <div className="match-detail-backdrop" />
          <div className="match-detail-sheet" onClick={(e) => e.stopPropagation()}>
            <img
              className="match-detail-poster"
              src={selectedMatch.media.poster_url}
              alt={selectedMatch.media.title}
            />
            <div className="match-detail-content">
              <h2>{selectedMatch.media.title}</h2>
              <div className="match-detail-year">{selectedMatch.media.year}</div>

              <div className="match-detail-chips">
                {selectedMatch.media.rating > 0 && (
                  <span className="detail-chip">
                    <span style={{ color: '#ffd700' }}>&#9733;</span>{' '}
                    {selectedMatch.media.rating.toFixed(1)}
                  </span>
                )}
                {selectedMatch.media.content_rating && (
                  <span className="detail-chip">{selectedMatch.media.content_rating}</span>
                )}
                {selectedMatch.media.type === 'movie' && selectedMatch.media.duration > 0 && (
                  <span className="detail-chip">{formatDuration(selectedMatch.media.duration)}</span>
                )}
                {selectedMatch.media.type === 'show' && selectedMatch.media.episode_count != null && (
                  <span className="detail-chip">{selectedMatch.media.episode_count} episodes</span>
                )}
                {genres.map((g) => (
                  <span key={g} className="genre-pill">{g}</span>
                ))}
              </div>

              <p className="match-detail-summary">
                {selectedMatch.media.summary || 'No summary available.'}
              </p>

              <div className="match-detail-actions">
                {!selectedMatch.watched ? (
                  <button
                    className="btn-watched"
                    onClick={() => handleMarkWatched(selectedMatch)}
                    disabled={markingWatched}
                  >
                    &#x2713; Mark as Watched
                  </button>
                ) : (
                  <button className="btn-watched done" disabled>
                    &#x2713; Watched
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelectedMatch(null)}
                  style={{ flex: 1 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
