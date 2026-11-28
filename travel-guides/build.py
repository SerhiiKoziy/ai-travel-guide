#!/usr/bin/env python3
"""Build the travel-guides static site.

Every page = _template.html + _src/<slug>/{meta.json, content.html[, map.json]}.
The sidebar nav is generated from GUIDES for ALL pages, so adding a country
means: add an entry below, create _src/<slug>/, run `python3 build.py`.

Macros available inside content.html:
  [[gm:Label|search query]]                     -> Google Maps place chip
  [[dir:Label|origin|destination|wp1;wp2;...]]   -> Google Maps driving route chip
  [[photo:key|caption]]                          -> photo figure from photos.json
  {{MAP}}                                        -> inline SVG route map from map.json
  {{PLACES}}                                     -> big map + place cards (places.py)
  {{CATS_LEGEND}}                                -> category icons legend
The TOC ("На цій сторінці") is built from <section id="..."> + its <h2>.
"""
import html
import json
import re
from pathlib import Path
from urllib.parse import quote

import places

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "_src"

# Sidebar groups: (radio id, nav class, label). Order = order in the sidebar.
GROUPS = [
    ("tab-about", "about", "🧭 Про гайди"),
    ("tab-europe", "europe", "🇪🇺 Європа"),
    ("tab-world", "world", "🌍 Світ"),
]

# One entry per page. `group` must be a nav class from GROUPS.
GUIDES = [
    {"slug": "index", "file": "index.html", "group": "about", "nav": "Як влаштовані гайди"},
    {"slug": "01-madeira", "file": "01-madeira.html", "group": "europe", "nav": "1. 🇵🇹 Мадейра: 7 днів"},
    {"slug": "02-north-spain", "file": "02-north-spain.html", "group": "europe", "nav": "2. 🇪🇸 Північ Іспанії: 7 днів"},
    {"slug": "03-panticosa", "file": "03-panticosa.html", "group": "europe", "nav": "3. 🏔 Пантікоса: гори з дітьми"},
    {"slug": "04-edinburgh", "file": "04-edinburgh.html", "group": "europe", "nav": "4. 🏰 Едінбург і околиці: 7 днів"},
    {"slug": "05-italy", "file": "05-italy.html", "group": "europe", "nav": "5. 🍝 Італія без Венеції: 14 днів"},
    {"slug": "06-portugal", "file": "06-portugal.html", "group": "europe", "nav": "6. 🇵🇹 Португалія: Лісабон і Алгарве, 7 днів"},
    {"slug": "07-north-france", "file": "07-north-france.html", "group": "europe", "nav": "7. 🇫🇷 Північ Франції: 7 днів"},
    {"slug": "08-helsinki-rovaniemi", "file": "08-helsinki-rovaniemi.html", "group": "europe", "nav": "8. 🎅 Потягом з Гельсінкі до Санти: 7 днів"},
    {"slug": "09-spain-rovaniemi", "file": "09-spain-rovaniemi.html", "group": "europe", "nav": "9. 🎄 Рованіемі з Іспанії: 7 днів"},
    {"slug": "10-lofoten-winter", "file": "10-lofoten-winter.html", "group": "europe", "nav": "10. 🌌 Лофотени взимку: потяг + авто, 7 днів"},
]


def load_locations(d: Path) -> list:
    """locations.json + optional photo_spots.json {key: {where, ll, time, tip}}:
    a place with a known photo spot gets the "photo" category and a "shot" block."""
    locs = json.loads((d / "locations.json").read_text())
    sp = d / "photo_spots.json"
    spots = json.loads(sp.read_text()) if sp.exists() else {}
    for loc in locs:
        shot = spots.get(loc["key"])
        if shot:
            loc["shot"] = shot
            if "photo" not in loc["cats"]:
                loc["cats"] = loc["cats"] + ["photo"]
    return locs


def render_nav(active_file: str) -> str:
    active_group = next(g["group"] for g in GUIDES if g["file"] == active_file)
    used = [g for g in GROUPS if any(p["group"] == g[1] for p in GUIDES)]
    out = ['  <aside class="nav-sidebar">']
    for rid, cls, _ in used:
        checked = " checked" if cls == active_group else ""
        out.append(f'    <input type="radio" name="topgroup" id="{rid}" class="tab-radio"{checked}>')
    out.append('    <div class="nav-tabbar">')
    for rid, _, label in used:
        out.append(f'      <label for="{rid}" class="nav-tabbtn">{label}</label>')
    out.append("    </div>")
    for _, cls, _ in used:
        out.append(f'      <nav class="nav-links {cls}">')
        for p in GUIDES:
            if p["group"] != cls:
                continue
            act = ' class="active"' if p["file"] == active_file else ""
            out.append(f'        <a href="{p["file"]}"{act}>{html.escape(p["nav"])}</a>')
        out.append("      </nav>")
    out.append("  </aside>")
    return "\n".join(out)


