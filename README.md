# Riftbound Collection

A self-hosted collection tracker for [Riftbound](https://playriftbound.com), the League of
Legends trading card game. Runs locally for logging what you pull, and builds a second time
as a read-only public page.

**Live site:** https://christapha.github.io/riftbound-tracker/

## What it does

- **Card grid with images** across every set, with unowned cards shown desaturated rather
  than hidden, so gaps stay visible while you scroll.
- **Keyboard logging.** Press `/`, type `ogn 42`, Enter. `x3` for copies, `f` / `sig` / `sp`
  for finish. Opening a box shouldn't need the mouse.
- **Set completion rail** — one tick per printing, filled when owned. At 300 cards a
  percentage tells you nothing; the texture shows whether you're missing a scattered
  handful or a whole numeric block.
- **Deck check.** Paste a decklist and see what you're short, with a cost to finish. Reads
  the riftbound.gg export format directly.
- **Chinese printings** tracked separately from English on the same card, since they carry
  different value.
- **Value over time**, recorded daily, marking the days the collection grew so a rise from
  buying doesn't read as a rise from prices.
- **Prices refresh themselves** daily; card data and images are cached locally and only
  update when asked.

Card data comes from [TCGCSV](https://tcgcsv.com), a free mirror of TCGplayer's product and
price feeds. Prices are English-market.

## Run your own copy

Needs Node 18+ and Python 3. No pip packages.

```bash
npm install
python3 scripts/riftbound_import.py --cards-only --images
npm run dev
```

Then open http://localhost:5180. The first import takes a few minutes — it walks every set
and, with `--images`, downloads roughly 1,200 card images so the grid works offline.

**[Full guide →](docs/GUIDE.md)** covers logging, decks, publishing, updating data, and
where your collection is stored.

## Publishing

`npm run build:public` produces a read-only build with the editing UI compiled out, not
merely hidden. The included GitHub Actions workflow fetches fresh card data, builds, and
deploys to GitHub Pages on every push and once a day.

Your collection lives in `public/collection.json`, written by the **Data → Publish** button
in the local app. It's the only data file in the repo — `catalog.json` is regenerated in CI
and never committed.

## Notes

This is a personal tool published in case it's useful, not a maintained product. It isn't
affiliated with Riot Games. Card names, images, and game content belong to Riot; card
images on the hosted build are served from TCGplayer's CDN.

Finish detection for special printings (Signature, Showcase, Overnumbered) relies on
pattern-matching TCGplayer's product names, which aren't perfectly consistent. If a full
import lands everything in `Base`, adjust `FINISH_RULES` at the top of
`scripts/riftbound_import.py`.
