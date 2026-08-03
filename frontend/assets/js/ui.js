/* =========================================================================
   漫溯 · ui.js
   通用 UI 助手：Lucide 图标渲染（返回 DOM 节点）、元素创建、渐进视频加载、Toast、工具。
   本文件与 pages.js / app.js 的调用约定一致：UI.icon 返回节点、UI.el(tag,attrs,children)。
   ========================================================================= */
(function () {
  "use strict";

  // ---- Lucide 图标（统一 1.5 描边，尺寸 16/20/24，返回 DOM 节点） ----
  function icon(name, size) {
    size = size || 20;
    var wrap = document.createElement("span");
    wrap.className = "lucide icon-" + size;
    wrap.setAttribute("aria-hidden", "true");
    var svg = (window.LUCIDE && window.LUCIDE[name]) || (window.LUCIDE && window.LUCIDE.image) || "";
    wrap.innerHTML = svg;
    return wrap;
  }

  // ---- 轻量元素创建（DOM 节点，支持 attrs + children） ----
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var SCENE_LABEL = {
    rainy_forest: "雨后森林", dusk_coast: "黄昏海岸",
    snowy_pine: "飘雪松林", misty_wheat: "晨雾麦田", free: "自在风景",
    gradient: "渐变作品", ai_generated: "渐变作品"
  };
  function sceneLabel(s) { return SCENE_LABEL[s] || "风景"; }

  // 视频描述：优先用资产自带 description，否则按场景生成一句舒缓说明（含来源与时长）
  function describe(a) {
    if (a && a.description) return a.description;
    var scene = (a && a.scene_tags && a.scene_tags[0]) || "free";
    var poeticByScene = {
      rainy_forest: "雨后，水珠从叶尖滑落，光线被洗得柔和。",
      dusk_coast: "黄昏把海岸线染暖，浪很轻，时间被拉长。",
      snowy_pine: "雪落得很慢，松林安静得能听见自己的呼吸。",
      misty_wheat: "晨雾漫过麦田，风很轻，光线朦胧如未醒。",
      free: "一处自在的风景，随呼吸慢慢展开。",
      gradient: "色彩缓缓流动，像一段没有情节的梦。",
      ai_generated: "色彩缓缓流动，像一段没有情节的梦。"
    };
    var poetic = poeticByScene[scene] || "一段舒缓的风景，适合慢慢看。";
    var src = (a && a.source === "library") ? "官方舒缓库" : "你";
    var dur = (a && a.duration) ? a.duration : 12;
    return poetic + " 来自" + src + "，时长约 " + dur + " 秒。";
  }

  // 兜底清洗：去除含 ⬛ 替换字符的损坏标题；缺省时按 videoId 取一个稳定短码显示
  function cleanTitle(title, videoId) {
    var s = (title == null ? "" : String(title)).trim();
    if (s && s.indexOf('\uFFFD') < 0) return s;
    var tail = (videoId || "").replace(/-/g, "").slice(-4);
    return "AI 渐变风景" + (tail ? " #" + tail : "");
  }
  // 提取"主题分组"：跳过 provider 名标签，返回第一个真实的场景；若没有则返回 'gradient'（AI 视频之间互切）。
  var PROVIDER_NAMES = ["wan", "hailuo", "kling", "seedance"];
  function assetGroup(asset) {
    var tags = (asset && asset.scene_tags) || [];
    for (var i = 0; i < tags.length; i++) {
      if (PROVIDER_NAMES.indexOf(tags[i]) < 0 && SCENE_LABEL[tags[i]]) return tags[i];
    }
    return "gradient";
  }

  // 后端任务只有 status（queued/processing/succeeded/failed），无 stage 词，做近似映射
  function statusToStage(s) { return s === "queued" ? "构图" : (s === "processing" ? "上色" : "完成"); }

  // ---- 渐进视频加载：poster(底图) → preview(360) → master(1080) 无感替换 ----
  // parent 需为定位容器；返回 { video, destroy }。
  function mountProgressiveVideo(parent, asset, opts) {
    opts = opts || {};
    parent.style.backgroundImage = "url('" + asset.poster + "')";
    parent.classList.add("poster-host");

    var poster = el("div", { class: "poster", style: "background-image:url('" + asset.poster + "')" });
    var video = el("video", {
      muted: "", loop: opts.loop === false ? null : "",
      playsinline: "", preload: "auto",
      poster: asset.poster, src: asset.preview
    });
    if (opts.muted !== false) video.muted = true;
    if (opts.autoplay !== false) {
      video.autoplay = true;
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }

    parent.appendChild(poster);
    parent.appendChild(video);

    function reveal() { video.classList.add("ready"); }
    video.addEventListener("loadeddata", reveal);
    video.addEventListener("playing", reveal);

    var upgradeTimer = null, probe = null;
    if (opts.upgrade !== false) {
      // preview 起播后，后台渐进加载 master，就绪无感替换
      upgradeTimer = setTimeout(function () {
        try {
          probe = el("video", { muted: "", preload: "auto", src: asset.master });
          probe.muted = true;
          probe.addEventListener("canplay", function () {
            video.src = asset.master;
            var pl = video.play(); if (pl && pl.catch) pl.catch(function () {});
          });
          probe.load();
        } catch (e) {}
      }, 2600);
    }

    function destroy() {
      if (upgradeTimer) clearTimeout(upgradeTimer);
      try { video.pause(); } catch (e) {}
      if (video.parentNode) video.parentNode.removeChild(video);
      if (poster.parentNode) poster.parentNode.removeChild(poster);
    }
    return { video: video, destroy: destroy };
  }

  // ---- 沉浸漫游：多个风景之间 cross-fade 渐变过渡（不硬切） ----
  function makeRoamLayer() {
    var layer = el("div", { class: "roam-layer" });
    var poster = el("div", { class: "poster" });
    var video = el("video", { muted: "", loop: "", playsinline: "", preload: "auto" });
    video.muted = true;
    video.addEventListener("loadeddata", function () { video.classList.add("ready"); });
    video.addEventListener("playing", function () { video.classList.add("ready"); });
    layer.appendChild(poster); layer.appendChild(video);
    return { layer: layer, poster: poster, video: video };
  }
  function mountRoaming(stage, list, startIndex, opts) {
    opts = opts || {};
    var interval = opts.interval || 15000;
    var onActive = opts.onActive || function () {};
    stage.classList.add("roam");
    var layers = [makeRoamLayer(), makeRoamLayer()];
    layers.forEach(function (L) { stage.appendChild(L.layer); });
    var fog = el("div", { class: "roam-fog" });
    stage.appendChild(fog);
    var cur = 0, idx = startIndex || 0;
    if (idx < 0 || idx >= list.length) idx = 0;
    var roamTimer = null, paused = false;
    function clearRoam() { if (roamTimer) { clearTimeout(roamTimer); roamTimer = null; } }
    function loadInto(L, asset) {
      L.poster.style.backgroundImage = "url('" + asset.poster + "')";
      L.video.poster = asset.poster;
      L.video.src = asset.preview;
      L.video.loop = true;
      if (L.masterTimer) clearTimeout(L.masterTimer);
      L.masterTimer = setTimeout(function () {
        try {
          var probe = el("video", { muted: "", preload: "auto", src: asset.master });
          probe.muted = true;
          probe.addEventListener("canplay", function () {
            if (L.video && L.video.src.indexOf(asset.master) < 0) {
              L.video.src = asset.master;
              var pl = L.video.play(); if (pl && pl.catch) pl.catch(function () {});
            }
          });
          probe.load();
        } catch (e) {}
      }, 2600);
    }
    function activate(targetIdx) {
      var nextIdx = ((targetIdx % list.length) + list.length) % list.length;
      if (nextIdx === idx) return;
      var curL = layers[cur], nextL = layers[1 - cur];
      loadInto(nextL, list[nextIdx]);
      var pl = nextL.video.play(); if (pl && pl.catch) pl.catch(function () {});
      // 触发柔雾过渡动画（先移除再强制重排，确保每次切换都重新播放）
      stage.classList.remove("is-transitioning");
      void stage.offsetWidth;
      stage.classList.add("is-transitioning");
      nextL.layer.classList.add("is-active");
      curL.layer.classList.remove("is-active");
      cur = 1 - cur; idx = nextIdx;
      onActive(list[idx]);
      if (!paused) scheduleNext();
    }
    function scheduleNext() { clearRoam(); roamTimer = setTimeout(function () { activate(idx + 1); }, interval); }
    loadInto(layers[cur], list[idx]);
    layers[cur].layer.classList.add("is-active");
    var pl0 = layers[cur].video.play(); if (pl0 && pl0.catch) pl0.catch(function () {});
    onActive(list[idx]);
    if (!opts.noAuto) scheduleNext();
    return {
      next: function () { paused = false; activate(idx + 1); },
      prev: function () { paused = false; activate(idx - 1); },
      pauseRoam: function () { paused = true; clearRoam(); },
      resumeRoam: function () { if (paused) { paused = false; scheduleNext(); } },
      getActive: function () { return layers[cur].video; },
      getActiveAsset: function () { return list[idx]; },
      destroy: function () {
        clearRoam();
        stage.classList.remove("is-transitioning");
        layers.forEach(function (L) {
          if (L.masterTimer) clearTimeout(L.masterTimer);
          try { L.video.pause(); } catch (e) {}
          if (L.layer.parentNode) L.layer.parentNode.removeChild(L.layer);
        });
        if (fog.parentNode) fog.parentNode.removeChild(fog);
        stage.classList.remove("roam");
      }
    };
  }

  // ---- 控制按钮（沉浸页/通用） ----
  function ctrlButton(name, onClick, on, cls) {
    var b = el("button", { class: "ctrl" + (on ? " is-on" : "") + (cls ? " " + cls : ""), type: "button", "aria-label": name }, icon(name, 24));
    b.addEventListener("click", onClick);
    return b;
  }
  function setBtnIcon(b, name) { b.innerHTML = ""; b.appendChild(icon(name, 24)); }

  // ---- Toast ----
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = el("div", { class: "toast", id: "toast" }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  // ---- 视频卡（首页 Bento / 我的风景库 共用） ----
  function ratioClassForIndex(i) {
    if (i % 6 === 0) return " span-2";
    if (i % 5 === 1) return " ratio-43";
    return "";
  }
  function buildCard(a, fresh, i) {
    var cls = "card enter" + (fresh ? " is-new" : "") + (i >= 0 ? ratioClassForIndex(i) : "");
    var card = el("article", { class: cls, "data-id": a.video_id, role: "button", tabindex: "0", "aria-label": a.title });
    if (fresh) card.appendChild(el("span", { class: "badge-new", text: "新" }));
    var posterOk = !!(a.poster && /^https?:/.test(String(a.poster)));
    var thumb = el("div", { class: "thumb" + (posterOk ? "" : " thumb--empty") });
    if (posterOk) thumb.style.backgroundImage = "url('" + a.poster + "')";
    thumb.appendChild(el("div", { class: "play" }, icon("play", 20)));
    card.appendChild(thumb);
    card.appendChild(el("div", { class: "meta" }, [
      el("span", { class: "title", text: cleanTitle(a.title, a.video_id) }),
      el("span", { class: "tag", text: sceneLabel(assetGroup(a)) })
    ]));
    function go() { if (window.App) window.App.navigate("#/watch/" + a.video_id); }
    card.addEventListener("click", go);
    card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    return card;
  }

  // ---- 4-7-8 呼吸节律控制器（吸 4s / 屏 7s / 呼 8s，共 19s 循环） ----
  function makePacer(orb, phaseEl, countEl) {
    var phases = [{ name: "吸气", dur: 4000, from: 0.82, to: 1.14 }, { name: "屏息", dur: 7000, from: 1.14, to: 1.14 }, { name: "呼气", dur: 8000, from: 1.14, to: 0.82 }];
    var idx = 0, timer = null, cd = null, running = false;
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function step() {
      var p = phases[idx];
      phaseEl.textContent = p.name;
      if (!reduced) { orb.style.transition = "transform " + p.dur + "ms linear"; orb.style.transform = "scale(" + p.to + ")"; }
      var remaining = Math.ceil(p.dur / 1000);
      countEl.textContent = remaining;
      cd = setInterval(function () { remaining--; if (remaining >= 0) countEl.textContent = remaining; }, 1000);
      timer = setTimeout(function () { if (cd) clearInterval(cd); idx = (idx + 1) % phases.length; step(); }, p.dur);
    }
    return {
      start: function () { if (running) return; running = true; if (reduced) { phaseEl.textContent = "随它呼吸"; return; } step(); },
      stop: function () { running = false; if (timer) clearTimeout(timer); if (cd) clearInterval(cd); }
    };
  }

  // 参考风景选择器：从库勾选最多 max 片，作为可灵生成的参考素材（poster URL）
  function refPicker(opts) {
    opts = opts || {};
    var max = opts.max || 2;
    var lib = (opts.library || window.MOCK.library || []).slice();
    var selected = [], cardsByUrl = {};
    var grid = el('div', { class: 'ref-grid' });
    lib.forEach(function (a) {
      var on = false;
      var card = el('button', { class: 'ref-card', type: 'button', 'aria-label': a.title }, [
        el('div', { class: 'ref-thumb', style: 'background-image:url(\'' + a.poster + '\')' }),
        el('span', { class: 'ref-name', text: cleanTitle(a.title, a.video_id) })
      ]);
      card.addEventListener('click', function () {
        if (on) { on = false; var i = selected.indexOf(a.poster); if (i >= 0) selected.splice(i, 1); card.classList.remove('on'); }
        else { if (selected.length >= max) { var first = selected.shift(); var fc = cardsByUrl[first]; if (fc) { fc.classList.remove('on'); fc._on = false; } } on = true; selected.push(a.poster); card.classList.add('on'); }
      });
      cardsByUrl[a.poster] = card; card._on = on;
      grid.appendChild(card);
    });
    return {
      el: grid,
      get: function () { return selected.slice(); },
      set: function (posters) {
        posters = posters || [];
        selected.forEach(function (p) { var c = cardsByUrl[p]; if (c) { c.classList.remove('on'); c._on = false; } });
        selected = [];
        posters.slice(0, max).forEach(function (p) {
          selected.push(p);
          var c = cardsByUrl[p];
          if (c) { c.classList.add('on'); c._on = true; }
        });
      },
      fallback: function () { return lib.slice(0, 2).map(function (x) { return x.poster; }); }
    };
  }

  window.UI = {
    icon: icon, el: el, esc: esc, sceneLabel: sceneLabel, describe: describe,
    cleanTitle: cleanTitle, assetGroup: assetGroup,
    mountProgressiveVideo: mountProgressiveVideo, mountRoaming: mountRoaming,
    ctrlButton: ctrlButton, setBtnIcon: setBtnIcon, toast: toast,
    buildCard: buildCard, makePacer: makePacer, statusToStage: statusToStage, refPicker: refPicker
  };
})();
