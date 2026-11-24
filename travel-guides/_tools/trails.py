#!/usr/bin/env python3
"""Fetch hiking trail geometry from OpenStreetMap (Overpass) for hikes.json.

Usage: python3 _tools/trails.py _src/01-madeira
Reads  hikes.json  [{key, osm: <relation id>, start: [lat,lng] (approx), ...}]
  optional "bbox": [s, w, n, e]  keeps only the relation's ways inside it (a section of a long path)
  no "osm" but "via": [[lat,lng],...]  the line is routed on foot paths (routing.openstreetmap.de),
  for summits that have no route relation in OSM
Writes trails.json {key: {"lines": [[[lat,lng],...],...], "head": [lat,lng], "km": 6.1}}
"head" = the trail endpoint nearest to the approximate start, so the pin sits on the path.
Lines are thinned to ~20 m spacing to keep the page light.
"""
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "travel-guide-bot/1.0"}


def dist(a, b):
    dy = (a[0] - b[0]) * 111_000
    dx = (a[1] - b[1]) * 111_000 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


def thin(line, step=20):
    out = [line[0]]
    for p in line[1:-1]:
        if dist(p, out[-1]) >= step:
            out.append(p)
    out.append(line[-1])
    return out


def foot_route(via):
    coords = ";".join(f"{lng:.5f},{lat:.5f}" for lat, lng in via)
    url = f"https://routing.openstreetmap.de/routed-foot/route/v1/foot/{coords}?overview=full&geometries=geojson"
    time.sleep(1.2)
    r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
    return thin([[round(lat, 5), round(lng, 5)] for lng, lat in r["routes"][0]["geometry"]["coordinates"]])


def inside(p, bbox):
    return bbox[0] <= p[0] <= bbox[2] and bbox[1] <= p[1] <= bbox[3]


def main():
    d = Path(sys.argv[1])
    hikes = json.loads((d / "hikes.json").read_text())
    ids = ",".join(str(h["osm"]) for h in hikes if h.get("osm"))
    q = f"[out:json][timeout:120];relation(id:{ids});out geom;"
    body = urllib.parse.urlencode({"data": q}).encode()
    servers = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
               "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
               "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
    res = {"elements": []}
    for i, url in enumerate(servers if ids else []):  # a guide with only "via" hikes needs no Overpass call
        try:
            res = json.load(urllib.request.urlopen(urllib.request.Request(url, data=body, headers=UA), timeout=180))
            break
        except Exception as e:  # Overpass is often busy (429/502/504)
            print(f"  {url}: {e}", flush=True)
            if i == len(servers) - 1:
                raise
            time.sleep(20)
    rels = {e["id"]: e for e in res["elements"]}
    out = {}
    for h in hikes:
        if not h.get("osm"):
            lines = [foot_route(h["via"])]
        else:
            rel = rels.get(h["osm"])
            if not rel:
                print(f'{h["key"]}: relation {h["osm"]} missing'); continue
            lines = []
            for m in rel.get("members", []):
                if m["type"] == "way" and m.get("geometry"):
                    pts = [[round(p["lat"], 5), round(p["lon"], 5)] for p in m["geometry"]]
                    if "bbox" in h:
                        pts = [p for p in pts if inside(p, h["bbox"])]
                        if len(pts) < 2:
                            continue
                    lines.append(thin(pts))
        ends = [l[0] for l in lines] + [l[-1] for l in lines]
        head = min(ends, key=lambda p: dist(p, h["start"])) if ends else h["start"]
        km = sum(dist(a, b) for l in lines for a, b in zip(l, l[1:])) / 1000
        out[h["key"]] = {"lines": lines, "head": head, "km": round(km, 1)}
        print(f'{h["key"]}: {len(lines)} ways, {km:.1f} km, head {dist(head, h["start"]):.0f} m from start hint')
    (d / "trails.json").write_text(json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    main()
