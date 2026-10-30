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

  /* 封面内侧的衬页：纯色，不显示任何画（避免开书时露出封底画面） */
  var INSIDE_COVER = '#241f31';
  function insideCover(pg) {
    if (!pg) return;
    pg.style.transition = 'none';
    pg.style.opacity = '1';
    pg.style.backgroundImage = 'none';
    pg.style.backgroundColor = INSIDE_COVER;
    var im = pg.querySelector('.page__img');
    if (im) im.style.opacity = '0';
  }
  function clearInsideCover(pg) {
    if (!pg) return;
    pg.style.backgroundColor = '';
    pg.style.backgroundImage = '';
    var im = pg.querySelector('.page__img');
    if (im) im.style.opacity = '';
  }

  /* 封面是三段包封（封底 48% | 书腰 4% | 封面 48%）；
     其余内页都是整幅插画，左右严格各占 50%，跨页才能严丝合缝。 */
  var COVER_SLUG = PLATES[0].slug;
  function coverWOf(plate) {
    return (plate && plate.slug === COVER_SLUG) ? 0.48 : 0.5;
  }
  /* 对应的背景缩放：封面 208.334%，内页 200% */
  function pageScaleOf(plate) {
    return (plate && plate.slug === COVER_SLUG) ? '208.334% 100%' : '200% 100%';
  }

  /* 构建一次卷曲：front = 叶片正面（最终落在右页），back = 背面（起始在左页） */
  function buildCurl(frontPlate, backPlate, dir) {
    leaf.textContent = '';
    strips = [];
    curlDir = dir === -1 ? -1 : 1;

    var bw = book.clientWidth || 1200;      /* 整本书宽（跨页） */
    var pageW = bw * 0.5;                    /* 单页宽 = 书宽一半 */
    /* 只有「封面」那张是三段包封：封底 | 书腰 | 封面，两侧各 48%；
       内页是整幅插画，必须严格左右各半，否则跨页中线会错开。 */
    var fw = coverWOf(frontPlate);
    var bwd = coverWOf(backPlate);
    var Sf = pageW / fw;                     /* front 图的显示宽度 */
    var Sb = pageW / bwd;                    /* back 图的显示宽度 */
    var frontStart = Sf * (1 - fw);          /* 封面左沿在整幅图上的位置 */
    var backEnd = Sb * bwd;                  /* 封底右沿 */
    var fsrc = 'assets/images/' + frontPlate.slug + '.jpg';
    var bsrc = 'assets/images/' + backPlate.slug + '.jpg';

    /* 用整数像素切分：每条边界都落在整像素上，消除亚像素接缝
       （小数宽度会让相邻两条的边缘落在半个像素上，转起来会闪） */
    var xs = [];
    for (var k = 0; k <= NSTRIP; k++) xs.push(Math.round(k * pageW / NSTRIP));

    var c = el('div', 'curl');
    var host = c;

    for (var i = 0; i < NSTRIP; i++) {
      var x0 = xs[i], x1 = xs[i + 1];
      var s = el('div', 'strip');
      s.style.width = (x1 - x0) + 'px';

      var f = el('div', 'face front');
      f.style.backgroundImage = 'url("' + fsrc + '")';
      f.style.backgroundSize = Sf + 'px 100%';
      /* 正面：显示 front 图的「封面」那一侧第 i 条 */
      f.style.backgroundPositionX = (-(frontStart + x0)) + 'px';

      var b = el('div', 'face back');
      b.style.backgroundImage = 'url("' + bsrc + '")';
      b.style.backgroundSize = Sb + 'px 100%';
      /* 背面：显示 back 图的「封底」那一侧第 i 条（翻转镜像） */
      b.style.backgroundPositionX = (x1 - backEnd) + 'px';

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
      s._sh = [shF, shB];
      s._gl = [glF, glB];
      s._f = f;                              /* 正/反面也缓存，逐帧控制可见性 */
      s._b = b;
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

    /* 书页上的那块「跟页翻动」的阴影：按要求去掉动画，
       固定保留完成态（= 不显示），中间的页缝阴影由 .gutter 常驻 */
    if (shadeR) shadeR.style.opacity = '0';
    if (shadeL) shadeL.style.opacity = '0';

    /* 逐条明暗：用「两端不同」的渐变，
       相邻切片共享边界值 → 整张叶子上的明暗是连续的，
       不会在每条接缝处各压一道暗边（那就是之前的折痕） */
    for (var i = 0; i < NSTRIP; i++) {
      var l1 = Math.abs(Math.cos(tt - i * td));        /* 本条的近边朝向 */
      var l2 = Math.abs(Math.cos(tt - (i + 1) * td));  /* 远边朝向 */
      var s = strips[i];
      if (!s._sh) continue;

      /* 只让「朝向观众」的那一面显示：彻底杜绝透出反面，
         同时少渲染一半的层，翻页更稳。±0.06 的窗口让两面在
         正侧身时短暂共存，避免出现一条透明缝隙。 */
      var c = Math.cos(tt - i * td);
      if (s._f) s._f.style.visibility = (c > -0.02) ? 'visible' : 'hidden';
      if (s._b) s._b.style.visibility = (c < 0.02) ? 'visible' : 'hidden';

      var a1 = ((1 - l1) * 0.55 * lift).toFixed(3);
      var a2 = ((1 - l2) * 0.55 * lift).toFixed(3);
      var g1 = (l1 * l1 * 0.16 * lift).toFixed(3);
      var g2 = (l2 * l2 * 0.16 * lift).toFixed(3);

      var sh0 = s._sh[0].style, sh1 = s._sh[1].style;
      sh0.setProperty('--a1', a1); sh0.setProperty('--a2', a2);
      sh1.setProperty('--a1', a1); sh1.setProperty('--a2', a2);

      var gl0 = s._gl[0].style, gl1 = s._gl[1].style;
      gl0.setProperty('--g1', g1); gl0.setProperty('--g2', g2);
      gl1.setProperty('--g1', g1); gl1.setProperty('--g2', g2);
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
  var loadedSrc = {};      /* 已经解码过的图，换页时直接切，不再淡入 */

  function paint(el, plate) {
    if (!el) return;
    var img = el.querySelector('.page__img');
    if (el.dataset.plate !== plate.slug) el.dataset.plate = plate.slug;
    if (!img) return;

    var bw = book.clientWidth || 1200;
    var pageW = bw * 0.5;
    var cw = coverWOf(plate);
    var S = pageW / cw;
    var posX = (el === pageL) ? 0 : -(S * (1 - cw));
    var src = 'assets/images/' + plate.slug + '.jpg';
    var size = S + 'px 100%';
    var pos = posX + 'px 0';
    el.style.backgroundSize = size;
    el.style.backgroundPosition = pos;
    img.style.backgroundSize = size;
    img.style.backgroundPosition = pos;

    if (img.dataset.src === src) return;
    img.dataset.src = src;

    /* 图已经在缓存里 → 同步换图并保持不透明。
       否则会出现「叶片消失 + 新图还在淡入」的几帧模糊，看着像跳一下。 */
    if (loadedSrc[src]) {
      img.style.backgroundImage = 'url("' + src + '")';
      img.classList.add('is-ready');
      return;
    }

    img.classList.remove('is-ready');
    var probe = new Image();
    probe.onload = function () {
      loadedSrc[src] = true;
      img.style.backgroundImage = 'url("' + src + '")';
      img.classList.add('is-ready');
    };
    probe.src = src;
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
  /* 跳页过程中，水滴指示器直接指向最终目标，
     不跟着中间那次翻页来回跳（否则会闪一下中间页） */
  var uiOverride = null;

  function syncUI() {
    var shown = uiOverride === null ? idx : uiOverride;
    var atStart = shown === 0;
    var atEnd = shown === N;
    if (btnPrev) btnPrev.disabled = atStart;
    if (btnNext) btnNext.disabled = atEnd;
    book.classList.toggle('is-open', isOpen(idx));
    if (dotsEl) {
      [].forEach.call(dotsEl.children, function (b, i) {
        b.classList.toggle('is-on', i === shown);
        b.setAttribute('aria-selected', i === shown ? 'true' : 'false');
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
  function animateTurn(to, msOverride, onDone, noFade) {
    if (turning) return false;
    var forward = to > idx;
    var from = idx;
    var ms = msOverride || turnMs();
    turning = true;
    /* 作废上一页遗留的「淡出后隐藏叶片」定时器，
       否则连翻时它会把新叶片直接藏掉（第二段就没有动画了） */
    leafToken++;

    var fromP = plateIdx(from);
    var toP = plateIdx(to);

    /* 水滴指示器在翻页「开始」就切到目标（原先要等落定后才动） */
    if (uiOverride === null) { uiOverride = to; syncUI(); }

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

    /* ---- 封面/封底 的收窄、展宽、隐藏单页 ----
       回到已验证可用的做法：开书时单页直接隐藏，不做衬页/裁剪，
       避免把封底画到左边、把封面画到右边。 */
    if (to === 0) {              /* 合到前封面：左页立刻消失（封面之前什么都没有） */
      pageL.style.transition = 'opacity .12s linear';
      book.classList.add('is-closed');
      book.classList.remove('is-closed-back');
      if (pageblockEl) { pageblockEl.style.transition = 'none'; pageblockEl.style.opacity = '0'; }
    } else if (to === N) {       /* 合到封底：右页立刻消失 */
      pageR.style.transition = 'opacity .12s linear';
      book.classList.add('is-closed-back');
      book.classList.remove('is-closed');
      if (pageblockEl) { pageblockEl.style.transition = 'none'; pageblockEl.style.opacity = '0'; }
    } else if (from === 0) {     /* 从前封面打开：左页先隐，书右移展宽（此分支保持 115 轮行为，不动） */
      if (spineNode) spineNode.style.opacity = '0';   /* 一开始翻动就让书腰退场，别露在页面下 */
      if (pageblockEl) { pageblockEl.style.transition = 'none'; pageblockEl.style.opacity = '0'; }
      pageL.style.transition = 'none';
      pageL.style.opacity = '0';
      book.classList.remove('is-closed');
    } else if (from === N) {     /* 从封底打开：右页先隐，书左移展宽 */
      if (spineNode) spineNode.style.opacity = '0';
      if (stackR) stackR.style.opacity = '0';   /* 右缘白条整段隐藏，避免跟着书「滑进来」 */
      if (pageblockEl) {
        pageblockEl.style.transition = 'none';
        pageblockEl.style.left = '-5px';
        pageblockEl.style.right = 'calc(50% - var(--spine-w, 3.9%))';
        pageblockEl.style.opacity = '1';
      }
      pageR.style.transition = 'none';
      pageR.style.opacity = '0';
      book.classList.remove('is-closed-back');
    }

    /* ---- 用 rAF 驱动卷曲翻页 ---- */
    var start = null;
    var closing = false;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / ms);
      var eased = easeInOut(t);
      applyCurl(forward ? eased : 1 - eased);




      /* 合上方向：厚度层从一开始就随进度显形，60% 进度就到满，
         不再等到落定那一帧才出现 */
      if ((to === 0 || to === N) && pageblockEl) {
        var pv = Math.min(1, eased / 0.60);
        pageblockEl.style.opacity = pv.toFixed(3);
      }

      /* 收书：等叶片完全盖住左页（96%）再瞬时收起，
         全程不透明，不会看到页面的淡出过程。 */
      if (to === 0 && !closing && eased > 0.96) {
        closing = true;
        pageL.style.opacity = '0';
      }
      if (to === N && !closing && eased > 0.96) {
        closing = true;
        pageR.style.opacity = '0';
      }

      /* 厚度层只在「完全合上」之后才由 CSS 显示；
         翻页过程中一律隐藏，避免它被带到书页中间/书外。 */

      /* 叶片全程保持不透明：不做任何淡出，避免翻页时画面「消失」。 */
      if (leaf.style.opacity !== '') leaf.style.opacity = '';

      /* 书缝竖带跟着翻页进度淡入：翻到多少就出现多少，
         落定那一刻正好是 1，不会「啪」地暗下去。 */

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
      /* 硬保证：合上封底时右页必须彻底消失（最后一页之后没有任何东西），
         合上封面时左页同理 —— 不受之前内联样式残留影响 */
      if (idx === N) pageR.style.opacity = '0';
      else if (idx === 0) pageL.style.opacity = '0';
      pageL.style.clipPath = '';
      pageR.style.clipPath = '';
      if (spineNode) spineNode.style.opacity = '';   /* 交还 CSS：翻完之后书腰才淡出 */
      if (pageblockEl) { pageblockEl.style.transition = ''; pageblockEl.style.opacity = ''; pageblockEl.style.left = ''; pageblockEl.style.right = ''; }  /* 落定后交还 CSS */
      if (stackR) stackR.style.opacity = '';   /* 落定后白条交还 CSS */
      clearInsideCover(pageL);      /* 衬页还原成正常页面 */
      clearInsideCover(pageR);
      book.classList.remove('is-collapsing');
      /* 方案 B：叶片上已经烘焙了同样的书缝阴影，
         所以落定时直接撤掉叶片即可，两侧明暗一致、不会有硬跳。 */
      leafToken++;
      leaf.hidden = true;
      leaf.textContent = '';
      leaf.style.opacity = '';
      leaf.style.transition = '';
      curlEl = null;
      strips = [];
      if (shadeL) shadeL.style.opacity = '0';
      if (shadeR) shadeR.style.opacity = '0';
      turning = false;
      uiOverride = chainFinal;   /* 连翻时仍锁在最终目标，否则水滴会跳回中间页 */
      syncUI();
      preload(1); preload(-1);
      if (onDone) onDone();
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
      if (stackR) stackR.style.opacity = '0';   /* 拖拽打开时白条也整段隐藏 */
      if (spineNode) spineNode.style.opacity = '0';
      pageL.style.transition = 'none';
      pageL.style.opacity = '0';
      book.classList.remove('is-closed');
    } else if (from === N) {
      if (stackR) stackR.style.opacity = '0';
      if (spineNode) spineNode.style.opacity = '0';
      pageR.style.transition = 'none';
      pageR.style.opacity = '0';
      book.classList.remove('is-closed-back');
    }

    /* 反向拖动「收书」：翻开状态下的那一页必须在拖动一开始就退场。
       否则手拖时卷页已经翻走，左边/右边却还留着一整页旧内容
       （点按钮时是靠 is-closed 立刻淡出的，所以按钮路径不会出现） */
    if (to === 0) {
      if (stackR) stackR.style.opacity = '0';
      pageL.style.transition = 'opacity .12s linear';
      pageL.style.opacity = '0';
    } else if (to === N) {
      if (stackR) stackR.style.opacity = '0';
      pageR.style.transition = 'opacity .12s linear';
      pageR.style.opacity = '0';
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
    if (uiOverride === null) { uiOverride = to; syncUI(); }
    palette(to);            /* 背景色随拖拽完成同时切换 */

    /* 收书时立刻切换合上状态：书脊压痕会跟着这段动画一起淡入，
       而不是等落定后才「啪」地出现 */
    if (to === 0) { book.classList.add('is-closed'); book.classList.remove('is-closed-back'); }
    else if (to === N) { book.classList.add('is-closed-back'); book.classList.remove('is-closed'); }

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
      /* 硬保证：合上封底时右页必须彻底消失（最后一页之后没有任何东西），
         合上封面时左页同理 —— 不受之前内联样式残留影响 */
      if (idx === N) pageR.style.opacity = '0';
      else if (idx === 0) pageL.style.opacity = '0';
      pageL.style.clipPath = '';
      pageR.style.clipPath = '';
      if (spineNode) spineNode.style.opacity = '';
      book.classList.remove('is-collapsing');
      if (shadeL) shadeL.style.opacity = 0;
      if (shadeR) shadeR.style.opacity = 0;
      turning = false;
      if (stackR) stackR.style.opacity = '';   /* 拖拽落定后白条交还 CSS */
      uiOverride = null;      /* 落定后交还给真实页号 */
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
      /* 硬保证：合上封底时右页必须彻底消失（最后一页之后没有任何东西），
         合上封面时左页同理 —— 不受之前内联样式残留影响 */
      if (idx === N) pageR.style.opacity = '0';
      else if (idx === 0) pageL.style.opacity = '0';
      pageL.style.clipPath = '';
      pageR.style.clipPath = '';
      if (spineNode) spineNode.style.opacity = '';   /* 回退时书腰照常显示 */
      if (stackR) stackR.style.opacity = '';         /* 回退时白条交还 CSS */
      /* 拖到一半松手回退：把两页还原成本来那一页。
         否则右页还留着拖拽开始时预画的「下一页」。 */
      var cur = PLATES[plateIdx(idx)];
      paint(pageL, cur);
      paint(pageR, cur);
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
      d.style.animationDuration = (1.80 + Math.random() * 1.40).toFixed(2) + 's';   /* 落雨更慢一些 */
      d.style.animationDelay = (-Math.random() * 2).toFixed(2) + 's';
      d.style.height = (8 + Math.random() * 18).toFixed(0) + 'px';
      d.style.opacity = (0.22 + Math.random() * 0.45).toFixed(2);
      weatherEl.appendChild(d);
    }
  }

  function jump(k) {
    if (turning) return;
    if (k === idx) return;
    if (k < 0) k = 0;
    if (k > N) k = N;

    /* 封面 ↔ 封底：先把封面翻开到相邻那一页（有个「开书」的动作），
       再直接翻到另一端。水滴指示器则直接跳到最终目标，不跟着中间页闪。
       其余跳转：一次翻到位，不显示中间页。 */
    if (idx === 0 && k === N) { chainTurn([1, N], k); return; }
    if (idx === N && k === 0) { chainTurn([N - 1, 0], k); return; }

    animateTurn(k);
  }

  /* 连续两次翻页，期间水滴锁定在最终目标上。
     两段之间不留停顿：第一段一落定立刻接第二段，且每段更短。 */
  function chainTurn(list, finalTarget) {
    chainFinal = finalTarget;
    uiOverride = finalTarget;
    syncUI();

    /* 从封面直达封底：中途书是摊开的，厚度层会被 CSS 隐藏，
       看起来「书突然变薄了」。这里让它全程保持可见。 */
    /* 封面直达封底时书会摊开，两半厚度都该在（CSS 用 is-open 已处理） */

    var each = Math.max(260, Math.round(turnMs() * 0.42));
    var i = 0;
    function step() {
      while (i < list.length && list[i] === idx) i++;
      if (i >= list.length) {
        chainFinal = null;
        uiOverride = null;

        syncUI();
        return;
      }
      animateTurn(list[i++], each, step, true);   /* 两段连着放，中间不淡出 */
    }
    step();
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

  var leafToken = 0;      /* 叶片淡出的令牌，防止连翻时误伤新叶片 */
  var chainFinal = null;  /* 连翻（封面↔封底）时水滴要停在的最终目标 */

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
  var rotateTimer = 0;                  /* 「请把手机横过来」的自动收起倒计时 */
  if (rotateEl) {
    var isPortrait = function () { return window.innerHeight > window.innerWidth; };

    var dismissRotate = function () {
      if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = 0; }
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

    /* 用「实际宽 > 高」判断横屏，而不是只信 orientation 媒体查询：
       部分手机（尤其 iOS）翻屏时该事件不触发或滞后，
       会导致提示层不消失 / 伪装横屏退不出来。 */
    function isLandscape() { return window.innerWidth > window.innerHeight; }

    function syncOrientation() {
      var land = isLandscape();
      document.body.classList.toggle('is-landscape', land);
      if (land) {
        rotateEl.classList.remove('is-off');
        document.body.classList.remove('is-flipland');
      }
    }

    syncOrientation();
    window.addEventListener('resize', syncOrientation);
    window.addEventListener('orientationchange', function () {
      syncOrientation();
      setTimeout(syncOrientation, 120);
      setTimeout(syncOrientation, 400);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncOrientation);
    }

    /* 兼容旧路径：orientation 媒体查询变化时也同步一次 */
    var mqLandscape = window.matchMedia('(orientation: landscape)');
    var onOrientation = function () { syncOrientation(); };
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
     尺寸变化后重画页面
     ---------------------------------------------------------
     页面的 background-size 是「按当前书宽算好的 px + 100% 高」。
     书宽一旦变（旋屏、点掉提示进竖屏旋转态 is-flipland、拉伸窗口），
     这个 px 就成了旧值：高度跟着 100% 改、宽度不改，
     于是整幅图被横向挤压 —— 竖屏时封面明显变形就是这个原因。
     所以书的盒子一变，就按新宽度重画一次。
     ========================================================= */
  function repaintPages() {
    if (!pageL || !pageR || !PLATES || !PLATES.length) return;
    if (turning) return;                        /* 翻页动画中交给 land/finishTurn */
    if (drag && drag.active) return;            /* 拖拽中交给 land/restore，别打断预画的下一页 */
    var cur = PLATES[plateIdx(idx)];
    paint(pageL, cur);
    paint(pageR, cur);
  }
  if (window.ResizeObserver) {
    new ResizeObserver(function () { repaintPages(); }).observe(book);
  } else {
    window.addEventListener('resize', repaintPages);
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

    /* 书本随指针做 3D 倾斜：像被托在手里转动。
       上下移动给前后俯仰，左右移动给水平旋转；越靠上抬得越高。 */
    var rx = ((y - 50) / 50) * -9;
    var ry = ((x - 50) / 50) * 11;
    book.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    book.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    book.style.setProperty('--lift', (-6 - (1 - y / 100) * 6).toFixed(2) + 'px');

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
    book.style.setProperty('--rx', '0deg');
    book.style.setProperty('--ry', '0deg');
  });

  /* ---------- 手机：没有鼠标，用设备摇摆来转动书 ---------- */
  var motionBound = false;
  function bindMotion() {
    if (motionBound) return;
    motionBound = true;
    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null && e.beta == null) return;
      var g = Math.max(-40, Math.min(40, e.gamma || 0));        /* 左右倾斜 */
      var b = Math.max(-40, Math.min(40, (e.beta || 0) - 40));  /* 前后倾斜，40° 为手持基准 */
      book.style.setProperty('--ry', (g / 40 * 9).toFixed(2) + 'deg');
      book.style.setProperty('--rx', (-b / 40 * 6).toFixed(2) + 'deg');
    }, true);
  }

  if (window.matchMedia('(hover:none)').matches) {
    var DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      /* iOS 13+ 需要用户手势授权 */
      book.addEventListener('pointerdown', function once() {
        book.removeEventListener('pointerdown', once);
        DOE.requestPermission().then(function (s) { if (s === 'granted') bindMotion(); }).catch(function () {});
      });
    } else if (DOE) {
      bindMotion();     /* Android 等直接可用 */
    }
  }

  /* =========================================================
     初始化
     ========================================================= */
  /* 书腰直接使用封面图中间那条真实画面（竖排书名所在处） */
  var pageblockEl = $('#pageblock');
  var spineNode = $('#spine');
  var gutterEl = document.querySelector('.gutter');
  var stackR = document.querySelector('.stack--r');

  function setupSpine() {
    var spineEl = $('#spine');
    if (!spineEl) return;
    spineEl.style.backgroundImage = 'url("assets/images/' + PLATES[0].slug + '.jpg")';
  }

  /* 预加载整本书：全部下载完再放行，翻页时就不会卡在取图/解码上 */
  var loadingEl = $('#loading');
  var loadFill = $('#loadFill');

  function preloadAll(onDone) {
    var total = PLATES.length, n = 0, finished = false;
    var t0 = Date.now();

    function finish() {
      if (finished) return;
      finished = true;
      if (loadFill) loadFill.style.width = '100%';
      /* 太快时也留一小会儿，避免“一闪而过” */
      var wait = Math.max(0, 420 - (Date.now() - t0)) + 200;
      setTimeout(onDone, wait);
    }
    function tick() {
      n++;
      if (loadFill) loadFill.style.width = Math.min(100, Math.round(n / total * 100)) + '%';
      if (n >= total) finish();
    }

    if (!total) { finish(); return; }
    if (loadFill) loadFill.style.width = '3%';   /* 一开始就有进度，不是空条 */

    PLATES.forEach(function (p) {
      preloadCache[p.slug] = true;      /* 之后按页预载就不会重复请求 */
      var src = 'assets/images/' + p.slug + '.jpg';
      var im = new Image();
      im.onload = function () {
        loadedSrc[src] = true;          /* 预载过的图，翻页时直接切、不淡入 */
        if (im.decode) im.decode().catch(function () {});
        tick();
      };
      im.onerror = tick;                /* 失败也算完成，不能卡住 */
      im.src = src;
    });

    /* 兜底：网络异常时最多等 30 秒 */
    setTimeout(finish, 30000);
  }

  function init() {
    book.classList.add('is-booting');   /* 先关掉过渡，避免开场从右往左滑进来 */
    book.classList.add('is-closed');
    paint(pageR, PLATES[0]);      /* 前封面 = 封面图右半 */
    paint(pageL, PLATES[0]);
    palette(0);
    syncUI();
    setupSpine();

    preloadAll(function () {
      if (loadingEl) loadingEl.classList.add('is-done');
      /* 预加载结束后，书从后方淡入到前方 */
      book.classList.remove('is-booting');
      book.classList.add('is-entering');
      setTimeout(function () { book.classList.remove('is-entering'); }, 1100);

      /* 竖屏：加载条走完了才亮出「请把手机横过来」，
         停留 2.7 秒后自动收起（等同于用户自己点了一下） */
      document.body.classList.add('is-ready');
      if (rotateEl && getComputedStyle(rotateEl).display !== 'none') {
        rotateTimer = setTimeout(function () {
          rotateTimer = 0;
          if (getComputedStyle(rotateEl).display === 'none') return;
          dismissRotate();
        }, 2700);
      }
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
