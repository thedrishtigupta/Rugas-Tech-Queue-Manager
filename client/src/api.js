const TOKEN_KEY = 'qm.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable - session lasts until reload */
  }
}

/** Start of today in the browser's local time, used for "today" stats. */
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Is it running?');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* non-JSON error page */
    }
  }

  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    setToken(null);
    window.dispatchEvent(new Event('qm:unauthorized'));
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
