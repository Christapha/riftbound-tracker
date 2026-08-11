# Riftbound Collection

A local-only tracker for Riftbound cards. Card grid with images, keyboard-speed logging,
set completion at a glance. No account, no server, nothing leaves your machine.

## Setup

```bash
npm install
python3 scripts/riftbound_import.py --cards-only --images   # card data + local images
npm run dev
```

Opens on http://localhost:5180. The importer needs no pip packages — standard library only.

Ships with `public/catalog.sample.json`, a 4-row placeholder the app falls back to so it
runs before you import anything. Your real data goes in `public/catalog.json`, which is
**never** included in a release — that way replacing the project folder can't overwrite it.
If you ever see the sample cards and a warning banner, the catalog is missing: re-run the
importer.

## Logging pulls

The quick-add bar is the point of the whole thing. Press `/` to focus it, then:

| Type | Result |
|---|---|
| `ogn 42` | +1 of Origins 042 |
| `ogn 42 x3` | +3 copies |
| `ogn 42 f` | +1 foil |
| `ogn 42 sig` | +1 signature |
| `ven sp1 006 sp` | +1 of the Vendetta crossover card |

Finish aliases: `f` foil, `s`/`sc` showcase, `sig` signature, `on` overnumbered, `sp`
crossover, `p` promo. Leading zeros are optional — `42` finds `042`.

Copy counts need the `x`. A bare `006` is read as part of a card number, not six copies,
because SP cards are numbered that way.

## Chinese printings

The **EN / CN** switch at the right of the filter bar decides which printing the `+` and `−`
buttons add. Each card carries two independent counters, so a Chinese OGN 042 and an
English one sit on the same card without overwriting each other. When you're on EN and
own Chinese copies, a small `CN 2` badge appears on the card art, and vice versa.

CN copies deliberately carry no value. The price feed is TCGplayer's English market and
applying those numbers to a Chinese card would overstate what you have. They still count
toward everything else — copy totals, the completion rail, deck checks — and the CSV export
has a Language column so you can price them separately.

Note this is different from the **FND** set code. FND is the Chinese-market release with
its own card pool and its own catalog rows. The CN counter is for a Chinese printing of a
card that also exists in English.

## Decks

**Decks** in the top bar. Paste a list and it tells you what you're short, live as you type.

The riftbound.gg export format works as-is:

```
2 Poppy - Paragon (UNL-116)
3 Bandle Soldier (UNL-151)
10 Order Rune (OGN-214)
```

So do plain names, `3x` prefixes, `x3` suffixes, and bare card numbers. `//` and `#`
comments and section headers like `Champions:` are skipped, and leading zeros are optional.

**Saving.** Name a deck and hit Save to keep it on the shelf at the left. Each saved deck
shows its own missing count, and every one re-resolves against your collection whenever the
panel is open — so as you log pulls, the shelf tells you which decks you can now build
without opening any of them.

Decks are stored as the text you pasted, not as a resolved card list. Re-running the
importer or fixing a finish rule can't corrupt a saved deck; it just re-resolves against
the new catalog. Decks ride along in Export backup.

Three things it does on purpose:

- **Any printing counts.** A foil, a showcase and a Chinese copy all satisfy a deck slot,
  so owned totals sum across every finish and language.
- **Lines it can't resolve are listed, not dropped.** A deck check that silently ignores
  two lines is worse than one that admits it failed.
- **Decks don't reserve cards.** Two decks that each want three copies of the same card
  will both report complete when you own three. There is no reservation system.

Cost to finish uses the cheapest priced printing of each missing card. Cards with no price
are counted separately rather than treated as free.

## Where your data lives

Quantities are a flat `{ storageKey: count }` map in browser localStorage, where the key is
the card key for English and `cardKey|CN` for Chinese. That means:

- **Clearing site data wipes it.** Use **Export backup** regularly. It downloads a small
  JSON file you can drop back in with **Load backup**.
- Refreshing the catalog can never damage your counts — re-running the importer only
  rewrites `catalog.json`, and quantities are matched back by key afterwards.
- A different browser or profile is a different collection.

If you want this properly durable, the smallest upgrade is a ~30-line Express server that
reads and writes a `collection.json` on disk, with the app POSTing on change. The state
shape is already a plain map, so it's a drop-in swap for the two `localStorage` calls in
`src/lib/useCollection.js`.

**Sorting.** The order dropdown in the filter bar covers set & number (the default),
price high/low, your own value (copies × price), copies owned, and name. Cards with no
price always sink to the bottom in both price directions — otherwise "low to high" opens
on a wall of unpriced cards.

Note that sorting by value or copies re-sorts as you log, so a card can move out from
under the cursor the moment you increment it. Set & number holds still; use that while
working through a box.

**Owned to CSV** exports just the cards you have, with line values — that's the one to
feed into eBay listings or a pricing sheet.

## Keeping data current

Two different things with two different rhythms, so they're handled separately.

**Prices go stale on their own**, so they refresh automatically. When you open the app and
the prices are more than a day old, it quietly re-reads the price feeds in the background —
that job skips the product endpoints entirely and only patches the price field, so it's
quick. The header shows how old the prices are.

**Card names and images don't change until a set releases**, so they never update on their
own. Both live on your disk and only move when you ask.

Open **Data** in the top bar for three buttons:

| | When |
|---|---|
| Refresh prices | Any time. This is what runs automatically each day. |
| Update card list | A new set released. Full re-import; keeps images you already have. |
| Download images | Once, ideally. Saves every card image locally. |