def render_header_nav(active_file: str) -> str:
    """Desktop header menu: the about page as a plain link, every other group as a dropdown."""
    out = ['      <nav class="hnav" aria-label="Гайди">']
    for rid, cls, label in GROUPS:
        pages = [p for p in GUIDES if p["group"] == cls]
        if not pages:
            continue
        current = any(p["file"] == active_file for p in pages)
        cur = " is-current" if current else ""
        if cls == "about":
            p = pages[0]
            out.append(f'        <a class="hn-link{cur}" href="{p["file"]}">{label}</a>')
            continue
        links = "".join(
            f'<a href="{p["file"]}"{" class=\"active\" aria-current=\"page\"" if p["file"] == active_file else ""}>'
            f'{html.escape(p["nav"])}</a>' for p in pages)
        out.append(f'        <div class="hn-group{cur}"><button type="button" class="hn-btn" aria-expanded="false">'
                   f'{label} <span class="hn-chev" aria-hidden="true">▾</span></button>'
                   f'<div class="hn-menu">{links}</div></div>')
    out.append("      </nav>")
    return "\n".join(out)


def render_steps(content: str) -> str:
    """Sticky step bar under the header: one chip per <section>, label from data-step."""
    chips = []
    for m in re.finditer(r'<section id="([^"]+)"([^>]*)>\s*<h2>(.*?)</h2>', content, re.S):
        sid, attrs, h2 = m.groups()
        num = re.search(r'<span class="num">(.*?)</span>', h2)
        step = re.search(r'data-step="([^"]+)"', attrs)
        title = re.sub(r"<[^>]+>", "", re.sub(r'<span class="num">.*?</span>', "", h2)).strip()
        label = step.group(1) if step else title.split(":")[0]
        chips.append(f'<a class="step" href="#{sid}" title="{html.escape(title)}">'
                     f'<b>{num.group(1) if num else ""}</b>{html.escape(label)}</a>')
    return ('  <nav class="steps-bar" aria-label="Розділи сторінки"><div class="steps-inner">'
            + "".join(chips) + "</div></nav>")


def gm_url(query: str) -> str:
    return "https://www.google.com/maps/search/?api=1&query=" + quote(query)


def dir_url(origin: str, dest: str, waypoints: str = "") -> str:
    url = (
        "https://www.google.com/maps/dir/?api=1&travelmode=driving"
        f"&origin={quote(origin)}&destination={quote(dest)}"
    )
    if waypoints:
        url += "&waypoints=" + quote(waypoints.replace(";", "|"))
    return url


PHOTOS: dict = {}


def photo(spec: str) -> str:
    """[[photo:key|caption]] -> <figure> using _src/<slug>/photos.json (Wikimedia Commons)."""
    key, caption = (spec.split("|", 1) + [""])[:2]
    p = PHOTOS[key]
    credit = (f'Фото: <a href="{html.escape(p["page"])}" target="_blank" rel="noopener">'
              f'{html.escape(p["author"])}</a>, {html.escape(p["license"])}, Wikimedia Commons')
    sep = " · " if caption else ""
    return (f'<figure class="photo"><img src="{html.escape(p["url"])}" alt="{html.escape(re.sub("<[^>]+>", "", caption) or key)}" '
            f'loading="lazy" referrerpolicy="no-referrer">'
            f'<figcaption>{caption}{sep}{credit}</figcaption></figure>')


def expand_macros(text: str) -> str:
    def gm(m):
        label, query = m.group(1).split("|", 1)
        return (f'<a class="gm" href="{html.escape(gm_url(query))}" target="_blank" '
                f'rel="noopener">📍 {label}</a>')

    def dr(m):
        parts = m.group(1).split("|")
        label, origin, dest = parts[0], parts[1], parts[2]
        wps = parts[3] if len(parts) > 3 else ""
        return (f'<a class="gm route" href="{html.escape(dir_url(origin, dest, wps))}" '
                f'target="_blank" rel="noopener">🚗 {label}</a>')

    text = re.sub(r"\[\[gm:(.+?)\]\]", gm, text)
    text = re.sub(r"\[\[photo:(.+?)\]\]", lambda m: photo(m.group(1)), text)
    text = re.sub(r"\[\[dir:(.+?)\]\]", dr, text)
    return text


