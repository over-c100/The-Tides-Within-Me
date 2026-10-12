/* =========================================================
   我和我 · The Tides Within Me
   app.js — 网格渐变驱动 / 玻璃图层 / 灯箱
   ========================================================= */
(function () {
  'use strict';

  var DATA = window.SPREAD_DATA || [];
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };

  /* ---------- 颜色工具 ---------- */
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    function f(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (!s) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function tri(c, sat, light) {
    var h = rgb2hsl(c[0], c[1], c[2]);
    var s = sat == null ? h[1] : clamp(sat, 0, 1);
    var l = light == null ? h[2] : clamp(light, 0, 1);
    return hsl2rgb(h[0], s, l);
  }
  function css(c, a) { return 'rgb(' + c[0] + ' ' + c[1] + ' ' + c[2] + (a == null ? '' : ' / ' + a) + ')'; }

  /* ---------- 预载层 ---------- */
  var loader = $('#loader'), bar = $('#loaderBar'), hint = $('#loaderHint');
  var hints = ['正在收集雨声…', '正在擦干跷跷板…', '正在数第 20 点的雨滴…', '正在等你抬头…'];
  var hi = 0;
  var hintTimer = setInterval(function () {
    hi = (hi + 1) % hints.length;
    if (hint) hint.textContent = hints[hi];
  }, 900);
  var progress = 0;
  function tick(to) {
    progress = Math.max(progress, to);
    if (bar) bar.style.width = progress + '%';
  }
  tick(12);

  // 载入进度：任意 3 个真实加载信号即进入页面，最长等待 3.2 秒
  var NEED = 3, settled = 0, finished = false;
  function loaded(step) {
    settled++;
    tick(Math.max(progress, step || (12 + settled * 21)));
    if (settled >= NEED) finish();
  }  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(hintTimer);
    tick(100);
    setTimeout(function () {
      loader.classList.add('is-done');
      revealAll();
    }, 380);
  }
  setTimeout(finish, 3200); // 兜底：无论如何 3.2 秒内进入页面

  /* ---------- 渲染跨页 ---------- */
  var list = $('#spreads');
  var frag = document.createDocumentFragment();

  DATA.forEach(function (d, i) {
    var li = document.createElement('li');
    li.className = 'spread';
    li.id = 'spread-' + d.slug;
    li.dataset.slug = d.slug;
    li.dataset.index = i;

    var num = String(i + 1).padStart(2, '0');
    var textHtml = (d.text || '').replace(/<br\s*\/?>/g, '<br>');

    li.innerHTML =
      '<div class="spread__inner">' +
        '<figure class="spread__figure glass">' +
          '<div class="spread__shot" data-ph="' + d.slug + '" data-src="assets/images/' + d.slug + '.jpg" role="button" tabindex="0"' +
            ' aria-label="查看第 ' + num + ' 幅跨页大图：' + stripTags(d.text) + '">' +
            '<img alt="《我和我》绘本第 ' + (i + 1) + ' 幅跨页：' + stripTags(d.text) + '" decoding="async"' +
              ' width="1900" height="' + Math.round(1900 * 1465 / 4144) + '">' +
            '<span class="spread__zoom">点击放大 ⤢</span>' +
          '</div>' +
          '<figcaption class="spread__meta">' +
            '<span class="spread__index">' + num + '</span>' +
            '<span class="spread__body">' +
              '<span class="spread__tag">' + (d.tag || '') + '</span>' +
              '<span class="spread__text">' + textHtml + '</span>' +
            '</span>' +
            '<span class="spread__time">' + (d.meta || '') + '</span>' +
          '</figcaption>' +
        '</figure>' +
      '</div>';

    frag.appendChild(li);
  });
  list.appendChild(frag);
  function stripTags(s) { return String(s || '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ''); }

  var spreads = [].slice.call(document.querySelectorAll('.spread'));
  var shots = [].slice.call(document.querySelectorAll('.spread__shot'));
  var navTotal = $('#navTotal');
  if (navTotal) navTotal.textContent = String(DATA.length).padStart(2, '0');

  /* ---------- 大图懒加载 ---------- */
  function loadShot(el) {
    if (el.dataset.loaded) return;
    el.dataset.loaded = '1';
    var img = el.querySelector('img');
    var src = el.dataset.src;
    var pre = new Image();
    pre.onload = function () {
      img.src = src;
      requestAnimationFrame(function () { img.classList.add('is-loaded'); });
    };
    pre.onerror = function () {
      img.alt = '图片加载失败：' + src;
      el.dataset.error = '1';
    };
    pre.src = src;
  }

  if ('IntersectionObserver' in window) {
    var lazyIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { loadShot(e.target); lazyIO.unobserve(e.target); }
      });
    }, { rootMargin: '150% 0px' });
    shots.forEach(function (s) { lazyIO.observe(s); });
  } else {
    shots.forEach(loadShot);
  }
  // 简单兜底：8 秒后全部加载
  setTimeout(function () { shots.forEach(loadShot); }, 8000);

  /* ---------- 进入动画 + 视差 ---------- */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var vh = window.innerHeight;
      for (var i = 0; i < spreads.length; i++) {
        var el = spreads[i].querySelector('.spread__figure');
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        var c = (r.top + r.height / 2 - vh / 2) / vh;  // -1 .. 1
        el.style.setProperty('--y', (c * 26).toFixed(2) + 'px');
      }
      ticking = false;
    });
  }

  if (!reduce) window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- 网格渐变：随当前跨页换色 ---------- */
  var cur = -1;
  function applyPalette(i) {
    if (i === cur || i < 0 || i >= DATA.length) return;
    cur = i;
    var d = DATA[i];
    var m = (d.mesh && d.mesh.length >= 5) ? d.mesh : [[25, 25, 40], [60, 55, 105], [130, 95, 190], [40, 70, 130], [200, 180, 150]];
    // 亮度分层：底色压暗，亮色提亮，形成有纵深的网格
    var c1 = tri(m[0], null, clamp(rgb2hsl(m[0][0], m[0][1], m[0][2])[2] * 0.55 + 0.06, .05, .3));
    var c2 = tri(m[1], clamp(rgb2hsl(m[1][0], m[1][1], m[1][2])[1] * 1.15 + .06, .12, .8), null);
    var c3 = tri(m[2], clamp(rgb2hsl(m[2][0], m[2][1], m[2][2])[1] * 1.2 + .08, .15, .85), clamp(rgb2hsl(m[2][0], m[2][1], m[2][2])[2] * .92, .2, .72));
    var c4 = tri(m[3], null, clamp(rgb2hsl(m[3][0], m[3][1], m[3][2])[2] * .85, .12, .55));
    var c5 = tri(m[4], clamp(rgb2hsl(m[4][0], m[4][1], m[4][2])[1] * .8, .05, .6), clamp(rgb2hsl(m[4][0], m[4][1], m[4][2])[2] * .95, .2, .78));

    // 强调色：取饱和度最高的那一团，再统一提高饱和与亮度，保证始终可读
    var best = m[0], bs = -1;
    m.forEach(function (c) { var s = rgb2hsl(c[0], c[1], c[2])[1]; if (s > bs) { bs = s; best = c; } });
    var bh = rgb2hsl(best[0], best[1], best[2])[0];
    var ac = hsl2rgb(bh, clamp(bs * 1.5 + .30, .45, .92), .70);
    var ac2 = hsl2rgb((bh + 0.10) % 1, clamp(bs * 1.2 + .28, .40, .85), .60);

    var s = root.style;
    s.setProperty('--m1', c1.join(' '));
    s.setProperty('--m2', c2.join(' '));
    s.setProperty('--m3', c3.join(' '));
    s.setProperty('--m4', c4.join(' '));
    s.setProperty('--m5', c5.join(' '));
    s.setProperty('--accent', ac.join(' '));
    s.setProperty('--accent-2', ac2.join(' '));

    var navIdx = $('#navIndex');
    if (navIdx) navIdx.textContent = String(i + 1).padStart(2, '0');

    spreads.forEach(function (el, j) { el.classList.toggle('is-current', j === i); });
  }

  var isIn = [];
  function reveal(el) { el.classList.add('is-in'); }        // 类挂在 <li.spread> 上，与 CSS 选择器一致
  function revealAll() { spreads.forEach(reveal); }

  if ('IntersectionObserver' in window) {
    // 进入视口 → 淡入
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          reveal(e.target);
          revealIO.unobserve(e.target);
        }
      });
    }, { rootMargin: '-8% 0px -8% 0px', threshold: 0.04 });
    spreads.forEach(function (el) { revealIO.observe(el); });

    // 接近视口中线 → 切换背景色（取最靠近中线的那个）
    var activeIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var i = +e.target.dataset.index;
        if (e.isIntersecting) { isIn[i] = e.intersectionRatio; }
        else { delete isIn[i]; }
      });
      var best = -1, br = 0;
      Object.keys(isIn).forEach(function (k) {
        var i = +k;
        if (isIn[i] >= br) { br = isIn[i]; best = i; }
      });
      // 未进入正文时用封面 / 首屏色调
      if (best < 0) best = 0;
      applyPalette(best);
    }, { rootMargin: '-32% 0px -32% 0px', threshold: [0, .15, .35, .6, .85, 1] });
    spreads.forEach(function (el) { activeIO.observe(el); });
  } else {
    revealAll();
    applyPalette(0);
  }
  applyPalette(0); // 首屏即用封面色调（紫色雨幕）

  /* ---------- 滚动进度 ---------- */
  var navProgress = $('#navProgress'), nav = $('#nav');
  var lastY = 0;
  function onScrollUI() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    if (navProgress) navProgress.style.width = (p * 100).toFixed(2) + '%';

    // 顶部玻璃导航：向下滚动收起，向上滚动展开
    var y = window.scrollY;
    if (nav) {
      if (y > 240 && y > lastY + 6) nav.classList.add('is-hidden');
      else if (y < lastY - 6 || y < 240) nav.classList.remove('is-hidden');
    }
    lastY = y;

    // 光标光晕
    if (!reduce) {
      root.style.setProperty('--sy', (y * .00006).toFixed(4));
    }
  }
  window.addEventListener('scroll', onScrollUI, { passive: true });
  window.addEventListener('resize', function () { onScroll(); onScrollUI(); });
  onScroll(); onScrollUI();

  /* ---------- 光标光晕 ---------- */
  var glow = $('.cursor-glow'), gx = window.innerWidth / 2, gy = window.innerHeight * .3, tx = gx, ty = gy;
  if (!reduce && window.matchMedia('(pointer:fine)').matches) {
    window.addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function loop() {
      gx += (tx - gx) * .06; gy += (ty - gy) * .06;
      if (glow) { glow.style.setProperty('--cx', gx.toFixed(1) + 'px'); glow.style.setProperty('--cy', gy.toFixed(1) + 'px'); }
      requestAnimationFrame(loop);
    })();
  } else if (glow) {
    glow.style.display = 'none';
  }

  /* ---------- 灯箱 ---------- */
  var lb = $('#lightbox'), lbImg = $('#lbImg'), lbMeta = $('#lbMeta'), lbCount = $('#lbCount');
  var lbIdx = 0, lastFocus = null;

  function openLb(i) {
    if (!DATA.length) return;
    lbIdx = (i + DATA.length) % DATA.length;
    var d = DATA[lbIdx];
    lbImg.src = 'assets/images/' + d.slug + '.jpg';
    lbImg.alt = '《我和我》绘本第 ' + (lbIdx + 1) + ' 幅跨页大图：' + stripTags(d.text);
    lbMeta.textContent = (d.meta || '') + ' · ' + (d.tag || '');
    lbCount.textContent = (lbIdx + 1) + ' / ' + DATA.length;
    lastFocus = document.activeElement;
    lb.hidden = false;
    document.body.classList.add('is-locked');
    requestAnimationFrame(function () { lb.classList.add('is-open'); });
    $('#lbClose').focus({ preventScroll: true });
    applyPalette(lbIdx);
    preload(lbIdx + 1); preload(lbIdx - 1);
  }
  function preload(i) {
    var d = DATA[(i + DATA.length) % DATA.length];
    if (d) { var im = new Image(); im.src = 'assets/images/' + d.slug + '.jpg'; }
  }
  function closeLb() {
    lb.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(function () { lb.hidden = true; lbImg.removeAttribute('src'); }, 420);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function step(d) { openLb(lbIdx + d); }

  shots.forEach(function (s) {
    var i = +s.closest('.spread').dataset.index;
    s.addEventListener('click', function () { openLb(i); });
    s.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(i); }
    });
  });
  $('#lbClose').addEventListener('click', closeLb);
  $('#lbPrev').addEventListener('click', function () { step(-1); });
  $('#lbNext').addEventListener('click', function () { step(1); });
  lb.querySelector('.lightbox__backdrop').addEventListener('click', closeLb);

  document.addEventListener('keydown', function (e) {
    if (!lb.hidden) {
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      return;
    }
    // 页面级快捷键：J / K 或 ← → 快速跳转跨页
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'j' || e.key === 'J') jump(1);
    if (e.key === 'k' || e.key === 'K') jump(-1);
  });

  function jump(d) {
    var target = clamp(cur + d, 0, spreads.length - 1);
    var el = spreads[target];
    if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }

  /* ---------- 自动放映 ---------- */
  var tourBtn = $('#startTour'), toast = $('#toast'), tourTimer = null, tourOn = false, tourAt = 0;
  var toastTimer = null;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-show'); }, 2600);
  }
  function tourStop(silent) {
    tourOn = false;
    clearInterval(tourTimer); tourTimer = null;
    if (tourBtn) { tourBtn.classList.remove('is-on'); tourBtn.textContent = '开始放映'; }
    if (!silent) showToast('放映结束');
  }
  function tourStart() {
    tourOn = true;
    tourAt = cur < 0 ? 0 : cur;
    if (tourBtn) { tourBtn.classList.add('is-on'); tourBtn.textContent = '停止放映'; }
    spreads[tourAt].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    showToast('自动放映中 · 再次点击可停止');
    tourTimer = setInterval(function () {
      tourAt++;
      if (tourAt >= spreads.length) { tourStop(true); showToast('已放映到最后一张 · END'); return; }
      spreads[tourAt].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    }, 5200);
  }
  if (tourBtn) {
    tourBtn.addEventListener('click', function () { tourOn ? tourStop() : tourStart(); });
  }
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (tourOn) tourStop(true); }, { passive: true });
  });

  /* ---------- 首屏与开篇图片就绪 → 收起载入层 ---------- */
  var heroImg = $('.hero__shot img');
  if (heroImg) {
    if (heroImg.complete && heroImg.naturalWidth) loaded(45);
    else {
      heroImg.addEventListener('load', function () { loaded(45); });
      heroImg.addEventListener('error', function () { loaded(45); });
    }
  } else { loaded(45); }

  // 第一张跨页（扉页）就绪
  var front = shots[0];
  if (front) {
    var fimg = front.querySelector('img');
    var fired = false;
    function one() { if (!fired) { fired = true; loaded(70); } }
    loadShot(front);
    if (fimg.complete && fimg.naturalWidth) one();
    else { fimg.addEventListener('load', one); fimg.addEventListener('error', one); }
  } else { loaded(70); }

  // 依赖字体等资源
  if (document.readyState === 'complete') loaded();
  else window.addEventListener('load', function () { loaded(); });

  // 首屏色调先于一切设置好
  root.style.setProperty('--m1', '11 10 26');
  setTimeout(function () { applyPalette(cur < 0 ? 0 : cur); }, 60);

  window.__SPREADS__ = { open: openLb, applyPalette: applyPalette, revealAll: revealAll, loadAll: function () { shots.forEach(loadShot); }, count: shots.length };
})();
