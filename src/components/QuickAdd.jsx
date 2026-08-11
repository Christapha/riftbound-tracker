import { useEffect, useRef, useState } from 'react'

/**
 * Type "ogn 42" and press Enter to add one. The whole point of the app: logging a
 * box of pulls should never require the mouse.
 * Accepts: "ogn 42", "ogn-042", "ogn 42 f" (foil), "ogn 42 x3" (three copies).
 */
const FINISH_ALIAS = {
  f: 'Foil',
  foil: 'Foil',
  s: 'Showcase / Alt Art',
  sc: 'Showcase / Alt Art',
  showcase: 'Showcase / Alt Art',
  sig: 'Signature',
  sg: 'Signature',
  on: 'Overnumbered',
  over: 'Overnumbered',
  sp: 'SP (Crossover)',
  p: 'Promo',
  promo: 'Promo',
}

export default function QuickAdd({ cards, lang, onAdd }) {
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement !== ref.current) {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = () => {
    const raw = value.trim()
    if (!raw) return

    const parts = raw.toLowerCase().replace(/[-/]/g, ' ').split(/\s+/).filter(Boolean)
    if (parts.length < 2) {
      setMsg({ ok: false, text: 'Needs a set and a number, like ogn 42' })
      return
    }

    const set = parts[0].toUpperCase()
    let copies = 1
    let finish = 'Base'
    const numTokens = []

    // Copies must be written x3, never a bare 3 — otherwise "ven sp1 006" reads the
    // 006 as six copies instead of part of the card number.
    for (const p of parts.slice(1)) {
      const m = p.match(/^x(\d+)$/)
      if (m) copies = Math.max(1, parseInt(m[1], 10))
      else if (FINISH_ALIAS[p]) finish = FINISH_ALIAS[p]
      else numTokens.push(p)
    }

    if (!numTokens.length) {
      setMsg({ ok: false, text: 'Needs a card number, like ogn 42' })
      return
    }
    const number = numTokens.join('-')

    const hit = cards.find((c) => {
      if (c.set !== set || c.finish !== finish) return false
      if (c.number.toLowerCase() === number) return true
      // Loose numeric match so "42" finds "042" — only for plain numbers, or
      // "sp1-006" would collide with card 1006.
      return /^\d+$/.test(number) && /^\d+$/.test(c.number) && c.sortNum === parseInt(number, 10)
    })

    if (!hit) {
      setMsg({ ok: false, text: `No ${set} ${number}${finish !== 'Base' ? ` (${finish})` : ''} in the catalog` })
      return
    }

    onAdd(hit.key, copies)
    setMsg({ ok: true, text: `+${copies} ${hit.name}${finish !== 'Base' ? ` · ${finish}` : ''}` })
    setValue('')
  }

  return (
    <div className="quickadd">
      <input
        ref={ref}
        value={value}
        placeholder={`Quick add ${lang} — ogn 42`}
        aria-label="Quick add a card by set and number"
        onChange={(e) => {
          setValue(e.target.value)
          if (msg) setMsg(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') { setValue(''); setMsg(null); e.currentTarget.blur() }
        }}
      />
      <div className={`quickadd-hint ${msg ? (msg.ok ? 'quickadd-hit' : 'quickadd-miss') : ''}`}>
        {msg ? msg.text : 'Press / to jump here · add f, sig or x3'}
      </div>
    </div>
  )
}
