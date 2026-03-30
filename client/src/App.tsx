import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useParams, useLocation, useNavigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Swipe from './pages/Swipe';
import Matches from './pages/Matches';
import Room from './pages/Room';
import Admin from './pages/Admin';
import BottomNav from './components/BottomNav';
import MatchPopup from './components/MatchPopup';
import { joinRoom as socketJoinRoom, onMatch, offMatch, onMemberJoined, offMemberJoined } from './socket';
import { checkRoomAuth } from './api';
import type { MatchEvent } from './socket';
import type { SwipeResult, Match } from './api';

function RoomLayout() {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [matchPopup, setMatchPopup] = useState<Match | null>(null);
  const [authed, setAuthed] = useState(false);

  // Verify the user belongs to this room, redirect if not
  useEffect(() => {
    if (!code) return;
    checkRoomAuth(code)
      .then(() => setAuthed(true))
      .catch(() => {
        navigate('/', { replace: true });
      });
  }, [code, navigate]);

  // Join socket room
  useEffect(() => {
    if (code && authed) {
      socketJoinRoom(code);
    }
  }, [code, authed]);

  // Listen for match events from socket
  useEffect(() => {
    function handleSocketMatch(data: MatchEvent) {
      setMatchPopup(data.match);
    }
    function handleMemberJoined() {
      // Could show a toast, for now just a no-op
    }

    onMatch(handleSocketMatch);
    onMemberJoined(handleMemberJoined);

    return () => {
      offMatch(handleSocketMatch);
      offMemberJoined(handleMemberJoined);
    };
  }, []);

  // Handle match from swipe API response
  const handleSwipeMatch = useCallback((result: SwipeResult) => {
    if (result.match) {
      setMatchPopup(result.match);
    }
  }, []);

  const dismissMatchPopup = useCallback(() => {
    setMatchPopup(null);
  }, []);

  // Determine which page we're on for routing
  const isSwipe = location.pathname.endsWith('/swipe');
  const isMatches = location.pathname.endsWith('/matches');

  if (!authed) {
    return (
      <div className="empty-state" style={{ height: '100vh' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <>
      {isSwipe && <Swipe onMatch={handleSwipeMatch} />}
      {isMatches && <Matches />}
      {!isSwipe && !isMatches && <Room />}

      <BottomNav />

      {matchPopup && code && (
        <MatchPopup
          match={matchPopup}
          roomCode={code}
          onDismiss={dismissMatchPopup}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/room/:code/swipe" element={<RoomLayout />} />
      <Route path="/room/:code/matches" element={<RoomLayout />} />
      <Route path="/room/:code" element={<RoomLayout />} />
    </Routes>
  );
}
