import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { api, getToken, setToken } from './api.js';

// ---------------------------------------------------------------- Auth

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setReady(true);
      return;
    }
    api('/auth/me')
      .then((d) => !cancelled && setUser(d.user))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('qm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('qm:unauthorized', onUnauthorized);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      async login(username, password) {
        const d = await api('/auth/login', { method: 'POST', body: { username, password } });
        setToken(d.token);
        setUser(d.user);
      },
      async register(form) {
        const d = await api('/auth/register', { method: 'POST', body: form });
        setToken(d.token);
        setUser(d.user);
      },
      logout() {
        setToken(null);
        setUser(null);
      },
    }),
    [user, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// ---------------------------------------------------------------- Toasts

const ToastContext = createContext(null);
let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (message, type = 'success') => {
      const id = ++toastId;
      setToasts((t) => [...t.slice(-3), { id, message, type }]);
      timers.current.set(id, setTimeout(() => dismiss(id), type === 'error' ? 5000 : 3000));
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({ success: (m) => push(m, 'success'), error: (m) => push(m, 'error') }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'error' ? <AlertCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
            <span>{t.message}</span>
            <button className="icon-btn ghost" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------------------------------------------------------------- Theme

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('qm.theme') || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('qm.theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return [theme, setTheme];
}

// ---------------------------------------------------------------- Ticking clock

/** Re-renders every `ms` so elapsed timers stay live. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