def build_toc(content: str) -> str:
    items = []
    for m in re.finditer(r'<section id="([^"]+)"[^>]*>\s*<h2>(.*?)</h2>', content, re.S):
        sid, h2 = m.group(1), m.group(2)
        num = re.search(r'<span class="num">(.*?)</span>', h2)
        title = re.sub(r"<[^>]+>", "", re.sub(r'<span class="num">.*?</span>', "", h2)).strip()
        label = f"{num.group(1)} {title}" if num else title
        items.append(f'      <li><a href="#{sid}">{label}</a></li>')
    return "    <ol>\n" + "\n".join(items) + "\n    </ol>"


# ---------- SVG route map ----------
def render_map(spec: dict) -> str:
    """Equirectangular projection of lon/lat into a W x H viewBox.

    map.json: {bbox:[lon_min,lat_min,lon_max,lat_max], width, outline:[[lon,lat],...],
               days:[{n,color,label,stops:[[lon,lat,"name"],...]}], bases:[[lon,lat,"name"]],
               caption}
    """
    lon0, lat0, lon1, lat1 = spec["bbox"]
    W = spec.get("width", 720)
    # correct longitude scale by cos(latitude) so the island is not stretched
    import math
    kx = math.cos(math.radians((lat0 + lat1) / 2))
    H = round(W * (lat1 - lat0) / ((lon1 - lon0) * kx))
    pad = 24

    def xy(lon, lat):
        x = pad + (lon - lon0) / (lon1 - lon0) * (W - 2 * pad)
        y = pad + (lat1 - lat) / (lat1 - lat0) * (H - 2 * pad)
        return round(x, 1), round(y, 1)

    poly = " ".join(f"{x},{y}" for x, y in (xy(*p) for p in spec["outline"]))
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{html.escape(spec.get("aria", "Схема маршруту"))}">',
           f'<polygon points="{poly}" class="map-land"/>']
    for ridge in spec.get("ridges", []):
        x, y = xy(ridge[0], ridge[1])
        out.append(f'<text x="{x}" y="{y}" class="map-ridge" text-anchor="middle">{html.escape(ridge[2])}</text>')
    for d in spec["days"]:
        pts = [xy(s[0], s[1]) for s in d["stops"]]
        path = " ".join(f"{x},{y}" for x, y in pts)
        out.append(f'<polyline points="{path}" class="map-route" style="stroke:{d["color"]}"/>')
    labelled = set()
    for d in spec["days"]:
        for s in d["stops"]:
            x, y = xy(s[0], s[1])
            out.append(f'<circle cx="{x}" cy="{y}" r="4.5" class="map-stop" style="fill:{d["color"]}"/>')
            if len(s) > 2 and s[2] and s[2] not in labelled:
                labelled.add(s[2])
                dx = s[3] if len(s) > 3 else 8
                dy = s[4] if len(s) > 4 else -7
                anchor = "end" if dx < 0 else "start"
                out.append(f'<text x="{x + dx}" y="{y + dy}" class="map-label" text-anchor="{anchor}">{html.escape(s[2])}</text>')
    for b in spec.get("bases", []):
        x, y = xy(b[0], b[1])
        out.append(f'<rect x="{x - 8}" y="{y - 8}" width="16" height="16" rx="4" class="map-base"/>'
                   f'<text x="{x}" y="{y + 4.5}" class="map-base-t" text-anchor="middle">🛏</text>')
    for a in spec.get("airport", []):
        x, y = xy(a[0], a[1])
        out.append(f'<text x="{x}" y="{y + 7}" text-anchor="middle" class="map-air">✈️</text>')
    # legend (wraps into extra rows below the map)
    ly = H + 6
    lx = pad
    for d in spec["days"]:
        w = 18 + 6.6 * len(d["label"]) + 16
        if lx + w > W - pad:
            lx, ly = pad, ly + 18
        out.append(f'<rect x="{lx}" y="{ly - 9}" width="14" height="4" rx="2" style="fill:{d["color"]}"/>'
                   f'<text x="{lx + 18}" y="{ly - 3}" class="map-legend">{html.escape(d["label"])}</text>')
        lx += w
    out[0] = out[0].replace(f'viewBox="0 0 {W} {H}"', f'viewBox="0 0 {W} {ly + 8}"')
    out.append("</svg>")
    cap = spec.get("caption", "")
    return f'<figure class="diagram map">\n{"".join(out)}\n<figcaption>{cap}</figcaption>\n</figure>'


