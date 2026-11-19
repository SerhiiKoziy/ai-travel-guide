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
    "hike":      ("Піші маршрути", "#8a5a2b"),
}

LEVELS = {"easy": ("Легкий", "#2f9e44"), "medium": ("Середній", "#e67700"), "hard": ("Складний", "#e03131")}

# Custom category icons as an SVG sprite (24x24, stroke-based, currentColor).
ICON_SPRITE = """<svg width="0" height="0" style="position:absolute" aria-hidden="true">
 <symbol id="ic-history" viewBox="0 0 24 24"><path d="M3 9.5 12 4l9 5.5M4.5 10h15M6 10v8M10 10v8M14 10v8M18 10v8M3.5 20.5h17M4.5 18h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
 <symbol id="ic-view" viewBox="0 0 24 24"><circle cx="17" cy="6.5" r="2.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 19.5 9 9.5l3.6 5.4 2.2-3 6.7 7.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m7.4 12 1.6 1.4 1.5-1.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
 <symbol id="ic-adventure" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="1" fill="currentColor"/></symbol>
 <symbol id="ic-hike" viewBox="0 0 24 24"><path d="M7 3.5h5l.6 6.2 4.9 2.4c1.6.8 2.5 2 2.5 3.6V18H4.5l1-6.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4.5 18v2.5H20V18M12.6 9.7l-2 1.3M14.6 10.7l-1.8 1.4M4.6 14h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></symbol>
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


def short_label(loc: dict) -> str:
    return loc.get("label") or loc["name"].split(":")[0].split(" — ")[0].split(" і ")[0]


def fmt_drive(km: int, mins: int) -> str:
    h, m = divmod(int(round(mins / 5.0) * 5), 60)
    t = f"{h} год {m:02d} хв" if h else f"{m} хв"
    return f"≈ {km} км · ≈ {t} за кермом"


def gmaps_dir(stops: list, q_of) -> str:
    """Google Maps driving link for a day; stops after a ferry leg ('~') are left out."""
    if "~" in stops:
        stops = stops[:stops.index("~")]
    qs = [q_of(s) for s in stops]
    url = ("https://www.google.com/maps/dir/?api=1&travelmode=driving"
           f"&origin={quote(qs[0])}&destination={quote(qs[-1])}")
    if len(qs) > 2:
        url += "&waypoints=" + quote("|".join(qs[1:-1]))
    return url


def plan_model(plans: dict, routes: dict, locs: dict) -> dict:
    """Per plan: route order of locations, day of each location, enriched days."""
    colors = plans["colors"]
    pts = plans["points"]

    def q_of(s):
        return pts[s]["q"] if s.startswith("@") else locs[s]["q"]

    model = {}
    for pid, plan in plans["plans"].items():
        order, day_of, days = [], {}, []
        for n, day in enumerate(plan["days"], 1):
            for s in day["stops"]:
                if s in locs and s not in day_of:
                    day_of[s] = n
                    order.append(s)
            r = routes.get(pid, [{}] * len(plan["days"]))[n - 1] if routes else {}
            days.append({
                "n": n, "title": day["title"], "note": day.get("note", ""), "color": colors[n - 1],
                "stops": [s for s in day["stops"] if s != "~"],
                "loc_stops": [s for s in day["stops"] if s in locs],
                "points": sorted({s for s in day["stops"] if s.startswith("@")}),
                "km": r.get("km"), "min": r.get("min"),
                "legs": r.get("legs", []), "ferry": r.get("ferry", []),
                "gmaps": gmaps_dir(day["stops"], q_of), "anchor": day.get("anchor", ""),
            })
        model[pid] = {"label": plan["label"], "nights": plan["nights"], "bases": plan["bases"],
                      "intro": plan["intro"], "order": order, "dayOf": day_of, "days": days}
    return model


def render_itinerary(pid: str, p: dict, locs: dict, num: dict, active: bool) -> str:
    rows = []
    for d in p["days"]:
        chips = "".join(
            f'<span class="it-stop"><b style="background:{d["color"]}">{num[s]}</b>{html.escape(short_label(locs[s]))}</span>'
            for s in d["loc_stops"])
        drive = fmt_drive(d["km"], d["min"]) if d["km"] is not None else ""
        if d["anchor"]:
            more = f'<a class="it-more" href="#{d["anchor"]}">Детально про день ↓</a>'
        else:
            more = ""
        rows.append(f"""
  <li class="it-day" data-day="{d['n']}" style="--dc:{d['color']}">
    <button type="button" class="it-head" aria-pressed="false" title="Показати день на карті">
      <span class="it-n">{d['n']}</span><span class="it-title">День {d['n']} · {html.escape(d['title'])}</span>
      <span class="it-drive">{drive}{' · ⛴ пором' if d['ferry'] else ''}</span>
    </button>
    <div class="it-stops">{chips}</div>
    {f'<p class="it-note">{d["note"]}</p>' if d['note'] else ''}
    <div class="it-links"><a class="gm route" href="{html.escape(d['gmaps'])}" target="_blank" rel="noopener">🚗 Маршрут дня в Google Maps</a>{more}</div>
  </li>""")
    hidden = "" if active else " hidden"
    return f'<ol class="itinerary" data-plan="{pid}"{hidden}>{"".join(rows)}\n</ol>'


def level_badge(level: str) -> str:
    label, color = LEVELS[level]
    return f'<span class="lvl-badge" style="--lc:{color}">{label}</span>'


def render_hikes(hikes: list, trails: dict, gallery: dict, locs: dict) -> str:
    cards = []
    for h in hikes:
        photos = gallery.get("hike-" + h["key"], [])
        thumb = photos[0]["url"] if photos else ""
        color = LEVELS[h["level"]][1]
        kid_cls, kid_txt = KID[h["kid"]]
        near = (f'<span class="near">поруч з локацією туру: <b>{html.escape(short_label(locs[h["tour"]]))}</b></span>'
                if h.get("tour") else "")
        cards.append(f"""
