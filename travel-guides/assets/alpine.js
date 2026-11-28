/* Two-season skin for body.theme-alpine. The season follows the plan switch (plan ids "summer" /
   "winter" in plans.json): body[data-season] swaps palette, hero photo and decorations (alpine.css),
   and the canvas shows butterflies in summer or snowfall in winter. Particles are off by default
   with prefers-reduced-motion; the button toggles them and remembers the choice. */
(function(){
  var body = document.body;
  if(!body.classList.contains('theme-alpine')) return;
  var KEY = 'alpine-fx-on', reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var on = !reduce, season = 'summer';
  try{ var s = localStorage.getItem(KEY); if(s !== null) on = s === '1'; }catch(e){}

  function current(){
    var b = document.querySelector('.seg-btn[data-plan][aria-pressed="true"]');
    return b && b.getAttribute('data-plan') === 'winter' ? 'winter' : 'summer';
  }
  function setSeason(next){
    if(next === season && body.hasAttribute('data-season')) return;
    season = next; body.setAttribute('data-season', season);
    document.querySelectorAll('article .card[data-season], article .decision[data-season]').forEach(function(c){
      c.classList.toggle('is-current', c.getAttribute('data-season') === season);
    });
    parts.length = 0; if(raf) resize();
    render();
  }

  var cv = document.createElement('canvas'); cv.className = 'alpine-canvas'; cv.setAttribute('aria-hidden', 'true');
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'alpine-toggle';
  body.appendChild(cv); body.appendChild(btn);
  var ctx = cv.getContext('2d'), parts = [], W = 0, H = 0, dpr = 1, raf = 0, t = 0;
  var WINGS = ['#9775fa', '#f59f00', '#ff8787', '#74c0fc', '#b197fc'];

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = season === 'winter' ? Math.min(90, Math.round(W * H / 18000)) : Math.min(9, Math.round(W * H / 140000) + 3);
    while(parts.length < n) parts.push(make(true));
    parts.length = n;
  }
  function make(any){
    if(season === 'winter'){
      var r = Math.random() * 2.4 + 0.8;
      return {x: Math.random() * W, y: any ? Math.random() * H : -6, r: r, v: 0.25 + r * 0.28,
              p: Math.random() * 6.28, a: 0.45 + Math.random() * 0.45};
    }
    return {x: Math.random() * W, y: any ? Math.random() * H : H + 20, s: 5 + Math.random() * 4,
            vx: (Math.random() - 0.5) * 0.6, vy: -(0.25 + Math.random() * 0.35),
            p: Math.random() * 6.28, c: WINGS[Math.floor(Math.random() * WINGS.length)]};
  }
  function dark(){
    var a = document.documentElement.getAttribute('data-theme');
    return a === 'dark' || (a !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function butterfly(b){
    var flap = Math.abs(Math.sin(t * 9 + b.p)) * 0.8 + 0.2;   // wing opening 0.2..1
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.sin(t + b.p) * 0.3);
    ctx.globalAlpha = 0.75; ctx.fillStyle = b.c;
    for(var side = -1; side <= 1; side += 2){
      ctx.beginPath(); ctx.ellipse(side * b.s * 0.55 * flap, -b.s * 0.25, b.s * 0.6 * flap, b.s * 0.75, side * 0.5, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.ellipse(side * b.s * 0.4 * flap, b.s * 0.45, b.s * 0.38 * flap, b.s * 0.5, -side * 0.4, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 0.9; ctx.fillStyle = dark() ? '#e9e3ff' : '#3b2a5c';
    ctx.fillRect(-0.8, -b.s * 0.7, 1.6, b.s * 1.5);
    ctx.restore();
  }
  function frame(){
    t += 0.01; ctx.clearRect(0, 0, W, H);
    if(season === 'winter'){
      var c = dark() ? '255,255,255' : '150,185,220';
      for(var i = 0; i < parts.length; i++){
        var f = parts[i]; f.y += f.v; f.x += Math.sin(t * 2 + f.p) * 0.35;
        if(f.y > H + 6){ parts[i] = make(false); continue; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fillStyle = 'rgba(' + c + ',' + f.a + ')'; ctx.fill();
      }
    } else {
      for(var j = 0; j < parts.length; j++){
        var b = parts[j]; b.x += b.vx + Math.sin(t * 1.3 + b.p) * 0.6; b.y += b.vy + Math.cos(t * 2 + b.p) * 0.4;
        if(b.y < -30 || b.x < -30 || b.x > W + 30){ parts[j] = make(false); continue; }
        butterfly(b);
      }
    }
    raf = requestAnimationFrame(frame);
  }
  function start(){ if(!raf && on && !document.hidden){ resize(); raf = requestAnimationFrame(frame); } }
  function stop(){ cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, W, H); }
  function render(){
    btn.textContent = season === 'winter' ? '❄' : '🦋';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? (season === 'winter' ? 'Вимкнути сніг' : 'Вимкнути метеликів')
                   : (season === 'winter' ? 'Увімкнути сніг' : 'Увімкнути метеликів');
    btn.setAttribute('aria-label', btn.title);
    cv.style.display = on ? '' : 'none';
  }
  btn.addEventListener('click', function(){
    on = !on; try{ localStorage.setItem(KEY, on ? '1' : '0'); }catch(e){}
    render(); on ? start() : stop();
  });
  addEventListener('resize', function(){ if(raf) resize(); });
  document.addEventListener('visibilitychange', function(){ document.hidden ? stop() : start(); });
  // "show this season" buttons in the content switch the plan through the map's own switch
  document.querySelectorAll('[data-go-season]').forEach(function(b){
    b.addEventListener('click', function(){
      var sw = document.querySelector('.seg-plan .seg-btn[data-plan="' + b.getAttribute('data-go-season') + '"]');
      if(sw) sw.click();
    });
  });
  // places.js flips aria-pressed on the plan buttons (also when it restores a saved plan on load)
  new MutationObserver(function(){ setSeason(current()); })
    .observe(document.querySelector('article') || body, {attributes: true, subtree: true, attributeFilter: ['aria-pressed']});
  setSeason(current()); start();
})();
