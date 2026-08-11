export const SETS = [
  { code: 'OGN', name: 'Origins', released: '2025-10-31' },
  { code: 'OGS', name: 'Origins: Proving Grounds', released: '2025-10-31' },
  { code: 'SFD', name: 'Spiritforged', released: '2026-02-13' },
  { code: 'UNL', name: 'Unleashed', released: '2026-05-08' },
  { code: 'VEN', name: 'Vendetta', released: '2026-07-31' },
  { code: 'FND', name: 'Rune Battlegrounds (CN)', released: null },
  { code: 'PROMO', name: 'Promos & Organized Play', released: null },
]

export const DOMAIN_COLOR = {
  Fury: 'var(--fury)',
  Calm: 'var(--calm)',
  Mind: 'var(--mind)',
  Body: 'var(--body)',
  Chaos: 'var(--chaos)',
  Order: 'var(--order)',
}

/**
 * Language is a property of your copy, not of the catalog row. A Chinese printing of
 * OGN 042 is the same card with the same number — it just carries a different value, and
 * the price feed only covers the English market. So it gets its own counter hanging off
 * the same catalog entry rather than a duplicated card list.
 */
export const LANGS = [
  { code: 'EN', label: 'EN', title: 'English printing — priced from the feed' },
  { code: 'CN', label: 'CN', title: 'Chinese printing — tracked, not priced' },
]

/** Accepts the JSON the importer writes, plus a couple of common header spellings. */
export function normalize(raw) {
  const rows = Array.isArray(raw) ? raw : raw?.cards || []
  const seen = new Map()
  const out = []

  for (const r of rows) {
    const set = String(r.set ?? r.Set ?? '').trim().toUpperCase()
    const number = String(r.number ?? r['Card #'] ?? r.card_number ?? '').trim()
    const finish = String(r.finish ?? r.Finish ?? 'Base').trim() || 'Base'
    if (!set || !number) continue

    // Key on the number with leading zeros stripped, so a source that writes "42"
    // and one that writes "042" resolve to the same card rather than two half-counts.
    const keyNum = /^\d+$/.test(number) ? String(parseInt(number, 10)) : number
    let key = `${set}-${keyNum}-${finish}`

    if (seen.has(key)) {
      const n = seen.get(key) + 1
      seen.set(key, n)
      console.warn(`[catalog] duplicate entry for ${key}, kept as ${key}#${n}`)
      key = `${key}#${n}`
    } else {
      seen.set(key, 1)
    }

    const price = Number(r.price ?? r['Market Price'] ?? r.market_price)
    const name = String(r.name ?? r['Card Name'] ?? '').trim() || 'Unnamed card'

    out.push({
      key,
      set,
      number,
      finish,
      name,
      nameLC: name.toLowerCase(),
      rarity: String(r.rarity ?? r.Rarity ?? '').trim(),
      domain: String(r.domain ?? r.Domain ?? '').trim(),
      type: String(r.type ?? r['Card Type'] ?? '').trim(),
      image: String(r.image ?? r['Image URL'] ?? r.image_url ?? '').trim(),
      price: Number.isFinite(price) && price > 0 ? price : null,
      sortNum: parseInt(String(number).replace(/\D/g, ''), 10) || 0,
      // Identity ignores finish: every printing of OGN 042 is the same card for deck purposes.
      cardId: `${set}-${keyNum}`,
    })
  }

  out.sort((a, b) =>
    a.set.localeCompare(b.set) ||
    a.sortNum - b.sortNum ||
    a.number.localeCompare(b.number) ||
    a.finish.localeCompare(b.finish))

  return out
}

/**
 * Filter options are derived from the cards actually loaded, never from a hardcoded list.
 * A dropdown offering a value the catalog doesn't contain is a dead end that reads as a bug.
 */
export function facets(cards) {
  const finishes = new Set()
  const rarities = new Set()
  for (const c of cards) {
    if (c.finish) finishes.add(c.finish)
    if (c.rarity) rarities.add(c.rarity)
  }
  const alpha = (s) => [...s].sort((a, b) => a.localeCompare(b))
  return { finishes: alpha(finishes), rarities: alpha(rarities) }
}

/**
 * Real data lives in catalog.json, which the importer writes and which ships in no
 * release — a placeholder of that name would silently overwrite an imported catalog when
 * the project folder is replaced. The sample is a separate file used only as a fallback.
 */
