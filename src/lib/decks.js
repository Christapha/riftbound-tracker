import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = 'riftbound.decks.v1'

const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * Decks are stored as the pasted text, not as a resolved card list. Re-running the
 * importer or fixing a finish rule then can't corrupt a saved deck — it just re-resolves
 * against the new catalog next time you open it.
 */
export function useDecks() {
  const [decks, setDecks] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(decks))
    } catch {
      /* surfaced by the collection hook's storage warning */
    }
  }, [decks])

  const saveDeck = useCallback(
    (id, name, text) => {
      const stamp = new Date().toISOString()
      // The id has to be decided out here. A useState updater doesn't run synchronously
      // on dispatch, so anything assigned inside it is still undefined at the return.
      const isUpdate = Boolean(id) && decks.some((d) => d.id === id)
      const finalId = isUpdate ? id : newId()

      setDecks((prev) =>
        isUpdate
          ? prev.map((d) => (d.id === id ? { ...d, name, text, updated: stamp } : d))
          : [...prev, { id: finalId, name, text, created: stamp, updated: stamp }],
      )
      return finalId
    },
    [decks],
  )

  const removeDeck = useCallback((id) => setDecks((prev) => prev.filter((d) => d.id !== id)), [])

  const replaceAllDecks = useCallback((list) => {
    if (!Array.isArray(list)) return
    setDecks(
      list
        .filter((d) => d && typeof d.text === 'string')
        .map((d) => ({
          id: d.id || newId(),
          name: String(d.name || 'Untitled deck'),
          text: d.text,
          created: d.created || new Date().toISOString(),
          updated: d.updated || new Date().toISOString(),
        })),
    )
  }, [])

  return { decks, saveDeck, removeDeck, replaceAllDecks }
}