def hero_style(meta: dict) -> str:
    """Background photo for the hero: meta["hero"] is a photos.json key or a full URL."""
    hero = meta.get("hero", "")
    url = PHOTOS.get(hero, {}).get("url", hero)
    return f' style="--hero:url(\'{html.escape(url)}\')"' if url else ""


def theme_css(meta: dict) -> str:
    """Optional seasonal skin: meta.json "theme": "winter" -> _src/themes/winter.css."""
    f = ROOT / "_src" / "themes" / f'{meta.get("theme", "")}.css'
    return "\n" + f.read_text() if meta.get("theme") and f.exists() else ""


def build_page(guide: dict, template: str) -> str:
    d = SRC / guide["slug"]
    meta = json.loads((d / "meta.json").read_text())
    content = (d / "content.html").read_text()
    PHOTOS.clear()
    if (d / "photos.json").exists():
        PHOTOS.update(json.loads((d / "photos.json").read_text()))
    if "{{PLACES}}" in content:
        gallery = json.loads((d / "gallery.json").read_text()) if (d / "gallery.json").exists() else {}
        cur_path = d / "gallery_curation.json"
        for key, cur in (json.loads(cur_path.read_text()) if cur_path.exists() else {}).items():
            if key.startswith("_") or key not in gallery:
                continue
            picked = [gallery[key][i] for i in cur.get("order", range(len(gallery[key])))]
            gallery[key] = [PHOTOS[k] for k in cur.get("prepend", [])] + picked
        routes = json.loads((d / "routes.json").read_text()) if (d / "routes.json").exists() else {}
        if "{{DAYS_PLANS}}" in content:
            plans = json.loads((d / "plans.json").read_text())
            lmap = {l["key"]: l for l in load_locations(d)}
            model = places.plan_model(plans, routes, lmap)
            content = content.replace("{{DAYS_SWITCH}}", places.render_days_switch(model, plans["default"]))
            # a plan written by hand in content.html (<div class="days-plan" data-plan="7">) is not generated
            manual = re.findall(r'<div class="days-plan" data-plan="([^"]+)"', content)
            content = content.replace("{{DAYS_PLANS}}", places.render_day_plans(
                model, lmap, gallery, plans["points"], plans["default"], skip=set(manual),
                labels=plans.get("labels")))
        content = content.replace("{{PLACES}}", places.render_places(
            load_locations(d), gallery,
            json.loads((d / "plans.json").read_text()), routes,
            json.loads((d / "hikes.json").read_text()) if (d / "hikes.json").exists() else None,
            json.loads((d / "trails.json").read_text()) if (d / "trails.json").exists() else None))
    content = content.replace("{{CATS_LEGEND}}", places.cats_legend())
    # number sections in order of appearance, so new sections never need renumbering
    counter = iter(range(1, 100))
    content = re.sub(r'<span class="num">\d+</span>', lambda m: f'<span class="num">{next(counter):02d}</span>', content)
    if "{{MAP}}" in content:
        content = content.replace("{{MAP}}", render_map(json.loads((d / "map.json").read_text())))
    content = expand_macros(content)
    pills = "\n".join(f'    <span class="pill">{p}</span>' for p in meta.get("pills", []))
    page = template
    for key, val in {
        "TITLE": meta["title"], "KICKER": meta["kicker"], "H1": meta["h1"], "LEAD": meta["lead"],
        "PILLS": pills, "NAV": render_nav(guide["file"]), "TOC": build_toc(content),
        "HNAV": render_header_nav(guide["file"]), "STEPS": render_steps(content),
        "CONTENT": content, "FOOTER": meta.get("footer", ""),
        "EXTRA_CSS": (ROOT / "_src" / "travel.css").read_text() + theme_css(meta),
        "ICONS": places.ICON_SPRITE,
        "HERO_STYLE": hero_style(meta),
    }.items():
        page = page.replace("{{" + key + "}}", val)
    if meta.get("theme"):  # e.g. "winter": body class + _src/themes/<theme>.css + assets/<theme>.js
        page = page.replace("<body>", f'<body class="theme-{meta["theme"]}">', 1)
        if (ROOT / "assets" / f'{meta["theme"]}.js').exists():
            page = page.replace("</body>", f'<script src="assets/{meta["theme"]}.js"></script>\n</body>', 1)
    left = re.findall(r"\{\{[A-Z_]+\}\}|\[\[(?:gm|dir):", page)
    assert not left, f"{guide['file']}: unexpanded placeholders {left}"
    return page


