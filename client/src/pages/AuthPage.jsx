import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, ListOrdered, Zap } from 'lucide-react';
import { useAuth } from '../context.jsx';

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', username: '', password: '' });
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
        <div className="brand">
          <div className="brand-mark">Q</div>
          <div className="brand-name">QueueFlow</div>
        </div>
        <div>
          <h1>Keep every line moving.</h1>
          <p>Create queues, issue tokens, call the next person with one click and see exactly how long people wait.</p>
          <ul className="auth-points">
            <li><ListOrdered size={18} /> Reorder, call and cancel tokens in real time</li>
            <li><Zap size={18} /> One-click “Call next” for the top of the queue</li>
            <li><BarChart3 size={18} /> Wait-time and queue-length analytics</li>
          </ul>
        </div>
        <div className="auth-foot">Demo account: <b>demo</b> / <b>demo1234</b></div>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit} noValidate>
          <h2>{isLogin ? 'Welcome back' : 'Create your account'}</h2>
          <p className="muted">{isLogin ? 'Log in to manage your queues.' : 'Start managing queues in seconds.'}</p>

          {error && <div className="alert">{error}</div>}

          {!isLogin && (
            <label className="field">
              <span>Full name</span>
              <input value={form.name} onChange={set('name')} autoComplete="name" maxLength={60} required />
            </label>
          )}
          <label className="field">
            <span>Username</span>
            <input value={form.username} onChange={set('username')} autoComplete="username" maxLength={30} autoFocus required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
            {!isLogin && <small className="muted">At least 6 characters.</small>}
          </label>

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'} {!busy && <ArrowRight size={16} />}
          </button>

          {isLogin && (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={busy}
              onClick={() => setForm({ name: '', username: 'demo', password: 'demo1234' })}
            >
              Fill demo credentials
            </button>
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
