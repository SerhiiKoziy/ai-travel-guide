/* Snowfall for winter-themed guides (body.theme-winter). A fixed canvas under the header,
   ~1 flake per 18 000 px² (max 90), paused when the tab is hidden; off by default with
   prefers-reduced-motion. The ❄ button toggles it and remembers the choice. */
(function(){
  if(!document.body.classList.contains('theme-winter')) return;
  var KEY = 'snow-on', reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var on = !reduce;
  try{ var s = localStorage.getItem(KEY); if(s !== null) on = s === '1'; }catch(e){}
  var cv = document.createElement('canvas'); cv.className = 'snow-canvas'; cv.setAttribute('aria-hidden', 'true');
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'snow-toggle'; btn.textContent = '❄';
  document.body.appendChild(cv); document.body.appendChild(btn);
  var ctx = cv.getContext('2d'), flakes = [], W = 0, H = 0, dpr = 1, raf = 0, t = 0;
  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.min(90, Math.round(W * H / 18000));
    while(flakes.length < n) flakes.push(make(true));
    flakes.length = n;
  }
  function make(any){
    var r = Math.random() * 2.4 + 0.8;
    return {x: Math.random() * W, y: any ? Math.random() * H : -6, r: r, v: 0.25 + r * 0.28,
            p: Math.random() * 6.28, a: 0.45 + Math.random() * 0.45};
  }
  function color(){
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (document.documentElement.getAttribute('data-theme') !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    return dark ? '255,255,255' : '150,185,220';
  }
  function frame(){
    t += 0.01; ctx.clearRect(0, 0, W, H); var c = color();
    for(var i = 0; i < flakes.length; i++){
      var f = flakes[i]; f.y += f.v; f.x += Math.sin(t * 2 + f.p) * 0.35;
      if(f.y > H + 6){ flakes[i] = make(false); continue; }
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fillStyle = 'rgba(' + c + ',' + f.a + ')'; ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  function start(){ if(!raf && on && !document.hidden){ resize(); raf = requestAnimationFrame(frame); } }
  function stop(){ cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, W, H); }
  function render(){
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Вимкнути сніг' : 'Увімкнути сніг';
    btn.setAttribute('aria-label', btn.title);
    cv.style.display = on ? '' : 'none';
  }
  btn.addEventListener('click', function(){
    on = !on; try{ localStorage.setItem(KEY, on ? '1' : '0'); }catch(e){}
    render(); on ? start() : stop();
  });
  addEventListener('resize', function(){ if(raf) resize(); });
  document.addEventListener('visibilitychange', function(){ document.hidden ? stop() : start(); });
  render(); start();
})();
