/* =========================================================================
   漫溯 · starfield.js
   程序化星空背景渲染器（无图片，纯 canvas 绘制）。
   颜色全部来自 CSS 变量（--mood-star / --mood-nebula / --mood-mw），本文件不写裸 hex。
   真实感来源：fbm 噪声生成的弥散星云气体云 + 强可见银河带 + 多色温星点
              + 亮星衍射十字 + 多深度视差微动 + 镜头暗角 + 大气辉光 + 颗粒。
   清晰度策略：星云气体渲染在 0.5× 离屏（结构细、放大倍率小 → 不糊成大块）；
              银河微星全分辨率 1:1 烘焙（密集锐利点）；前景星三层视差全部带硬核，
              中/近层亮星适度回软光晕（摄影长曝光必有 airy disk + 镜头散射），
              远层星纯锐点；星点密度大幅提升 → 满天星斗；银河带三层叠加（气体+密集微星+亮核）。
   慢产品基调：星点疏密有致、闪烁极缓、星云呼吸，不喧宾夺主。
   ========================================================================= */
(function () {
  "use strict";

  // 真实恒星色温（白/蓝白主导，间杂暖黄、橙红、青绿）：摄影般色彩层次更丰富
  var STAR_COLORS = [
    [255, 255, 255],   // 纯白
    [208, 222, 255],   // 蓝白
    [178, 202, 255],   // 蓝
    [255, 242, 206],   // 暖黄白
    [255, 206, 158],   // 橙黄
    [255, 176, 150],   // 橙红
    [196, 252, 236]    // 青绿（稀少点缀）
  ];
  var STAR_WEIGHTS = [5, 4, 3, 3, 2, 1, 1];

  function pickStarColor() {
    var total = 0, i;
    for (i = 0; i < STAR_WEIGHTS.length; i++) total += STAR_WEIGHTS[i];
    var r = Math.random() * total;
    for (i = 0; i < STAR_WEIGHTS.length; i++) {
      r -= STAR_WEIGHTS[i];
      if (r <= 0) return STAR_COLORS[i];
    }
    return STAR_COLORS[0];
  }

  function makeNoise(seedX, seedY) {
    function hash(x, y) {
      var n = (x * 374761393 + y * 668265263) ^ (seedX * 2246822519 + seedY * 3266489917);
      n = (n ^ (n >> 13)) * 1274126177;
      n = n ^ (n >> 16);
      return ((n >>> 0) % 100000) / 100000;
    }
    function smooth(t) { return t * t * (3 - 2 * t); }
    function vnoise(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = x - xi, yf = y - yi;
      var tl = hash(xi, yi), tr = hash(xi + 1, yi), bl = hash(xi, yi + 1), br = hash(xi + 1, yi + 1);
      var u = smooth(xf), v = smooth(yf);
      var top = tl + (tr - tl) * u, bot = bl + (br - bl) * u;
      return top + (bot - top) * v;
    }
    function fbm(x, y) {
      var v = 0, a = 0.5, f = 1;
      for (var o = 0; o < 5; o++) { v += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; }
      return v;
    }
    return fbm;
  }

  function mount(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var raf = null, running = false;
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var pal = {
      star: { r: 200, g: 214, b: 255 },
      nebula: { r: 60, g: 90, b: 150 },
      mw: { r: 200, g: 214, b: 255 }
    };

    var stars = [];
    var neb = null;
    var starBake = null;
    var mwHalo = null;   // 银河带柔光底图（柔）
    var pad = 64;

    function buildBackdrop() {
      var pw = W + pad * 2, ph = H + pad * 2;

      // (1) 星云气体云：0.5× 离屏，气体而非雾
      var ns = 0.5;
      var nw = Math.max(2, Math.ceil(pw * ns)), nh = Math.max(2, Math.ceil(ph * ns));
      var nc = document.createElement("canvas"); nc.width = nw; nc.height = nh;
      var octx = nc.getContext("2d");
      var img = octx.createImageData(nw, nh);
      var data = img.data;
      var fbmA = makeNoise(11, 7), fbmB = makeNoise(53, 29), fbmD = makeNoise(91, 67), fbmC = makeNoise(131, 197);
      var nR = pal.nebula.r, nG = pal.nebula.g, nB = pal.nebula.b;
      var mR = pal.mw.r, mG = pal.mw.g, mB = pal.mw.b;
      for (var y = 0; y < nh; y++) {
        for (var x = 0; x < nw; x++) {
          var nx = x / nw * 5.6, ny = y / nh * 5.6;
          var f = fbmA(nx, ny) * 0.58 + fbmB(nx * 3.6 + 5, ny * 3.6 + 9) * 0.42;
          var dens = fbmD(nx * 0.9 + 3, ny * 0.9 + 1);
          var a = (f - 0.44) / 0.56;                   // 阈值略降，多留点气体
          if (a < 0) a = 0; else if (a > 1) a = 1;
          a = a * a;
          a = a * (0.42 + 0.58 * dens);
          if (a <= 0.004) { data[(y * nw + x) * 4 + 3] = 0; continue; }
          var alpha = Math.min(0.72, a * 0.72);       // 适度不透明，气体感更强
          // 双色气体：在 nebula 与 mw 两色间用独立噪声插值 → 气体云呈两种色调交织（暖核冷缘）
          var mix = fbmC(nx * 2.2 + 13, ny * 2.2 + 7);
          var cr = nR + (mR - nR) * mix * 0.85;
          var cg = nG + (mG - nG) * mix * 0.85;
          var cb = nB + (mB - nB) * mix * 0.85;
          var k = (y * nw + x) * 4;
          data[k] = cr | 0; data[k + 1] = cg | 0; data[k + 2] = cb | 0;
          data[k + 3] = (alpha * 255) | 0;
        }
      }
      octx.putImageData(img, 0, 0);
      neb = nc;

      // (2) 银河柔光带（专门为银河核心造一层柔光 → 真实摄影中银河核是有气辉的）
      var mhc = document.createElement("canvas"); mhc.width = nw; mhc.height = nh;
      var mhctx = mhc.getContext("2d");
      mhctx.translate(nw / 2, nh / 2); mhctx.rotate(-0.42);
      var band = mhctx.createLinearGradient(0, -nh * 0.18, 0, nh * 0.18);
      band.addColorStop(0.0, "rgba(0,0,0,0)");
      band.addColorStop(0.5, "rgba(" + mR + "," + mG + "," + mB + ",0.60)");   // 银河带 alpha 0.42→0.60（更亮）
      band.addColorStop(1.0, "rgba(0,0,0,0)");
      mhctx.fillStyle = band;
      mhctx.fillRect(-nw, -nh * 0.2, nw * 2, nh * 0.4);
      mwHalo = mhc;

      // (3) 清晰星点烘焙：全分辨率 1:1 → 银河密集微星 + 背景场锐利
      var sb = document.createElement("canvas"); sb.width = pw; sb.height = ph;
      var sctx = sb.getContext("2d");

      // 背景稀疏场：密度 560 → 780，分布更密，摄影感"满天星斗"
      for (var i = 0; i < 780; i++) {
        var bx = Math.random() * pw, by = Math.random() * ph;
        var ba = 0.22 + Math.random() * 0.40;
        sctx.fillStyle = "rgba(" + mR + "," + mG + "," + mB + "," + ba.toFixed(2) + ")";
        sctx.beginPath(); sctx.arc(bx, by, 0.65 + Math.random() * 0.6, 0, Math.PI * 2); sctx.fill();
      }
      // 银河密集微星：1280 → 1500，沿带轴，整体提亮
      sctx.save();
      sctx.translate(pw / 2, ph / 2); sctx.rotate(-0.42);
      for (var j = 0; j < 1500; j++) {
        var mx = (Math.random() - 0.5) * pw * 2;
        var my = (Math.random() - 0.5) * ph * 0.36 * (1 - Math.min(1, Math.abs(mx) / pw));
        var ma = 0.42 + Math.random() * 0.52;
        sctx.fillStyle = "rgba(" + mR + "," + mG + "," + mB + "," + ma.toFixed(2) + ")";
        var mr = Math.random() < 0.12 ? 1.6 : 0.8;
        sctx.beginPath(); sctx.arc(mx + pw / 2, my + ph / 2, mr, 0, Math.PI * 2); sctx.fill();
      }
      // 银河亮星：36 → 52，更明显的亮核（与密集微星同色带，提亮）
      for (var k = 0; k < 52; k++) {
        var bx2 = (Math.random() - 0.5) * pw * 1.6;
        var by2 = (Math.random() - 0.5) * ph * 0.30 * (1 - Math.min(1, Math.abs(bx2) / pw));
        sctx.fillStyle = "rgba(255,255,255,0.96)";
        var br = 1.1 + Math.random() * 0.7;
        sctx.beginPath(); sctx.arc(bx2 + pw / 2, by2 + ph / 2, br, 0, Math.PI * 2); sctx.fill();
      }
      sctx.restore();
      starBake = sb;
    }

    // 三层视差前景星：密度大幅提升，远/中/近各 35/45/20
    function seed() {
      var count = Math.max(180, Math.min(540, Math.round((W * H) / 4800)));
      stars = [];
      for (var i = 0; i < count; i++) {
        var layer = Math.random();
        var depth = layer < 0.45 ? 0 : (layer < 0.82 ? 1 : 2); // 远/中/近
        var c = pickStarColor();
        var r = depth === 0 ? (0.55 + Math.random() * 0.6)
              : depth === 1 ? (0.85 + Math.random() * 0.9)
              : (1.20 + Math.random() * 1.30);
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: r,
          cr: c[0], cg: c[1], cb: c[2],
          base: (depth === 2 ? 0.62 : depth === 1 ? 0.50 : 0.36) + Math.random() * 0.24,
          amp: 0.06 + Math.random() * 0.22,
          spd: 0.30 + Math.random() * 0.9,
          ph: Math.random() * Math.PI * 2,
          spike: depth === 2 && r > 1.5 && Math.random() < 0.55,
          // 适度回软光晕：中近层都有（摄影长曝光必有 airy disk + 镜头散射），但仍收敛
          glowR: depth === 2 ? 2.4 : (depth === 1 ? 1.4 : 0),
          // 硬核：全部都有
          hardCoreR: depth === 2 ? Math.max(0.55, r * 0.50) : depth === 1 ? 0.55 : 0.45,
          swayAmp: (depth === 2 ? 5 : depth === 1 ? 2.4 : 1.0) + Math.random() * 1.5,
          swayPh: Math.random() * Math.PI * 2,
          swaySpd: 0.05 + Math.random() * 0.06
        });
      }
    }

    function resize() {
      W = canvas.clientWidth || window.innerWidth;
      H = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildBackdrop();
      seed();
      if (reduced) draw(0);
    }

    function drawStar(s, time) {
      var a = s.base + s.amp * (0.5 + 0.5 * Math.sin(time * s.spd + s.ph));
      if (a < 0) a = 0; else if (a > 1) a = 1;

      if (s.spike) {
        var L = s.r * 5.0;
        var gx = ctx.createLinearGradient(s.x - L, s.y, s.x + L, s.y);
        gx.addColorStop(0, "rgba(" + s.cr + "," + s.cg + "," + s.cb + ",0)");
        gx.addColorStop(0.5, "rgba(" + s.cr + "," + s.cg + "," + s.cb + "," + (a * 0.5).toFixed(3) + ")");
        gx.addColorStop(1, "rgba(" + s.cr + "," + s.cg + "," + s.cb + ",0)");
        ctx.strokeStyle = gx; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(s.x - L, s.y); ctx.lineTo(s.x + L, s.y); ctx.stroke();
        var gy = ctx.createLinearGradient(s.x, s.y - L, s.x, s.y + L);
        gy.addColorStop(0, "rgba(" + s.cr + "," + s.cg + "," + s.cb + ",0)");
        gy.addColorStop(0.5, "rgba(" + s.cr + "," + s.cg + "," + s.cb + "," + (a * 0.5).toFixed(3) + ")");
        gy.addColorStop(1, "rgba(" + s.cr + "," + s.cg + "," + s.cb + ",0)");
        ctx.strokeStyle = gy;
        ctx.beginPath(); ctx.moveTo(s.x, s.y - L); ctx.lineTo(s.x, s.y + L); ctx.stroke();
      }

      // 适度软光晕（中近层都有；远层无 → 保持锐利）
      if (s.glowR > 0) {
        var g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * s.glowR);
        g.addColorStop(0, "rgba(" + s.cr + "," + s.cg + "," + s.cb + "," + (a * 0.78).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + s.cr + "," + s.cg + "," + s.cb + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.glowR, 0, Math.PI * 2); ctx.fill();
      }
      // 锐利核心（硬边圆）
      ctx.fillStyle = "rgba(" + s.cr + "," + s.cg + "," + s.cb + "," + a.toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      // 1px 纯白硬核
      if (s.hardCoreR) {
        ctx.fillStyle = "rgba(255,255,255," + (a * 0.92).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(s.x, s.y, s.hardCoreR, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 颗粒噪点（破"渲染感"）—— 单次预生成，每帧随机点位 offset
    var grainPts = [];
    function buildGrain() {
      grainPts.length = 0;
      var n = Math.floor((W * H) / 900);
      for (var i = 0; i < n; i++) {
        grainPts.push({ x: Math.random() * W, y: Math.random() * H, a: 0.04 + Math.random() * 0.06 });
      }
    }
    function drawGrain() {
      var pr = (Math.random() - 0.5) * 12; // 每帧整体偏移，破固定模式
      ctx.fillStyle = "rgba(255,255,255,1)";
      for (var i = 0; i < grainPts.length; i++) {
        var p = grainPts[i];
        ctx.globalAlpha = p.a;
        ctx.fillRect(p.x + pr, p.y, 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      var time = t / 1000;
      var driftX = reduced ? 0 : Math.sin(time * 0.03) * 10;
      var driftY = reduced ? 0 : Math.cos(time * 0.024) * 8;
      var px = -pad + driftX, py = -pad + driftY;

      // 星云气体（柔）
      if (neb) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(neb, px, py, W + pad * 2, H + pad * 2);
      }
      // 银河柔光带（叠加在星云上，柔即可）
      if (mwHalo) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(mwHalo, px, py, W + pad * 2, H + pad * 2);
      }
      // 清晰星点（1:1）
      if (starBake) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(starBake, px, py);
        ctx.imageSmoothingEnabled = true;
      }

      // 前景视差星
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var ox = reduced ? 0 : Math.sin(time * s.swaySpd + s.swayPh) * s.swayAmp;
        var oy = reduced ? 0 : Math.cos(time * s.swaySpd * 0.8 + s.swayPh) * s.swayAmp * 0.6;
        var sx = s.x, sy = s.y; s.x += ox; s.y += oy;
        drawStar(s, time);
        s.x = sx; s.y = sy;
      }

      // 大气辉光：底部中央极淡的纵向光晕（长曝光地平线/空气辉光，无视觉中心干扰）
      var ag = ctx.createLinearGradient(0, H * 0.55, 0, H);
      ag.addColorStop(0, "rgba(0,0,0,0)");
      ag.addColorStop(1, "rgba(" + pal.star.r + "," + pal.star.g + "," + pal.star.b + ",0.06)");
      ctx.fillStyle = ag;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);

      // 颗粒（破"渲染感"→ 摄影感）
      if (grainPts.length === 0) buildGrain();
      drawGrain();

      // 镜头暗角（收敛）
      var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.46, W / 2, H / 2, Math.max(W, H) * 0.82);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.24)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      if (running) raf = requestAnimationFrame(draw);
    }

    function start() {
      if (reduced) { draw(0); return; }
      if (running) return;
      running = true;
      raf = requestAnimationFrame(draw);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }
    function setTint(p) {
      if (!p) return;
      if (typeof p.r === "number") pal.star = { r: p.r, g: p.g, b: p.b };
      if (p.star) pal.star = p.star;
      if (p.nebula) pal.nebula = p.nebula;
      if (p.mw) pal.mw = p.mw;
      buildBackdrop();
      if (reduced) draw(0);
    }

    var rt = null;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(resize, 150); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });

    resize();
    start();

    return { setTint: setTint, start: start, stop: stop, destroy: function () { stop(); } };
  }

  window.Starfield = { mount: mount };
})();