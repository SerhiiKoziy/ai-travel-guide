#!/usr/bin/env python3
"""Refine location coordinates with OpenStreetMap Nominatim (1 req/s).
Usage: python3 _tools/geocode.py _src/01-madeira [country_code=pt] [region suffix=Madeira]
Updates locations.json "ll" when the hit is within 5 km of the current value."""
import json, math, sys, time, urllib.parse, urllib.request
from pathlib import Path
UA = {"User-Agent": "travel-guide-bot/1.0"}

def km(a, b):
    dy = (a[0] - b[0]) * 111; dx = (a[1] - b[1]) * 111 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)

p = Path(sys.argv[1]) / "locations.json"
CC = sys.argv[2] if len(sys.argv) > 2 else "pt"
REGION = sys.argv[3] if len(sys.argv) > 3 else "Madeira"
locs = json.loads(p.read_text())
for loc in locs:
    for q in (loc["pt"].split(" · ")[0] + ", " + REGION, loc["q"]):
        time.sleep(1.1)
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1, "countrycodes": CC})
        hits = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
        if hits:
            ll = [round(float(hits[0]["lat"]), 5), round(float(hits[0]["lon"]), 5)]
            d = km(ll, loc["ll"])
            if d < 5:
                print(f'{loc["key"]:14} {q:45} moved {d:4.2f} km')
                loc["ll"] = ll
                break
            print(f'{loc["key"]:14} {q:45} REJECT {d:.1f} km')
    else:
        print(f'{loc["key"]:14} kept approximate')
p.write_text(json.dumps(locs, ensure_ascii=False, indent=1))
