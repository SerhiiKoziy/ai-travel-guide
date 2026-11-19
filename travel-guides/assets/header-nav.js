/* Desktop header: guide dropdowns + sticky "steps" bar with scroll-spy.
   On phones (≤768px) both are hidden by CSS; mobile-nav.js provides the drawer and
   the "Ви читаєте" bar instead. */
(function () {
  /* ---------- dropdowns (hover via CSS; click/tap + keyboard here) ---------- */
  var groups = document.querySelectorAll('.hn-group');
  function closeAll(except) {
    Array.prototype.forEach.call(groups, function (g) {
      if (g === except) return;
      g.classList.remove('is-open');
      g.querySelector('.hn-btn').setAttribute('aria-expanded', 'false');
    });
  }
  Array.prototype.forEach.call(groups, function (g) {
    var btn = g.querySelector('.hn-btn');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !g.classList.contains('is-open');
      closeAll(g);
      g.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function () { closeAll(null); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(null); });

  /* ---------- steps scroll-spy ---------- */
  var bar = document.querySelector('.steps-inner');
  var header = document.querySelector('header.top');
  if (!bar || !header) return;
  var steps = Array.prototype.slice.call(bar.querySelectorAll('a.step')).map(function (a) {
    return { a: a, target: document.getElementById(a.getAttribute('href').slice(1)) };
  }).filter(function (s) { return s.target; });
  var current = -2;

  function keepVisible(a) {
    var l = a.offsetLeft, r = l + a.offsetWidth;
    if (l < bar.scrollLeft + 24 || r > bar.scrollLeft + bar.clientWidth - 24) {
      bar.scrollTo({ left: l - bar.clientWidth / 2 + a.offsetWidth / 2, behavior: 'smooth' });
    }
  }
  function compute() {
    var line = header.getBoundingClientRect().bottom + 24;
    var idx = -1;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].target.getBoundingClientRect().top <= line) idx = i; else break;
    }
    if (idx === current) return;
    current = idx;
    steps.forEach(function (s, i) {
      s.a.classList.toggle('is-active', i === idx);
      s.a.classList.toggle('is-done', i < idx);
      if (i === idx) s.a.setAttribute('aria-current', 'location'); else s.a.removeAttribute('aria-current');
    });
    if (idx >= 0) keepVisible(steps[idx].a);
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; compute(); });
  }, { passive: true });
  window.addEventListener('resize', compute);
  compute();
})();