<article class="place hike" id="hike-{h['key']}" data-hike="{h['key']}" data-level="{h['level']}">
  <div class="place-top">
    <div class="place-thumb" style="background-image:url('{html.escape(thumb)}')">
      <span class="hike-ref" style="background:{color}" role="button" title="Показати на карті">{html.escape(h['ref'])}</span>
    </div>
    <div class="place-body">
      <div class="place-head">
        <h3>{html.escape(h['ua'])}</h3>
        <span class="place-pt">{html.escape(h['ref'])} · {html.escape(h['name'])}</span>
      </div>
      <div class="place-cats">{level_badge(h['level'])}{cat_chip('hike')}</div>
      <p class="place-short">{h['short']}</p>
      <ul class="hike-stats">
        <li title="Довжина">📏 {html.escape(h['dist'])}</li>
        <li title="Час">⏱ {html.escape(h['time'])}</li>
        <li title="Набір висоти">⛰ {html.escape(h['gain'])}</li>
        <li title="Вартість">🎟 {html.escape(h['fee'])}</li>
      </ul>
      <div class="place-meta">
        <span class="kid {kid_cls}">{kid_txt}</span>
        <a class="gm" href="{html.escape(gm_link(h['q']))}" target="_blank" rel="noopener">📍 Старт у Google Maps</a>
        {near}
      </div>
    </div>
  </div>
  <details class="place-more">
    <summary><span>Детальніше: що очікувати, історія{', ' + str(len(photos)) + ' фото' if photos else ''}</span></summary>
    <div class="place-full">
      {slider('hike-' + h['key'], photos)}
      <div class="place-text">
        <h4>🥾 Що очікувати</h4>{h['full']}
        <h4>📜 Історія</h4>{h['history']}
      </div>
    </div>
  </details>
