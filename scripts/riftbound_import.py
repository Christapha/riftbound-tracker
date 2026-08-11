#!/usr/bin/env python3
"""
riftbound_import.py — builds and maintains public/catalog.json.

Three jobs, deliberately separate because they have very different costs:

  Full import   every card, every field. Slow. Only needed when a set releases.
                  python3 scripts/riftbound_import.py --cards-only

  Prices only   skips the product endpoints entirely and reads just the price feeds,
                then patches the prices in the existing catalog. Fast, safe to run often.
                  python3 scripts/riftbound_import.py --prices-only

  Images        downloads every card image to public/card-images/ and rewrites the
                catalog to point at local files. Slow once, then the app is offline-
                capable and instant.
                  python3 scripts/riftbound_import.py --images

Data comes from TCGCSV, a free daily mirror of TCGplayer's product and price data.
Standard library only — no pip install.

NOTE ON FINISH DETECTION: TCGplayer's naming for special printings is not perfectly
consistent, and I could not inspect the live Riftbound data when writing this. The
FINISH_RULES table below is the part most likely to need a tweak. After a full import,
check the finish breakdown it prints. Adjust the patterns and re-run — it is a lookup
table, not logic.
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE = "https://tcgcsv.com/tcgplayer"
TIMEOUT = 30

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
CATALOG = os.path.join(ROOT, "public", "catalog.json")
IMAGE_DIR = os.path.join(ROOT, "public", "card-images")

# Checked top to bottom; first match wins, case-insensitive, against the product name.
FINISH_RULES = [
    (r"\bsignature\b",                      "Signature"),
    (r"\bovernumber(ed)?\b",                "Overnumbered"),
    (r"\bshowcase\b|\balt(ernate)? art\b",  "Showcase / Alt Art"),
    (r"\bcrossover\b|\bSP\d|\b-SP\b",       "SP (Crossover)"),
    (r"\bpromo\b|\bjudge\b|\bprerelease\b", "Promo"),
    (r"\btoken\b",                          "Token"),
    (r"\bfoil\b|\bholo(foil)?\b",           "Foil"),
]

SEALED = re.compile(
    r"booster (box|pack|bundle)|starter deck|showdown deck|vault|"
    r"\bcase\b|collector|display|playmat|sleeve|bundle\b|precon",
    re.I,
)


# ECB reference rates via Frankfurter — free, no key. The .dev host is current; the .app
# host is the older one and still answers, so it stands in if the first is unreachable.
FX_ENDPOINTS = [
    "https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY",
    "https://api.frankfurter.app/latest?from=USD&to=JPY",
]


def fetch_rate(manual=None):
    """USD to JPY. A manual rate always wins — see the note in the guide about why you
    might want one that isn't the interbank figure."""
    if manual:
        return {"JPY": float(manual), "rateDate": now()[:10], "source": "manual"}

    for url in FX_ENDPOINTS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "riftbound-tracker/2.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read().decode("utf-8"))
            rate = (data.get("rates") or {}).get("JPY")
            if rate:
                return {"JPY": float(rate), "rateDate": data.get("date") or now()[:10],
                        "source": "ECB via Frankfurter"}
        except Exception as e:
            print(f"  rate lookup failed at {url.split('/')[2]}: {e}")
    return None


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "riftbound-tracker/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} fetching {url}")
    except urllib.error.URLError as e:
        sys.exit(f"Could not reach {url} — {e.reason}")


def find_category(override=None):
    if override:
        return override, f"category {override}"
    for c in get(f"{BASE}/categories").get("results", []):
        blob = f"{c.get('name','')} {c.get('displayName','')}".lower()
        if "riftbound" in blob or "rune battlegrounds" in blob:
            return c["categoryId"], c.get("displayName") or c["name"]
    sys.exit("No Riftbound category found. Check https://tcgcsv.com/tcgplayer/categories "
             "and pass --category-id manually.")


def best_prices(price_rows):
    """Products are one-to-many with prices; prefer the Normal subtype."""
    out = {}
    for p in price_rows:
        pid = p.get("productId")
        mkt = p.get("marketPrice")
        if pid is None or mkt is None:
            continue
        if pid not in out or p.get("subTypeName") == "Normal":
            out[pid] = mkt
    return out


def ext(product):
    return {d.get("name", ""): d.get("value", "") for d in product.get("extendedData", []) or []}


def set_code(number, group_name, group_abbr):
    m = re.match(r"\s*([A-Z]{2,5})[\s\-/]", number or "")
    if m:
        return m.group(1).upper()
    if group_abbr:
        return group_abbr.upper()
    for code, words in {
        "OGN": ["origins"], "OGS": ["proving grounds"], "SFD": ["spiritforged"],
        "UNL": ["unleashed"], "VEN": ["vendetta"], "PROMO": ["promo", "organized play"],
    }.items():
        if any(w in (group_name or "").lower() for w in words):
            return code
    return (group_name or "UNK")[:5].upper()


