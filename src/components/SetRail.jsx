import { memo } from 'react'
import { DOMAIN_COLOR } from '../lib/catalog'

/**
 * One tick per card in the set, filled when owned. At 300 cards the row of ticks
 * reads as texture — you see where the holes are without reading a number.
 * Clicking a tick scrolls to that card.
 */
function SetRail({ setCode, setName, cards, qty, onJump }) {
  if (!cards.length) return null
  const owned = cards.reduce((n, c) => n + (qty[c.key] > 0 ? 1 : 0), 0)

  return (
    <div className="railbar">
      <div className="rail-head">
        <span className="rail-set">{setCode}</span>
        <span className="rail-name">{setName}</span>
        <span className="rail-count">
          {owned} / {cards.length} printings
        </span>
      </div>
      <div className="rail" role="list" aria-label={`${setName} completion`}>
        {cards.map((c) => {
          const has = qty[c.key] > 0
          return (
            <button
              key={c.key}
              className="tick"
              data-owned={has}
              role="listitem"
              onClick={() => onJump(c.key)}
              title={`${c.set} ${c.number} · ${c.name}${has ? ` · ${qty[c.key]}x` : ' · missing'}`}
              style={has ? { background: DOMAIN_COLOR[c.domain] || 'var(--none)' } : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}

export default memo(SetRail)
