#!/usr/bin/env python3
"""Precompute road geometry for every day of every plan with the public OSRM router.

Usage: python3 _tools/routes.py _src/01-madeira
Reads  plans.json + locations.json, writes routes.json:
  {plan: [{"legs": [[[lat,lng],...], ...], "ferry": [[[lat,lng],[lat,lng]]], "km": 63.2, "min": 71}, ...]}
Driving legs are routed by OSRM (router.project-osrm.org, 1 request per drive leg group,
cached by coordinates); a "~" stop marks a ferry crossing drawn as a straight line.
"~train" / "~bus" / "~taxi" / "~walk" / "~flight" mark a public-transport hop: it is not routed, it is drawn
as a dashed line through the stops (put intermediate stations as @points to follow the railway);
consecutive hops of one mode merge into one line -> "transit": [{"mode": "train", "line": [...]}].
Done once at authoring time so the published page never calls a routing API.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "travel-guide-bot/1.0"}
OSRM = "https://router.project-osrm.org/route/v1/driving/"


def osrm(coords, cache):
    key = ";".join(f"{lng:.5f},{lat:.5f}" for lat, lng in coords)
    if key in cache:
        return cache[key]
    url = OSRM + urllib.parse.quote(key, safe=";,.-") + "?overview=simplified&geometries=geojson"
    for attempt in range(4):
        try:
            time.sleep(1.2)
            r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
            break
        except Exception as e:  # network hiccup / rate limit
            if attempt == 3:
                raise
            print("  retry:", e, flush=True)
            time.sleep(5 * (attempt + 1))
    route = r["routes"][0]
    res = {
        "line": [[round(lat, 5), round(lng, 5)] for lng, lat in route["geometry"]["coordinates"]],
        "km": route["distance"] / 1000,
        "min": route["duration"] / 60,
    }
    cache[key] = res
    return res


def main():
    d = Path(sys.argv[1])
    plans = json.loads((d / "plans.json").read_text())
    locs = {l["key"]: l for l in json.loads((d / "locations.json").read_text())}

    def ll(stop):
        # a location reached on foot (a lake, a viewpoint) can give "route_ll": where the car stops
        return plans["points"][stop]["ll"] if stop.startswith("@") else locs[stop].get("route_ll", locs[stop]["ll"])

    out, cache = {}, {}
    for pid, plan in plans["plans"].items():
        out[pid] = []
        for n, day in enumerate(plan["days"], 1):
            groups, ferry, transit, cur = [], [], [], []
            stops = day["stops"]
            for i, s in enumerate(stops):
                if s == "~":
                    groups.append(cur)
                    ferry.append([ll(stops[i - 1]), ll(stops[i + 1])])
                    cur = []
                elif s.startswith("~"):
                    groups.append(cur)
                    a, b = ll(stops[i - 1]), ll(stops[i + 1])
                    if transit and transit[-1]["mode"] == s[1:] and transit[-1]["line"][-1] == a:
                        transit[-1]["line"].append(b)
                    else:
                        transit.append({"mode": s[1:], "line": [a, b]})
                    cur = []
                else:
                    cur.append(ll(s))
            groups.append(cur)
            legs, km, mins = [], 0.0, 0.0
            for g in groups:
                if len(g) < 2:
                    continue
                r = osrm(g, cache)
                legs.append(r["line"])
                km += r["km"]
                mins += r["min"]
            out[pid].append({"legs": legs, "ferry": ferry, "transit": transit, "km": round(km), "min": round(mins)})
            print(f"plan {pid} day {n}: {round(km)} km, {round(mins)} min", flush=True)
    (d / "routes.json").write_text(json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    main()
