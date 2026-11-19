/* Places block: Leaflet map with numbered pins, category filter, photo sliders.
   Data comes from <script id="places-data"> rendered by places.py. */
(function () {
  var dataEl = document.getElementById('places-data');
  if (!dataEl) return;
  var DATA = JSON.parse(dataEl.textContent);
  var root = document.documentElement;

  function isDark() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
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
  window.__openPlace = openPlace;

  /* ---------- sliders ---------- */
  function initSlider(el) {
    var track = el.querySelector('.slides');
    var slides = track.children;
    var counter = el.querySelector('.sl-i');
    function index() { return Math.round(track.scrollLeft / track.clientWidth); }
    function go(i) {
      i = (i + slides.length) % slides.length;
      track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
    }
    el.querySelector('.prev').addEventListener('click', function () { go(index() - 1); });
    el.querySelector('.next').addEventListener('click', function () { go(index() + 1); });
    track.addEventListener('scroll', function () { counter.textContent = index() + 1; }, { passive: true });
    el.tabIndex = 0;
    el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') go(index() - 1);
      if (e.key === 'ArrowRight') go(index() + 1);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-slider]'), initSlider);

  /* ---------- map ---------- */
  var map, markers = {}, tiles;
  var TILE = {
    // one street map for both themes; dark mode dims it in CSS (dark basemaps hide the island at this zoom)
    light: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
  };
  TILE.dark = TILE.light;
  var ATTR = 'Tiles &copy; <a href="https://www.esri.com">Esri</a> — Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

  function catIcons(cats) {
    return cats.map(function (c) {
      return '<svg class="cat-ic" width="16" height="16" style="color:' + DATA.cats[c].color +
        '"><use href="#ic-' + c + '"/></svg>';
    }).join('');
  }

  function initMap() {
    if (!window.L || !document.getElementById('bigmap')) return;
    map = L.map('bigmap', { scrollWheelZoom: false, zoomSnap: 0.25 });
    tiles = L.tileLayer(isDark() ? TILE.dark : TILE.light, { attribution: ATTR, maxZoom: 16 }).addTo(map);
    var bounds = [];
    DATA.places.forEach(function (p) {
      var color = DATA.days[p.day].color;
      var icon = L.divIcon({
        className: 'pin-wrap',
        html: '<span class="pin" style="--pc:' + color + '"><b>' + p.n + '</b></span>' +
              '<span class="pin-label">' + p.label + '</span>',
        iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28]
      });
      var popup = '<div class="pop">' +
        (p.thumb ? '<div class="pop-img" style="background-image:url(\'' + p.thumb + '\')"></div>' : '') +
        '<div class="pop-b"><div class="pop-t"><span class="pop-n" style="background:' + color + '">' + p.n + '</span>' + p.name + '</div>' +
        '<div class="pop-c">' + catIcons(p.cats) + ' <span>' + DATA.days[p.day].label + '</span></div>' +
        '<p>' + p.short + '</p>' +
        '<button type="button" class="pop-more" data-key="' + p.key + '">Детальніше ↓</button></div></div>';
      markers[p.key] = L.marker(p.ll, { icon: icon, riseOnHover: true }).bindPopup(popup, { maxWidth: 260, minWidth: 220 }).addTo(map);
      markers[p.key].cats = p.cats;
      bounds.push(p.ll);
    });
    DATA.bases.forEach(function (b) {
      L.marker(b.ll, { icon: L.divIcon({ className: 'pin-wrap', html: '<span class="pin base">🛏</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) })
        .bindPopup('<div class="pop-b"><b>' + b.name + '</b></div>').addTo(map);
    });
    DATA.airport.forEach(function (a) {
      L.marker(a.ll, { icon: L.divIcon({ className: 'pin-wrap', html: '<span class="pin base">✈️</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) })
        .bindPopup('<div class="pop-b"><b>Аеропорт FNC</b><br>Отримання та повернення авто</div>').addTo(map);
    });
    map.fitBounds(bounds, { padding: [24, 24] });
    // Show a pin's name only if it doesn't overlap a name already shown (route order wins);
    // hidden names reappear as you zoom in. The number on the pin is always visible.
    function labels() {
      var box = document.getElementById('bigmap').getBoundingClientRect();
      var taken = [];   // rects of shown labels and of all pins
      function overlaps(r, own) {
        if (r.left < box.left + 4 || r.right > box.right - 4 || r.top < box.top || r.bottom > box.bottom) return true;
        return taken.some(function (s) {
          if (s.owner === own) return false;
          return r.left < s.right + 3 && r.right + 3 > s.left && r.top < s.bottom + 1 && r.bottom + 1 > s.top;
        });
      }
      function rect(node, owner) {
        var r = node.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, owner: owner };
      }
      var items = DATA.places.map(function (p) {
        var m = markers[p.key], el = m && m.getElement && m.getElement();
        return (el && map.hasLayer(m)) ? el : null;
      }).filter(Boolean);
      items.forEach(function (el) { taken.push(rect(el.querySelector('.pin b'), el)); });
      items.forEach(function (el) {
        var lab = el.querySelector('.pin-label');
        lab.style.visibility = 'visible';
        lab.classList.remove('left');
        var r = rect(lab, el);
        if (overlaps(r, el)) {
          lab.classList.add('left');
          r = rect(lab, el);
          if (overlaps(r, el)) { lab.style.visibility = 'hidden'; return; }
        }
        taken.push(r);
      });
    }
    map.on('zoomend moveend', labels); setTimeout(labels, 0);
    window.__labels = labels;
    map.on('popupopen', function (e) {
      var btn = e.popup.getElement().querySelector('.pop-more');
      if (btn) btn.addEventListener('click', function () { map.closePopup(); openPlace(btn.getAttribute('data-key')); });
    });
    // re-skin tiles when the theme switch is used
    new MutationObserver(function () { tiles.setUrl(isDark() ? TILE.dark : TILE.light); })
      .observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ---------- category filter ---------- */
  var buttons = document.querySelectorAll('.cf-btn');
  Array.prototype.forEach.call(buttons, function (btn) {
    btn.addEventListener('click', function () {
      var cat = btn.getAttribute('data-cat');
      Array.prototype.forEach.call(buttons, function (b) { b.classList.toggle('is-on', b === btn); });
      Array.prototype.forEach.call(document.querySelectorAll('.place'), function (card) {
        var show = cat === 'all' || card.getAttribute('data-cats').split(' ').indexOf(cat) >= 0;
        card.hidden = !show;
      });
      if (!map) return;
      Object.keys(markers).forEach(function (k) {
        var m = markers[k], show = cat === 'all' || m.cats.indexOf(cat) >= 0;
        if (show && !map.hasLayer(m)) m.addTo(map);
        if (!show && map.hasLayer(m)) map.removeLayer(m);
      });
      if (window.__labels) window.__labels();
    });
  });

  // card number -> fly to its pin
  Array.prototype.forEach.call(document.querySelectorAll('.place-n'), function (badge) {
    badge.setAttribute('role', 'button');
    badge.setAttribute('title', 'Показати на карті');
    badge.addEventListener('click', function () {
      var key = badge.closest('.place').id.replace('place-', '');
      if (!map || !markers[key]) return;
      document.getElementById('bigmap').scrollIntoView({ behavior: 'smooth', block: 'center' });
      map.flyTo(markers[key].getLatLng(), 13, { duration: 0.8 });
      setTimeout(function () { markers[key].openPopup(); }, 850);
    });
  });

  if (window.L) initMap();
  else window.addEventListener('load', initMap);
  if (location.hash.indexOf('#place-') === 0) {
    window.addEventListener('load', function () { openPlace(location.hash.slice(7)); });
  }
})();
