import { useMemo, useState } from 'react'
import { RANGES, sliceRange } from '../lib/history'
import { money } from '../lib/catalog'

const W = 900
const H = 300
const PAD = { t: 18, r: 62, b: 26, l: 10 }

const fmtDate = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function ValueChart({ history, onClear }) {
  const [range, setRange] = useState('all')
  const [hover, setHover] = useState(null)

  const points = useMemo(
    () => sliceRange(history, RANGES.find((r) => r.id === range)?.days),
    [history, range],
  )

  const geo = useMemo(() => {
    if (points.length < 2) return null

    const t = (p) => new Date(`${p.d}T00:00:00`).getTime()
    const t0 = t(points[0])
    const t1 = t(points[points.length - 1])
    const span = t1 - t0 || 1

    const vals = points.map((p) => p.v)
    let lo = Math.min(...vals)
    let hi = Math.max(...vals)
    if (hi === lo) {
      // A perfectly flat line would divide by zero. Give it breathing room instead.
      const pad = Math.max(hi * 0.05, 1)
      lo -= pad
      hi += pad
    } else {
      const pad = (hi - lo) * 0.12
      lo -= pad
      hi += pad
    }

    const x = (p) => PAD.l + ((t(p) - t0) / span) * (W - PAD.l - PAD.r)
    const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)

    const xy = points.map((p) => ({ ...p, X: x(p), Y: y(p.v) }))
    const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p.X.toFixed(1)},${p.Y.toFixed(1)}`).join(' ')
    const area = `${line} L${xy[xy.length - 1].X.toFixed(1)},${H - PAD.b} L${xy[0].X.toFixed(1)},${H - PAD.b} Z`

    // Days the collection grew — value moving because you added cards is not the same
    // thing as value moving because prices did.
    const adds = xy.filter((p, i) => i > 0 && p.c > xy[i - 1].c)

    return { xy, line, area, lo, hi, gridY: [lo, (lo + hi) / 2, hi].map((v) => ({ v, Y: y(v) })), adds }
  }, [points])

  const first = points[0]
  const last = points[points.length - 1]
  const delta = first && last ? last.v - first.v : 0
  const pct = first && first.v > 0 ? (delta / first.v) * 100 : null
  const up = delta >= 0

  if (history.length < 2) {
    return (
      <div className="chart-empty">
        <h3>Not enough history yet</h3>
        <p>
          A point is recorded once a day while the app is open, so the chart needs at least two
          days before it can draw anything.
        </p>
        <p className="chart-empty-note">
          There's no backfill: price feeds only serve today's number, so there's no honest way to
          reconstruct what your collection was worth last month. It starts from here.
        </p>
        {history.length === 1 && (
          <p className="chart-empty-note">
            First point recorded {fmtDate(history[0].d)} at {money(history[0].v)}.
          </p>
        )}
      </div>
    )
  }

  const active = hover ?? (geo ? geo.xy.length - 1 : 0)
  const cur = geo?.xy[active]

  return (
    <div className="chart">
      <div className="chart-head">
        <div>
          <div className="chart-value">{money(cur?.v ?? last.v)}</div>
          <div className={`chart-delta ${up ? 'up' : 'down'}`}>
            {up ? '▲' : '▼'} {money(Math.abs(delta))}
            {pct != null && ` · ${up ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`}
            <span className="chart-delta-since"> since {fmtDate(first.d)}</span>
          </div>
        </div>
        <div className="seg chart-ranges">
          {RANGES.map((r) => (
            <button key={r.id} data-on={range === r.id} onClick={() => { setRange(r.id); setHover(null) }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {geo && (
        <svg
          className="chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Collection value from ${first.d} to ${last.d}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            const px = ((e.clientX - box.left) / box.width) * W
            let best = 0
            let bestD = Infinity
            geo.xy.forEach((p, i) => {
              const d = Math.abs(p.X - px)
              if (d < bestD) { bestD = d; best = i }
            })
            setHover(best)
          }}
        >
          <defs>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={up ? 'var(--ok)' : 'var(--fury)'} stopOpacity="0.26" />
              <stop offset="100%" stopColor={up ? 'var(--ok)' : 'var(--fury)'} stopOpacity="0" />
            </linearGradient>
          </defs>

          {geo.gridY.map((g, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={g.Y} y2={g.Y} stroke="var(--ink-700)" strokeWidth="1"
                    vectorEffect="non-scaling-stroke" />
              <text x={W - PAD.r + 8} y={g.Y + 3.5} className="chart-axis">{money(g.v)}</text>
            </g>
          ))}

          <path d={geo.area} fill="url(#fill)" />
          <path d={geo.line} fill="none" stroke={up ? 'var(--ok)' : 'var(--fury)'} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

          {geo.adds.map((p) => (
            <line key={p.d} x1={p.X} x2={p.X} y1={H - PAD.b} y2={H - PAD.b - 6}
                  stroke="var(--mind)" strokeWidth="2" vectorEffect="non-scaling-stroke">
              <title>{`${fmtDate(p.d)} — cards added`}</title>
            </line>
          ))}

          {cur && (
            <g>
              <line x1={cur.X} x2={cur.X} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-500)"
                    strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <circle cx={cur.X} cy={cur.Y} r="4" fill={up ? 'var(--ok)' : 'var(--fury)'}
                      stroke="var(--ink-900)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </svg>
      )}

      <div className="chart-foot">
        <span>{cur ? fmtDate(cur.d) : ''}</span>
        <span>{cur ? `${cur.c} copies · ${cur.n} distinct` : ''}</span>
        <span className="chart-legend">
          <i className="chart-legend-tick" /> cards added
        </span>
        <button className="btn btn-quiet btn-sm chart-clear" onClick={onClear}>
          Clear history
        </button>
      </div>

      <p className="chart-note">
        Value is English-market prices at the time each point was recorded, so a rise can mean
        prices moved <em>or</em> that you added cards. The purple ticks mark the days the
        collection grew.
      </p>
    </div>
  )
}
