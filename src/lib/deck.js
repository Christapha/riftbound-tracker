/**
 * Decklist parsing.
 *
 * There is no single Riftbound decklist format, so this accepts the shapes people
 * actually paste and is deliberate about what it refuses to guess at. Anything it
 * cannot resolve is reported back rather than silently dropped — a deck check that
 * quietly ignores two lines is worse than one that says it failed.
 *
 * Understood:
 *   3 OGN-042              3x OGN 042            OGN-042 x3
 *   3 Ahri                 3x Ahri - Inquisitive  Ahri x3
 *   1 Jinx (OGN 117)       // comments and # comments are stripped
 *   Champion: / Main Deck  section headers are skipped
 */

const SECTION =
  /^(main|side|sideboard|champion|legend|battlefield|rune|spell|unit|gear|token)s?(\s+(deck|board|list))?\s*:?\s*$/i

export function parseDeck(text) {
  const entries = []
  const unparsed = []

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/(^|\s)(\/\/|#).*$/, '').trim()
    if (!line) continue
    if (SECTION.test(line)) continue

    let qty = 1
    let rest = line

    // "3 Ahri" or "3x Ahri"
    const pre = rest.match(/^(\d{1,3})\s*[xX]?\s+(.+)$/)
    if (pre) {
      qty = parseInt(pre[1], 10)
      rest = pre[2].trim()
    } else {
      // "Ahri x3" — only with an explicit x, or a card number would be read as a count
      const post = rest.match(/^(.+?)\s+[xX](\d{1,3})$/)
      if (post) {
        rest = post[1].trim()
        qty = parseInt(post[2], 10)
      }
    }

    if (!rest || qty < 1) {
      unparsed.push(line)
      continue
    }

    // A set code plus number anywhere in the line identifies the card exactly.
    const ref = rest.match(/\b([A-Z]{2,5})[\s\-]?(\d{1,4})\b(?:\s*\/\s*\d+)?/i)
    let set = null
    let number = null
    if (ref) {
      set = ref[1].toUpperCase()
      number = ref[2]
    }

    // Name is the line minus any parenthetical set reference.
    const name = rest
      .replace(/\(([^)]*)\)/g, ' ')
      .replace(/\b[A-Z]{2,5}[\s\-]?\d{1,4}\b(?:\s*\/\s*\d+)?/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (!set && !name) {
      unparsed.push(line)
      continue
    }

    entries.push({ qty, set, number, name, line })
  }

  // Deliberately not merged here. "3 OGN-042" and "4 Ahri" may be the same card, and
  // only resolution against the catalog can tell — merging on the raw text would let one
  // pile of copies satisfy two separate rows.
  return { entries, unparsed }
}

const stripZeros = (n) => (/^\d+$/.test(n) ? String(parseInt(n, 10)) : n)

/**
 * Resolves each deck entry against the catalog and works out what is missing.
 * Any printing counts toward a deck slot — a foil and a base copy are both just the card —
 * so owned totals sum across every finish and language.
 */
export function checkDeck(deck, cards, qty, countAll) {
  const byCardId = new Map()
  const byName = new Map()
  for (const c of cards) {
    if (!byCardId.has(c.cardId)) byCardId.set(c.cardId, [])
    byCardId.get(c.cardId).push(c)
    if (!byName.has(c.nameLC)) byName.set(c.nameLC, [])
    byName.get(c.nameLC).push(c)
  }

  const groups = new Map()
  const unmatched = []

  for (const e of deck.entries) {
    let printings = null

    if (e.set && e.number) {
      printings = byCardId.get(`${e.set}-${stripZeros(e.number)}`) || null
    }
    if (!printings && e.name) {
      const n = e.name.toLowerCase()
      printings = byName.get(n) || null
      if (!printings) {
        // Fall back to a unique prefix match, so "Ahri" finds "Ahri - Inquisitive"
        // but an ambiguous stem is reported instead of guessed at.
        const hits = [...byName.keys()].filter((k) => k.startsWith(n))
        if (hits.length === 1) printings = byName.get(hits[0])
      }
    }

    if (!printings || !printings.length) {
      unmatched.push(e)
      continue
    }

    // Merge on the resolved card, so listing a card by number on one line and by name
    // on another counts as one requirement rather than two.
    const id = printings[0].cardId
    const existing = groups.get(id)
    if (existing) {
      existing.need += e.qty
      continue
    }

    const owned = printings.reduce((n, c) => n + countAll(qty, c.key), 0)
    const priced = printings.filter((c) => c.price != null).sort((a, b) => a.price - b.price)
    const display = printings.find((c) => c.finish === 'Base') || printings[0]

    groups.set(id, {
      id,
      name: display.name,
      set: display.set,
      number: display.number,
      image: display.image,
      domain: display.domain,
      cardKey: display.key,
      need: e.qty,
      owned,
      unit: priced.length ? priced[0].price : null,
    })
  }

  const rows = [...groups.values()].map((g) => {
    const missing = Math.max(0, g.need - g.owned)
    return { ...g, missing, cost: g.unit != null ? g.unit * missing : null }
  })

  rows.sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name))

  const totals = rows.reduce(
    (t, r) => {
      t.need += r.need
      t.missing += r.missing
      if (r.cost != null) t.cost += r.cost
      else if (r.missing > 0) t.unpriced += r.missing
      return t
    },
    { need: 0, missing: 0, cost: 0, unpriced: 0 },
  )

  return { rows, unmatched, unparsed: deck.unparsed, totals }
}
