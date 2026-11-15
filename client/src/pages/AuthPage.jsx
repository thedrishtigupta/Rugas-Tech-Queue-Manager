import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Clock, Eye, EyeOff, ListOrdered, Sparkles, Zap } from 'lucide-react';
import { useAuth } from '../context.jsx';
import { BrandMark } from '../components/Layout.jsx';

// Autofocus only on desktop; on phones it would pop the keyboard over the page.
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

function HeroMock() {
  const rows = [
    ['#043', 'Rohan Iyer', '4m'],
    ['#044', 'Isha Verma', '2m'],
    ['#045', 'Dev Kapoor', 'just now'],
  ];
  return (
    <div className="hero-mock" aria-hidden="true">
      <div className="mock-card mock-main">
        <div className="mock-top">
          <span className="mock-label">Now serving</span>
          <span className="mock-live"><span className="pulse" /> Live</span>
        </div>
        <div className="mock-number">#042</div>
        <div className="mock-name">Ananya Mehta</div>
        <div className="mock-btn"><Zap size={14} /> Call next · #043</div>
      </div>
      <div className="mock-card mock-list">
        {rows.map(([n, name, t], i) => (
          <div className="mock-row" key={n} style={{ '--i': i }}>
            <span className="mock-badge">{n}</span>
            <span className="mock-row-name">{name}</span>
            <span className="mock-row-time">{t}</span>
          </div>
        ))}
      </div>
      <div className="mock-chip">
        <Clock size={14} /> Avg wait <b>6m</b> <span className="mock-down">−18%</span>
      </div>
    </div>
  );
}

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (isLogin) await login(form.username.trim(), form.password);
      else await register({ name: form.name.trim(), username: form.username.trim(), password: form.password });
      navigate(location.state?.from || '/queues', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="auth-glow" aria-hidden="true" />
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">QueueFlow</div>
            <div className="brand-sub">by Rugas Tech</div>
          </div>
        </div>

        <div className="auth-copy">
          <span className="eyebrow"><Sparkles size={14} aria-hidden="true" /> Smart queue management</span>
          <h1>Keep every line <span className="text-gradient">moving.</span></h1>
          <p>Issue tokens, call the next person with one click and see exactly how long people wait, all in real time.</p>
          <ul className="auth-points">
            <li><ListOrdered size={18} aria-hidden="true" /> Reorder, call and cancel tokens live</li>
            <li><Zap size={18} aria-hidden="true" /> One-click “Call next” for the top of the queue</li>
            <li><BarChart3 size={18} aria-hidden="true" /> Wait-time and queue-length analytics</li>
          </ul>
        </div>

        <HeroMock />
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit} noValidate>
          <div className="auth-mobile-brand">
            <BrandMark size={40} />
          </div>
          <h2>{isLogin ? 'Welcome Back' : 'Create Your Account'}</h2>
          <p className="muted">{isLogin ? 'Log in to manage your queues.' : 'Start managing queues in under a minute.'}</p>

          {error && <div className="alert" role="alert">{error}</div>}

          {!isLogin && (
            <label className="field">
              <span>Full name</span>
              <input name="name" value={form.name} onChange={set('name')} autoComplete="name" maxLength={60} required />
            </label>
          )}
          <label className="field">
            <span>Username</span>
            <input
              name="username"
              value={form.username}
              onChange={set('username')}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
              autoFocus={FINE_POINTER}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <div className="input-wrap">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={6}
                required
              />
              <button
                type="button"
                className="input-addon"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {!isLogin && <small className="muted">At least 6 characters.</small>}
          </label>

          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
            {busy ? 'Please wait…' : isLogin ? 'Log In' : 'Create Account'}
            {!busy && <ArrowRight size={17} aria-hidden="true" />}
          </button>

          {isLogin && (
            <>
              <div className="divider"><span>or</span></div>
              <button
                type="button"
                className="demo-btn"
                disabled={busy}
                onClick={() => setForm({ name: '', username: 'demo', password: 'demo1234' })}
              >
                <span className="demo-icon"><Sparkles size={16} aria-hidden="true" /></span>
                <span className="demo-text">
                  <b>Try the Demo Account</b>
                  <small>Fills in demo / demo1234 with a week of data</small>
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </>
          )}

          <p className="auth-switch">
            {isLogin ? (
              <>New here? <Link to="/register">Create an account</Link></>
            ) : (
              <>Already have an account? <Link to="/login">Log in</Link></>
            )}
          </p>
        </form>
      </section>
    </div>
  );
}
