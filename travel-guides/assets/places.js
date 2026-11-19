/* Places block: Leaflet map, mode switch (locations / route by day), trip length switch
   (4/6/7/9 days), category filter, place cards with photo sliders.
   Data: <script id="places-data"> rendered by places.py; road geometry precomputed by
   _tools/routes.py (no routing API calls at runtime). */
(function () {
  var dataEl = document.getElementById('places-data');
  if (!dataEl) return;
  var DATA = JSON.parse(dataEl.textContent);
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var state = { mode: 'places', plan: DATA.default, cat: 'all', focus: 0, hikes: false };
  var HIKES = DATA.hikes || {};
  try {   // remember the viewer's last choice (per-browser convenience only)
    var saved = JSON.parse(localStorage.getItem('tg-madeira-view') || '{}');
    if (saved.plan && DATA.plans[saved.plan]) state.plan = saved.plan;
    if (saved.mode === 'route' || saved.mode === 'places') state.mode = saved.mode;
  } catch (e) {}
  function save() { try { localStorage.setItem('tg-madeira-view', JSON.stringify({ plan: state.plan, mode: state.mode })); } catch (e) {} }

  function plan() { return DATA.plans[state.plan]; }
  function numOf(key) { return plan().order.indexOf(key) + 1; }
  function dayOf(key) { return plan().dayOf[key] || 0; }
  function colorOf(key) { var d = dayOf(key); return d ? plan().days[d - 1].color : '#888'; }
  function visible(key) {
    return dayOf(key) > 0 && (state.cat === 'all' || DATA.places[key].cats.indexOf(state.cat) >= 0);
  }

  /* ---------- open a place card (from map popup or hash) ---------- */
  function openPlace(key) {
    var card = document.getElementById('place-' + key);
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
  var map, markers = {}, pointMarkers = {}, hikeMarkers = {}, routeLayer, trailLayer, labelsFn = function () {};
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
  function popupHtml(key) {
    var p = DATA.places[key], d = dayOf(key);
    return '<div class="pop">' + (p.thumb ? '<div class="pop-img" style="background-image:url(\'' + p.thumb + '\')"></div>' : '') +
      '<div class="pop-b"><div class="pop-t"><span class="pop-n" style="background:' + colorOf(key) + '">' + numOf(key) + '</span>' + p.name + '</div>' +
      '<div class="pop-c">' + catIcons(p.cats) + ' <span>День ' + d + ' · ' + plan().days[d - 1].title + '</span></div>' +
      '<p>' + p.short + '</p><button type="button" class="pop-more" data-key="' + key + '">Детальніше ↓</button></div></div>';
  }
  function pointIcon(id) {
    var ico = id === '@airport' ? '✈️' : (id.indexOf('@port') === 0 ? '⛴' : '🛏');
    return L.divIcon({ className: 'pin-wrap', html: '<span class="pin base">' + ico + '</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
  }

  function hikeIcon(k) {
    var h = HIKES[k];
    return L.divIcon({
      className: 'pin-wrap',
      html: '<span class="pin hike-pin" style="--pc:' + h.color + '"><svg width="16" height="16"><use href="#ic-hike"/></svg></span>' +
            '<span class="pin-label hike-label' + (h.labelLeft ? ' left' : '') + '">' + h.ref + '</span>',
      // h.shift (px) fans out pins that share a trailhead; it is screen-space, so it holds at any zoom
      iconSize: [28, 28], iconAnchor: [14 - (h.shift || 0), 14], popupAnchor: [h.shift || 0, -12]
    });
  }
  function hikePopup(k) {
    var h = HIKES[k];
    return '<div class="pop">' + (h.thumb ? '<div class="pop-img" style="background-image:url(\'' + h.thumb + '\')"></div>' : '') +
      '<div class="pop-b"><div class="pop-t"><span class="pop-ref" style="background:' + h.color + '">' + h.ref + '</span>' + h.name + '</div>' +
      '<div class="pop-c"><span style="color:' + h.color + ';font-weight:800;margin:0">' + h.levelLabel + '</span><span>· ' + h.time + '</span></div>' +
      '<p>' + h.short + '</p><button type="button" class="pop-more" data-hike="' + k + '">Детальніше ↓</button></div></div>';
  }
  function openHike(k) {
    var card = document.getElementById('hike-' + k);
    if (!card) return;
    var det = card.querySelector('details'); if (det) det.open = true;
    card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 1600);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function initMap() {
    if (!window.L || !$('#bigmap')) return;
    map = L.map('bigmap', { scrollWheelZoom: false, zoomSnap: 0.25 });
    L.tileLayer(TILE, { attribution: ATTR, maxZoom: 16 }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    trailLayer = L.layerGroup().addTo(map);
    // trails that share a trailhead (PR6/PR6.1, PR9/PR9.1) get their pins fanned out sideways
    var heads = [];
    Object.keys(HIKES).forEach(function (k) {
      var h = HIKES[k].head, same = heads.filter(function (p) { return Math.abs(p[0] - h[0]) < 0.0006 && Math.abs(p[1] - h[1]) < 0.0006; }).length;
      heads.push(h);
      HIKES[k].pin = h;
      HIKES[k].shift = same * 34;
      if (same) Object.keys(HIKES).forEach(function (o) {   // the unshifted twin puts its label on the left
        var t = HIKES[o].head;
        if (o !== k && !HIKES[o].shift && Math.abs(t[0] - h[0]) < 0.0006 && Math.abs(t[1] - h[1]) < 0.0006) HIKES[o].labelLeft = true;
      });
    });
    Object.keys(HIKES).forEach(function (k) {
      hikeMarkers[k] = L.marker(HIKES[k].pin || HIKES[k].head, { icon: hikeIcon(k), zIndexOffset: 200 }).bindPopup('', { maxWidth: 260, minWidth: 220 });
      hikeMarkers[k].on('popupopen', function (e) { e.popup.setContent(hikePopup(k)); wirePopup(e.popup); });
    });
    Object.keys(DATA.places).forEach(function (key) {
      markers[key] = L.marker(DATA.places[key].ll, { riseOnHover: true }).bindPopup('', { maxWidth: 260, minWidth: 220 });
      markers[key].on('popupopen', function (e) { e.popup.setContent(popupHtml(key)); wirePopup(e.popup); });
    });
    Object.keys(DATA.points).forEach(function (id) {
      pointMarkers[id] = L.marker(DATA.points[id].ll, { icon: pointIcon(id), zIndexOffset: -100 })
        .bindPopup('<div class="pop-b"><b>' + DATA.points[id].name + '</b></div>');
    });
    labelsFn = makeLabels();
    map.on('zoomend moveend', labelsFn);
    render(true);
  }
  function wirePopup(popup) {
    var btn = popup.getElement() && popup.getElement().querySelector('.pop-more');
    if (btn) btn.addEventListener('click', function () {
      map.closePopup();
      if (btn.hasAttribute('data-hike')) openHike(btn.getAttribute('data-hike')); else openPlace(btn.getAttribute('data-key'));
    });
  }

  // Show a pin's name only where it fits (right, else left of the pin); route order wins.
  function makeLabels() {
    return function () {
      var box = $('#bigmap').getBoundingClientRect(), taken = [];
      function rect(node, owner) { var r = node.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, o: owner }; }
      function hit(r, own) {
        if (r.l < box.left + 4 || r.r > box.right - 4 || r.t < box.top || r.b > box.bottom) return true;
        return taken.some(function (s) { return s.o !== own && r.l < s.r + 3 && r.r + 3 > s.l && r.t < s.b + 1 && r.b + 1 > s.t; });
      }
      var els = plan().order.map(function (k) { var m = markers[k]; return map.hasLayer(m) && m.getElement(); }).filter(Boolean);
      els.forEach(function (el) { taken.push(rect(el.querySelector('.pin b'), el)); });
      els.forEach(function (el) {
        var lab = el.querySelector('.pin-label');
        lab.style.visibility = 'visible'; lab.classList.remove('left');
        var r = rect(lab, el);
        if (hit(r, el)) { lab.classList.add('left'); r = rect(lab, el); if (hit(r, el)) { lab.style.visibility = 'hidden'; return; } }
        taken.push(r);
      });
    };
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
    Object.keys(HIKES).forEach(function (k) {
      var on = state.hikes && !state.focus;
      if (on && !map.hasLayer(hikeMarkers[k])) hikeMarkers[k].addTo(map);
      if (!on && map.hasLayer(hikeMarkers[k])) map.removeLayer(hikeMarkers[k]);
      if (!on) return;
      HIKES[k].lines.forEach(function (line) {
        L.polyline(line, { color: '#fff', weight: 7, opacity: 0.9, interactive: false }).addTo(trailLayer);
        L.polyline(line, { color: HIKES[k].color, weight: 4, opacity: 1, dashArray: '3 6', lineCap: 'round' })
          .bindTooltip(HIKES[k].ref + ' · ' + HIKES[k].name + ' (' + HIKES[k].levelLabel.toLowerCase() + ')', { sticky: true })
          .on('click', function () { hikeMarkers[k].openPopup(); })
          .addTo(trailLayer);
      });
    });
  }

  function fit() {
    var pts = [];
    if (state.focus) {
      var d = plan().days[state.focus - 1];
      d.legs.concat(d.ferry).forEach(function (l) { pts = pts.concat(l); });
    } else {
      plan().order.forEach(function (k) { if (visible(k)) pts.push(DATA.places[k].ll); });
      if (state.mode === 'route') plan().days.forEach(function (d) { d.points.forEach(function (p) { pts.push(DATA.points[p].ll); }); });
      if (state.hikes) Object.keys(HIKES).forEach(function (k) { pts.push(HIKES[k].head); });
    }
    if (pts.length) map.fitBounds(pts, { padding: [28, 28], maxZoom: 13 });
  }

  function renderMap(refit) {
    if (!map) return;
    var used = {};
    plan().days.forEach(function (d) {
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
    setTimeout(labelsFn, 0);
  }

  /* ---------- page (cards, legend, itinerary, controls) ---------- */
  function renderPage() {
    var p = plan();
    // cards: reorder by route, renumber, recolour, hide those not in this plan / category
    var list = $('.places');
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
    // category counts within the plan
    $$('.cf-btn').forEach(function (b) {
      var c = b.getAttribute('data-cat');
      var cnt = p.order.filter(function (k) { return c === 'all' || DATA.places[k].cats.indexOf(c) >= 0; }).length;
      $('.cf-n', b).textContent = cnt;
      b.classList.toggle('is-on', c === state.cat);
      b.disabled = cnt === 0;
    });
    $$('.plan-summary').forEach(function (el) { el.hidden = el.getAttribute('data-plan') !== state.plan; });
    $$('.itinerary').forEach(function (el) { el.hidden = el.getAttribute('data-plan') !== state.plan; });
    $('.itineraries').hidden = state.mode !== 'route';
    var hb = $('.hikes'); if (hb) hb.hidden = !state.hikes;
    var cb = $('#show-hikes'); if (cb) cb.checked = state.hikes;
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
    // day legend (click = focus that day on the map)
    $('.day-legend').innerHTML = p.days.map(function (d) {
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
    b.addEventListener('click', function () {
      state.cat = b.getAttribute('data-cat'); state.focus = 0;
      if (state.cat === 'hike') state.hikes = true;   // this category means "show me the trails too"
      render(true);
    });
  });
  var hikeBox = $('#show-hikes');
  if (hikeBox) hikeBox.addEventListener('change', function () {
    state.hikes = hikeBox.checked; state.focus = 0;
    if (!state.hikes && state.cat === 'hike') state.cat = 'all';
    render(true);
  });
  $$('.hike-ref').forEach(function (badge) {
    badge.addEventListener('click', function () {
      var k = badge.closest('.hike').getAttribute('data-hike');
      if (!map || !hikeMarkers[k]) return;
      $('#bigmap').scrollIntoView({ behavior: 'smooth', block: 'center' });
      map.flyTo(HIKES[k].pin || HIKES[k].head, 13, { duration: 0.8 });
      setTimeout(function () { hikeMarkers[k].openPopup(); }, 850);
    });
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
  // card number -> fly to its pin
  $$('.place[data-key] .place-n').forEach(function (badge) {
    badge.setAttribute('role', 'button');
    badge.setAttribute('title', 'Показати на карті');
    badge.addEventListener('click', function () {
      var key = badge.closest('.place').getAttribute('data-key');
      if (!map || !markers[key]) return;
      if (state.focus && dayOf(key) !== state.focus) focusDay(0);
      $('#bigmap').scrollIntoView({ behavior: 'smooth', block: 'center' });
      map.flyTo(markers[key].getLatLng(), 13, { duration: 0.8 });
      setTimeout(function () { markers[key].openPopup(); }, 850);
    });
  });

  renderPage();
  if (window.L) initMap(); else window.addEventListener('load', initMap);
  if (location.hash.indexOf('#place-') === 0) window.addEventListener('load', function () { openPlace(location.hash.slice(7)); });
})();