</article>""")
    counts = {lv: sum(h["level"] == lv for h in hikes) for lv in LEVELS}
    legend = " ".join(f'{level_badge(lv)} <span class="muted">×{counts[lv]}</span>' for lv in LEVELS)
    return f"""
<div class="hikes" hidden>
  <h3 class="it-h">🥾 {len(hikes)} найкращих піших маршрутів</h3>
  <p class="hikes-intro">Опціонально, поза планом туру: для дня, коли малюк з бабусею, для одного з дорослих або для наступної поїздки. Рівень — наша оцінка для сім'ї. Лінії на карті — траси з OpenStreetMap.</p>
  <div class="lvl-legend">{legend}</div>
  <div class="places hikes-list">{''.join(cards)}
  </div>
  <div class="callout warn"><div class="ic">🎟</div><div class="body"><span class="tag">Бронювання</span><br>Усі маршрути PR — тільки зі слотом на <a href="https://simplifica.madeira.gov.pt" target="_blank" rel="noopener">simplifica.madeira.gov.pt</a> (на сьогодні/завтра), діти до 12 — безкоштовно, але вписати. Після пожеж і зливи маршрути тимчасово закривають — статус там же.</div></div>
</div>"""


def render_places(locs_list: list, gallery: dict, plans: dict, routes: dict,
                  hikes: list = None, trails: dict = None) -> str:
    locs = {l["key"]: l for l in locs_list}
    model = plan_model(plans, routes, locs)
    default = plans["default"]
    dp = model[default]
    # numbers follow the route order of the selected plan; server renders the default plan
    num_default = {k: i for i, k in enumerate(dp["order"], 1)}
    cards = []
    ordered = dp["order"] + [k for k in locs if k not in dp["dayOf"]]
    for key in ordered:
        loc = locs[key]
        photos = gallery.get(key, [])
        thumb = photos[0]["url"] if photos else ""
        kid_cls, kid_txt = KID[loc["kid"]]
        cats = "".join(cat_chip(c) for c in loc["cats"])
        day = dp["dayOf"].get(key)
        color = dp["days"][day - 1]["color"] if day else "#888"
        hidden = "" if day else " hidden"
        cards.append(f"""
<article class="place" id="place-{key}" data-key="{key}" data-cats="{' '.join(loc['cats'])}"{hidden}>
  <div class="place-top">
    <div class="place-thumb" style="background-image:url('{html.escape(thumb)}')">
      <span class="place-n" style="background:{color}">{num_default.get(key, '')}</span>
    </div>
    <div class="place-body">
      <div class="place-head">
        <h3>{html.escape(loc['name'])}</h3>
        <span class="place-pt">{html.escape(loc['pt'])}</span>
      </div>
      <div class="place-cats">{cats}</div>
      <p class="place-short">{loc['short']}</p>
      <div class="place-meta">
        <span class="day-chip" style="--dc:{color}">{f'День {day}' if day else ''}</span>
        <span class="kid {kid_cls}">{kid_txt}</span>
        <a class="gm" href="{html.escape(gm_link(loc['q']))}" target="_blank" rel="noopener">📍 Google Maps</a>
      </div>
    </div>
  </div>
  <details class="place-more">
    <summary><span>Детальніше: опис, історія{', ' + str(len(photos)) + ' фото' if photos else ''}</span></summary>
    <div class="place-full">
      {slider(key, photos)}
      <div class="place-text">
        <h4>🧭 Що робити</h4>{loc['full']}
        <h4>📜 Історія</h4>{loc['history']}
      </div>
    </div>
  </details>