def bust_assets(page: str) -> str:
    """Append ?v=<content hash> to local assets so browsers never pair a new page with a cached old script."""
    import hashlib

    def ver(m):
        f = ROOT / m.group(1)
        return f'{m.group(1)}?v={hashlib.sha1(f.read_bytes()).hexdigest()[:8]}"' if f.exists() else m.group(0)
    return re.sub(r'(assets/[\w.-]+\.(?:js|css))"', ver, page)


# One colour per guide on the home map (cycled), readable on light and dark land.
HOME_COLORS = ["#2f9e44", "#e8590c", "#1c7ed6", "#7048e8", "#d6336c", "#0c8599", "#f08c00", "#c2255c", "#5c940d"]


def build_home() -> str:
    """Repo-root index.html: interactive Europe map (_src/home/map.json from _tools/europe_map.py)
    where each guide's provinces light up on hover and open the guide on click."""
    tpl = (SRC / "home" / "home.html").read_text()
    geo = json.loads((SRC / "home" / "map.json").read_text())
    guides = [g for g in GUIDES if g["slug"] in geo["guides"]]
    data, cards, layers = {}, [], []
    countries_with = {geo["guides"][g["slug"]]["country"] for g in guides}
    for i, g in enumerate(guides):
        meta = json.loads((SRC / g["slug"] / "meta.json").read_text())
        gm, color, num = geo["guides"][g["slug"]], HOME_COLORS[i % len(HOME_COLORS)], i + 1
        title = re.sub(r"^\d+\.\s*", "", g["nav"])
        sub = re.sub(r"^Гайд #\d+\s*·\s*", "", meta.get("kicker", ""))
        hero = meta.get("hero", "")
        thumb = hero.replace("/1280px-", "/500px-")
        pills = meta.get("pills", [])
        pick = pills[:2] + [p for p in pills[2:] if p[:1] in "🌤❄"][:1]
        href = "travel-guides/" + g["file"]
        data[g["slug"]] = {"title": title, "kicker": sub.split("·")[0].strip(), "thumb": thumb,
                           "pills": pick, "href": href, "color": color}
        x, y = gm["pin"]
        layers.append(
            f'<a class="guide" href="{href}" data-slug="{g["slug"]}" style="--c:{color}" aria-label="{html.escape(title)}">'
            f'<path class="area" d="{gm["d"]}" fill-rule="evenodd"/>'
            f'<g class="pin" data-x="{x}" data-y="{y}" transform="translate({x} {y})">'
            f'<circle class="hit" r="20" fill="transparent"/><circle class="halo" r="11"/><circle class="dot" r="10"/>'
            f'<text>{num}</text></g></a>')
        cards.append(
            f'    <a class="card" href="{href}" data-slug="{g["slug"]}" style="--c:{color}">'
            f'<span class="th" style="background-image:url(\'{html.escape(hero.replace("/1280px-", "/330px-"))}\')"><b>{num}</b></span>'
            f'<span><span class="t">{html.escape(title)}</span><span class="s" style="display:block">{html.escape(sub)}</span></span></a>')
    countries = "".join(
        f'<path class="country{" has-guide" if c["iso"] in countries_with else ""}" d="{c["d"]}"><title>{html.escape(c["name"])}</title></path>'
        for c in geo["countries"])
    w, h = int(geo["w"]), int(geo["h"])
    svg = (f'<svg viewBox="0 0 {w} {h}" data-w="{w}" data-h="{h}" role="img" aria-label="Карта Європи з регіонами гайдів">'
           f'<g id="vp"><g class="countries">{countries}</g><g class="guides">{"".join(layers)}</g></g></svg>')
    n = len(guides)
    count = f"{n} " + ("гайд" if n % 10 == 1 and n % 100 != 11 else "гайди" if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else "гайдів")
    out = tpl
    for key, val in {"SVG": svg, "CARDS": "\n".join(cards), "COUNT": count,
                     "DATA": json.dumps(data, ensure_ascii=False)}.items():
        out = out.replace("{{" + key + "}}", val)
    assert not re.search(r"\{\{[A-Z_]+\}\}", out), "home: unexpanded placeholders"
    return out


def main():
    template = (ROOT / "_template.html").read_text()
    for g in GUIDES:
        (ROOT / g["file"]).write_text(bust_assets(build_page(g, template)))
        print("built", g["file"])
    (ROOT.parent / "index.html").write_text(build_home())
    print("built ../index.html (home map)")


if __name__ == "__main__":
    main()
