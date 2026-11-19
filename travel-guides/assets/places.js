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

  var state = { mode: 'places', plan: DATA.default, cat: 'all', focus: 0 };
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
  var map, markers = {}, pointMarkers = {}, routeLayer, labelsFn = function () {};
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

  function initMap() {
    if (!window.L || !$('#bigmap')) return;
    map = L.map('bigmap', { scrollWheelZoom: false, zoomSnap: 0.25 });
    L.tileLayer(TILE, { attribution: ATTR, maxZoom: 16 }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
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
    if (btn) btn.addEventListener('click', function () { map.closePopup(); openPlace(btn.getAttribute('data-key')); });
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

  function fit() {
    var pts = [];
    if (state.focus) {
      var d = plan().days[state.focus - 1];
      d.legs.concat(d.ferry).forEach(function (l) { pts = pts.concat(l); });
    } else {
      plan().order.forEach(function (k) { if (visible(k)) pts.push(DATA.places[k].ll); });
      if (state.mode === 'route') plan().days.forEach(function (d) { d.points.forEach(function (p) { pts.push(DATA.points[p].ll); }); });
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
    if (refit) fit();
    setTimeout(labelsFn, 0);
  }

  /* ---------- page (cards, legend, itinerary, controls) ---------- */
  function renderPage() {
    var p = plan();
    // cards: reorder by route, renumber, recolour, hide those not in this plan / category
    var list = $('.places');
    p.order.forEach(function (k) { var c = document.getElementById('place-' + k); if (c) list.appendChild(c); });
    $$('.place').forEach(function (card) {
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
    b.addEventListener('click', function () { state.cat = b.getAttribute('data-cat'); state.focus = 0; render(true); });
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
  $$('.place-n').forEach(function (badge) {
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