Downloading images takes a while — it's ~1,200 files, a few tens of MB into
`public/card-images/`. Once done the grid loads instantly and works with no connection.
The job skips anything already on disk, so re-running it after a new set only fetches the
new cards. Any image that fails keeps its network URL and still renders.

The buttons work by asking the dev server to run the importer, so they need
`npm run dev`. The same jobs run from a terminal:

```bash
python3 scripts/riftbound_import.py --prices-only     # prices, fast
python3 scripts/riftbound_import.py --cards-only      # full re-import
python3 scripts/riftbound_import.py --images-only     # cache images locally
python3 scripts/riftbound_import.py --cards-only --images   # both, for a fresh setup
python3 scripts/riftbound_import.py --sets OGN VEN    # limit a full import
python3 scripts/riftbound_import.py --cards-only --out cards.csv   # also write the spreadsheet CSV
```

The catalog is written to a temp file and renamed into place, so an interrupted run can't
leave a half-written catalog where a good one used to be. Only one job runs at a time.

**Check the finish breakdown** a full import prints at the end. TCGplayer's naming for
special printings isn't fully consistent and I couldn't inspect the live Riftbound data
when writing the rules. If everything lands in `Base`, edit `FINISH_RULES` at the top of
`scripts/riftbound_import.py` — it's a pattern table, not logic.

## Value over time

**Value** in the top bar, local build only. A stock-style chart of what the collection has
been worth.

One point is recorded per day while the app is open, holding that day's closing state.
Same-day changes overwrite rather than pile up, so logging a box doesn't produce forty
points.

**There is no backfill, and there can't be.** Price feeds serve today's number only — there
is no honest way to reconstruct what your collection was worth last month, so the chart
starts from the day you first open it and needs two days before it draws anything. That's
a real limitation, not a setting.

**Read it carefully.** The line moving up can mean prices rose *or* that you added cards,
and those are completely different facts. Each point stores the copy count alongside the
value, and the purple ticks along the bottom mark days the collection grew — so a jump
sitting on top of a tick is you buying, not the market moving.

History lives in localStorage next to your quantities and rides along in Export backup, so
restoring a backup restores the chart. **Clear history** under the chart wipes it; there's
no undo, and no way to rebuild it.

What it deliberately doesn't do is track cost basis. The app has no idea what you paid, so
it can show what things are worth but never what you made. For the eBay side, Owned to CSV
with your own purchase column is still the honest answer.


## Publishing a public view

The app can build a second time as a read-only site, which GitHub Pages hosts for free.
There is no backend involved: the local API only exists under `npm run dev`, and the
hosted site is nothing but HTML, JS and two JSON files.

The editing controls aren't hidden on the public build, they're **absent** — quick add,
the steppers, backup and the Data panel are all compiled out, so a visitor's browser has
no code to edit anything with even if they go looking.

**Publishing:**

1. Open **Data** in the app, give the page a title, hit **Publish**. That writes
   `public/collection.json`.
2. Commit and push. That file and your source are the only things in the repo.
3. In the repo's Settings → Pages, set Source to **GitHub Actions**.

The included workflow at `.github/workflows/deploy.yml` does the rest: it fetches fresh
card data in CI, builds with `VITE_PUBLIC=1`, and deploys. `catalog.json` is never
committed — it's regenerated on every run, so the hosted prices are current as of the
last deploy rather than whenever you last imported.

It also runs daily on a schedule, which keeps prices fresh with your machine off. Two
things to know about that: GitHub disables scheduled workflows on repos with no activity
for 60 days, and the workflow assumes a project page at `/<repo>/`. If you use a
`username.github.io` repo instead, delete the `VITE_BASE` line.

Re-publish whenever you want the public view to catch up with what you've logged — the
snapshot is a point in time, not a live feed.

**Images on the public site** come from TCGplayer's CDN, because committing ~1,200 files
would bloat the repo. That means the public site hotlinks someone else's images and will
break if they move. If you'd rather self-host them, run the image job, drop
`public/card-images/` from `.gitignore` and commit — it's a few tens of MB, well within
what Pages allows.

**Worth thinking about before you publish:** the page states what you own and what it's
worth, publicly and permanently, under your GitHub username. That's fine for a trade
binder and less fine as an inventory of valuables tied to an identity. You can publish a
subset by clearing quantities you'd rather not show before hitting Publish.


## Design notes

Colour is reserved for the six domains (Fury, Calm, Mind, Body, Chaos, Order) and used
nowhere else, so a coloured pixel in this UI always carries meaning. Unowned cards are
desaturated rather than hidden, which makes a set's gaps visible while you scroll.

The **set completion rail** under the filter bar is one tick per printing in the set,
filled and domain-coloured when owned. At 300 cards a percentage tells you nothing, but
the texture of the rail shows you immediately whether you're missing a scattered handful
or an entire numeric block. Ticks are clickable and scroll to the card.

## Structure

```
public/catalog.json          card data — regenerated by the importer, safe to delete
scripts/riftbound_import.py  fetches from TCGCSV, writes catalog.json and a CSV
src/lib/catalog.js           loading, normalization, set tables, local API calls
src/lib/useCollection.js     quantity state, localStorage, import/export
src/components/QuickAdd.jsx  the keyboard entry parser
src/components/SetRail.jsx   completion rail
src/components/CardTile.jsx  card tile and stepper
src/components/DataPanel.jsx update buttons for prices, card list and images
src/components/ValueChart.jsx portfolio value chart
src/lib/history.js           daily value snapshots
vite.config.js               dev server plus the small whitelisted local task API
public/card-images/          downloaded images, created by the image job
```

Grid renders 120 cards at a time with a Show more button, and images are lazy-loaded, so
a 1,200-card catalog stays responsive.
