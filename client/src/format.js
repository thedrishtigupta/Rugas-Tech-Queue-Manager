export function tokenLabel(n) {
  return `#${String(n).padStart(3, '0')}`;
}

/** 0 -> "0m", 75s -> "1m", 3725s -> "1h 2m" */
export function duration(ms, { seconds = false } = {}) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (seconds) return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
  return `${m}m`;
}

export function clock(ts) {
  if (ts == null) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
