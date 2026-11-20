# AI Travel Guide

Static Ukrainian-language family travel guides: 7 days / 6 nights, rental car from airport to airport, hotels ≤ $160/night.

```
travel-guides/
  build.py            # renders every page; generates the sidebar nav for all pages
  places.py           # {{PLACES}}: big Leaflet map + category filter + place cards with photo sliders
  _tools/             # commons_find.py / commons_gallery.py (Wikimedia photos), geocode.py (OSM Nominatim)
  _template.html      # shared layout (same look as the ai-delivery-planner docs)
  _src/travel.css     # travel-specific components (days, hotels, photos, map)
  _src/<slug>/        # meta.json, content.html, map.json, photos.json,
                      # locations.json (places: text, history, categories, coords),
                      # gallery_sources.json -> gallery.json (+ gallery_curation.json),
                      # plans.json (4/6/7/9-day variants) -> routes.json (_tools/routes.py, OSRM)
  assets/             # mobile nav (drawer, TOC scroll-spy)
  index.html, 01-madeira.html   # GENERATED — edit _src and rebuild
```

Add a country: register it in `GUIDES` in `build.py`, create `_src/<slug>/`, run `python3 travel-guides/build.py`.
New guide locations: write locations.json + gallery_sources.json, then
`python3 travel-guides/_tools/geocode.py travel-guides/_src/<slug>` and
`python3 travel-guides/_tools/commons_gallery.py travel-guides/_src/<slug>`; review and reorder in gallery_curation.json.
Hikes (optional, not in plans): hikes.json (OSM relation ids) -> `python3 travel-guides/_tools/trails.py travel-guides/_src/<slug>` -> trails.json.
A hike can use only a section of a long relation (`"bbox": [s, w, n, e]`), or have no relation at all:
`"via": [[lat,lng], ...]` is then routed on foot paths (routing.openstreetmap.de).
Trip variants: edit plans.json, then `python3 travel-guides/_tools/routes.py travel-guides/_src/<slug>` to recompute road geometry.
Categories (icons in places.py): history, view, adventure, drone, hike. Hike levels: easy, medium, hard.

Macros in content.html: `{{PLACES}}`, `{{CATS_LEGEND}}`, `[[gm:Label|query]]`, `[[dir:Label|origin|dest|wp1;wp2]]`, `[[photo:key|caption]]`, `{{MAP}}`.
