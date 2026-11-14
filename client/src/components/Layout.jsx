import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, ListOrdered, LogOut, Moon, Sun, Monitor } from 'lucide-react';
import { useAuth, useTheme } from '../context.jsx';
import { initials } from '../format.js';

const THEMES = [
  { key: 'light', icon: Sun, label: 'Light' },
  { key: 'system', icon: Monitor, label: 'System' },
  { key: 'dark', icon: Moon, label: 'Dark' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useTheme();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">Q</div>
          <div>
            <div className="brand-name">QueueFlow</div>
            <div className="brand-sub">Queue Manager</div>
          </div>
        </div>

        <nav className="nav">
          <NavLink to="/queues" className="nav-link">
            <ListOrdered size={18} /> <span>Queues</span>
          </NavLink>
          <NavLink to="/dashboard" className="nav-link">
            <LayoutDashboard size={18} /> <span>Dashboard</span>
          </NavLink>
        </nav>

        <div className="sidebar-foot">
          <div className="theme-switch" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                role="radio"
                aria-checked={theme === key}
                className={theme === key ? 'active' : ''}
                onClick={() => setTheme(key)}
                title={label}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
          <div className="user-chip">
            <div className="avatar">{initials(user?.name)}</div>
            <div className="user-meta">
              <div className="user-name">{user?.name}</div>
              <div className="user-handle">@{user?.username}</div>
            </div>
            <button className="icon-btn ghost" onClick={logout} title="Log out" aria-label="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
