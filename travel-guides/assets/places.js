/* Places block: Leaflet map with three modes —
     places : tour locations of the selected trip length (4/6/7/9 days)
     route  : the same + road routes by day and the day-by-day itinerary
     hike   : a separate world — the best hiking trails with their own numbering,
              start/finish points, level filter and cards (tour pins and routes hidden)
   Data: <script id="places-data"> rendered by places.py; road geometry (routes.json) and
   trail geometry (trails.json) are precomputed, so no routing API is called at runtime. */
(function () {
  var dataEl = document.getElementById('places-data');
  if (!dataEl) return;
  var DATA = JSON.parse(dataEl.textContent);
  var HIKES = DATA.hikes || {};
  var HIKE_KEYS = Object.keys(HIKES).sort(function (a, b) { return HIKES[a].n - HIKES[b].n; });
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var MODES = ['places', 'route', 'hike'];
  var state = { mode: 'places', plan: DATA.default, cat: 'all', level: 'all', focus: 0 };
  try {   // remember the viewer's last choice (per-browser convenience only)
    var saved = JSON.parse(localStorage.getItem('tg-madeira-view') || '{}');
    if (saved.plan && DATA.plans[saved.plan]) state.plan = saved.plan;
    if (MODES.indexOf(saved.mode) >= 0 && (saved.mode !== 'hike' || HIKE_KEYS.length)) state.mode = saved.mode;
  } catch (e) {}
  function save() { try { localStorage.setItem('tg-madeira-view', JSON.stringify({ plan: state.plan, mode: state.mode })); } catch (e) {} }

  function hiking() { return state.mode === 'hike'; }
  function plan() { return DATA.plans[state.plan]; }
  function numOf(key) { return plan().order.indexOf(key) + 1; }
  function dayOf(key) { return plan().dayOf[key] || 0; }
  function colorOf(key) { var d = dayOf(key); return d ? plan().days[d - 1].color : '#888'; }
  function visible(key) {
    return !hiking() && dayOf(key) > 0 && (state.cat === 'all' || DATA.places[key].cats.indexOf(state.cat) >= 0);
  }
  function hikeVisible(k) { return hiking() && (state.level === 'all' || HIKES[k].level === state.level); }

  /* ---------- open a card (from a map popup or a #hash) ---------- */
  function openCard(id) {
    var card = document.getElementById(id);
    if (!card) return;
    var det = card.querySelector('details');
    if (det) det.open = true;
    card.classList.add('flash');
    setTimeout(function () { card.classList.remove('flash'); }, 1600);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- sliders ---------- */
  $$('[data-slider]').forEach(function (el) {
    var track = $('.slides', el), n = track.children.length, counter = $('.sl-i', el);
    function index() { return Math.round(track.scrollLeft / track.clientWidth); }
    function go(i) { track.scrollTo({ left: ((i + n) % n) * track.clientWidth, behavior: 'smooth' }); }
    $('.prev', el).addEventListener('click', function () { go(index() - 1); });
    $('.next', el).addEventListener('click', function () { go(index() + 1); });
    track.addEventListener('scroll', function () { counter.textContent = index() + 1; }, { passive: true });
    el.tabIndex = 0;
    el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') go(index() - 1);
      if (e.key === 'ArrowRight') go(index() + 1);
    });
  });

  /* ---------- map ---------- */
  var map, markers = {}, pointMarkers = {}, hikeStart = {}, hikeEnd = {}, routeLayer, trailLayer;
  var TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
  var ATTR = 'Tiles &copy; <a href="https://www.esri.com">Esri</a> — Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

  function catIcons(cats) {
    return cats.map(function (c) {
      return '<svg class="cat-ic" width="16" height="16" style="color:' + DATA.cats[c].color + '"><use href="#ic-' + c + '"/></svg>';
    }).join('');
  }
  function pinIcon(key) {
    return L.divIcon({
      className: 'pin-wrap',
      html: '<span class="pin" style="--pc:' + colorOf(key) + '"><b>' + numOf(key) + '</b></span>' +
            '<span class="pin-label">' + DATA.places[key].label + '</span>',
      iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28]
    });
  }
  function moreBtn(target) {
    return '<button type="button" class="pop-more" data-target="' + target + '">Детальніше ↓</button>';
  }
  function popupHtml(key) {
    var p = DATA.places[key], d = dayOf(key);
    return '<div class="pop">' + (p.thumb ? '<div class="pop-img" style="background-image:url(\'' + p.thumb + '\')"></div>' : '') +
      '<div class="pop-b"><div class="pop-t"><span class="pop-n" style="background:' + colorOf(key) + '">' + numOf(key) + '</span>' + p.name + '</div>' +
      '<div class="pop-c">' + catIcons(p.cats) + ' <span>День ' + d + ' · ' + plan().days[d - 1].title + '</span></div>' +
      '<p>' + p.short + '</p>' + moreBtn('place-' + key) + '</div></div>';
  }
  function pointIcon(id) {
    var ico = id === '@airport' ? '✈️' : (id.indexOf('@port') === 0 ? '⛴' : '🛏');
    return L.divIcon({ className: 'pin-wrap', html: '<span class="pin base">' + ico + '</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
  }
  function hikeStartIcon(k) {
    var h = HIKES[k];
    return L.divIcon({
      className: 'pin-wrap',
      html: '<span class="pin" style="--pc:' + h.color + '"><b>' + h.n + '</b></span>' +
            '<span class="pin-label">' + h.label + '</span>',
      // h.shift (px) fans out trails that share a trailhead (PR6/PR6.1, PR9/PR9.1); screen-space, so it holds at any zoom
      iconSize: [30, 30], iconAnchor: [15 - (h.shift || 0), 30], popupAnchor: [h.shift || 0, -28]
    });
  }
  function hikeEndIcon(k) {
    return L.divIcon({
      className: 'pin-wrap',
      html: '<span class="hike-end" style="--pc:' + HIKES[k].color + '">🏁<b>' + HIKES[k].n + '</b></span>',
      iconSize: [34, 22], iconAnchor: [6, 20]
    });
  }
  function hikePopup(k, isEnd) {
    var h = HIKES[k];
    return '<div class="pop">' + (h.thumb ? '<div class="pop-img" style="background-image:url(\'' + h.thumb + '\')"></div>' : '') +
      '<div class="pop-b"><div class="pop-t"><span class="pop-n" style="background:' + h.color + '">' + h.n + '</span>' + h.name + '</div>' +
      '<div class="pop-c"><span class="pop-lvl" style="color:' + h.color + '">' + h.levelLabel + '</span><span>· ' + h.ref + ' · ' + h.time + '</span></div>' +
      '<p>' + (isEnd ? '<b>🏁 Фініш стежки.</b> ' : '<b>▶ Старт.</b> ') + h.short + '</p>' +
      '<p class="pop-stats">📏 ' + h.dist + '</p>' + moreBtn('hike-' + k) + '</div></div>';
  }

  function initMap() {
    if (!window.L || !$('#bigmap')) return;
    map = L.map('bigmap', { scrollWheelZoom: false, zoomSnap: 0.25 });
    L.tileLayer(TILE, { attribution: ATTR, maxZoom: 16 }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    trailLayer = L.layerGroup().addTo(map);
    Object.keys(DATA.places).forEach(function (key) {
      markers[key] = L.marker(DATA.places[key].ll, { riseOnHover: true }).bindPopup('', { maxWidth: 260, minWidth: 220 });
      markers[key].on('popupopen', function (e) { e.popup.setContent(popupHtml(key)); });
    });
    Object.keys(DATA.points).forEach(function (id) {
      pointMarkers[id] = L.marker(DATA.points[id].ll, { icon: pointIcon(id), zIndexOffset: -100 })
        .bindPopup('<div class="pop-b"><b>' + DATA.points[id].name + '</b></div>');
    });
    var heads = [];
    HIKE_KEYS.forEach(function (k) {
      var h = HIKES[k].start;
      HIKES[k].shift = 34 * heads.filter(function (p) { return Math.abs(p[0] - h[0]) < 0.0006 && Math.abs(p[1] - h[1]) < 0.0006; }).length;
      heads.push(h);
      hikeStart[k] = L.marker(h, { icon: hikeStartIcon(k), riseOnHover: true, zIndexOffset: 200 }).bindPopup('', { maxWidth: 260, minWidth: 220 });
      hikeStart[k].on('popupopen', function (e) { e.popup.setContent(hikePopup(k, false)); });
      hikeEnd[k] = L.marker(HIKES[k].end, { icon: hikeEndIcon(k) }).bindPopup('', { maxWidth: 260, minWidth: 220 });
      hikeEnd[k].on('popupopen', function (e) { e.popup.setContent(hikePopup(k, true)); });
    });
    // one delegated handler for every "Детальніше" button inside any popup
    map.getContainer().addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.pop-more');
      if (!btn) return;
      e.preventDefault();
      map.closePopup();
      openCard(btn.getAttribute('data-target'));
    });
    map.on('zoomend moveend', labels);
    render(true);
  }

  // Show a pin's name only where it fits (right, else left of the pin); list order wins.
  function labels() {
    if (!map) return;
    var box = $('#bigmap').getBoundingClientRect(), taken = [];
    function rect(node, owner) { var r = node.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, o: owner }; }
    function hit(r, own) {
      if (r.l < box.left + 4 || r.r > box.right - 4 || r.t < box.top || r.b > box.bottom) return true;
      return taken.some(function (s) { return s.o !== own && r.l < s.r + 3 && r.r + 3 > s.l && r.t < s.b + 1 && r.b + 1 > s.t; });
    }
    var list = hiking() ? HIKE_KEYS.map(function (k) { return hikeStart[k]; }) : plan().order.map(function (k) { return markers[k]; });
    var els = list.map(function (m) { return map.hasLayer(m) && m.getElement(); }).filter(Boolean);
    if (hiking()) HIKE_KEYS.forEach(function (k) { var el = map.hasLayer(hikeEnd[k]) && hikeEnd[k].getElement(); if (el) taken.push(rect(el.firstChild, null)); });
    els.forEach(function (el) { taken.push(rect(el.querySelector('.pin b'), el)); });
    els.forEach(function (el) {
      var lab = el.querySelector('.pin-label');
      lab.style.visibility = 'visible'; lab.classList.remove('left');
      var r = rect(lab, el);
      if (hit(r, el)) { lab.classList.add('left'); r = rect(lab, el); if (hit(r, el)) { lab.style.visibility = 'hidden'; return; } }
      taken.push(r);
    });
  }

  function drawRoutes() {
    routeLayer.clearLayers();
    if (state.mode !== 'route') return;
    plan().days.forEach(function (d) {
      var dim = state.focus && state.focus !== d.n;
      d.legs.forEach(function (line) {
        L.polyline(line, { color: '#fff', weight: 8, opacity: dim ? 0.15 : 0.9, interactive: false }).addTo(routeLayer);
        L.polyline(line, { color: d.color, weight: 4.5, opacity: dim ? 0.18 : 0.95 })
          .bindTooltip('День ' + d.n + ' · ' + d.title, { sticky: true })
          .on('click', function () { focusDay(state.focus === d.n ? 0 : d.n); })
          .addTo(routeLayer);
      });
      d.ferry.forEach(function (seg) {
        L.polyline(seg, { color: d.color, weight: 3, opacity: dim ? 0.2 : 0.9, dashArray: '2 9', lineCap: 'round' })
          .bindTooltip('⛴ Пором Фуншал — Порту-Санту', { sticky: true }).addTo(routeLayer);
      });
    });
  }

  function drawTrails() {
    trailLayer.clearLayers();
    HIKE_KEYS.forEach(function (k) {
      var on = hikeVisible(k);
      [hikeStart[k], hikeEnd[k]].forEach(function (m) {
        if (on && !map.hasLayer(m)) m.addTo(map);
        if (!on && map.hasLayer(m)) map.removeLayer(m);
      });
      if (!on) return;
      HIKES[k].lines.forEach(function (line) {
        L.polyline(line, { color: '#fff', weight: 8, opacity: 0.9, interactive: false }).addTo(trailLayer);
        L.polyline(line, { color: HIKES[k].color, weight: 4.5, opacity: 1, dashArray: '6 6', lineCap: 'round' })
          .bindTooltip(HIKES[k].n + ' · ' + HIKES[k].name + ' (' + HIKES[k].levelLabel.toLowerCase() + ')', { sticky: true })
          .on('click', function () { hikeStart[k].openPopup(); })
          .addTo(trailLayer);
      });
    });
  }

  function fit() {
    var pts = [];
    if (hiking()) {
      HIKE_KEYS.forEach(function (k) { if (hikeVisible(k)) pts.push(HIKES[k].start, HIKES[k].end); });
    } else if (state.focus) {
      var d = plan().days[state.focus - 1];
      d.legs.concat(d.ferry).forEach(function (l) { pts = pts.concat(l); });
    } else {
      plan().order.forEach(function (k) { if (visible(k)) pts.push(DATA.places[k].ll); });
      if (state.mode === 'route') plan().days.forEach(function (d) { d.points.forEach(function (p) { pts.push(DATA.points[p].ll); }); });
    }
    if (pts.length) map.fitBounds(pts, { padding: [36, 36], maxZoom: 13 });
  }

  function renderMap(refit) {
    if (!map) return;
    map.closePopup();
    var used = {};
    if (!hiking()) plan().days.forEach(function (d) {
      if (state.focus && state.focus !== d.n) return;
      d.points.forEach(function (p) { used[p] = 1; });
    });
    Object.keys(markers).forEach(function (k) {
      var on = visible(k) && (!state.focus || dayOf(k) === state.focus);
      if (on) { markers[k].setIcon(pinIcon(k)); if (!map.hasLayer(markers[k])) markers[k].addTo(map); }
      else if (map.hasLayer(markers[k])) map.removeLayer(markers[k]);
    });
    Object.keys(pointMarkers).forEach(function (id) {
      var on = !!used[id] && (state.mode === 'route' || id === '@airport' || id.indexOf('@base') === 0);
      if (on && !map.hasLayer(pointMarkers[id])) pointMarkers[id].addTo(map);
      if (!on && map.hasLayer(pointMarkers[id])) map.removeLayer(pointMarkers[id]);
    });
    drawRoutes();
    drawTrails();
    if (refit) fit();
    setTimeout(labels, 0);
  }

  /* ---------- page (cards, legend, itinerary, controls) ---------- */
  function show(sel, on) { $$(sel).forEach(function (el) { el.hidden = !on; }); }
  function renderPage() {
    var p = plan(), hk = hiking();
    // tour cards: reorder by route, renumber, recolour, hide those not in this plan / category
    var list = $('.places.tour-list');
    p.order.forEach(function (k) { var c = document.getElementById('place-' + k); if (c) list.appendChild(c); });
    $$('.place[data-key]').forEach(function (card) {
      var k = card.getAttribute('data-key'), d = dayOf(k);
      card.hidden = !visible(k);
      if (!d) return;
      var color = colorOf(k);
      var n = $('.place-n', card); n.textContent = numOf(k); n.style.background = color;
      var chip = $('.day-chip', card); chip.textContent = 'День ' + d; chip.style.setProperty('--dc', color);
      chip.title = p.days[d - 1].title;
    });
    $$('.cf-btn').forEach(function (b) {
      var c = b.getAttribute('data-cat');
      var cnt = p.order.filter(function (k) { return c === 'all' || DATA.places[k].cats.indexOf(c) >= 0; }).length;
      $('.cf-n', b).textContent = cnt;
      b.classList.toggle('is-on', c === state.cat);
      b.disabled = cnt === 0;
    });
    // hike cards + level filter
    $$('.hike[data-hike]').forEach(function (card) { card.hidden = !hikeVisible(card.getAttribute('data-hike')); });
    $$('.lf-btn').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-level') === state.level); });

    // what belongs to which mode
    show('.tour-only', !hk);
    show('.hike-only', hk);
    $$('.plan-summary').forEach(function (el) { el.hidden = hk || el.getAttribute('data-plan') !== state.plan; });
    $$('.itinerary').forEach(function (el) { el.hidden = el.getAttribute('data-plan') !== state.plan; });
    $('.itineraries').hidden = state.mode !== 'route';
    $('.seg-plan').classList.toggle('is-disabled', hk);
    $$('.seg-plan .seg-btn').forEach(function (b) { b.disabled = hk; });

    $$('.it-day').forEach(function (li) {
      var on = +li.getAttribute('data-day') === state.focus && li.parentNode.getAttribute('data-plan') === state.plan;
      li.classList.toggle('is-focus', on);
      $('.it-head', li).setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('.seg-btn[data-mode]').forEach(function (b) {
      var on = b.getAttribute('data-mode') === state.mode;
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('.seg-btn[data-plan]').forEach(function (b) {
      var on = b.getAttribute('data-plan') === state.plan;
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('.day-legend').innerHTML = hk
      ? '<span><b class="lg-start">1</b> старт стежки</span><span><b class="lg-end">🏁</b> фініш</span><span><i class="lg-line"></i> траса (OpenStreetMap)</span>'
      : p.days.map(function (d) {
          return '<button type="button" data-day="' + d.n + '" class="' + (state.focus === d.n ? 'is-focus' : '') + '">' +
            '<i style="background:' + d.color + '"></i>Д' + d.n + ' ' + d.title + '</button>';
        }).join('') + '<span>🛏 база</span><span>✈️ аеропорт</span>';
  }

  function render(refit) { renderPage(); renderMap(refit); }
  function focusDay(n) { state.focus = n; render(true); }

  /* ---------- events ---------- */
  $$('.seg-btn[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { state.mode = b.getAttribute('data-mode'); state.focus = 0; save(); render(true); });
  });
  $$('.seg-btn[data-plan]').forEach(function (b) {
    b.addEventListener('click', function () { state.plan = b.getAttribute('data-plan'); state.focus = 0; state.cat = 'all'; save(); render(true); });
  });
  $$('.cf-btn').forEach(function (b) {
    b.addEventListener('click', function () { state.cat = b.getAttribute('data-cat'); state.focus = 0; render(true); });
  });
  $$('.lf-btn').forEach(function (b) {
    b.addEventListener('click', function () { state.level = b.getAttribute('data-level'); render(true); });
  });
  $('.day-legend').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-day]');
    if (!b) return;
    var n = +b.getAttribute('data-day');
    state.mode = 'route';
    focusDay(state.focus === n ? 0 : n);
  });
  $$('.it-head').forEach(function (b) {
    b.addEventListener('click', function () {
      var n = +b.parentNode.getAttribute('data-day');
      focusDay(state.focus === n ? 0 : n);
      $('#bigmap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  function flyTo(marker) {
    $('#bigmap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    map.flyTo(marker.getLatLng(), 13, { duration: 0.8 });
    setTimeout(function () { marker.openPopup(); }, 850);
  }
  // card number -> fly to its pin
  $$('.place[data-key] .place-n').forEach(function (badge) {
    badge.setAttribute('role', 'button');
    badge.setAttribute('title', 'Показати на карті');
    badge.addEventListener('click', function () {
      var key = badge.closest('.place').getAttribute('data-key');
      if (!map || !markers[key]) return;
      if (state.focus && dayOf(key) !== state.focus) focusDay(0);
      flyTo(markers[key]);
    });
  });
  $$('.hike[data-hike] .place-n').forEach(function (badge) {
    badge.setAttribute('role', 'button');
    badge.setAttribute('title', 'Показати на карті');
    badge.addEventListener('click', function () {
      var k = badge.closest('.hike').getAttribute('data-hike');
      if (!map || !hikeStart[k]) return;
      if (!hikeVisible(k)) { state.level = 'all'; render(false); }
      flyTo(hikeStart[k]);
    });
  });

  renderPage();
  if (window.L) initMap(); else window.addEventListener('load', initMap);
  window.addEventListener('load', function () {
    var h = location.hash.slice(1);
    if (h.indexOf('hike-') === 0 && HIKES[h.slice(5)]) { state.mode = 'hike'; render(true); openCard(h); }
    else if (h.indexOf('place-') === 0) openCard(h);
  });
})();
