#!/usr/bin/env python3
"""Build photo galleries for guide locations from Wikimedia Commons categories.

Usage: python3 _tools/commons_gallery.py _src/01-madeira
Reads  <dir>/gallery_sources.json  {"key": ["Category A", "Category B"], ...}
Writes <dir>/gallery.json          {"key": [{url, page, author, license}, ...]}

Selection: JPEG, landscape (w >= 1.25 h), original width >= 1600 px,
at most 3 photos per author, spread across the category list, N per location.
Existing keys in gallery.json are kept unless --refresh is passed; --only k1,k2 refetches just those.
Small categories (<5 picks) fall back to portrait/smaller files and no per-author cap.
Winter guides: "_winter": true in gallery_sources.json (or --winter) keeps only photos taken
in December–March (EXIF DateTimeOriginal) or with snow/winter words in the title or categories.
A source "Snow in Oslo|Opera|Operahuset" takes files of a broad category whose title matches the regex
(Commons rarely has a "<place> in winter" category, but has "Snow in <city>").
"""
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "travel-guide-bot/1.0"}
N = 8
WIDTH = 1280


def api(**p):
    p.update(format="json", formatversion=2)
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(p), headers=UA)
    for attempt in range(6):
        try:
            time.sleep(1.5)
            return json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("rate limited")


def clean(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", html.unescape(s or ""))
    return re.sub(r"\s+", " ", s).strip()[:80] or "unknown"


WINTER_WORDS = re.compile(
    r"snow|winter|talvi|lumi|vinter|frost|frozen|icicle|ice hotel|ice sculpt|aurora|northern lights|"
    r"revontul|christmas|joulu|xmas|santa claus|january|february|december|tammikuu|helmikuu|joulukuu|"
    r"sled|sledge|toboggan|ski|husky|huskies", re.I)


def is_winter(f: dict) -> bool:
    m = re.search(r"(\d{4})[-:](\d{2})[-:]\d{2}", f.get("date", ""))
    if m and int(m.group(2)) in (12, 1, 2, 3):
        return True
    if m:  # dated outside winter: only an explicit snow word in the title saves it
        return bool(re.search(r"snow|winter|talvi|lumi|vinter|frozen", f["title"], re.I))
    return bool(WINTER_WORDS.search(f["title"] + " " + f.get("cats", "")))


def category_files(cat: str, relaxed: bool = False):
    if "|" in cat:
        cat, rx = cat.split("|", 1)
        yield from (f for f in category_files(cat, relaxed) if re.search(rx, f["title"], re.I))
        return
    params = dict(action="query", generator="categorymembers", gcmtitle="Category:" + cat,
                  gcmtype="file", gcmlimit=50, prop="imageinfo",
                  iiprop="url|size|mime|extmetadata", iiurlwidth=WIDTH,
                  iiextmetadatafilter="Artist|LicenseShortName|DateTimeOriginal|Categories")
    while True:
        r = api(**params)
        for pg in r.get("query", {}).get("pages", []):
            ii = (pg.get("imageinfo") or [{}])[0]
            if ii.get("mime") != "image/jpeg":
                continue
            w, h = ii.get("width", 0), ii.get("height", 1)
            if relaxed:
                if w < 1000:
                    continue
            elif w < 1600 or w < 1.25 * h:
                continue
            meta = ii.get("extmetadata", {})
            yield {
                "url": ii.get("thumburl") or ii["url"],
                "page": ii["descriptionurl"],
                "author": clean(meta.get("Artist", {}).get("value")),
                "license": clean(meta.get("LicenseShortName", {}).get("value")),
                "title": pg["title"],
                "date": clean(meta.get("DateTimeOriginal", {}).get("value")),
                "cats": meta.get("Categories", {}).get("value", ""),
            }
        if "continue" not in r:
            break
        params.update(r["continue"])


def pick(cands, cap=3):
    out, per_author = [], {}
    if not cands:
        return out
    step = max(1, len(cands) // (N * 2))
    ordered = cands[::step] + [c for i, c in enumerate(cands) if i % step]
    for c in ordered:
        if per_author.get(c["author"], 0) >= cap:
            continue
        per_author[c["author"]] = per_author.get(c["author"], 0) + 1
        out.append(c)
        if len(out) == N:
            break
    return out


def main():
    d = Path(sys.argv[1])
    refresh = "--refresh" in sys.argv
    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
    sources = json.loads((d / "gallery_sources.json").read_text())
    winter = "--winter" in sys.argv or sources.pop("_winter", False)
    gpath = d / "gallery.json"
    gallery = json.loads(gpath.read_text()) if gpath.exists() else {}
    for key, cats in sources.items():
        if key.startswith("_"):
            continue
        if only is not None and key not in only:
            continue
        if key in gallery and not refresh and only is None:
            continue
        cands, seen = [], set()
        for cat in cats:
            for f in category_files(cat):
                if f["title"] not in seen:
                    seen.add(f["title"])
                    cands.append(f)
        if winter:
            cands = [c for c in cands if is_winter(c)]
            # a December photo of a city is often snowless: prefer files that show snow, if enough
            snowy = [c for c in cands if re.search(r"snow|lumi|\bsnø|snö|winter|vinter|talvi", c["title"] + c["cats"], re.I)]
            if len(snowy) >= 5:
                cands = snowy
        picked = pick(cands)
        if len(picked) < 5:   # small category: allow portrait/smaller files and more per author
            for cat in cats:
                for f in category_files(cat, relaxed=True):
                    if f["title"] not in seen and (not winter or is_winter(f)):
                        seen.add(f["title"])
                        cands.append(f)
            picked = pick(cands, cap=N)
        gallery[key] = [{k: v for k, v in p.items() if k not in ("title", "date", "cats")} for p in picked]
        print(f"{key}: {len(cands)} candidates -> {len(gallery[key])}", flush=True)
        gpath.write_text(json.dumps(gallery, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
