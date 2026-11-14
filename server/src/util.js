import jwt from 'jsonwebtoken';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Validate and trim a string field. Returns null for optional empty values. */
export function str(value, field, { min = 1, max = 100, optional = false } = {}) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (optional) return null;
    throw new HttpError(400, `${field} is required`);
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
  const v = value.trim();
  if (v.length < min) throw new HttpError(400, `${field} must be at least ${min} characters`);
  if (v.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return v;
}

export function intParam(value, field) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${field}`);
  return n;
}

/** Optional epoch-ms query param, e.g. ?since=... Falls back to the provided default. */
export function tsParam(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Invalid timestamp');
  return Math.floor(n);
}

export function signToken(user, secret) {
  return jwt.sign({ sub: user.id, username: user.username }, secret, { expiresIn: '7d' });
}

export function requireAuth(db, secret) {
  const findUser = db.prepare('SELECT id, name, username FROM users WHERE id = ?');
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Authentication required'));
    try {
      const payload = jwt.verify(token, secret);
      const user = findUser.get(payload.sub);
      if (!user) return next(new HttpError(401, 'Account no longer exists'));
      req.user = { ...user };
      next();
    } catch {
      next(new HttpError(401, 'Session expired, please log in again'));
    }
  };
}
