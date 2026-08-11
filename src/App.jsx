import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LANGS, PUBLIC_MODE, SETS, SORTS, ageOf, facets, loadCatalog, loadPublicCollection, money, runTask, sortCards } from './lib/catalog'
import { countAll, countOf, downloadCSV, downloadJSON, readBackupFile, unslot, useCollection } from './lib/useCollection'
import CardTile from './components/CardTile'
import SetRail from './components/SetRail'
import QuickAdd from './components/QuickAdd'
import DeckCheck from './components/DeckCheck'
import { useDecks } from './lib/decks'
import DataPanel from './components/DataPanel'
import ValueChart from './components/ValueChart'
import BagPanel from './components/BagPanel'
import { useBag } from './lib/bag'
import { useHistory } from './lib/history'

const PAGE = 120

export default function App() {
  const [cards, setCards] = useState(null)
  const [isSample, setIsSample] = useState(false)
  const [meta, setMeta] = useState({})
  const [dataOpen, setDataOpen] = useState(false)
  const [chartOpen, setChartOpen] = useState(false)
  const [bagOpen, setBagOpen] = useState(false)
  const [autoPrice, setAutoPrice] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const live = useCollection()
  const liveDecks = useDecks()
  const [snapshot, setSnapshot] = useState(null)
  const [snapshotState, setSnapshotState] = useState('loading')
  const { bag, bump: bagBump, clear: bagClear } = useBag(PUBLIC_MODE)

  // On the hosted site the collection is a shipped file and nothing can edit it.
  const qty = PUBLIC_MODE ? (snapshot?.quantities || {}) : live.qty
  const decks = PUBLIC_MODE ? (snapshot?.decks || []) : liveDecks.decks
  const bump = PUBLIC_MODE ? () => {} : live.bump
  const { replaceAll, saveError } = live
  const { saveDeck, removeDeck, replaceAllDecks } = liveDecks

  const [activeSet, setActiveSet] = useState('ALL')
  const [search, setSearch] = useState('')
  const [finish, setFinish] = useState('ALL')
  const [rarity, setRarity] = useState('ALL')
  const [ownedOnly, setOwnedOnly] = useState(PUBLIC_MODE)
  const [sort, setSort] = useState('number')
  const [lang, setLang] = useState('EN')
  const [deckOpen, setDeckOpen] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [toast, setToast] = useState(null)
  const fileRef = useRef(null)

  const refreshCatalog = useCallback(async () => {
    const { cards: c, sample, ...rest } = await loadCatalog()
    setCards(c)
    setIsSample(sample)
    setMeta(rest)
    return { sample, ...rest }
  }, [])

  useEffect(() => {
    if (!PUBLIC_MODE) return
    loadPublicCollection().then((doc) => {
      if (doc) {
        setSnapshot(doc)
        setSnapshotState('ok')
      } else {
        // Without a snapshot the "Owned only" default hides every card, which reads as a
        // blank page rather than a missing file. Say what happened and show the catalog.
        setSnapshotState('missing')
        setOwnedOnly(false)
      }
    })
  }, [])

  useEffect(() => {
    refreshCatalog()
      .then(({ sample, pricesUpdated }) => {
        // Prices are the only thing that goes stale on its own, so they refresh quietly
        // once a day. The card list never changes without being asked.
        const age = ageOf(pricesUpdated)
        // The hosted build has no dev server to ask; its prices come from the deploy.
        if (PUBLIC_MODE || sample || (age && age.hours < 24)) return
        setAutoPrice('running')
        runTask('prices')
          .then(() => refreshCatalog())
          .then(() => setAutoPrice('done'))
          .catch(() => setAutoPrice(null)) // no dev server, or offline — not worth a warning
      })
      .catch((e) => setLoadError(e.message))
  }, [refreshCatalog])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => setLimit(PAGE), [activeSet, search, finish, rarity, ownedOnly, sort])

  const opts = useMemo(() => (cards ? facets(cards) : { finishes: [], rarities: [] }), [cards])

  const setsPresent = useMemo(() => {
    if (!cards) return []
    const found = new Set(cards.map((c) => c.set))
    const known = SETS.filter((s) => found.has(s.code))
    const extra = [...found].filter((c) => !SETS.some((s) => s.code === c)).sort()
    return [...known, ...extra.map((code) => ({ code, name: code }))]
  }, [cards])

  const visible = useMemo(() => {
    if (!cards) return []
    const q = search.trim().toLowerCase()
    const kept = cards.filter((c) => {
      if (activeSet !== 'ALL' && c.set !== activeSet) return false
      if (finish !== 'ALL' && c.finish !== finish) return false
      if (rarity !== 'ALL' && c.rarity !== rarity) return false
      if (ownedOnly && countAll(qty, c.key) === 0) return false
      if (q && !(c.nameLC.includes(q) || c.number.toLowerCase().includes(q) ||
                 c.rarity.toLowerCase().includes(q) || c.type.toLowerCase().includes(q))) return false
      return true
    })

    // Value follows the header: English copies at English prices. A Chinese copy has no
    // price here, so counting it would inflate the ordering.
    const valueOf = (c) => (c.price || 0) * countOf(qty, c.key, 'EN')
    return sortCards(kept, sort, valueOf, (c) => countAll(qty, c.key))
  }, [cards, activeSet, finish, rarity, ownedOnly, search, qty, sort])

  const railCards = useMemo(
    () => (cards && activeSet !== 'ALL' ? cards.filter((c) => c.set === activeSet) : []),
    [cards, activeSet])

  const stats = useMemo(() => {
    if (!cards) return { copies: 0, distinct: 0, value: 0, cn: 0 }
    let copies = 0, distinct = 0, value = 0, cn = 0
    const byKey = new Map(cards.map((c) => [c.key, c]))
    for (const [storageKey, n] of Object.entries(qty)) {
      if (!n) continue
      const { cardKey, lang: l } = unslot(storageKey)
      copies += n
      distinct += 1
      if (l === 'CN') { cn += n; continue }
      const c = byKey.get(cardKey)
      if (c?.price) value += c.price * n
    }
    return { copies, distinct, value, cn }
  }, [cards, qty])

  const { history, replaceHistory, clearHistory } = useHistory(
    stats,
    !PUBLIC_MODE && Boolean(cards) && !isSample,
  )

  const priceAge = useMemo(() => ageOf(meta.pricesUpdated), [meta.pricesUpdated])

  const availableOf = useCallback((c) => countAll(qty, c.key), [qty])
  const bagCount = useMemo(
    () => Object.values(bag).reduce((n, v) => n + (v > 0 ? v : 0), 0),
    [bag],
  )

  const jumpTo = (key) => {
    const el = document.getElementById(`c-${key}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    else setToast('That card is hidden by the current filters.')
  }

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { quantities, decks: savedDecks, history: savedHistory } = await readBackupFile(file)
      replaceAll(quantities)
      if (savedDecks) replaceAllDecks(savedDecks)
      if (savedHistory) replaceHistory(savedHistory)
      setToast(
        `Loaded ${Object.keys(quantities).length} entries` +
        (savedDecks?.length ? `, ${savedDecks.length} decks` : '') +
        (savedHistory?.length ? `, ${savedHistory.length} history points` : ''))
    } catch (err) { setToast(err.message) }
  }

  const ready = cards && cards.length > 0

  return (
    <div className="app">
      <header className="masthead">
        <h1 className="wordmark">Riftbound<span>Collection</span></h1>

        <div className="stats">
          <div>
            <div className="stat-k">{stats.copies.toLocaleString()}</div>
            <div className="stat-l">Copies{stats.cn ? ` · ${stats.cn} CN` : ''}</div>
          </div>
          <div>
            <div className="stat-k">{stats.distinct.toLocaleString()}</div>
            <div className="stat-l">Distinct</div>
          </div>
          <div>
            <div className="stat-k">{money(stats.value)}</div>
            <div className="stat-l">
              {autoPrice === 'running'
                ? 'Refreshing prices…'
                : `English market value${priceAge ? ` · ${priceAge.label}` : ''}`}
            </div>
          </div>
        </div>

        <div className="tools">
          {PUBLIC_MODE && (
            <button className="btn btn-go" onClick={() => setBagOpen(true)} disabled={!ready}>
              Your list{bagCount ? ` · ${bagCount}` : ''}
            </button>
          )}
          {(decks.length > 0 || !PUBLIC_MODE) && (
            <button className="btn btn-go" onClick={() => setDeckOpen(true)} disabled={!ready}>
              Decks{decks.length ? ` · ${decks.length}` : ''}
            </button>
          )}
          {!PUBLIC_MODE && (
            <>
              <button className="btn" onClick={() => setDataOpen(true)} title="Update card list, images and prices">
                Data
              </button>
              <button className="btn" onClick={() => setChartOpen(true)} title="Collection value over time">
                Value
              </button>
              <button className="btn" onClick={() => downloadJSON(qty, decks, history)}>Export backup</button>
              <button className="btn btn-quiet" onClick={() => fileRef.current?.click()}>Load backup</button>
            </>
          )}
          <button className="btn btn-quiet" onClick={() => { downloadCSV(cards || [], qty); setToast('CSV of owned cards downloaded') }}>
            Owned to CSV
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: 'none' }} />
        </div>
      </header>

      {snapshotState === 'missing' && (
        <div className="banner">
          <strong>No collection published.</strong> This site couldn't read
          <code>collection.json</code>, so it's showing the card catalogue rather than anyone's
          collection. If this is your site: publish a snapshot from the local app and make sure
          the file is committed at <code>public/collection.json</code>.
        </div>
      )}

      {snapshotState === 'ok' && Object.keys(snapshot?.quantities || {}).length === 0 && (
        <div className="banner">
          <strong>Nothing published yet.</strong> The snapshot loaded but lists no cards.
        </div>
      )}

      {isSample && (
        <div className="banner">
          <strong>Showing sample data.</strong> Your card counts are safe, but the catalog is
          missing — run <code>python3 scripts/riftbound_import.py --cards-only</code> in the project
          folder and refresh to get your cards and prices back.
        </div>
      )}

      {ready && (
        <>
          <div className="controls">
            {!PUBLIC_MODE && (
              <QuickAdd cards={cards} lang={lang} onAdd={(key, n) => { bump(key, n, lang); jumpTo(key) }} />
            )}

            <div className="search">
              <input value={search} placeholder="Search name, number or rarity" aria-label="Search cards"
                     onChange={(e) => setSearch(e.target.value)} />
            </div>

            <select value={activeSet} onChange={(e) => setActiveSet(e.target.value)} aria-label="Set">
              <option value="ALL">All sets</option>
              {setsPresent.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
            </select>

            <select value={rarity} onChange={(e) => setRarity(e.target.value)} aria-label="Rarity">
              <option value="ALL">All rarities</option>
              {opts.rarities.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>

            <select value={finish} onChange={(e) => setFinish(e.target.value)} aria-label="Finish">
              <option value="ALL">All finishes</option>
              {opts.finishes.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>

            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort order">
              {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>

            <div className="seg">
              <button data-on={!ownedOnly} onClick={() => setOwnedOnly(false)}>Everything</button>
              <button data-on={ownedOnly} onClick={() => setOwnedOnly(true)}>Owned only</button>
            </div>

            {!PUBLIC_MODE && (
            <div className="seg seg-lang" title="Which printing the + and − buttons add">
              {LANGS.map((l) => (
                <button key={l.code} data-on={lang === l.code} title={l.title} onClick={() => setLang(l.code)}>
                  {l.label}
                </button>
              ))}
            </div>
            )}
          </div>

          {activeSet !== 'ALL' && (
            <SetRail setCode={activeSet} setName={setsPresent.find((s) => s.code === activeSet)?.name || ''}
                     cards={railCards} qty={qty} onJump={jumpTo} />
          )}
        </>
      )}

      {loadError && (
        <div className="empty">
          <h2>No catalog yet</h2>
          <p>The app looks for <code>public/catalog.json</code> and could not read it ({loadError}).</p>
          <p>Build it by running <code>python3 scripts/riftbound_import.py --cards-only</code> from the project folder, then refresh.</p>
        </div>
      )}

      {!cards && !loadError && <div className="empty"><p>Loading catalog…</p></div>}

      {cards && cards.length === 0 && (
        <div className="empty">
          <h2>The catalog is empty</h2>
          <p><code>catalog.json</code> parsed fine but had no usable rows. Each entry needs at least a set code and a card number.</p>
        </div>
      )}

      {ready && visible.length === 0 && (
        <div className="empty">
          <h2>Nothing matches</h2>
          <p>Clear the search or set the filters back to All to see the full set.</p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="grid">
          {visible.slice(0, limit).map((c) => (
            <CardTile
              key={c.key}
              card={c}
              qty={qty}
              lang={lang}
              onBump={bump}
              bagQty={bag[c.key] || 0}
              onBag={PUBLIC_MODE ? bagBump : undefined}
            />
          ))}
          {visible.length > limit && (
            <div className="loadmore">
              <button className="btn" onClick={() => setLimit((n) => n + PAGE)}>
                Show more — {visible.length - limit} left
              </button>
            </div>
          )}
        </div>
      )}

      {deckOpen && ready && (
        <DeckCheck
          cards={cards}
          qty={qty}
          decks={decks}
          onSave={saveDeck}
          onRemove={removeDeck}
          onClose={() => setDeckOpen(false)}
          onJump={(k) => { setDeckOpen(false); setTimeout(() => jumpTo(k), 60) }}
        />
      )}

      {bagOpen && PUBLIC_MODE && ready && (
        <BagPanel
          bag={bag}
          cards={cards}
          availableOf={availableOf}
          onBump={bagBump}
          onClear={bagClear}
          onClose={() => setBagOpen(false)}
          title={snapshot?.title}
          contact={snapshot?.contact}
          submitUrl={snapshot?.submitUrl}
          submitKey={snapshot?.submitKey}
          email={snapshot?.email}
        />
      )}

      {chartOpen && !PUBLIC_MODE && (
        <div className="sheet" role="dialog" aria-label="Collection value">
          <div className="sheet-head">
            <h2>Value over time</h2>
            <button className="btn btn-quiet" onClick={() => setChartOpen(false)}>Close</button>
          </div>
          <div className="sheet-body">
            <ValueChart
              history={history}
              onClear={() => {
                clearHistory()
                setToast('History cleared')
              }}
            />
          </div>
        </div>
      )}

      {dataOpen && !PUBLIC_MODE && (
        <DataPanel
          meta={meta}
          qty={qty}
          decks={decks}
          onClose={() => setDataOpen(false)}
          onDone={() => refreshCatalog().then(() => setToast('Card data updated')).catch(() => {})}
        />
      )}

      {(toast || saveError) && <div className="toast">{saveError || toast}</div>}
    </div>
  )
}
