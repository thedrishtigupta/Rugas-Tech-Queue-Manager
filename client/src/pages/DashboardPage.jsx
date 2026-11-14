import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Clock, Hourglass, Timer, Ticket, CheckCircle2, XCircle, Users, TrendingUp, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import { duration } from '../format.js';

const RANGES = [
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

const C1 = 'var(--series-1)';
const C2 = 'var(--series-2)';
const C3 = 'var(--series-3)';

function tickFormatter(range) {
  return (t) => {
    const d = new Date(t);
    if (range === '24h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === '7d') return `${d.toLocaleDateString([], { weekday: 'short' })} ${String(d.getHours()).padStart(2, '0')}h`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };
}

function labelFormatter(range, size) {
  return (t) => {
    const a = new Date(t);
    const b = new Date(t + size);
    if (range === '30d') return a.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    const day = a.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    const hm = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${day}, ${hm(a)}–${hm(b)}`;
  };
}

function ChartTooltip({ active, payload, label, labelFmt, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{labelFmt ? labelFmt(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tip-row">
          <span className="swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <b>{p.value == null ? '—' : `${p.value}${unit}`}</b>
        </div>
      ))}
    </div>
  );
}

const axisProps = {
  stroke: 'var(--border-strong)',
  tick: { fill: 'var(--text-muted)', fontSize: 12 },
  tickLine: false,
  axisLine: false,
};

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const range = RANGES.some((r) => r.key === params.get('range')) ? params.get('range') : '24h';
  const queueId = params.get('queueId') || '';

  const [queues, setQueues] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    api('/queues').then((d) => setQueues(d.queues)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ range, tz: String(new Date().getTimezoneOffset()) });
      if (queueId) qs.set('queueId', queueId);
      const d = await api(`/analytics?${qs}`);
      setData(d);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range, queueId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const tickFmt = useMemo(() => tickFormatter(range), [range]);
  const labelFmt = useMemo(() => labelFormatter(range, data?.bucketSize ?? 0), [range, data?.bucketSize]);
  const k = data?.kpis;
  const hasHistory = data && (k.totalTokens > 0 || k.waitingNow > 0);
  const tickInterval = range === '24h' ? 3 : range === '7d' ? 3 : 4;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Wait times, throughput and queue-length trends.</p>
        </div>
        <div className="filters">
          <select value={queueId} onChange={(e) => setParam('queueId', e.target.value)} aria-label="Queue">
            <option value="">All queues</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
          <div className="segmented" role="radiogroup" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                role="radio"
                aria-checked={range === r.key}
                className={range === r.key ? 'active' : ''}
                onClick={() => setParam('range', r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={load} title="Refresh" aria-label="Refresh" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}

      {!data && !error && (
        <div className="kpi-grid">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="card skeleton" style={{ height: 96 }} />)}
        </div>
      )}

      {data && (
        <>
          <div className="kpi-grid">
            <Kpi icon={Clock} label="Average wait" value={duration(k.avgWaitMs)} sub={`Median ${duration(k.medianWaitMs)} · P90 ${duration(k.p90WaitMs)}`} />
            <Kpi icon={Timer} label="Average service time" value={duration(k.avgServiceMs)} sub="From call to completion" />
            <Kpi icon={Users} label="Waiting now" value={k.waitingNow} sub={k.longestWaitNowMs != null ? `Longest ${duration(k.longestWaitNowMs)}` : 'Nobody waiting'} />
            <Kpi icon={TrendingUp} label="Peak queue length" value={k.peakLength} sub={k.peakAt ? `Around ${labelFmt(k.peakAt)}` : 'No activity'} />
            <Kpi icon={Ticket} label="Tokens issued" value={k.totalTokens} sub={`In the last ${RANGES.find((r) => r.key === range).label}`} />
            <Kpi icon={CheckCircle2} label="Served" value={k.served} sub={`${k.servingNow} in service now`} />
            <Kpi icon={XCircle} label="Cancelled" value={k.cancelled} sub={k.cancellationRate == null ? '—' : `${Math.round(k.cancellationRate * 100)}% of tokens issued`} />
            <Kpi icon={Hourglass} label="Completion rate" value={k.served + k.cancelled ? `${Math.round((k.served / (k.served + k.cancelled)) * 100)}%` : '—'} sub="Of finished tokens, share served" />
          </div>

          {!hasHistory ? (
            <div className="empty">
              <h3>No activity in this period</h3>
              <p className="muted">Issue and serve some tokens and the charts will fill in.</p>
              <Link to="/queues" className="btn btn-primary">Go to queues</Link>
            </div>
          ) : (
            <div className="chart-grid">
              <ChartCard title="Queue length over time" subtitle="Average and peak number of people waiting" wide>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data.series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="lenFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C1} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={C1} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="t" tickFormatter={tickFmt} interval={tickInterval} {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip content={<ChartTooltip labelFmt={labelFmt} />} cursor={{ stroke: 'var(--border-strong)' }} />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} />
                    <Area type="monotone" dataKey="avgLength" name="Average length" stroke={C1} strokeWidth={2} fill="url(#lenFill)" connectNulls={false} activeDot={{ r: 4 }} />
                    <Area type="monotone" dataKey="peakLength" name="Peak length" stroke={C2} strokeWidth={2} fill="none" activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Average wait time" subtitle="Minutes from joining to being called, by call time">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="t" tickFormatter={tickFmt} interval={tickInterval} {...axisProps} />
                    <YAxis {...axisProps} />
                    <Tooltip content={<ChartTooltip labelFmt={labelFmt} unit=" min" />} cursor={{ stroke: 'var(--border-strong)' }} />
                    <Line type="monotone" dataKey="avgWaitMin" name="Avg wait" stroke={C1} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Arrivals vs. served" subtitle="Tokens issued and completed per period">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="t" tickFormatter={tickFmt} interval={tickInterval} {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip content={<ChartTooltip labelFmt={labelFmt} />} cursor={{ fill: 'var(--hover)' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="arrivals" name="Arrivals" fill={C1} radius={[4, 4, 0, 0]} maxBarSize={14} />
                    <Bar dataKey="served" name="Served" fill={C3} radius={[4, 4, 0, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Wait time distribution" subtitle="How long people waited before being called">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.distribution} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="label" {...axisProps} interval={0} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--hover)' }} />
                    <Bar dataKey="count" name="People" fill={C1} radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="By queue" subtitle="Performance of each queue in this period">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Queue</th>
                        <th className="num">Waiting</th>
                        <th className="num">Issued</th>
                        <th className="num">Served</th>
                        <th className="num">Cancelled</th>
                        <th className="num">Avg wait</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.perQueue.map((q) => (
                        <tr key={q.id}>
                          <td><Link to={`/queues/${q.id}`}>{q.name}</Link></td>
                          <td className="num">{q.waitingNow}</td>
                          <td className="num">{q.tokens}</td>
                          <td className="num">{q.served}</td>
                          <td className="num">{q.cancelled}</td>
                          <td className="num">{duration(q.avgWaitMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub }) {
  return (
    <div className="card kpi">
      <div className="kpi-head">
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, wide }) {
  return (
    <section className={`card chart-card ${wide ? 'wide' : ''}`}>
      <h2 className="card-title">{title}</h2>
      <p className="muted small">{subtitle}</p>
      <div className="chart-body">{children}</div>
    </section>
  );
}
