import { useEffect, useMemo, useState } from 'react'
import { checkDeck, parseDeck } from '../lib/deck'
import { countAll } from '../lib/useCollection'
import { DOMAIN_COLOR, PUBLIC_MODE } from '../lib/catalog'
import { useMoney } from '../lib/currency'

const PLACEHOLDER = `Paste a decklist, for example:

2 Poppy - Paragon (UNL-116)
3 Bandle Soldier (UNL-151)
10 Order Rune (OGN-214)`

export default function DeckCheck({ cards, qty, decks, onSave, onRemove, onClose, onJump }) {
  const money = useMoney()
  const [activeId, setActiveId] = useState(null)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const result = useMemo(
    () => (text.trim() ? checkDeck(parseDeck(text), cards, qty, countAll) : null),
    [text, cards, qty],
  )

  // Every saved deck re-resolves against the current collection, so the shelf is a live
  // readout of what you can actually build rather than a snapshot from when you saved.
  const shelf = useMemo(
    () =>
      decks.map((d) => {
        const r = checkDeck(parseDeck(d.text), cards, qty, countAll)
        return { ...d, missing: r.totals.missing, size: r.totals.need, cost: r.totals.cost }
      }),
    [decks, cards, qty],
  )

  const openDeck = (d) => {
    setActiveId(d.id)
    setName(d.name)
    setText(d.text)
    setDirty(false)
  }

  const startNew = () => {
    setActiveId(null)
    setName('')
    setText('')
    setDirty(false)
  }

  const save = () => {
    const finalName = name.trim() || 'Untitled deck'
    const id = onSave(activeId, finalName, text)
    setName(finalName)
    if (id) setActiveId(id)
    setDirty(false)
  }

  const missingRows = result ? result.rows.filter((r) => r.missing > 0) : []
  const haveRows = result ? result.rows.filter((r) => r.missing === 0) : []

  return (
    <div className="sheet" role="dialog" aria-label="Decks">
      <div className="sheet-head">
        <h2>Decks</h2>
        <button className="btn btn-quiet" onClick={onClose}>Close</button>
      </div>

      <div className="sheet-cols">
        <aside className="shelf">
          <div className="shelf-head">
            <span>Saved</span>
            {!PUBLIC_MODE && <button className="btn btn-quiet btn-sm" onClick={startNew}>New</button>}
          </div>

          {shelf.length === 0 && (
            <p className="shelf-empty">
              {PUBLIC_MODE
                ? 'No decks published.'
                : 'Nothing saved yet. Paste a list, name it, and hit Save to keep it here.'}
            </p>
          )}

          <ul className="shelf-list">
            {shelf.map((d) => (
              <li key={d.id} className="shelf-item" data-active={d.id === activeId}>
                <button className="shelf-open" onClick={() => openDeck(d)}>
                  <span className="shelf-name">{d.name}</span>
                  <span className={`shelf-stat ${d.missing === 0 ? 'shelf-ok' : ''}`}>
                    {d.missing === 0 ? `complete · ${d.size}` : `${d.missing} missing of ${d.size}`}
                  </span>
                </button>
                {!PUBLIC_MODE && <button
                  className="shelf-del"
                  title={`Delete ${d.name}`}
                  aria-label={`Delete ${d.name}`}
                  onClick={() => {
                    onRemove(d.id)
                    if (d.id === activeId) startNew()
                  }}
                >
                  ×
                </button>}
              </li>
            ))}
          </ul>
        </aside>

        <div className="sheet-body">
          {!PUBLIC_MODE && (
          <div className="deck-name-row">
            <input
              className="deck-name-input"
              value={name}
              placeholder="Deck name"
              aria-label="Deck name"
              onChange={(e) => { setName(e.target.value); setDirty(true) }}
            />
            <button className="btn btn-go" onClick={save} disabled={!text.trim()}>
              {activeId ? 'Save changes' : 'Save deck'}
            </button>
            {dirty && activeId && <span className="deck-dirty">unsaved edits</span>}
          </div>
          )}

          <textarea
            className="deck-input"
            value={text}
            spellCheck="false"
            placeholder={PLACEHOLDER}
            onChange={(e) => { setText(e.target.value); setDirty(true) }}
          />

          <p className="deck-help">
            Reads the riftbound.gg export format directly. Card numbers or names both work,
            with or without an <code>x</code>. Any printing you own counts, including Chinese copies.
          </p>

          {result && (
            <>
              <div className="deck-tally">
                <div>
                  <div className="stat-k">{result.totals.missing}</div>
                  <div className="stat-l">Cards missing</div>
                </div>
                <div>
                  <div className="stat-k">{result.totals.need}</div>
                  <div className="stat-l">Deck size</div>
                </div>
                <div>
                  <div className="stat-k">{result.totals.missing ? money(result.totals.cost) : '—'}</div>
                  <div className="stat-l">
                    Cost to finish{result.totals.unpriced ? ` · ${result.totals.unpriced} unpriced` : ''}
                  </div>
                </div>
              </div>

              {result.totals.missing === 0 && result.rows.length > 0 && (
                <p className="deck-note deck-ok">You have every card in this list.</p>
              )}

              {missingRows.length > 0 && (
                <ul className="deck-list">
                  {missingRows.map((r) => (
                    <li key={r.id} className="deck-row">
                      <span className="deck-dot" style={{ background: DOMAIN_COLOR[r.domain] || 'var(--none)' }} />
                      <button className="deck-name" onClick={() => onJump(r.cardKey)}>{r.name}</button>
                      <span className="deck-ref">{r.set} {r.number}</span>
                      <span className="deck-have">{r.owned} of {r.need}</span>
                      <span className="deck-need">need {r.missing}</span>
                      <span className="deck-cost">{r.cost != null ? money(r.cost) : 'no price'}</span>
                    </li>
                  ))}
                </ul>
              )}

              {haveRows.length > 0 && (
                <details className="deck-details">
                  <summary>{haveRows.length} cards you already have</summary>
                  <ul className="deck-list">
                    {haveRows.map((r) => (
                      <li key={r.id} className="deck-row deck-row-done">
                        <span className="deck-dot" style={{ background: DOMAIN_COLOR[r.domain] || 'var(--none)' }} />
                        <button className="deck-name" onClick={() => onJump(r.cardKey)}>{r.name}</button>
                        <span className="deck-ref">{r.set} {r.number}</span>
                        <span className="deck-have">{r.owned} of {r.need}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {(result.unmatched.length > 0 || result.unparsed.length > 0) && (
                <div className="deck-note deck-warn">
                  <strong>Not recognised</strong>
                  <p>
                    These lines didn't match anything in the catalog and are not counted above.
                    Usually a spelling difference, or a card the importer hasn't pulled yet.
                  </p>
                  <ul>
                    {result.unmatched.map((u, i) => <li key={`u${i}`}>{u.line}</li>)}
                    {result.unparsed.map((u, i) => <li key={`p${i}`}>{u}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
