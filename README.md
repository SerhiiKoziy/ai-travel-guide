# AI Travel Guide

Static Ukrainian-language family travel guides: 7 days / 6 nights, rental car from airport to airport, hotels ≤ $160/night.

```
travel-guides/
  build.py            # renders every page; generates the sidebar nav for all pages
  _template.html      # shared layout (same look as the ai-delivery-planner docs)
  _src/travel.css     # travel-specific components (days, hotels, photos, map)
  _src/<slug>/        # meta.json, content.html, map.json, photos.json per guide
  assets/             # mobile nav (drawer, TOC scroll-spy)
  index.html, 01-madeira.html   # GENERATED — edit _src and rebuild
```

Add a country: register it in `GUIDES` in `build.py`, create `_src/<slug>/`, run `python3 travel-guides/build.py`.
Macros in content.html: `[[gm:Label|query]]`, `[[dir:Label|origin|dest|wp1;wp2]]`, `[[photo:key|caption]]`, `{{MAP}}`.
