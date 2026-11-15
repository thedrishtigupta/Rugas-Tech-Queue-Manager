import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, ListOrdered, LogOut, Moon, Sun, Monitor } from 'lucide-react';
import { useAuth, useTheme } from '../context.jsx';
import { initials } from '../format.js';

const THEMES = [
  { key: 'light', icon: Sun, label: 'Light theme' },
  { key: 'system', icon: Monitor, label: 'System theme' },
  { key: 'dark', icon: Moon, label: 'Dark theme' },
];

const NAV = [
  { to: '/queues', icon: ListOrdered, label: 'Queues' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
];

export function BrandMark({ size = 36 }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width={size * 0.6} height={size * 0.6} fill="none">
        <rect x="4" y="6" width="24" height="5" rx="2.5" fill="currentColor" />
        <rect x="4" y="13.5" width="17" height="5" rx="2.5" fill="currentColor" opacity="0.75" />
        <rect x="4" y="21" width="10" height="5" rx="2.5" fill="currentColor" opacity="0.5" />
      </svg>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useTheme();

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>

      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">QueueFlow</div>
            <div className="brand-sub">by Rugas Tech</div>
          </div>
        </div>

        <div className="nav-section">Workspace</div>
        <nav className="nav" aria-label="Main">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className="nav-link">
              <Icon size={18} aria-hidden="true" /> <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="theme-switch" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                role="radio"
                aria-checked={theme === key}
                aria-label={label}
                className={theme === key ? 'active' : ''}
                onClick={() => setTheme(key)}
                title={label}
              >
                <Icon size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="user-chip">
            <div className="avatar avatar-glow">{initials(user?.name)}</div>
            <div className="user-meta">
              <div className="user-name">{user?.name}</div>
              <div className="user-handle">@{user?.username}</div>
            </div>
            <button className="icon-btn on-dark" onClick={logout} title="Log out" aria-label="Log out">
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>

      {/* Mobile bottom navigation (icon + label) */}
      <nav className="tabbar" aria-label="Main">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className="tab-link">
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
