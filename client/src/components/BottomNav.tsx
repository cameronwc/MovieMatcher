import { NavLink, useParams } from 'react-router-dom';

export default function BottomNav() {
  const { code } = useParams<{ code: string }>();

  if (!code) return null;

  const base = `/room/${encodeURIComponent(code)}`;

  return (
    <nav className="bottom-nav">
      <NavLink
        to={`${base}/swipe`}
        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      >
        <span className="nav-item-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="18" rx="2" />
            <path d="M8 7v10M16 7v10" />
          </svg>
        </span>
        <span className="nav-item-label">Swipe</span>
      </NavLink>

      <NavLink
        to={`${base}/matches`}
        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      >
        <span className="nav-item-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </span>
        <span className="nav-item-label">Matches</span>
      </NavLink>

      <NavLink
        to={base}
        end
        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      >
        <span className="nav-item-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        <span className="nav-item-label">Room</span>
      </NavLink>
    </nav>
  );
}