def card_number(number):
    if not number:
        return ""
    n = re.sub(r"^\s*[A-Z]{2,5}[\s\-]*", "", str(number)).strip()
    head = n.split("/")[0].strip()
    if re.fullmatch(r"\d+", head):
        return head
    return n.replace("/", "-").strip()


def finish_of(name, extras):
    hay = f"{name} {extras.get('Rarity','')}"
    for pattern, label in FINISH_RULES:
        if re.search(pattern, hay, re.I):
            return label
    return "Base"


def clean_name(name):
    n = re.sub(r"\s*\((?:foil|holo(?:foil)?|showcase|alt(?:ernate)? art|signature|"
               r"overnumbered|promo|token|crossover)[^)]*\)", "", name, flags=re.I)
    return re.sub(r"\s{2,}", " ", n).strip()


def load_catalog():
    if not os.path.exists(CATALOG):
        return None
    try:
        with open(CATALOG, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        sys.exit(f"Could not read {CATALOG}: {e}")
    # Older catalogs were a bare array with no metadata wrapper.
    if isinstance(data, list):
        return {"version": 1, "cardsUpdated": None, "pricesUpdated": None, "cards": data}
    return data


def write_catalog(doc):
    os.makedirs(os.path.dirname(CATALOG), exist_ok=True)
    tmp = CATALOG + ".tmp"
    # Write then rename, so an interrupted run can never leave a half-written catalog
    # in place of a good one.
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    os.replace(tmp, CATALOG)


# --------------------------------------------------------------------- prices only
def refresh_prices(cat_id, rate_override=None):
    doc = load_catalog()
    if not doc or not doc.get("cards"):
        sys.exit("No catalog to update. Run a full import first (--cards-only).")

    groups = get(f"{BASE}/{cat_id}/groups").get("results", [])
    prices = {}
    for g in groups:
        prices.update(best_prices(get(f"{BASE}/{cat_id}/{g['groupId']}/prices").get("results", [])))
    print(f"Fetched {len(prices)} prices across {len(groups)} groups")

    changed = missing = 0
    for c in doc["cards"]:
        pid = c.get("id")
        if pid is None:
            missing += 1
            continue
        new = prices.get(pid)
        if new is None:
            missing += 1
            continue
        if c.get("price") != new:
            c["price"] = new
            changed += 1

    fx = fetch_rate(rate_override)
    if fx:
        doc["fx"] = fx
        print(f"USD to JPY: {fx['JPY']} ({fx['source']}, {fx['rateDate']})")

    doc["pricesUpdated"] = now()
    write_catalog(doc)
    print(f"Updated {changed} prices, {missing} cards had no price in the feed")
    if missing and missing == len(doc["cards"]):
        print("Every card missed — this catalog predates product ids. Run a full import once.")


# --------------------------------------------------------------------- images
def cache_images(force=False):
    doc = load_catalog()
    if not doc or not doc.get("cards"):
        sys.exit("No catalog to fetch images for. Run a full import first (--cards-only).")

    os.makedirs(IMAGE_DIR, exist_ok=True)
    total = len(doc["cards"])
    got = skipped = failed = 0

    for i, c in enumerate(doc["cards"], 1):
        remote = c.get("imageRemote") or c.get("image") or ""
        if not remote.startswith("http"):
            skipped += 1
            continue

        pid = c.get("id") or f"{c.get('set','X')}-{c.get('number','0')}-{c.get('finish','Base')}"
        fname = f"{pid}.jpg"
        path = os.path.join(IMAGE_DIR, fname)
        local = f"/card-images/{fname}"

        if os.path.exists(path) and not force:
            c["imageRemote"] = remote
            c["image"] = local
            skipped += 1
            continue

        try:
            req = urllib.request.Request(remote, headers={"User-Agent": "riftbound-tracker/2.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                blob = r.read()
            if len(blob) < 512:
                raise ValueError("suspiciously small response")
            with open(path, "wb") as f:
                f.write(blob)
            c["imageRemote"] = remote
            c["image"] = local
            got += 1
            time.sleep(0.05)  # be a polite guest on someone else's CDN
        except Exception as e:
            failed += 1
            # Leave the remote URL in place so the card still renders from the network.
            print(f"  image failed for {pid}: {e}")

        if i % 100 == 0:
            print(f"  {i}/{total} — {got} downloaded, {skipped} already had, {failed} failed")

    doc["imagesUpdated"] = now()
    write_catalog(doc)
    print(f"Images: {got} downloaded, {skipped} skipped, {failed} failed, into {IMAGE_DIR}")


# --------------------------------------------------------------------- full import
def full_import(args, cat_id, cat_name):
    print(f"Category: {cat_name} (id {cat_id})")
    groups = get(f"{BASE}/{cat_id}/groups").get("results", [])
    print(f"Found {len(groups)} groups")

    rows, skipped = [], 0
    for g in groups:
        gid, gname, gabbr = g["groupId"], g.get("name", ""), g.get("abbreviation", "")
        products = get(f"{BASE}/{cat_id}/{gid}/products").get("results", [])
        prices = best_prices(get(f"{BASE}/{cat_id}/{gid}/prices").get("results", []))

        kept = 0
        for p in products:
            name = p.get("name", "")
            if args.cards_only and SEALED.search(name):
                skipped += 1
                continue

            e = ext(p)
            num_raw = e.get("Number", "")
            code = set_code(num_raw, gname, gabbr)
            if args.sets and code not in {s.upper() for s in args.sets}:
                continue

            pid = p.get("productId")
            img = p.get("imageUrl") or (
                f"https://tcgplayer-cdn.tcgplayer.com/product/{pid}_200w.jpg" if pid else "")

            rows.append({
                "id": pid,
                "set": code,
                "number": card_number(num_raw),
                "finish": finish_of(name, e),
                "name": clean_name(name),
                "rarity": e.get("Rarity", ""),
                "domain": e.get("Domain", "") or e.get("Color", ""),
                "type": e.get("CardType", "") or e.get("Card Type", "") or e.get("Type", ""),
                "image": img,
                "imageRemote": img,
                "price": prices.get(pid),
            })
            kept += 1
        print(f"  {gname:38s} {kept:5d} rows")

    rows.sort(key=lambda r: (r["set"], int(re.sub(r"\D", "", r["number"]) or 0),
                             r["number"], r["finish"]))

    # A full import must not throw away images already on disk.
    previous = load_catalog()
    if previous:
        local = {c.get("id"): c.get("image") for c in previous.get("cards", [])
                 if str(c.get("image", "")).startswith("/card-images/")}
        for r in rows:
            if r["id"] in local:
                r["image"] = local[r["id"]]

    stamp = now()
    fx = fetch_rate(args.rate) or (previous or {}).get("fx")
    if fx:
        print(f"USD to JPY: {fx['JPY']} ({fx['source']}, {fx['rateDate']})")
    else:
        print("No exchange rate available — yen prices will be unavailable.")

    write_catalog({
        "version": 3,
        "cardsUpdated": stamp,
        "pricesUpdated": stamp,
        "imagesUpdated": (previous or {}).get("imagesUpdated"),
        "fx": fx,
        "cards": rows,
    })
    print(f"\nWrote {len(rows)} cards to {CATALOG}" + (f" (skipped {skipped} sealed)" if skipped else ""))

    if args.out:
        cols = ["Set", "Card #", "Finish", "Card Name", "Rarity", "Domain", "Card Type",
                "Image URL", "Market Price", "Price Updated"]
        with open(args.out, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for r in rows:
                w.writerow([r["set"], r["number"], r["finish"], r["name"], r["rarity"],
                            r["domain"], r["type"], r["imageRemote"],
                            "" if r["price"] is None else r["price"], stamp[:10]])
        print(f"Wrote {args.out} for the spreadsheet")

    by = {}
    for r in rows:
        by[r["set"]] = by.get(r["set"], 0) + 1
    print("By set: " + ", ".join(f"{k} {v}" for k, v in sorted(by.items())))
    fin = {}
    for r in rows:
        fin[r["finish"]] = fin.get(r["finish"], 0) + 1
    print("By finish: " + ", ".join(f"{k} {v}" for k, v in sorted(fin.items())))
    print("\nSanity check the finish counts. If everything says 'Base', edit FINISH_RULES "
          "near the top of this file and re-run.")

    if args.images:
        print("\nFetching images...")
        cache_images()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prices-only", action="store_true",
                    help="refresh prices in the existing catalog and nothing else")
    ap.add_argument("--images-only", action="store_true",
                    help="download images for the existing catalog and nothing else")
    ap.add_argument("--images", action="store_true",
                    help="after a full import, also download card images")
    ap.add_argument("--force-images", action="store_true", help="re-download images that already exist")
    ap.add_argument("--cards-only", action="store_true", help="exclude sealed product from a full import")
    ap.add_argument("--sets", nargs="*", help="limit a full import to these set codes")
    ap.add_argument("--out", default="", help="also write a CSV here for the spreadsheet")
    ap.add_argument("--category-id", type=int, help="override category auto-detection")
    ap.add_argument("--rate", type=float,
                    help="fixed USD to JPY rate to use instead of the ECB reference rate")
    args = ap.parse_args()

    if args.prices_only and (args.images or args.images_only):
        sys.exit("Pick one of --prices-only or the image options.")

    if args.prices_only:
        cat_id, _ = find_category(args.category_id)
        refresh_prices(cat_id, args.rate)
        return

    if args.images_only or args.force_images:
        cache_images(force=args.force_images)
        return

    cat_id, cat_name = find_category(args.category_id)
    full_import(args, cat_id, cat_name)


if __name__ == "__main__":
    main()
