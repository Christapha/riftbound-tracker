import { useEffect, useRef, useState } from 'react'

const KEY = 'riftbound.history.v1'
const MAX_POINTS = 1500 // roughly four years of daily points; kilobytes, not megabytes

const today = () => new Date().toISOString().slice(0, 10)

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Records one point per day: what the collection was worth and how big it was.
 *
 * Both numbers matter. Value alone can't tell you whether you're up because prices moved
 * or because you opened three boxes, so copies rides along and the chart marks the days
 * the collection changed size.
 *
 * There is no backfill. Price feeds serve today's number only, so history starts the day
 * you start recording and there's no honest way to invent what came before.
 */
export function useHistory({ value, copies, distinct }, enabled) {
  const [history, setHistory] = useState(read)
  const timer = useRef(null)

  useEffect(() => {
    if (!enabled) return
    // Only meaningful once something is actually owned.
    if (!distinct) return

    clearTimeout(timer.current)
    // Settle before writing, so clicking + five times doesn't write five times.
    timer.current = setTimeout(() => {
      setHistory((prev) => {
        const date = today()
        const point = {
          d: date,
          v: Math.round((value || 0) * 100) / 100,
          c: copies || 0,
          n: distinct || 0,
        }
        const last = prev[prev.length - 1]

        let next
        if (last && last.d === date) {
          // Same day: overwrite. A day holds its closing state, not every keystroke.
          if (last.v === point.v && last.c === point.c) return prev
          next = [...prev.slice(0, -1), point]
        } else {
          next = [...prev, point]
        }

        if (next.length > MAX_POINTS) next = next.slice(next.length - MAX_POINTS)

        try {
          localStorage.setItem(KEY, JSON.stringify(next))
        } catch {
          return prev
        }
        return next
      })
    }, 1500)

    return () => clearTimeout(timer.current)
  }, [value, copies, distinct, enabled])

  const replaceHistory = (list) => {
    if (!Array.isArray(list)) return
    const clean = list
      .filter((p) => p && typeof p.d === 'string' && Number.isFinite(Number(p.v)))
      .map((p) => ({ d: p.d, v: Number(p.v), c: Number(p.c) || 0, n: Number(p.n) || 0 }))
      .sort((a, b) => a.d.localeCompare(b.d))
    setHistory(clean)
    try {
      localStorage.setItem(KEY, JSON.stringify(clean))
    } catch {
      /* storage full — the in-memory copy still works for this session */
    }
  }

  const clearHistory = () => {
    setHistory([])
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* nothing to do */
    }
  }

  return { history, replaceHistory, clearHistory }
}

export const RANGES = [
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 90 },
  { id: '1y', label: '1Y', days: 365 },
  { id: 'all', label: 'All', days: null },
]

export function sliceRange(history, days) {
  if (!days) return history
  const cut = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const out = history.filter((p) => p.d >= cut)
  // Never render an empty chart just because the window is narrow.
  return out.length >= 2 ? out : history.slice(-2)
}
