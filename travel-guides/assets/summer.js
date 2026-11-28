/* Rising sea bubbles for summer-themed guides (body.theme-summer). A fixed canvas,
   ~1 bubble per 40 000 px² (max 34), paused when the tab is hidden; off by default with
   prefers-reduced-motion. The 🫧 button toggles them and remembers the choice. */
(function(){
  if(!document.body.classList.contains('theme-summer')) return;
  var KEY = 'bubbles-on', reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var on = !reduce;
  try{ var s = localStorage.getItem(KEY); if(s !== null) on = s === '1'; }catch(e){}
  var cv = document.createElement('canvas'); cv.className = 'bubble-canvas'; cv.setAttribute('aria-hidden', 'true');
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'bubble-toggle'; btn.textContent = '🫧';
  document.body.appendChild(cv); document.body.appendChild(btn);
  var ctx = cv.getContext('2d'), bubbles = [], W = 0, H = 0, dpr = 1, raf = 0, t = 0;
  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.min(34, Math.round(W * H / 40000));
    while(bubbles.length < n) bubbles.push(make(true));
    bubbles.length = n;
  }
  function make(any){
    var r = Math.random() * 5 + 2;
    return {x: Math.random() * W, y: any ? Math.random() * H : H + 10, r: r, v: 0.18 + r * 0.05,
            p: Math.random() * 6.28, a: 0.25 + Math.random() * 0.3};
  }
  function color(){
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (document.documentElement.getAttribute('data-theme') !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    return dark ? '120,220,230' : '7,138,153';
  }
  function frame(){
    t += 0.01; ctx.clearRect(0, 0, W, H); var c = color();
    for(var i = 0; i < bubbles.length; i++){
      var b = bubbles[i]; b.y -= b.v; b.x += Math.sin(t * 1.6 + b.p) * 0.3;
      if(b.y < -10){ bubbles[i] = make(false); continue; }
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283);
      ctx.strokeStyle = 'rgba(' + c + ',' + b.a + ')'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, 6.283);
      ctx.fillStyle = 'rgba(255,255,255,' + (b.a + 0.2) + ')'; ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  function start(){ if(!raf && on && !document.hidden){ resize(); raf = requestAnimationFrame(frame); } }
  function stop(){ cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, W, H); }
  function render(){
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Вимкнути бульбашки' : 'Увімкнути бульбашки';
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
