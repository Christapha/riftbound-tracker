import { memo, useState } from 'react'
import { DOMAIN_COLOR, money } from '../lib/catalog'
import { countOf } from '../lib/useCollection'
import { PUBLIC_MODE } from '../lib/catalog'

function CardTile({ card, qty, lang, onBump }) {
  const [broken, setBroken] = useState(false)
  const here = countOf(qty, card.key, lang)
  const other = countOf(qty, card.key, lang === 'EN' ? 'CN' : 'EN')
  const owned = here > 0 || other > 0

  return (
    <article className="card" data-owned={owned} id={`c-${card.key}`}>
      <div className="art-wrap">
        {card.image && !broken ? (
          <img className="art" src={card.image} alt={card.name} loading="lazy" decoding="async"
               onError={() => setBroken(true)} />
        ) : (
          <div className="art-fallback">{card.set} {card.number}<br />no image</div>
        )}
        {other > 0 && (
          <span className="lang-badge" title={`${other} ${lang === 'EN' ? 'Chinese' : 'English'} ${other === 1 ? 'copy' : 'copies'}`}>
            {lang === 'EN' ? 'CN' : 'EN'} {other}
          </span>
        )}
      </div>

      <div className="domain-bar" style={{ background: DOMAIN_COLOR[card.domain] || 'var(--none)' }} aria-hidden="true" />

      <div className="meta">
        <div className="c-name" title={card.name}>{card.name}</div>
        <div className="c-sub">{card.set} {card.number}{card.rarity ? ` · ${card.rarity}` : ''}</div>
        <div className="c-finish">{card.finish}</div>
        <div className="c-price">{lang === 'CN' ? 'not priced' : money(card.price)}</div>
      </div>

      {PUBLIC_MODE ? (
        <div className="qty qty-static">
          <div className="qty-n" data-owned={here > 0}>{here > 0 ? `${here}x` : '—'}</div>
        </div>
      ) : (
        <div className="qty" data-lang={lang}>
          <button onClick={() => onBump(card.key, -1, lang)} disabled={here === 0}
                  aria-label={`Remove one ${lang} ${card.name}`}>−</button>
          <div className="qty-n" data-owned={here > 0}>{here}</div>
          <button onClick={() => onBump(card.key, 1, lang)} aria-label={`Add one ${lang} ${card.name}`}>+</button>
        </div>
      )}
    </article>
  )
}

export default memo(CardTile)
