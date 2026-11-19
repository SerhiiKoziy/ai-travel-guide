#!/usr/bin/env python3
"""Find Wikimedia Commons categories for a search term and show file counts.
Usage: python3 commons_find.py "Cabo Girão" "Porto Moniz" ..."""
import json, sys, time, urllib.error, urllib.parse, urllib.request
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "travel-guide-bot/1.0"}

def api(**p):
    p.update(format="json", formatversion=2)
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(p), headers=UA)
    for attempt in range(5):
        try:
            time.sleep(1.5)
            return json.load(urllib.request.urlopen(req, timeout=30))
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(10 * (attempt + 1))
    raise RuntimeError("rate limited")

for term in sys.argv[1:]:
    r = api(action="query", list="search", srsearch=term, srnamespace=14, srlimit=6)
    titles = [h["title"] for h in r["query"]["search"]]
    if not titles:
        print(f"{term}: -"); continue
    info = api(action="query", prop="categoryinfo", titles="|".join(titles))
    out = []
    for pg in info["query"]["pages"]:
        ci = pg.get("categoryinfo", {})
        out.append(f'{pg["title"][9:]} [{ci.get("files",0)}f/{ci.get("subcats",0)}s]')
    print(f"{term}: " + " | ".join(out))
