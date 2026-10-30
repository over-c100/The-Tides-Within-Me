/* =========================================================
   我和我 · 翻书引擎
   ---------------------------------------------------------
   物理模型（与纸书一致）：
   · 每一跨页 = 左半 + 右半，取自同一张图
   · 封面是一张完整包封：左半 = 封底，右半 = 前封面
   · 位置序列（共 N+1 个）：
       0        = 前封面（合上）
       1 .. N-1 = 摊开的跨页
       N        = 封底（合上）
   · 向前翻：叶子正面 = 当前右半，背面 = 目标左半，绕书脊 0°→-180°
   · 向后翻：同一张叶子倒着转回
   · 末尾可继续向前翻到封底；开头可继续向后翻到前封面。
   ========================================================= */
(function () {
  'use strict';

  var PLATES = window.BOOK || [];
  var N = PLATES.length;         /* 跨页数（含封面图） */
  if (!N) return;
  var TOTAL = N + 1;             /* 位置数：0..N */

  var root = document.documentElement;
  var $ = function (s) { return document.querySelector(s); };

  var book   = $('#book');
  var pageL  = $('#pageL');
  var pageR  = $('#pageR');
  var leaf   = $('#leaf');
  var shadeL = $('#shadeL');
  var shadeR = $('#shadeR');
  var dotsEl = $('#dots');
  var btnPrev = $('#btnPrev');
  var btnNext = $('#btnNext');

  /* =========================================================
     卷曲叶片 —— 移植 mengto.com 的「链式条带」方案
     · curl 容器绕书脊旋转 -tt
     · 内部 N 条 strip 层层嵌套，每条相对上一条再折 -td
     · 切向连续扫过弧线 = 真实的纸张卷曲（不是硬板）
     · 每条 strip 按朝向算明暗（--lit / --a1 / --a2）
     ========================================================= */
  var NSTRIP = 18;        /* 条带数：越多越圆滑 */
  var BETA = 0.60;        /* 峰值卷曲量（弧度） */
  var RAD = 180 / Math.PI;
  var curlEl = null;
  var strips = [];
  var curlDir = 1;        /* 本次翻页方向：1 向前 / -1 向后 */

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  /* 构建一次卷曲：front = 叶片正面（最终落在右页），back = 背面（起始在左页） */
  function buildCurl(frontPlate, backPlate, dir) {
    leaf.textContent = '';
    strips = [];
    curlDir = dir === -1 ? -1 : 1;

    var bw = book.clientWidth || 1200;      /* 整本书宽（跨页） */
    var pageW = bw * 0.5;                    /* 单页宽 = 书宽一半 */
    var gut = pageW;                         /* 书脊位置 */
    var sw = pageW / NSTRIP;                 /* 每条 strip 宽 */
    var fsrc = 'assets/images/' + frontPlate.slug + '.jpg';
    var bsrc = 'assets/images/' + backPlate.slug + '.jpg';

    var c = el('div', 'curl');
    var host = c;

    for (var i = 0; i < NSTRIP; i++) {
      var s = el('div', 'strip');
      s.style.width = sw + 'px';

      var f = el('div', 'face front');
      f.style.backgroundImage = 'url("' + fsrc + '")';
      f.style.backgroundSize = bw + 'px auto';
      /* 正面：显示 front 图的「右半」第 i 条 —— 从书脊向右数 */
      f.style.backgroundPositionX = (-(gut + i * sw)).toFixed(2) + 'px';

      var b = el('div', 'face back');
      b.style.backgroundImage = 'url("' + bsrc + '")';
      b.style.backgroundSize = bw + 'px auto';
      /* 背面：显示 back 图的「左半」第 i 条（翻转镜像，公式同 mengto） */
      b.style.backgroundPositionX = ((i + 1) * sw - gut).toFixed(2) + 'px';

      var shF = el('i', 'sh'), glF = el('i', 'gl');
      var shB = el('i', 'sh'), glB = el('i', 'gl');
      f.appendChild(shF);
      f.appendChild(glF);
      b.appendChild(shB);
      b.appendChild(glB);

      s.appendChild(f);
      s.appendChild(b);
      host.appendChild(s);
      host = s;                              /* 链式嵌套：下一条套在这一条里 */
      s._sh = [shF, shB];                    /* 缓存引用，逐帧只改透明度 */
      s._gl = [glF, glB];
      strips.push(s);
    }

    leaf.appendChild(c);
    curlEl = c;
    return c;
  }

  /* 设置卷曲姿态：pose 0 = 平铺右侧，1 = 平铺左侧，中间卷曲 */
  function applyCurl(pose) {
    if (!curlEl || !strips.length) return;
    pose = Math.max(0, Math.min(1, pose));

    var th = Math.PI * pose;                 /* 主旋转 */
    var beta = BETA * Math.sin(Math.PI * pose);  /* 弯曲量：两端为 0 */
    var tt = th + beta;
    var td = 2 * beta / NSTRIP;

    /* 翻页进度（0 = 刚掀起，1 = 已落定） */
    var prog = curlDir === 1 ? pose : 1 - pose;
    /* 统一的「抬起量」包络：两端为 0，中间最大。
       阴影和高光都按它走，起落才不会「啪」地跳出来 */
    var lift = Math.sin(Math.PI * prog);

    curlEl.style.setProperty('--tt', (tt * RAD).toFixed(2) + 'deg');
    curlEl.style.setProperty('--td', (td * RAD).toFixed(3) + 'deg');

    /* 被翻页压在下方的阴影：跟着抬起量一起长、一起消 */
    if (shadeR) shadeR.style.opacity = (curlDir === 1 ? lift * 0.62 : 0).toFixed(3);
    if (shadeL) shadeL.style.opacity = (curlDir === -1 ? lift * 0.62 : 0).toFixed(3);

    /* 逐条明暗：只改 opacity（合成层操作），不触碰渐变/布局，
       这样每帧没有重绘，翻页才顺 */
    for (var i = 0; i < NSTRIP; i++) {
      var l1 = Math.abs(Math.cos(tt - i * td));
      var shade = ((1 - l1) * 0.85).toFixed(3);
      var glow = (l1 * l1 * 0.20 * lift).toFixed(3);
      var s = strips[i];
      if (s._sh) { s._sh[0].style.opacity = shade; s._sh[1].style.opacity = shade; }
      if (s._gl) { s._gl[0].style.opacity = glow; s._gl[1].style.opacity = glow; }
    }
  }

  /* ---------- 时长 ---------- */
  function turnMs() {
    var v = getComputedStyle(root).getPropertyValue('--turn').trim();
    var n = parseFloat(v);
    if (!n) return 900;
    return /ms$/.test(v) ? n : n * 1000;
  }

  /* ---------- 状态 ----------
     idx : 0..N
           0 = 前封面（合） · 1..N-1 = 摊开跨页 · N = 封底（合）
  --------------------------------- */
  var idx = 0;
  var turning = false;
  var hintShown = false;

  function isClosed(i) { return i === 0 || i === N; }
  function isOpen(i) { return i > 0 && i < N; }
  function plateIdx(i) { return (i === 0 || i === N) ? 0 : i; }  /* 封面/封底共用封面图 */

  /* ---------- 画一页 ---------- */
  function paint(el, plate) {
    if (!el) return;
    var img = el.querySelector('.page__img');
    if (el.dataset.plate !== plate.slug) el.dataset.plate = plate.slug;
    if (img && img.dataset.src !== plate.slug) {
      img.dataset.src = plate.slug;
      img.classList.remove('is-ready');
      var src = 'assets/images/' + plate.slug + '.jpg';
      var probe = new Image();
      probe.onload = function () {
        img.style.backgroundImage = 'url("' + src + '")';
        img.classList.add('is-ready');
      };
      probe.src = src;
    }
  }

  /* ---------- 环境光取色（不依赖情绪，只改背景色） ---------- */
  function palette(i) {
    var p = PLATES[plateIdx(i)] || PLATES[0];
    var s = root.style;
    s.setProperty('--m1', p.mesh[0]);
    s.setProperty('--m2', p.mesh[1]);
    s.setProperty('--m3', p.mesh[2]);
    s.setProperty('--m4', p.mesh[3]);
    s.setProperty('--m5', p.mesh[4]);
    s.setProperty('--accent', p.accent);
  }

  /* ---------- 同步 UI ---------- */
  function syncUI() {
    var atStart = idx === 0;
    var atEnd = idx === N;
    if (btnPrev) btnPrev.disabled = atStart;
    if (btnNext) btnNext.disabled = atEnd;
    book.classList.toggle('is-open', isOpen(idx));
    if (dotsEl) {
      [].forEach.call(dotsEl.children, function (b, i) {
        b.classList.toggle('is-on', i === idx);
        b.setAttribute('aria-selected', i === idx ? 'true' : 'false');
      });
    }
  }

  /* ---------- 预载相邻页（并提前解码，翻页时就不会卡在解码上） ---------- */
  var preloadCache = {};
  function preload(dir) {
    var i = idx + dir;
    if (i < 0 || i > N) return;
    var slug = PLATES[plateIdx(i)].slug;
    if (preloadCache[slug]) return;
    preloadCache[slug] = true;
    var im = new Image();
    im.decoding = 'async';
    im.src = 'assets/images/' + slug + '.jpg';
    if (im.decode) im.decode().catch(function () {});
  }

  /* =========================================================
     翻页
     ========================================================= */
  function animateTurn(to) {
    if (turning) return false;
    var forward = to > idx;
    var from = idx;
    var ms = turnMs();
    turning = true;

    var fromP = plateIdx(from);
    var toP = plateIdx(to);

    /* 背景色切换与翻页同时开始（而非等翻完） */
    palette(to);

    /* ---- 布置叶子：正面=当前右半，背面=目标左半 ---- */
    if (forward) {
      buildCurl(PLATES[fromP], PLATES[toP], 1);
      if (!isClosed(to)) paint(pageR, PLATES[toP]);  /* 掀开后露出的右页 */
    } else {
      buildCurl(PLATES[toP], PLATES[fromP], -1);
      if (!isClosed(to)) paint(pageL, PLATES[toP]);  /* 掀开后露出的左页 */
    }
    leaf.hidden = false;
    applyCurl(forward ? 0 : 1);        /* 反向：叶片从左侧开始 */

    /* ---- 封面/封底 的收窄、展宽、隐藏单页 ---- */
    if (to === 0) {              /* 合到前封面：左页淡出，书左移收窄 */
      pageL.style.transition = 'opacity .5s ease';
      book.classList.add('is-closed');
      book.classList.remove('is-closed-back');
    } else if (to === N) {       /* 合到封底：右页淡出，书右移收窄 */
      pageR.style.transition = 'opacity .5s ease';
      book.classList.add('is-closed-back');
      book.classList.remove('is-closed');
    } else if (from === 0) {     /* 从前封面打开：左页先隐，书右移展宽 */
      pageL.style.transition = 'none';
      pageL.style.opacity = '0';
      book.classList.remove('is-closed');
    } else if (from === N) {     /* 从封底打开：右页先隐，书左移展宽 */
      pageR.style.transition = 'none';
      pageR.style.opacity = '0';
      book.classList.remove('is-closed-back');
    }

    /* ---- 用 rAF 驱动卷曲翻页 ---- */
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / ms);
      var eased = easeInOut(t);
      applyCurl(forward ? eased : 1 - eased);
      if (t < 1) { requestAnimationFrame(step); }
      else { finishTurn(); }
    }
    requestAnimationFrame(step);

    function finishTurn() {
      idx = to;
      paint(pageL, PLATES[toP]);
      paint(pageR, PLATES[toP]);
      pageL.style.transition = '';
      pageR.style.transition = '';
      pageL.style.opacity = '';
      pageR.style.opacity = '';
      book.classList.remove('is-collapsing');
      leaf.hidden = true;
      leaf.textContent = '';
      curlEl = null;
      strips = [];
      if (shadeL) shadeL.style.opacity = '0';
      if (shadeR) shadeR.style.opacity = '0';
      turning = false;
      syncUI();
      preload(1); preload(-1);
    }

    return true;
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function next() {
    if (turning || idx >= N) return;
    animateTurn(idx + 1);
  }
  function prev() {
    if (turning || idx <= 0) return;
    animateTurn(idx - 1);
  }

  /* =========================================================
     拖动翻页
     ========================================================= */
  var drag = null;

  function isFlipLand() { return document.body.classList.contains('is-flipland'); }

  book.addEventListener('pointerdown', function (e) {
    if (turning || (e.button !== undefined && e.button !== 0)) return;
    var r = book.getBoundingClientRect();
    var flip = isFlipLand();
    /* 画面转了 90° 时：书的「右半」对应屏幕下方，用 y 判断 */
    var inRight = flip
      ? (e.clientY - r.top) > r.height / 2
      : (e.clientX - r.left) > r.width / 2;

    var dir = 0;
    if (idx === 0) dir = 1;                 /* 前封面：只能打开 */
    else if (idx === N) dir = -1;           /* 封底：只能打开 */
    else if (inRight && idx < N) dir = 1;
    else if (!inRight && idx > 0) dir = -1;
    if (!dir) return;

    drag = {
      dir: dir,
      x0: e.clientX, y0: e.clientY,
      x: e.clientX,
      moved: 0, active: false,
      flip: flip,
      /* 拖拽轴：正常用书宽的一半；旋转后用书高的一个半页宽 */
      half: flip ? (r.height / 2) : (r.width / 2),
      id: e.pointerId
    };
    try { book.setPointerCapture(e.pointerId); } catch (_) {}
  });

  book.addEventListener('pointermove', function (e) {
    if (!drag) return;
    drag.x = e.clientX;

    /* 旋转 90° 后，书页横向位移映射到屏幕纵向 */
    var d = drag.flip ? (e.clientY - drag.y0) : (e.clientX - drag.x0);
    var dOther = drag.flip ? (e.clientX - drag.x0) : (e.clientY - drag.y0);
    drag.moved = Math.max(drag.moved, Math.hypot(d, dOther));

    if (!drag.active) {
      if (Math.abs(d) < 6) return;
      var okDir = drag.dir === 1 ? d < 0 : d > 0;
      if (!okDir) return;
      drag.active = true;
      beginDragLeaf(drag.dir);
    }

    var prog = drag.dir === 1
      ? clamp(-d / (drag.half * 1.15), 0, 1)
      : clamp(d / (drag.half * 1.15), 0, 1);
    drag.prog = prog;
    applyDrag(prog, drag.dir);
  });

  function endDrag() {
    if (!drag) return;
    var d = drag; drag = null;
    try { book.releasePointerCapture(d.id); } catch (_) {}

    if (!d.active) {
      if (d.moved < 8) { d.dir === 1 ? next() : prev(); }
      return;
    }
    var prog = d.prog || 0;
    if (prog > 0.32) finishDrag(d.dir, d.to, prog);
    else cancelDrag(d.dir, prog);
  }
  book.addEventListener('pointerup', endDrag);
  book.addEventListener('pointercancel', function () {
    if (drag && drag.active) cancelDrag(drag.dir);
    drag = null;
  });

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function beginDragLeaf(dir) {
    var from = idx;
    var to = from + dir;
    if (to < 0 || to > N) { drag.active = false; return; }
    drag.to = to;
    var fromP = plateIdx(from), toP = plateIdx(to);

    if (dir === 1) {
      buildCurl(PLATES[fromP], PLATES[toP], 1);
      if (!isClosed(to)) paint(pageR, PLATES[toP]);
    } else {
      buildCurl(PLATES[toP], PLATES[fromP], -1);
      if (!isClosed(to)) paint(pageL, PLATES[toP]);
    }
    leaf.hidden = false;
    applyCurl(dir === 1 ? 0 : 1);
    book.classList.add('is-dragging');

    if (from === 0) {
      pageL.style.transition = 'none';
      pageL.style.opacity = '0';
      book.classList.remove('is-closed');
    } else if (from === N) {
      pageR.style.transition = 'none';
      pageR.style.opacity = '0';
      book.classList.remove('is-closed-back');
    }
  }

  function applyDrag(p, dir) {
    /* 拖动：正向 pose = p，反向 pose = 1-p（保证卷曲方向正确） */
    applyCurl(dir === 1 ? p : 1 - p);
  }

  function finishDrag(dir, to, fromPose) {
    if (to === undefined || to === null) to = idx + dir;
    var ms = turnMs();
    if (fromPose === undefined || fromPose === null) fromPose = 0.32;
    book.classList.remove('is-dragging');
    turning = true;
    palette(to);            /* 背景色随拖拽完成同时切换 */

    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / Math.min(ms, 520));
      var eased = easeInOut(t);
      var p = fromPose + (1 - fromPose) * eased;
      applyCurl(dir === 1 ? p : 1 - p);
      if (t < 1) requestAnimationFrame(step);
      else land();
    }
    requestAnimationFrame(step);

    function land() {
      idx = to;
      var toP = plateIdx(to);
      if (to === 0) { book.classList.add('is-closed'); book.classList.remove('is-closed-back'); }
      else if (to === N) { book.classList.add('is-closed-back'); book.classList.remove('is-closed'); }
      else { book.classList.remove('is-closed'); book.classList.remove('is-closed-back'); }
      paint(pageL, PLATES[toP]);
      paint(pageR, PLATES[toP]);
      leaf.hidden = true;
      leaf.textContent = '';
      curlEl = null;
      strips = [];
      pageL.style.transition = '';
      pageR.style.transition = '';
      pageL.style.opacity = '';
      pageR.style.opacity = '';
      book.classList.remove('is-collapsing');
      if (shadeL) shadeL.style.opacity = 0;
      if (shadeR) shadeR.style.opacity = 0;
      turning = false;
      syncUI();
      preload(1); preload(-1);
    }
  }

  function cancelDrag(dir, fromPose) {
    book.classList.remove('is-dragging');
    if (fromPose === undefined || fromPose === null) fromPose = 0.3;

    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / Math.min(turnMs(), 420));
      var eased = easeInOut(t);
      var p = fromPose * (1 - eased);
      applyCurl(dir === 1 ? p : 1 - p);
      if (t < 1) requestAnimationFrame(step);
      else restore();
    }
    requestAnimationFrame(step);

    function restore() {
      leaf.hidden = true;
      leaf.textContent = '';
      curlEl = null;
      strips = [];
      if (shadeL) shadeL.style.opacity = 0;
      if (shadeR) shadeR.style.opacity = 0;
      pageL.style.transition = '';
      pageR.style.transition = '';
      pageL.style.opacity = '';
      pageR.style.opacity = '';
      book.classList.remove('is-collapsing');
      if (idx === 0) book.classList.add('is-closed');
      else if (idx === N) book.classList.add('is-closed-back');
    }
  }

  /* =========================================================
     控件
     ========================================================= */
  if (btnPrev) btnPrev.addEventListener('click', prev);
  if (btnNext) btnNext.addEventListener('click', next);

  /* 雨滴进度条：共 N+1 滴（首滴=前封面，末滴=封底） */
  if (dotsEl) {
    for (var i = 0; i < TOTAL; i++) {
      (function (k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', '第 ' + (k + 1) + ' 页');
        b.addEventListener('click', function () { jump(k); });
        dotsEl.appendChild(b);
      })(i);
    }
  }

  /* 下雨：预生成一屏雨丝 */
  var weatherEl = $('#weather');
  if (weatherEl) {
    var drops = 66;
    for (var r = 0; r < drops; r++) {
      var d = document.createElement('i');
      d.style.left = (Math.random() * 100).toFixed(2) + '%';
      d.style.animationDuration = (0.75 + Math.random() * 0.95).toFixed(2) + 's';
      d.style.animationDelay = (-Math.random() * 2).toFixed(2) + 's';
      d.style.height = (8 + Math.random() * 18).toFixed(0) + 'px';
      d.style.opacity = (0.22 + Math.random() * 0.45).toFixed(2);
      weatherEl.appendChild(d);
    }
  }

  function jump(k) {
    if (turning) return;
    if (k === idx) return;

    /* 相邻 → 翻页动画 */
    if (Math.abs(k - idx) === 1) { animateTurn(k); return; }

    /* 远距离 → 直接切换 + 轻微呼吸 */
    idx = k;
    paint(pageL, PLATES[plateIdx(k)]);
    paint(pageR, PLATES[plateIdx(k)]);
    palette(k);
    book.classList.toggle('is-closed', k === 0);
    book.classList.toggle('is-closed-back', k === N);
    pageL.style.transition = '';
    pageR.style.transition = '';
    pageL.style.opacity = '';
    pageR.style.opacity = '';
    syncUI();
    book.classList.remove('is-dragging');
    book.classList.add('is-flash');
    setTimeout(function () { book.classList.remove('is-flash'); }, 260);
    preload(1); preload(-1);
  }

  /* =========================================================
     键盘 / 滚轮 / 触摸
     ========================================================= */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { e.preventDefault(); jump(0); }
    else if (e.key === 'End') { e.preventDefault(); jump(N); }
  });

  var wheelLock = 0;
  window.addEventListener('wheel', function (e) {
    var now = Date.now();
    if (now < wheelLock) return;
    if (Math.abs(e.deltaY) < 12) return;
    wheelLock = now + 780;
    e.deltaY > 0 ? next() : prev();
  }, { passive: true });

  /* =========================================================
     竖屏提示：点一下 = 当作已把手机横过来
     （电脑没有陀螺仪时也能看到横屏后的画面）
     ========================================================= */
  var rotateEl = $('#rotate');
  if (rotateEl) {
    var isPortrait = function () { return window.innerHeight > window.innerWidth; };

    var dismissRotate = function () {
      rotateEl.classList.add('is-off');
      /* 视口还是竖的 → 把整页转 90° 铺满，绘本长边贴满手机长边 */
      if (isPortrait()) document.body.classList.add('is-flipland');
      else document.body.classList.remove('is-flipland');
    };
    rotateEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      dismissRotate();
    });
    rotateEl.addEventListener('click', dismissRotate);

    /* 提示还在时，先吃掉按键，避免顺手翻了页 */
    document.addEventListener('keydown', function (e) {
      if (getComputedStyle(rotateEl).display === 'none') return;
      e.preventDefault();
      e.stopPropagation();
      dismissRotate();
    }, true);

    /* 真机上真的转成横屏后重置：退出伪装横屏，回到竖屏会再次提示 */
    var mqLandscape = window.matchMedia('(orientation: landscape)');
    var onOrientation = function (ev) {
      if (ev.matches) {
        rotateEl.classList.remove('is-off');
        document.body.classList.remove('is-flipland');
      }
    };
    if (mqLandscape.addEventListener) mqLandscape.addEventListener('change', onOrientation);
    else if (mqLandscape.addListener) mqLandscape.addListener(onOrientation);

    /* 想回到正常竖屏视图：按 Esc */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        document.body.classList.remove('is-flipland');
      }
    });
  }

  /* =========================================================
     悬停反馈：抬起 + 跟随鼠标的高光
     ========================================================= */
  /* 合上时书只占半个身位，另一半是空的 —— 指针落在空的那半不算悬停，
     否则书会凭空抬起、还有光斑溢出到空白处 */
  function onVisiblePage(e) {
    var r = book.getBoundingClientRect();
    var x = ((e.clientX - r.left) / r.width) * 100;
    if (book.classList.contains('is-closed')) return x > 50;
    if (book.classList.contains('is-closed-back')) return x < 50;
    return true;
  }

  function onBookMove(e) {
    if (turning && drag) return;
    var r = book.getBoundingClientRect();
    var x = ((e.clientX - r.left) / r.width) * 100;
    var y = ((e.clientY - r.top) / r.height) * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    book.style.setProperty('--sx', x + '%');
    book.style.setProperty('--sy', y + '%');
    if (book.classList.contains('is-closed') || book.classList.contains('is-closed-back')) {
      book.classList.toggle('is-hover', onVisiblePage(e));
    }
  }
  book.addEventListener('pointerenter', function (e) {
    if (window.matchMedia('(hover:none)').matches) return;
    if (onVisiblePage(e)) book.classList.add('is-hover');
  });
  book.addEventListener('pointermove', onBookMove);
  book.addEventListener('pointerleave', function () {
    book.classList.remove('is-hover');
  });

  /* =========================================================
     初始化
     ========================================================= */
  function init() {
    book.classList.add('is-closed');
    paint(pageR, PLATES[0]);      /* 前封面 = 封面图右半 */
    paint(pageL, PLATES[0]);
    palette(0);
    syncUI();

    [0, 1, 2].forEach(function (i) {
      if (PLATES[i]) { var im = new Image(); im.src = 'assets/images/' + PLATES[i].slug + '.jpg'; }
    });

    setTimeout(function () {
      if (!hintShown) { hintShown = true; book.classList.add('is-hint'); }
    }, 1400);
  }

  init();

  window.__BOOK__ = {
    next: next, prev: prev, jump: jump,
    get index() { return idx; },
    get opened() { return isOpen(idx); },
    get total() { return TOTAL; }
  };
})();
