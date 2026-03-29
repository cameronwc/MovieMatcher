import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Match } from '../api';

interface MatchPopupProps {
  match: Match;
  roomCode: string;
  onDismiss: () => void;
}

export default function MatchPopup({ match, roomCode, onDismiss }: MatchPopupProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  function handleViewMatches() {
    onDismiss();
    navigate(`/room/${encodeURIComponent(roomCode)}/matches`);
  }

  return (
    <div className="match-popup-overlay" onClick={onDismiss}>
      <div className="match-popup-content" onClick={(e) => e.stopPropagation()}>
        <div className="match-popup-emoji">🎉</div>
        <div className="match-popup-title">It's a Match!</div>
        {match.media.poster_url && (
          <img
            className="match-popup-poster"
            src={match.media.poster_url}
            alt={match.media.title}
          />
        )}
        <div className="match-popup-media-title">{match.media.title}</div>
        <div className="match-popup-actions">
          <button className="btn btn-primary btn-full" onClick={handleViewMatches}>
            View Matches
          </button>
          <button className="btn btn-secondary btn-full" onClick={onDismiss}>
            Keep Swiping
          </button>
        </div>
      </div>
    </div>
  );
}