</article>""")

    itineraries, summaries = [], []
    for pid, p in model.items():
        num = {k: i for i, k in enumerate(p["order"], 1)}
        itineraries.append(render_itinerary(pid, p, locs, num, pid == default))
        hidden = "" if pid == default else " hidden"
        summaries.append(
            f'<p class="plan-summary" data-plan="{pid}"{hidden}><b>{p["label"]} · {p["nights"]}</b> · '
            f'{html.escape(p["bases"])} · {len(p["order"])} локацій<br><span>{html.escape(p["intro"])}</span></p>')

    data = {
        "places": {k: {"name": l["name"], "label": short_label(l), "ll": l["ll"], "cats": l["cats"],
                       "short": l["short"], "thumb": (gallery.get(k) or [{"url": ""}])[0]["url"]}
                   for k, l in locs.items()},
        "points": plans["points"],
        "plans": {pid: {"order": p["order"], "dayOf": p["dayOf"],
                        "days": [{k: d[k] for k in ("n", "title", "color", "legs", "ferry", "points")}
                                 for d in p["days"]]}
                  for pid, p in model.items()},
        "default": default,
        "cats": {k: {"label": v[0], "color": v[1]} for k, v in CATS.items()},
        "hikes": {h["key"]: {"ref": h["ref"], "name": h["ua"], "level": h["level"],
                             "levelLabel": LEVELS[h["level"]][0], "color": LEVELS[h["level"]][1],
                             "short": h["short"], "dist": h["dist"], "time": h["time"],
                             "thumb": (gallery.get("hike-" + h["key"]) or [{"url": ""}])[0]["url"],
                             "head": (trails or {}).get(h["key"], {}).get("head", h["start"]),
                             "lines": (trails or {}).get(h["key"], {}).get("lines", [])}
                  for h in (hikes or [])},
    }
    plan_btns = "".join(
        f'<button type="button" class="seg-btn{" is-on" if pid == default else ""}" data-plan="{pid}" '
        f'aria-pressed="{"true" if pid == default else "false"}">{p["label"]}</button>'
        for pid, p in model.items())
    filters = [f'<button type="button" class="cf-btn is-on" data-cat="all">Усі <b class="cf-n"></b></button>']
    for c, (label, color) in CATS.items():
        filters.append(f'<button type="button" class="cf-btn" data-cat="{c}" style="--cc:{color}">'
                       f'{icon(c, 16)} {label} <b class="cf-n"></b></button>')
    return f"""
<div class="map-controls">
  <div class="seg" role="group" aria-label="Що показати на карті">
    <button type="button" class="seg-btn is-on" data-mode="places" aria-pressed="true">📍 Локації</button>
    <button type="button" class="seg-btn" data-mode="route" aria-pressed="false">🛣 Маршрут по днях</button>
  </div>
  <div class="seg seg-plan" role="group" aria-label="Тривалість поїздки">
    <span class="seg-label">Тривалість:</span>{plan_btns}
  </div>
  {f'<label class="hike-toggle"><input type="checkbox" id="show-hikes"> <svg class="cat-ic" width="18" height="18" style="color:{CATS["hike"][1]}" aria-hidden="true"><use href="#ic-hike"/></svg> Показати піші маршрути <b>{len(hikes)}</b></label>' if hikes else ''}
</div>
{''.join(summaries)}
<div class="cat-filter" role="group" aria-label="Фільтр за категорією">{''.join(filters)}</div>
<div class="bigmap-wrap">
  <div id="bigmap" class="bigmap" role="region" aria-label="Карта локацій і маршрутів"></div>
  <noscript><p class="muted">Для інтерактивної карти увімкніть JavaScript.</p></noscript>
</div>
<div class="day-legend" aria-hidden="true"></div>
<div class="itineraries" hidden>
  <h3 class="it-h">🗓 План по днях</h3>
  {''.join(itineraries)}
  <p class="muted it-foot">Час за кермом — оцінка роутера OSRM; з малюком додавайте ~30%. Натисніть на день, щоб виділити його на карті.</p>
</div>
{render_hikes(hikes, trails or {}, gallery, locs) if hikes else ''}
<h3 class="places-h">📍 Локації маршруту</h3>
<div class="places">{''.join(cards)}
</div>
<script type="application/json" id="places-data">{json.dumps(data, ensure_ascii=False, separators=(',', ':'))}</script>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="" defer></script>
<script src="assets/places.js" defer></script>
"""
