import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = 'riftbound.collection.v1'
const KEEP_KEY = 'riftbound.keep.v1'

/**
 * Storage key for one card in one language. English keeps the bare card key so every
 * collection saved before languages existed still loads with no migration step.
 */
export const slot = (cardKey, lang) => (lang === 'EN' ? cardKey : `${cardKey}|${lang}`)

export const countOf = (qty, cardKey, lang) => qty[slot(cardKey, lang)] || 0

/** Every language of one printing, added up. */
export const countAll = (qty, cardKey) =>
  (qty[cardKey] || 0) + (qty[`${cardKey}|CN`] || 0)

/** Splits a storage key back into its parts. */
export function unslot(storageKey) {
  const i = storageKey.indexOf('|')
  return i === -1
    ? { cardKey: storageKey, lang: 'EN' }
    : { cardKey: storageKey.slice(0, i), lang: storageKey.slice(i + 1) }
}

export function useCollection() {
  const [qty, setQty] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })
  const [saveError, setSaveError] = useState(null)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(qty))
      setSaveError(null)
    } catch {
      setSaveError('Browser storage is full. Export a backup now.')
    }
  }, [qty])

  const bump = useCallback((cardKey, delta, lang = 'EN') => {
    const k = slot(cardKey, lang)
    setQty((prev) => {
      const next = { ...prev }
      const v = Math.max(0, (prev[k] || 0) + delta)
      if (v === 0) delete next[k]
      else next[k] = v
      return next
    })
  }, [])

  const replaceAll = useCallback((map) => setQty(map || {}), [])

  return { qty, bump, replaceAll, saveError }
}

/**
 * Copies held back from the published site.
 *
 * Keyed exactly like quantities, so reserving is per printing and per language — keeping
 * your Chinese copy of a card and listing the English one is the normal case, not an edge
 * case. Stored separately from quantities so that clearing a reservation can never
 * disturb the count of what you actually own.
 */
export function useKeep() {
  const [keep, setKeep] = useState(() => {
    try {
      const raw = localStorage.getItem(KEEP_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  })
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    try {
      localStorage.setItem(KEEP_KEY, JSON.stringify(keep))
    } catch {
      /* the collection hook surfaces the storage warning */
    }
  }, [keep])

  const bumpKeep = useCallback((cardKey, delta, lang = 'EN', max = Infinity) => {
    const k = slot(cardKey, lang)
    setKeep((prev) => {
      const next = { ...prev }
      const v = Math.max(0, Math.min((prev[k] || 0) + delta, max))
      if (v === 0) delete next[k]
      else next[k] = v
      return next
    })
  }, [])

  const replaceKeep = useCallback((map) => setKeep(map && typeof map === 'object' ? map : {}), [])

  return { keep, bumpKeep, replaceKeep }
}

export const keptOf = (keep, cardKey, lang) => keep[slot(cardKey, lang)] || 0

/**
 * What the published site is allowed to offer: owned minus reserved, per slot.
 * Clamped at zero and stripped of empties, so a fully reserved card disappears from the
 * public page rather than appearing with nothing available.
 */
export function publishableQty(qty, keep) {
  const out = {}
  for (const [k, n] of Object.entries(qty)) {
    const available = Math.max(0, (n || 0) - (keep[k] || 0))
    if (available > 0) out[k] = available
  }
  return out
}

export function downloadJSON(qty, decks = [], history = [], keep = {}) {
  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob(
    [JSON.stringify(
      { format: 'riftbound-collection', version: 5, exported: stamp, quantities: qty, decks, history, keep },
      null, 2)],
    { type: 'application/json' },
  )
  triggerDownload(blob, `riftbound-collection-${stamp}.json`)
}

export function downloadCSV(cards, qty) {
  const head = ['Set', 'Card #', 'Finish', 'Language', 'Card Name', 'Rarity', 'Qty', 'Unit Price', 'Line Value']
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const byKey = new Map(cards.map((c) => [c.key, c]))
  const lines = [head.join(',')]

  for (const [storageKey, n] of Object.entries(qty)) {
    if (!n) continue
    const { cardKey, lang } = unslot(storageKey)
    const c = byKey.get(cardKey)
    if (!c) continue
    // Prices come from the English market feed, so a CN copy gets no value rather than
    // an English number that would overstate what it is worth.
    const p = lang === 'EN' ? Number(c.price) || 0 : 0
    lines.push([c.set, c.number, c.finish, lang, c.name, c.rarity, n,
      p ? p.toFixed(2) : '', p ? (p * n).toFixed(2) : ''].map(esc).join(','))
  }

  const stamp = new Date().toISOString().slice(0, 10)
  triggerDownload(new Blob([lines.join('\n')], { type: 'text/csv' }), `riftbound-owned-${stamp}.csv`)
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result)
        // Version 1 and 2 backups were a bare quantity map with no decks.
        const map = parsed.quantities || parsed
        if (typeof map !== 'object' || Array.isArray(map)) throw new Error('shape')
        const clean = {}
        for (const [k, v] of Object.entries(map)) {
          const n = Math.max(0, Math.floor(Number(v) || 0))
          if (n) clean[k] = n
        }
        resolve({
          quantities: clean,
          decks: Array.isArray(parsed.decks) ? parsed.decks : null,
          history: Array.isArray(parsed.history) ? parsed.history : null,
          keep: parsed.keep && typeof parsed.keep === 'object' ? parsed.keep : null,
        })
      } catch {
        reject(new Error("That file isn't a collection backup."))
      }
    }
    r.onerror = () => reject(new Error('Could not read that file.'))
    r.readAsText(file)
  })
}
