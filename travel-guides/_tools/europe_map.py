#!/usr/bin/env python3
"""Build the data for the home page map: _src/home/map.json.

    python3 travel-guides/_tools/europe_map.py

Downloads Natural Earth (countries 1:50m, admin-1 1:10m) into _tools/.cache once,
projects everything to Lambert azimuthal equal-area (centre 10°E 52°N, like EPSG:3035)
and writes simplified SVG paths:
  countries: [{"iso": "FRA", "d": "M..."}]          base map, clipped to the view
  guides:    {slug: {"d": "M...", "units": [...], "pin": [x, y]}}
A guide's highlighted area = every admin-1 unit (province / department / district)
that contains at least one point of its locations.json (only the main country, unless
meta.json "home_map": {"all_countries": true}); the pin = mean of its points or home_map.pin.
Re-run after adding a guide (it reads the GUIDES list from build.py).
"""
import json
import math
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build import GUIDES  # noqa: E402

CACHE = Path(__file__).resolve().parent / ".cache"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
FILES = ["ne_50m_admin_0_countries", "ne_10m_admin_1_states_provinces"]

LON0, LAT0 = math.radians(10), math.radians(52)
WIDTH = 1000.0
# Points the view must contain: Iceland, Madeira, Cyprus, Moscow, North Cape, Canaries edge.
VIEW_PTS = [(-25.5, 66.5), (-21.5, 30.8), (-16, 29.3), (35.5, 34.5), (40, 56), (28, 71.2), (-10, 36)]


def laea(lon, lat):
    lam, phi = math.radians(lon), math.radians(lat)
    k = math.sqrt(2 / (1 + math.sin(LAT0) * math.sin(phi) + math.cos(LAT0) * math.cos(phi) * math.cos(lam - LON0)))
    x = k * math.cos(phi) * math.sin(lam - LON0)
    y = k * (math.cos(LAT0) * math.sin(phi) - math.sin(LAT0) * math.cos(phi) * math.cos(lam - LON0))
    return x, y


_xs, _ys = zip(*(laea(*p) for p in VIEW_PTS))
X0, X1, Y0, Y1 = min(_xs), max(_xs), min(_ys), max(_ys)
SCALE = WIDTH / (X1 - X0)
HEIGHT = round((Y1 - Y0) * SCALE)


def proj(lon, lat):
    x, y = laea(lon, lat)
    return ((x - X0) * SCALE, (Y1 - y) * SCALE)


def load(name):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / f"{name}.geojson"
    if not f.exists():
        print("download", name)
        urllib.request.urlretrieve(NE + f.name, f)
    return json.loads(f.read_text())["features"]


def polygons(geom):
    if geom is None:
        return []
    return geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]


def simplify(pts, tol):
    """Douglas–Peucker, iterative."""
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy) or 1e-9
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / n if (dx or dy) else math.hypot(px - ax, py - ay)
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def clip(pts, x0, y0, x1, y1):
    """Sutherland–Hodgman against an axis-aligned rectangle."""
    def edge(points, inside, cross):
        out = []
        for i, cur in enumerate(points):
            prev = points[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
        return out

    def at_x(x):
        return lambda p, q: (x, p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]))

    def at_y(y):
        return lambda p, q: (p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]), y)

    for inside, cross in ((lambda p: p[0] >= x0, at_x(x0)), (lambda p: p[0] <= x1, at_x(x1)),
                          (lambda p: p[1] >= y0, at_y(y0)), (lambda p: p[1] <= y1, at_y(y1))):
        pts = edge(pts, inside, cross)
        if not pts:
            break
    return pts


def area(pts):
    return abs(sum(pts[i - 1][0] * p[1] - p[0] * pts[i - 1][1] for i, p in enumerate(pts))) / 2


def ring_path(pts, prec):
    f = f"{{:.{prec}f}}"
    return "M" + "L".join(f.format(x) + "," + f.format(y) for x, y in pts) + "Z"


def geom_path(geom, tol, min_area, prec, margin=30):
    out = []
    for poly in polygons(geom):
        for ring in poly:
            pts = [proj(lon, lat) for lon, lat in ring]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            if max(xs) < -margin or min(xs) > WIDTH + margin or max(ys) < -margin or min(ys) > HEIGHT + margin:
                continue
            pts = clip(pts, -margin, -margin, WIDTH + margin, HEIGHT + margin)
            pts = simplify(pts + [pts[0]], tol)[:-1] if len(pts) > 3 else pts
            if len(pts) >= 3 and area(pts) >= min_area:
                out.append(ring_path(pts, prec))
    return "".join(out)


def contains(geom, lon, lat):
    for poly in polygons(geom):
        inside = False
        for ri, ring in enumerate(poly):
            c = False
            for i in range(len(ring)):
                (x1, y1), (x2, y2) = ring[i - 1], ring[i]
                if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                    c = not c
            if ri == 0:
                inside = c
                if not inside:
                    break
            elif c:  # inside a hole
                inside = False
        if inside:
            return True
    return False


def main():
    countries = []
    for f in load(FILES[0]):
        p = f["properties"]
        d = geom_path(f["geometry"], tol=0.45, min_area=1.5, prec=1)
        if d:
            countries.append({"iso": p["ADM0_A3"], "name": p["NAME"], "d": d})

    admin = load(FILES[1])
    guides = {}
    for g in GUIDES:
        locf = ROOT / "_src" / g["slug"] / "locations.json"
        if not locf.exists():
            continue
        pts = [tuple(l["ll"]) for l in json.loads(locf.read_text())]
        hits = []  # (unit, number of points inside)
        for f in admin:
            n = sum(contains(f["geometry"], lng, lat) for lat, lng in pts)
            if n:
                hits.append((f, n))
        # Points on a border pass (Portalet, Hondarribia) must not pull in the neighbour country.
        by_cc = {}
        for f, n in hits:
            by_cc[f["properties"]["adm0_a3"]] = by_cc.get(f["properties"]["adm0_a3"], 0) + n
        main_cc = max(by_cc, key=by_cc.get) if by_cc else ""
        # meta.json "home_map": {"all_countries": true, "pin": [lat, lng]} — for multi-country trips
        hm = json.loads((locf.parent / "meta.json").read_text()).get("home_map", {})
        units = [f for f, _ in hits if hm.get("all_countries") or f["properties"]["adm0_a3"] == main_cc]
        lat = sum(p[0] for p in pts) / len(pts)
        lng = sum(p[1] for p in pts) / len(pts)
        if hm.get("pin"):
            lat, lng = hm["pin"]
        guides[g["slug"]] = {
            "units": [u["properties"]["name"] for u in units],
            "country": units[0]["properties"]["adm0_a3"] if units else "",
            "d": "".join(geom_path(u["geometry"], tol=0.12, min_area=0.02, prec=2) for u in units),
            "pin": [round(c, 1) for c in proj(lng, lat)],
        }
        print(g["slug"], "→", ", ".join(guides[g["slug"]]["units"]))

    out = ROOT / "_src" / "home" / "map.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"w": WIDTH, "h": HEIGHT, "countries": countries, "guides": guides},
                              ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {out} ({out.stat().st_size // 1024} KB), view {WIDTH:.0f}×{HEIGHT}")


if __name__ == "__main__":
    main()
