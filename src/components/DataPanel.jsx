import { useState } from 'react'
import { ageOf, publishSnapshot, runTask } from '../lib/catalog'

const JOBS = [
  {
    id: 'prices',
    label: 'Refresh prices',
    blurb: 'Reads just the price feeds and patches the catalog. Quick, and safe to run any time.',
    stamp: 'pricesUpdated',
  },
  {
    id: 'catalog',
    label: 'Update card list',
    blurb: 'Full re-import. Run this when a new set releases. Keeps images you have already downloaded.',
    stamp: 'cardsUpdated',
  },
  {
    id: 'images',
    label: 'Download images',
    blurb: 'Saves every card image to disk so the grid loads instantly and works offline. Slow the first time; skips anything already saved.',
    stamp: 'imagesUpdated',
  },
]

export default function DataPanel({ meta, qty, decks, onClose, onDone }) {
  const [busy, setBusy] = useState(null)
  const [log, setLog] = useState(null)
  const [title, setTitle] = useState('')
  const [contact, setContact] = useState('')
  const [submitUrl, setSubmitUrl] = useState('')
  const [submitKey, setSubmitKey] = useState('')
  const [email, setEmail] = useState('')

  const run = async (id) => {
    setBusy(id)
    setLog(null)
    try {
      const res = await runTask(id)
      setLog({ ok: true, text: res.output })
      onDone()
    } catch (e) {
      setLog({ ok: false, text: e.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="sheet" role="dialog" aria-label="Card data">
      <div className="sheet-head">
        <h2>Card data</h2>
        <button className="btn btn-quiet" onClick={onClose}>Close</button>
      </div>

      <div className="sheet-body">
        <p className="data-intro">
          Card names and images live on your disk and only change when you ask. Prices are the
          part that goes stale, so they refresh on their own once a day when you open the app.
        </p>

        {JOBS.map((j) => {
          const age = ageOf(meta[j.stamp])
          return (
            <div className="data-job" key={j.id}>
              <div className="data-job-text">
                <div className="data-job-label">{j.label}</div>
                <div className="data-job-blurb">{j.blurb}</div>
                <div className="data-job-age">
                  {age ? `Last run ${age.label}` : j.id === 'images' ? 'Never run — images load from the network' : 'Never run'}
                </div>
              </div>
              <button className="btn btn-go" disabled={Boolean(busy)} onClick={() => run(j.id)}>
                {busy === j.id ? 'Working…' : 'Run'}
              </button>
            </div>
          )
        })}

        {busy && (
          <p className="data-note">
            Running. Card list and image jobs walk every set, so give them a minute — this
            page stays usable while it works.
          </p>
        )}

        {log && (
          <div className={`data-log ${log.ok ? '' : 'data-log-bad'}`}>
            <strong>{log.ok ? 'Finished' : 'Failed'}</strong>
            <pre>{log.text}</pre>
          </div>
        )}

        <div className="data-publish">
          <div className="data-job-label">Publish a public snapshot</div>
          <div className="data-job-blurb">
            Writes what you own to <code>public/collection.json</code>. Commit and push it and
            the hosted site shows your collection — read-only, with a want list visitors can
            build and send you. Add a form endpoint to get the list emailed to you
            automatically; without one, visitors copy it and send it themselves.
            These fields land in a public file, so only use a publishable form key here.
          </div>
          <div className="data-publish-row">
            <input
              className="deck-name-input"
              value={title}
              placeholder="Page title, e.g. Chris's Riftbound binder"
              aria-label="Public page title"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="data-publish-row">
            <input
              className="deck-name-input"
              value={contact}
              placeholder="Where to reach you, e.g. Discord chris#0001"
              aria-label="Contact shown to visitors"
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
          <div className="data-publish-row">
            <input
              className="deck-name-input"
              value={submitUrl}
              placeholder="Form endpoint URL (optional) — e.g. https://api.web3forms.com/submit"
              aria-label="Form endpoint"
              onChange={(e) => setSubmitUrl(e.target.value)}
            />
          </div>
          <div className="data-publish-row">
            <input
              className="deck-name-input"
              value={submitKey}
              placeholder="Form access key (optional)"
              aria-label="Form access key"
              onChange={(e) => setSubmitKey(e.target.value)}
            />
            <input
              className="deck-name-input"
              value={email}
              placeholder="Email fallback (optional)"
              aria-label="Email fallback"
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="btn btn-go"
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy('publish')
                setLog(null)
                try {
                  const res = await publishSnapshot(qty, decks, title.trim(), contact.trim(), {
                    submitUrl: submitUrl.trim(), submitKey: submitKey.trim(), email: email.trim(),
                  })
                  setLog({ ok: true, text: res.output })
                } catch (e) {
                  setLog({ ok: false, text: e.message })
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === 'publish' ? 'Writing…' : 'Publish'}
            </button>
          </div>
        </div>

        <p className="data-note">
          These buttons need <code>npm run dev</code> — they ask the dev server to run the
          importer for you. The same jobs are always available from a terminal:
          <code>python3 scripts/riftbound_import.py --prices-only</code>
        </p>
      </div>
    </div>
  )
}
