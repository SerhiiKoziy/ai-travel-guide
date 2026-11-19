#!/usr/bin/env python3
"""Build photo galleries for guide locations from Wikimedia Commons categories.

Usage: python3 _tools/commons_gallery.py _src/01-madeira
Reads  <dir>/gallery_sources.json  {"key": ["Category A", "Category B"], ...}
Writes <dir>/gallery.json          {"key": [{url, page, author, license}, ...]}

Selection: JPEG, landscape (w >= 1.25 h), original width >= 1600 px,
at most 3 photos per author, spread across the category list, N per location.
Existing keys in gallery.json are kept unless --refresh is passed.
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


def category_files(cat: str):
    params = dict(action="query", generator="categorymembers", gcmtitle="Category:" + cat,
                  gcmtype="file", gcmlimit=50, prop="imageinfo",
                  iiprop="url|size|mime|extmetadata", iiurlwidth=WIDTH,
                  iiextmetadatafilter="Artist|LicenseShortName")
    while True:
        r = api(**params)
        for pg in r.get("query", {}).get("pages", []):
            ii = (pg.get("imageinfo") or [{}])[0]
            if ii.get("mime") != "image/jpeg":
                continue
            w, h = ii.get("width", 0), ii.get("height", 1)
            if w < 1600 or w < 1.25 * h:
                continue
            meta = ii.get("extmetadata", {})
            yield {
                "url": ii.get("thumburl") or ii["url"],
                "page": ii["descriptionurl"],
                "author": clean(meta.get("Artist", {}).get("value")),
                "license": clean(meta.get("LicenseShortName", {}).get("value")),
                "title": pg["title"],
            }
        if "continue" not in r:
            break
        params.update(r["continue"])


def pick(cands):
    out, per_author = [], {}
    if not cands:
        return out
    step = max(1, len(cands) // (N * 2))
    ordered = cands[::step] + [c for i, c in enumerate(cands) if i % step]
    for c in ordered:
        if per_author.get(c["author"], 0) >= 3:
            continue
        per_author[c["author"]] = per_author.get(c["author"], 0) + 1
        out.append(c)
        if len(out) == N:
            break
    return out


def main():
    d = Path(sys.argv[1])
    refresh = "--refresh" in sys.argv
    sources = json.loads((d / "gallery_sources.json").read_text())
    gpath = d / "gallery.json"
    gallery = json.loads(gpath.read_text()) if gpath.exists() else {}
    for key, cats in sources.items():
        if key in gallery and not refresh:
            continue
        cands, seen = [], set()
        for cat in cats:
            for f in category_files(cat):
                if f["title"] not in seen:
                    seen.add(f["title"])
                    cands.append(f)
        gallery[key] = [{k: v for k, v in p.items() if k != "title"} for p in pick(cands)]
        print(f"{key}: {len(cands)} candidates -> {len(gallery[key])}", flush=True)
        gpath.write_text(json.dumps(gallery, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
