"""Locations block for a guide: big interactive map + category filter + place cards.

Data:  _src/<slug>/locations.json  [{key,name,pt,q,ll,day,kid,cats,short,full,history}]
       _src/<slug>/gallery.json    {key: [{url,page,author,license}, ...]}  (_tools/commons_gallery.py)
       _src/<slug>/map.json        day colours + bases/airport (shared with the SVG route map)
Usage in content.html: {{PLACES}}
Client side: assets/places.js (Leaflet map, filter, slider).
"""
import html
import json
from urllib.parse import quote

CATS = {
    "history":   ("Історичне місце", "#b7791f"),
    "view":      ("Красивий вид", "#0e7490"),
    "adventure": ("Цікава пригода", "#e8590c"),
    "drone":     ("Для зйомки дроном", "#7048e8"),
}

# Custom category icons as an SVG sprite (24x24, stroke-based, currentColor).
ICON_SPRITE = """<svg width="0" height="0" style="position:absolute" aria-hidden="true">
 <symbol id="ic-history" viewBox="0 0 24 24"><path d="M3 9.5 12 4l9 5.5M4.5 10h15M6 10v8M10 10v8M14 10v8M18 10v8M3.5 20.5h17M4.5 18h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
 <symbol id="ic-view" viewBox="0 0 24 24"><circle cx="17" cy="6.5" r="2.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 19.5 9 9.5l3.6 5.4 2.2-3 6.7 7.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m7.4 12 1.6 1.4 1.5-1.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
 <symbol id="ic-adventure" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="1" fill="currentColor"/></symbol>
 <symbol id="ic-drone" viewBox="0 0 24 24"><rect x="9" y="9.5" width="6" height="5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 10 6.2 7.2M15 10l2.8-2.8M9 14l-2.8 2.8M15 14l2.8 2.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="5.5" cy="6.5" rx="3" ry="1.1" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="18.5" cy="6.5" rx="3" ry="1.1" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="5.5" cy="17.5" rx="3" ry="1.1" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="18.5" cy="17.5" rx="3" ry="1.1" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="16.6" r=".9" fill="currentColor"/></symbol>
</svg>"""

KID = {"ok": ("ok", "👶 ок з малюком"), "mid": ("mid", "👶 з переноскою"), "no": ("no", "👶 не з малюком")}


def icon(cat: str, size: int = 18) -> str:
    return (f'<svg class="cat-ic" width="{size}" height="{size}" style="color:{CATS[cat][1]}" '
            f'aria-hidden="true"><use href="#ic-{cat}"/></svg>')


def cat_chip(cat: str) -> str:
    label, color = CATS[cat]
    return (f'<span class="cat-chip" style="--cc:{color}" title="{label}">'
            f'{icon(cat, 16)}<span>{label}</span></span>')


def cats_legend() -> str:
    return '<div class="cat-legend">' + "".join(cat_chip(c) for c in CATS) + "</div>"


def gm_link(q: str) -> str:
    return "https://www.google.com/maps/search/?api=1&query=" + quote(q)


def slider(key: str, photos: list) -> str:
    if not photos:
        return ""
    slides = []
    for i, p in enumerate(photos):
        credit = f'{p["author"]}, {p["license"]}'
        slides.append(
            f'<figure class="slide"><img src="{html.escape(p["url"])}" alt="" loading="lazy" '
            f'referrerpolicy="no-referrer" decoding="async">'
            f'<figcaption><a href="{html.escape(p["page"])}" target="_blank" rel="noopener">'
            f'📷 {html.escape(credit)}</a></figcaption></figure>')
    return (f'<div class="slider" data-slider>'
            f'<div class="slides">{"".join(slides)}</div>'
            f'<button type="button" class="sl-btn prev" aria-label="Попереднє фото">‹</button>'
            f'<button type="button" class="sl-btn next" aria-label="Наступне фото">›</button>'
            f'<div class="sl-count"><span class="sl-i">1</span> / {len(photos)}</div>'
            f'</div>')


