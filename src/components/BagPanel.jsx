import { useMemo, useState } from 'react'
import { DOMAIN_COLOR, money } from '../lib/catalog'
import { bagAsText, encodeBag, reconcile } from '../lib/bag'

export default function BagPanel({ bag, cards, availableOf, onBump, onClear, onClose, title, contact }) {
  const [copied, setCopied] = useState(null)

  const { rows, dropped } = useMemo(
    () => reconcile(bag, cards, availableOf),
    [bag, cards, availableOf],
  )

  const totals = rows.reduce(
    (t, r) => {
      t.cards += r.want
      if (r.card.price != null) t.value += r.card.price * r.want
      else t.unpriced += r.want
      return t
    },
    { cards: 0, value: 0, unpriced: 0 },
  )

  const text = useMemo(() => bagAsText(rows, title), [rows, title])

  const flash = (what) => {
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  const copy = async (payload, what) => {
    try {
      await navigator.clipboard.writeText(payload)
      flash(what)
    } catch {
      flash('failed')
    }
  }

  const shareUrl = () => {
    const base = `${window.location.origin}${window.location.pathname}`
    return `${base}#bag=${encodeBag(bag)}`
  }

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `riftbound-want-list-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="sheet" role="dialog" aria-label="Your list">
      <div className="sheet-head">
        <h2>Your list</h2>
        <button className="btn btn-quiet" onClick={onClose}>Close</button>
      </div>

      <div className="sheet-body">
        {rows.length === 0 ? (
          <div className="chart-empty">
            <h3>Nothing picked yet</h3>
            <p>
              Use the <strong>+</strong> on any card to add it. When you're done, export the
              list here and send it over.
            </p>
          </div>
        ) : (
          <>
            <div className="deck-tally">
              <div>
                <div className="stat-k">{totals.cards}</div>
                <div className="stat-l">Cards</div>
              </div>
              <div>
                <div className="stat-k">{money(totals.value)}</div>
                <div className="stat-l">
                  Reference value{totals.unpriced ? ` · ${totals.unpriced} unpriced` : ''}
                </div>
              </div>
            </div>

            <ul className="deck-list">
              {rows.map(({ card, want, have }) => (
                <li key={card.key} className="deck-row bag-row">
                  <span className="deck-dot" style={{ background: DOMAIN_COLOR[card.domain] || 'var(--none)' }} />
                  <span className="deck-name bag-name">
                    {card.name}
                    <span className="bag-finish">{card.finish}</span>
                  </span>
                  <span className="deck-ref">{card.set} {card.number}</span>
                  <span className="deck-cost">{card.price != null ? money(card.price) : '—'}</span>
                  <span className="bag-qty">
                    <button onClick={() => onBump(card.key, -1, have)} aria-label={`One fewer ${card.name}`}>−</button>
                    <b>{want}</b>
                    <button onClick={() => onBump(card.key, 1, have)} disabled={want >= have}
                            aria-label={`One more ${card.name}`}>+</button>
                  </span>
                  <span className="bag-have">of {have}</span>
                </li>
              ))}
            </ul>

            {dropped > 0 && (
              <p className="deck-note">
                {dropped} item{dropped === 1 ? '' : 's'} removed — no longer in the collection.
              </p>
            )}

            <div className="bag-actions">
              <button className="btn btn-go" onClick={() => copy(text, 'list')}>
                {copied === 'list' ? 'Copied' : 'Copy list'}
              </button>
              <button className="btn" onClick={() => copy(shareUrl(), 'link')}>
                {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
              <button className="btn btn-quiet" onClick={download}>Download .txt</button>
              <button className="btn btn-quiet bag-clear" onClick={onClear}>Clear list</button>
            </div>
            {copied === 'failed' && (
              <p className="deck-note">Clipboard blocked by the browser — use Download instead.</p>
            )}

            <p className="deck-note">
              {contact
                ? <>Send it to <strong>{contact}</strong>.</>
                : 'Send the copied list however you normally get in touch.'}
              {' '}The link version reopens this page with the same list already filled in.
            </p>

            <details className="deck-details">
              <summary>Preview what gets copied</summary>
              <pre className="bag-preview">{text}</pre>
            </details>

            <p className="chart-note">
              Prices shown are TCGplayer market reference, not an asking price, and nothing here
              reserves anything. Your list stays in your browser — adding cards doesn't notify
              anyone until you send it.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