async function fetchCatalog(path) {
  const res = await fetch(path, { cache: 'no-store' }).catch(() => null)
  if (!res || !res.ok) return null
  // Vite's dev server answers unknown paths with index.html and a 200, so a successful
  // status proves nothing. Parse defensively rather than trusting res.ok.
  try {
    const data = JSON.parse(await res.text())
    const cards = normalize(data)
    if (!cards.length) return null
    return {
      cards,
      cardsUpdated: data?.cardsUpdated || null,
      pricesUpdated: data?.pricesUpdated || null,
      imagesUpdated: data?.imagesUpdated || null,
    }
  } catch {
    return null
  }
}

export async function loadCatalog() {
  const B = import.meta.env?.BASE_URL || '/'
  const real = await fetchCatalog(`${B}catalog.json`)
  if (real) return { ...real, sample: false }

  const fallback = await fetchCatalog(`${B}catalog.sample.json`)
  if (fallback) return { ...fallback, sample: true }

  throw new Error('no catalog.json and no sample to fall back on')
}

/**
 * True when this build is the read-only public site. Set at build time by
 * `npm run build:public`, so the editing UI is absent from the bundle rather than
 * merely hidden.
 */
// Optional chaining so this module also imports cleanly outside Vite (plain node,
// tests), where import.meta.env doesn't exist.
export const PUBLIC_MODE = import.meta.env?.VITE_PUBLIC === '1'

/** The published snapshot, for the hosted build. */
export async function loadPublicCollection() {
  const res = await fetch(`${import.meta.env?.BASE_URL || '/'}collection.json`, { cache: 'no-store' })
    .catch(() => null)
  if (!res || !res.ok) return null
  try {
    const doc = JSON.parse(await res.text())
    if (!doc || typeof doc.quantities !== 'object') return null
    return doc
  } catch {
    return null
  }
}

/** Sends the current collection to the dev server to be written as a public snapshot. */
export async function publishSnapshot(quantities, decks, title, contact) {
  const res = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantities, decks, title, contact }),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error('No local API. Publishing needs the dev server (npm run dev).')
  }
  if (!res.ok || body.error) throw new Error(body.error || `Publish failed (${res.status})`)
  return body
}

/** Asks the dev server to run one of its whitelisted maintenance tasks. */
export async function runTask(task) {
  const res = await fetch('/api/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task }),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    // The API only exists under `npm run dev`; a built copy serves index.html here.
    throw new Error('No local API. This needs the dev server (npm run dev).')
  }
  if (!res.ok || body.error) throw new Error(body.error || `Task failed (${res.status})`)
  return body
}

export function ageOf(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const h = ms / 3_600_000
  if (h < 1) return { hours: h, label: `${Math.max(1, Math.round(h * 60))} min ago` }
  if (h < 24) return { hours: h, label: `${Math.round(h)}h ago` }
  const d = Math.round(h / 24)
  return { hours: h, label: `${d} day${d === 1 ? '' : 's'} ago` }
}

/**
 * Display orderings. Cards with no price always sink to the bottom regardless of
 * direction — otherwise "low to high" opens on a wall of unpriced cards, which is the
 * least useful thing it could show.
 */
export const SORTS = [
  { id: 'number', label: 'Set & number' },
  { id: 'price-desc', label: 'Price, high to low' },
  { id: 'price-asc', label: 'Price, low to high' },
  { id: 'value-desc', label: 'My value, high to low' },
  { id: 'qty-desc', label: 'Copies owned' },
  { id: 'name', label: 'Name A–Z' },
]

export function sortCards(cards, sort, valueOf, countOf) {
  if (sort === 'number') return cards // already in catalog order

  const byNumber = (a, b) =>
    a.set.localeCompare(b.set) || a.sortNum - b.sortNum ||
    a.number.localeCompare(b.number) || a.finish.localeCompare(b.finish)

  const priced = (a, b, dir) => {
    const av = a.price
    const bv = b.price
    if (av == null && bv == null) return byNumber(a, b)
    if (av == null) return 1
    if (bv == null) return -1
    return av === bv ? byNumber(a, b) : (av - bv) * dir
  }

  // slice() because the catalog array is shared state, and sorting in place would
  // quietly reorder it for everything else reading it.
  const out = cards.slice()
  switch (sort) {
    case 'price-desc': return out.sort((a, b) => priced(a, b, -1))
    case 'price-asc': return out.sort((a, b) => priced(a, b, 1))
    case 'value-desc': return out.sort((a, b) => (valueOf(b) - valueOf(a)) || byNumber(a, b))
    case 'qty-desc': return out.sort((a, b) => (countOf(b) - countOf(a)) || byNumber(a, b))
    case 'name': return out.sort((a, b) => a.nameLC.localeCompare(b.nameLC) || byNumber(a, b))
    default: return out
  }
}

export const money = (n) =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