def render_places(locs: list, gallery: dict, mapspec: dict) -> str:
    day_color = {d["n"]: d["color"] for d in mapspec["days"]}
    day_label = {d["n"]: d["label"] for d in mapspec["days"]}
    cards = []
    for n, loc in enumerate(locs, 1):
        loc["n"] = n
        photos = gallery.get(loc["key"], [])
        thumb = photos[0]["url"] if photos else ""
        kid_cls, kid_txt = KID[loc["kid"]]
        cats = "".join(cat_chip(c) for c in loc["cats"])
        cards.append(f"""
<article class="place" id="place-{loc['key']}" data-cats="{' '.join(loc['cats'])}" data-n="{n}">
  <div class="place-top">
    <div class="place-thumb" style="background-image:url('{html.escape(thumb)}')">
      <span class="place-n" style="background:{day_color[loc['day']]}">{n}</span>
    </div>
    <div class="place-body">
      <div class="place-head">
        <h3>{html.escape(loc['name'])}</h3>
        <span class="place-pt">{html.escape(loc['pt'])}</span>
      </div>
      <div class="place-cats">{cats}</div>
      <p class="place-short">{loc['short']}</p>
      <div class="place-meta">
        <a class="day-chip" href="#day{loc['day']}" style="--dc:{day_color[loc['day']]}">{html.escape(day_label[loc['day']])}</a>
        <span class="kid {kid_cls}">{kid_txt}</span>
        <a class="gm" href="{html.escape(gm_link(loc['q']))}" target="_blank" rel="noopener">📍 Google Maps</a>
      </div>
    </div>
  </div>
  <details class="place-more">
    <summary><span>Детальніше: опис, історія{', ' + str(len(photos)) + ' фото' if photos else ''}</span></summary>
    <div class="place-full">
      {slider(loc['key'], photos)}
      <div class="place-text">
        <h4>🧭 Що робити</h4>{loc['full']}
        <h4>📜 Історія</h4>{loc['history']}
      </div>
    </div>
  </details>
</article>""")

    data = {
        "places": [{"n": l["n"], "key": l["key"], "name": l["name"], "label": l.get("label") or l["name"].split(":")[0].split(" — ")[0].split(" і ")[0], "ll": l["ll"], "day": l["day"],
                    "cats": l["cats"], "short": l["short"],
                    "thumb": (gallery.get(l["key"]) or [{"url": ""}])[0]["url"]} for l in locs],
        "bases": [{"ll": [b[1], b[0]], "name": b[2] if len(b) > 2 else "База"} for b in mapspec.get("bases", [])],
        "airport": [{"ll": [a[1], a[0]]} for a in mapspec.get("airport", [])],
        "days": {d["n"]: {"color": d["color"], "label": d["label"]} for d in mapspec["days"]},
        "cats": {k: {"label": v[0], "color": v[1]} for k, v in CATS.items()},
    }
    filters = ['<button type="button" class="cf-btn is-on" data-cat="all">Усі <b>{}</b></button>'.format(len(locs))]
    for c, (label, color) in CATS.items():
        cnt = sum(c in l["cats"] for l in locs)
        filters.append(f'<button type="button" class="cf-btn" data-cat="{c}" style="--cc:{color}">'
                       f'{icon(c, 16)} {label} <b>{cnt}</b></button>')
    legend = "".join(f'<span><i style="background:{d["color"]}"></i>{html.escape(d["label"])}</span>'
                     for d in mapspec["days"])
    return f"""
<div class="cat-filter" role="group" aria-label="Фільтр за категорією">{''.join(filters)}</div>
<div class="bigmap-wrap">
  <div id="bigmap" class="bigmap" role="region" aria-label="Карта локацій"></div>
  <noscript><p class="muted">Для інтерактивної карти увімкніть JavaScript. Схема маршруту — нижче в розділі «Маршрут на карті».</p></noscript>
</div>
<div class="day-legend">{legend}<span>🛏 база</span><span>✈️ аеропорт</span></div>
<div class="places">{''.join(cards)}
</div>
<script type="application/json" id="places-data">{json.dumps(data, ensure_ascii=False)}</script>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="" defer></script>
<script src="assets/places.js" defer></script>
"""
