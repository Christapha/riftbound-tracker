import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = 'riftbound.bag.v1'

/**
 * The visitor's want list on the published site.
 *
 * This is their state, not the owner's — it lives in their browser and never touches the
 * repo. Since there is no server to post to, "sending" a bag means exporting text or a
 * link they pass along however they already talk to you.
 */
function readStored() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** "key:qty;key:qty" — shorter than JSON, and the hash never reaches a server. */
export function encodeBag(bag) {
  const parts = Object.entries(bag)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}:${n}`)
  return encodeURIComponent(parts.join(';'))
}

export function decodeBag(raw) {
  if (!raw) return null
  try {
    const out = {}
    for (const chunk of decodeURIComponent(raw).split(';')) {
      if (!chunk) continue
      const i = chunk.lastIndexOf(':')
      if (i < 1) continue
      const key = chunk.slice(0, i)
      const n = parseInt(chunk.slice(i + 1), 10)
      if (key && Number.isFinite(n) && n > 0) out[key] = n
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

export function useBag(enabled) {
  const [bag, setBag] = useState(() => (enabled ? readStored() : {}))
  const first = useRef(true)

  // A shared link wins over whatever was in this browser, since following one is an
  // explicit request to see that bag.
  useEffect(() => {
    if (!enabled) return
    const m = window.location.hash.match(/[#&]bag=([^&]+)/)
    const shared = m && decodeBag(m[1])
    if (shared) setBag(shared)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    if (first.current) {
      first.current = false
      return
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(bag))
    } catch {
      /* private browsing — the bag still works for this session */
    }
  }, [bag, enabled])

  const setQty = useCallback((key, n, max) => {
    setBag((prev) => {
      const next = { ...prev }
      // Never let someone ask for more copies than exist.
      const v = Math.max(0, Math.min(Math.floor(Number(n) || 0), max ?? Infinity))
      if (v === 0) delete next[key]
      else next[key] = v
      return next
    })
  }, [])

  const bump = useCallback((key, delta, max) => {
    setBag((prev) => {
      const next = { ...prev }
      const v = Math.max(0, Math.min((prev[key] || 0) + delta, max ?? Infinity))
      if (v === 0) delete next[key]
      else next[key] = v
      return next
    })
  }, [])

  const clear = useCallback(() => setBag({}), [])

  return { bag, setQty, bump, clear }
}

/** Trims requests for cards that aren't in the catalog or aren't owned any more. */
export function reconcile(bag, cards, availableOf) {
  const byKey = new Map(cards.map((c) => [c.key, c]))
  const rows = []
  let dropped = 0
  for (const [key, want] of Object.entries(bag)) {
    const card = byKey.get(key)
    const have = card ? availableOf(card) : 0
    if (!card || have < 1) {
      dropped += 1
      continue
    }
    rows.push({ card, want: Math.min(want, have), have })
  }
  rows.sort((a, b) =>
    a.card.set.localeCompare(b.card.set) ||
    a.card.sortNum - b.card.sortNum ||
    a.card.finish.localeCompare(b.card.finish))
  return { rows, dropped }
}

export function bagAsText(rows, title) {
  const total = rows.reduce((t, r) => t + (r.card.price || 0) * r.want, 0)
  const cards = rows.reduce((t, r) => t + r.want, 0)
  const pad = (s, n) => String(s).padEnd(n)

  const lines = [
    `Riftbound want list — ${cards} card${cards === 1 ? '' : 's'}`,
    title ? `From: ${title}` : null,
    `Generated ${new Date().toLocaleDateString()}`,
    '',
    // filter(Boolean) would drop the blank line above along with the nulls.
  ].filter((l) => l !== null)

  for (const { card, want } of rows) {
    const price = card.price != null ? `$${card.price.toFixed(2)} ea` : 'no price'
    lines.push(
      `${pad(`${want}x`, 5)}${pad(card.name, 32)}${pad(`${card.set} ${card.number}`, 12)}` +
      `${pad(card.finish, 20)}${price}`,
    )
  }

  lines.push('')
  lines.push(`Reference total: $${total.toFixed(2)} (TCGplayer market prices, not an offer)`)
  return lines.join('\n')
}
