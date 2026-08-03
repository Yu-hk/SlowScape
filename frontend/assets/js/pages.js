/* =========================================================================
   漫溯 · pages.js
   四个页面：home（舒缓视频流）/ generate（安静生成）/ watch（沉浸播放+呼吸引导）/ mine（风景库）
   全部使用 Lucide 图标 + Token 颜色，无 emoji、无裸 hex。
   ========================================================================= */
(function () {
  "use strict";
  var UI = window.UI, MOCK = window.MOCK, API = window.API;
  // 拉后端 /feed 并入 MOCK，同时清掉"后端没有"的孤儿（防旧会话留下的空卡）。
  function syncBackendFeed() {
    return API.feed().then(function (items) {
      var backendIds = {};
      (items || []).forEach(function (a) { backendIds[a.video_id] = a; });
      try { MOCK.removeStaleFeed && MOCK.removeStaleFeed(backendIds); } catch (e) {}
      (items || []).forEach(function (a) { try { MOCK.pushGenerated(a); } catch (e) {} });
      return items || [];
    }).catch(function () { return []; });
  }
  // 合成显示列表：MOCK 库 + feed，去重；近期生成置前。
  function unionLibraryFeed() {
    var items = MOCK.library.slice();
    MOCK.feedAssets().forEach(function (a) {
      if (!items.some(function (x) { return x.video_id === a.video_id; })) items.unshift(a);
    });
    return items;
  }
  function renderBento(host, items, opts) {
    host.innerHTML = "";
    items.forEach(function (a, i) { host.appendChild(UI.buildCard(a, !!(opts && opts.generated), i)); });
  }  // ============================================================
  // 首页 / 舒缓视频流
  // ============================================================
  window.Pages = window.Pages || {};

  // 客户端分页：每页 step 条，底部"看看更多"按钮。
  function paginate(host, getAll, opts) {
    opts = opts || {};
    var step = opts.step || 9;
    var shown = step;
    var moreBtn = null;
    function render() {
      var all = getAll() || [];
      if (shown > all.length) shown = all.length;
      else if (shown < step && all.length >= step) shown = step;
      host.innerHTML = "";
      for (var idx = 0; idx < shown && idx < all.length; idx++) {
        // featured 模式：第一张传 i=0（拿到 .span-2），再手动加 .card--featured；其余传 i=-1 跳过 ratioClassForIndex，让 .bento--three 保持节奏统一。
        var iArg = (opts.featured && idx === 0) ? 0 : -1;
        var card = UI.buildCard(all[idx], !!opts.generated, iArg);
        if (opts.featured && idx === 0) card.classList.add("card--featured");
        host.appendChild(card);
      }
      if (moreBtn && moreBtn.parentNode) moreBtn.parentNode.removeChild(moreBtn);
      moreBtn = null;
      if (shown < all.length) {
        moreBtn = UI.el("button", { class: "btn btn-ghost load-more", type: "button", text: "看看更多 · 还有 " + (all.length - shown) + " 片" });
        moreBtn.addEventListener("click", function () { shown += step; render(); });
        if (host.parentNode) host.parentNode.appendChild(moreBtn);
      }
      return all;
    }
    return { render: render };
  }

  window.Pages.home = function (view) {
    view.innerHTML = "";
    var root = UI.el("div", { class: "home" });

    // 大地背景：与登录极光、详情深海拼成"天·地·海"世界轴；纯自然本地图，缓慢轮播
    var LAND_IMG = [
      "/assets/img/land/land-1.jpg",
      "/assets/img/land/land-2.jpg",
      "/assets/img/land/land-3.jpg",
    ];
    var bg = UI.el("div", { class: "home-bg" });
    var landSlides = LAND_IMG.map(function (url, i) {
      var s = UI.el("div", { class: "slide", style: "background-image:url('" + url + "')" + (i === 0 ? ";opacity:1" : "") });
      bg.appendChild(s);
      return s;
    });
    var landCur = 0;
    var landTimer = setInterval(function () {
      landSlides[landCur].style.opacity = "0";
      landCur = (landCur + 1) % landSlides.length;
      landSlides[landCur].style.opacity = "1";
    }, 8000);
    root.appendChild(bg);

    var hero = UI.el("section", { class: "hero" });
    hero.appendChild(UI.el("div", { class: "scrim" }));
    hero.appendChild(UI.el("div", { class: "greeting" }, [
      UI.el("div", { class: "eyebrow", text: "漫溯 · 此刻" }),
      UI.el("h1", { text: "今天有点累？让一片竹林替你呼吸三分钟。" }),
      UI.el("p", { text: "挑一片风景，把呼吸交还给身体。" })
    ]));
    root.appendChild(hero);
    view.appendChild(root);
    UI.mountProgressiveVideo(hero, MOCK.library[0], { upgrade: true });
    var sec = UI.el("section", { class: "section container" });
      sec.appendChild(UI.el("div", { class: "section-head" }, [
        UI.el("div", {}, [
          UI.el("h2", { class: "section-title", text: "我的风景" }),
          UI.el("div", { class: "section-sub", text: "随呼吸缓缓展开" })
        ]),
        UI.el("a", { class: "btn btn-ghost", href: "#/generate" }, [UI.icon("plus", 20), document.createTextNode("生成一片")])
      ]));
    // —— 场景分类筛选：按后端 scene_tags 维度聚合（数据层已具备，前端动态生成） ——
    var sceneFilter = "all";
    var sceneOrder = ["rainy_forest", "dusk_coast", "snowy_pine", "misty_wheat", "free", "gradient"];
    function normScene(k) { return k === "ai_generated" ? "gradient" : k; }
    var chips = UI.el("div", { class: "chips filter-row" });
    function buildChips() {
      var present = {};
      unionLibraryFeed().forEach(function (a) { present[normScene(UI.assetGroup(a))] = true; });
      var keys = sceneOrder.filter(function (k) { return present[k]; });
      chips.innerHTML = "";
      ["all"].concat(keys).forEach(function (key) {
        var label = key === "all" ? "全部" : UI.sceneLabel(key);
        var chip = UI.el("button", { class: "chip" + (key === sceneFilter ? " selected" : ""), type: "button", "data-scene": key, text: label });
        chip.addEventListener("click", function () {
          sceneFilter = key;
          Array.prototype.forEach.call(chips.children, function (c) { c.classList.toggle("selected", c.getAttribute("data-scene") === key); });
          pager.render();
        });
        chips.appendChild(chip);
      });
    }
    buildChips();
    sec.appendChild(chips);
    var grid = UI.el("div", { class: "bento bento--three" });
    function filteredFeed() {
      var list = unionLibraryFeed();
      return sceneFilter === "all" ? list : list.filter(function (a) { return normScene(UI.assetGroup(a)) === sceneFilter; });
    }
    var pager = paginate(grid, filteredFeed, { step: 9, featured: true });
    sec.appendChild(grid);
    pager.render();
      root.appendChild(sec);
      // 生成完成 · 顶部轻柔滑入新卡
      var unsub = MOCK.onAnyTask(function (t) {
        if (t.status === "succeeded" && t.asset) {
          if (sceneFilter !== "all" && UI.assetGroup(t.asset) !== sceneFilter) return;
          if (grid.querySelector('[data-id="' + t.asset.video_id + '"]')) return;
          var c = UI.buildCard(t.asset, true, -1);
          grid.insertBefore(c, grid.firstChild);
          c.classList.remove("enter"); void c.offsetWidth; c.classList.add("enter");
          UI.toast("一片新的风景长好了");
        }
      });
      // 首次加载从后端 feed 拉真实生成历史，结束后用最新列表重绘 bento。
      syncBackendFeed().then(function () { buildChips(); pager.render(); });
      return function () { unsub(); clearInterval(landTimer); };
    };

  // ============================================================
  // 生成输入页 / 安静表单 + 呼吸进度
  // ============================================================
  window.Pages = window.Pages || {};
  window.Pages.generate = function (view) {
    view.innerHTML = "";
    var wrap = UI.el("div", { class: "quiet container" });
    var form = UI.el("form", { class: "form" });
    var lead = UI.el("div", { class: "lead" }, [
      UI.el("h2", { text: "想看一片什么样的风景？" }),
      UI.el("p", { text: "描述得越具体，它越像你心里那片安静。" })
    ]);
    var ta = UI.el("textarea", {
      class: "field", rows: "4", maxlength: "200",
      placeholder: "例如：被薄雾覆盖的针叶林，风很轻", "aria-label": "描述你想看到的景色"
    });
    var row = UI.el("div", { class: "row" }, [
      UI.el("span", { class: "label", text: "或，从预设开始" }),
      UI.el("span", { class: "t-muted t-mono", id: "charcount", text: "0 / 200" })
    ]);
    var chips = UI.el("div", { class: "chips", id: "chips" });
    var submitZone = UI.el("div", { class: "submit-zone" });
    var btn = UI.el("button", { class: "btn btn-primary", type: "submit", disabled: "" }, [UI.icon("plus", 20), document.createTextNode("生成一片风景")]);
    var aiBtnLabel = document.createTextNode("AI 帮我挑参考图");
    var aiBtn = UI.el("button", { class: "btn btn-ghost", type: "button" }, [UI.icon("image", 20), aiBtnLabel]);
    submitZone.appendChild(btn); submitZone.appendChild(aiBtn);
    var suggestCard = UI.el("div", { class: "suggest-card", style: "display:none" });
    form.appendChild(ta); form.appendChild(row); form.appendChild(chips);
    var rp = UI.refPicker({ max: 2 });
    form.appendChild(rp.el); form.appendChild(submitZone); form.appendChild(suggestCard);

    var doneZone = UI.el("div", { class: "generate-done" });
    wrap.appendChild(lead); wrap.appendChild(form); wrap.appendChild(doneZone);
    view.appendChild(wrap);

    API.getPresets().then(function (res) {
      (res.presets || []).forEach(function (p) {
        var c = UI.el("button", { class: "chip", type: "button", "data-prompt": p.prompt }, [UI.icon("wind", 16), document.createTextNode(p.name)]);
        c.addEventListener("click", function () {
          ta.value = p.prompt; syncCount();
          chips.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("selected"); });
          c.classList.add("selected"); syncBtn();
        });
        chips.appendChild(c);
      });
    });

    function syncCount() { var n = (ta.value || "").length; var cc = document.getElementById("charcount"); if (cc) cc.textContent = n + " / 200"; }
    function syncBtn() { btn.disabled = !(ta.value || "").trim(); }
    ta.addEventListener("input", function () { syncCount(); syncBtn(); if (ta.value.trim()) chips.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("selected"); }); });
    form.addEventListener("submit", function (e) { e.preventDefault(); var prompt = (ta.value || "").trim(); if (!prompt) return; startGenerate(prompt); });

    aiBtn.addEventListener("click", function () {
      var p = (ta.value || "").trim();
      if (!p) { UI.toast("先描述一下你想看的风景"); ta.focus(); return; }
      aiBtn.disabled = true; var saved = aiBtnLabel.textContent; aiBtnLabel.textContent = "AI 挑选中…";
      API.suggestReferences(p).then(function (d) {
        var refs = (d && d.references) || [];
        if (!refs.length) { UI.toast("暂时挑不出参考图，你手动选也行"); return; }
        rp.set(refs);
        renderSuggestCard(d);
      }).catch(function () {
        UI.toast("选图接口暂时不可用，你手动选也行");
      }).finally(function () { aiBtn.disabled = false; aiBtnLabel.textContent = saved; });
    });

    function renderSuggestCard(d) {
      var refs = d.references || [];
      suggestCard.innerHTML = "";
      var head = UI.el("div", { class: "suggest-card__head" }, [
        UI.icon("image", 18),
        UI.el("span", { text: "AI 为你挑好了参考图" }),
        UI.el("span", { class: "suggest-card__tag", text: d.strategy || "auto" })
      ]);
      var refsRow = UI.el("div", { class: "suggest-card__refs" });
      refs.slice(0, 2).forEach(function (r, i) {
        if (i > 0) refsRow.appendChild(UI.icon("arrow-right", 18));
        var img = UI.el("img", { class: "suggest-thumb__img", src: r || "", alt: i === 0 ? "起始参考图" : "过渡参考图", loading: "lazy" });
        img.addEventListener("error", function () { img.style.display = "none"; });
        refsRow.appendChild(UI.el("div", { class: "suggest-thumb" }, [
          img,
          UI.el("span", { class: "suggest-thumb__role", text: i === 0 ? "起" : "终" })
        ]));
      });
      var promptLine = UI.el("p", { class: "suggest-card__prompt" }, [
        document.createTextNode("建议描述：" + (d.suggested_prompt || (ta.value || ""))),
        d.reason ? UI.el("span", { class: "suggest-card__reason", text: "（" + d.reason + "）" }) : null
      ].filter(Boolean));
      var actions = UI.el("div", { class: "suggest-card__actions" });
      var useBtn = UI.el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "用建议描述" });
      var clearBtn = UI.el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "不用参考图" });
      useBtn.addEventListener("click", function () { ta.value = d.suggested_prompt || ta.value; syncCount(); syncBtn(); });
      clearBtn.addEventListener("click", function () { rp.set([]); suggestCard.style.display = "none"; });
      actions.appendChild(useBtn); actions.appendChild(clearBtn);
      suggestCard.appendChild(head); suggestCard.appendChild(refsRow); suggestCard.appendChild(promptLine); suggestCard.appendChild(actions);
      suggestCard.style.display = "";
    }

    function startGenerate(prompt) {
      var refs = rp.get(); if (!refs.length) refs = rp.fallback();
      form.style.display = "none"; lead.style.display = "none";
      var ripple = UI.el("div", { class: "ripple" });
      ["ring", "ring", "ring", "core"].forEach(function (c) { ripple.appendChild(UI.el("span", { class: c })); });
      var sw = UI.el("div", { class: "stage-words" });
      ["构图", "上色", "起风"].forEach(function (s, i) {
        if (i > 0) sw.appendChild(UI.el("span", { class: "sep", text: "·" }));
        sw.appendChild(UI.el("span", { class: "step", "data-step": s, text: s }));
      });
      var breathe = UI.el("div", { class: "breathe-wrap" }, [
        ripple,
        UI.el("div", { class: "breathe-label", text: "正在为你酝酿一片风景……" }),
        sw,
        UI.el("div", { class: "breathe-sub", text: "不用等，先去别处走走也行。" })
      ]);
      wrap.appendChild(breathe);

      function setStage(stage) {
        if (!stage) return;
        var steps = breathe.querySelectorAll(".step"), order = ["构图", "上色", "起风"], idx = order.indexOf(stage);
        steps.forEach(function (s, i) { s.classList.remove("done", "current"); if (i < idx) s.classList.add("done"); else if (i === idx) s.classList.add("current"); });
      }

      API.createGeneration({ prompt: prompt, duration: 10, resolution: "720p", aspect_ratio: "16:9", references: refs }).then(function (acc) {
        var unsub = null, pollTimer = null, done = false;
        function finish(asset) {
          if (done) return; done = true;
          if (unsub) unsub();
          if (pollTimer) clearInterval(pollTimer);
          if (asset) { try { MOCK.pushGenerated(asset); } catch (e) {} }
          setTimeout(function () {
            breathe.querySelector(".breathe-label").textContent = "这片风景已经长好了。";
            breathe.querySelector(".breathe-sub").textContent = "它会在首页静静等你。";
            doneZone.innerHTML = "";
            doneZone.appendChild(UI.el("div", { class: "breathe-label", text: "已为你留出一片风景" }));
            doneZone.appendChild(UI.el("button", { class: "btn btn-primary", type: "button", onclick: function () { window.App.navigate("#/"); } }, [UI.icon("home", 20), document.createTextNode("回到首页看看")]));
            doneZone.classList.add("show");
          }, 1200);
        }
        function onUpdate(t) { if (!t) return; setStage(t.stage || UI.statusToStage(t.status)); }
        if (acc.backend) {
          pollTimer = setInterval(function () {
            API.getTask(acc.task_id).then(function (t) {
              onUpdate(t);
              if (t && t.status === "succeeded") finish(t.asset);
              else if (t && t.status === "failed") finish(null);
            }).catch(function () {});
          }, 1500);
        } else {
          unsub = MOCK.subscribe(acc.task_id, function (t) {
            onUpdate(t);
            if (t.status === "succeeded") finish(t.asset);
            else if (t.status === "failed") finish(null);
          });
        }
      });
    }
    syncBtn();
    return function () {};
  };

  // ============================================================
  // 沉浸播放 / 呼吸引导（4-7-8）
  // ============================================================
  window.Pages = window.Pages || {};
  window.Pages.watch = function (view, params) {
    view.innerHTML = "";
    var id = params.id;
    var root = UI.el("div", { class: "watch" });
    // 程序化星空背景（canvas 渲染，无图片）
    var starCanvas = UI.el("canvas", { class: "starfield" });
    root.appendChild(starCanvas);
    var star = null;
    try { if (window.Starfield) star = window.Starfield.mount(starCanvas); } catch (e) { star = null; }

    // 居中舞台外壳：视频在左、内容在右，两侧留白透出星空
    var shell = UI.el("div", { class: "watch-shell" });
    var main = UI.el("div", { class: "watch-main" });
    var hero = UI.el("div", { class: "watch-video" });   // 视频影院卡（兼作 idle 隐藏锚点）
    var stage = UI.el("div", { class: "stage" });
    var stageBreathe = UI.el("div", { class: "stage-breathe" });
    var back = UI.el("a", { class: "back", href: "#/" }, [UI.icon("arrow-left", 20), document.createTextNode("返回")]);
    var pacerAnchor = UI.el("div", { class: "pacer-anchor" });
    var controls = UI.el("div", { class: "controls" });
    stage.appendChild(stageBreathe);
    hero.appendChild(stage); hero.appendChild(back); hero.appendChild(pacerAnchor); hero.appendChild(controls);

    var panel = UI.el("div", { class: "watch-panel" });
    var meta = UI.el("div", { class: "w-meta" });
    var wTitle = UI.el("h1", { class: "w-title" });
    var wChips = UI.el("div", { class: "w-chips" });
    meta.appendChild(wTitle); meta.appendChild(wChips);
    var author = UI.el("div", { class: "w-author" });
    var stats = UI.el("div", { class: "w-stats" });
    var desc = UI.el("div", { class: "w-desc" });
    var commentsSec = UI.el("section", { class: "w-comments", id: "w-comments" });
    var cdTitle = UI.el("div", { class: "cd-title" });
    var cdList = UI.el("div", { class: "cd-list" });
    var cdFoot = UI.el("div", { class: "cd-foot" });
    commentsSec.appendChild(UI.el("div", { class: "cd-head" }, [cdTitle]));
    commentsSec.appendChild(cdList);
    commentsSec.appendChild(cdFoot);
    panel.appendChild(meta); panel.appendChild(author); panel.appendChild(stats); panel.appendChild(desc); panel.appendChild(commentsSec);

    main.appendChild(hero);
    main.appendChild(panel);
    shell.appendChild(main);
    root.appendChild(shell);
    view.appendChild(root);

    function bumpPlay(vid) {
      try { var k = "slowscape.plays", m = JSON.parse(localStorage.getItem(k) || "{}"); m[vid] = (m[vid] || 0) + 1; localStorage.setItem(k, JSON.stringify(m)); return m[vid]; } catch (e) { return 0; }
    }
    function getPlay(vid) { try { var m = JSON.parse(localStorage.getItem("slowscape.plays") || "{}"); return m[vid] || 0; } catch (e) { return 0; } }

    var roam = null, pacer = null;
    // 程序化星空背景：按场景切换"夜空气氛"键（mood），颜色与星点微染由 CSS .watch.mood-* 类承载。
    // 保留与视频场景的呼应——但现在是"颜色"而非"照片"：无下载、无模糊、无色温撞车。
    // 每个资产可用 a.mood 覆盖（标签错配的视频单独指定更协调的氛围，如 v-1082）。
    // 整页氛围覆盖：设为某套 mood 键即把 watch 背景全局锁定为该色调（用于挑选整站主色快速预览）。
    // 置 null 即恢复"按视频场景自动配色"。当前锁定 snowy_pine（v-3350 银蓝冬夜）。
    var WATCH_MOOD_OVERRIDE = "snowy_pine";
    function moodKeyForAsset(a) {
      if (WATCH_MOOD_OVERRIDE) return WATCH_MOOD_OVERRIDE;
      if (a && a.mood) return a.mood;
      return (a && a.scene_tags && a.scene_tags[0]) || "free";
    }
    var MOOD_KEYS = ["dusk_coast", "misty_wheat", "rainy_forest", "snowy_pine", "free", "gradient"];
    function setWatchMood(a) {
      var key = moodKeyForAsset(a);
      for (var mi = 0; mi < MOOD_KEYS.length; mi++) root.classList.remove("mood-" + MOOD_KEYS[mi]);
      root.classList.add("mood-" + key);
      if (star) {
        function readRGB(name, fb) {
          var raw = (getComputedStyle(root).getPropertyValue(name) || "").trim();
          var p = raw.split(",").map(function (n) { return parseInt(n, 10); });
          if (p.length === 3 && !isNaN(p[0])) return { r: p[0], g: p[1], b: p[2] };
          return fb;
        }
        star.setTint({
          star: readRGB("--mood-star", { r: 200, g: 214, b: 255 }),
          nebula: readRGB("--mood-nebula", { r: 56, g: 86, b: 146 }),
          mw: readRGB("--mood-mw", { r: 200, g: 214, b: 255 })
        });
      }
    }
    var cmtLabel = null, currentVideoId = null;
    // 漫游列表与首页/风景库同源（MOCK.library + MOCK.feedAssets）。下边的 sync 拉回真实生成视频。
    var items = unionLibraryFeed();

    function showEmpty() {
      stage.appendChild(UI.el("div", { class: "poster", style: "background:var(--surface-warm)" }));
      root.appendChild(UI.el("div", { class: "empty", style: "position:absolute;inset:0;margin:auto;height:fit-content" }, [
        UI.el("div", { class: "ic" }, UI.icon("info", 24)),
        UI.el("h3", { text: "这片风景暂时走远了" }),
        UI.el("p", { text: "换个心情，去首页挑一片？" }),
        UI.el("button", { class: "btn btn-ghost", type: "button", onclick: function () { window.App.navigate("#/"); } }, [UI.icon("home", 20), document.createTextNode("回到首页")])
      ]));
    }

    if (!items.length) { showEmpty(); return function () {}; }
    // 同主题分组 + 生成时间升序：用户先做 A 后做 B 的自然流。
    var grp = UI.assetGroup(items.find(function (a) { return a.video_id === id; }) || items[0]);
    items = items.filter(function (a) { return UI.assetGroup(a) === grp; })
      .sort(function (a, b) { return new Date(a.created_at || 0) - new Date(b.created_at || 0); });
    // 进入即预加载整组候选背景，组内切换零闪（加载视频时把适配的背景图也拉进缓存）
    // 程序化星空背景随场景切换，无需预加载图片
    var start = 0;
    for (var i = 0; i < items.length; i++) { if (items[i].video_id === id) { start = i; break; } }

    roam = UI.mountRoaming(stage, items, start, {
      interval: 15000,
      onActive: function (a) {
        bumpPlay(a.video_id);
        setWatchMood(a);
        renderBody(a);
        resetIdle(); // 切换视频时短暂显示控制条
      }
    });
    // 不再 setTimeout 显示 stage-hint——中央留给风景本身。
    buildPacer();
    buildControls();
    renderBody(roam.getActiveAsset());
    setWatchMood(roam.getActiveAsset());
    // 预热：拉一次后端 feed 同步 MOCK（不重算当前列表，保护 roam 稳定；下次进入自动含新视频）。
    syncBackendFeed();

    // ---- 控制 UI 自动隐藏（沉浸看风景，不被打扰） ----
    var idleTimer = null, UI_HIDDEN = false;
    function showHeroUI() { if (!UI_HIDDEN) return; UI_HIDDEN = false; hero.classList.remove("is-idle"); }
    function hideHeroUI() { if (UI_HIDDEN) return; UI_HIDDEN = true; hero.classList.add("is-idle"); }
    function startIdleTimer() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        var v = roam ? roam.getActive() : null;
        if (v && !v.paused) hideHeroUI();
      }, 3000);
    }
    function cancelIdle() { clearTimeout(idleTimer); showHeroUI(); }
    function resetIdle() { cancelIdle(); startIdleTimer(); }
    root.addEventListener("mousemove", resetIdle);
    root.addEventListener("touchstart", resetIdle);
    // 首次加载，视频自动播放 → 3s 后控制条淡出
    setTimeout(function () { var v = roam ? roam.getActive() : null; if (v && !v.paused) startIdleTimer(); }, 1000);

    function renderBody(a) {
      if (!a) return;
      wTitle.textContent = a.title || UI.sceneLabel(UI.assetGroup(a)) || "无题";
      wChips.innerHTML = "";
      wChips.appendChild(UI.el("span", { class: "source-chip " + (a.source === "library" ? "is-lib" : "is-mine"), text: a.source === "library" ? "官方库" : "我的生成" }));
      wChips.appendChild(UI.el("span", { class: "scene-chip", text: UI.sceneLabel(UI.assetGroup(a)) }));
      renderAuthor(a);
      renderStats(a);
      desc.textContent = UI.describe(a);
      loadComments(a);
    }

    function renderAuthor(a) {
      var isLib = a.source === "library";
      var aname = isLib ? "漫溯 · 官方库" : ((window.Auth && window.Auth.username) || "我");
      author.innerHTML = "";
      var avatar = UI.el("div", { class: "w-avatar", text: (aname.slice(0, 1) || "?").toUpperCase() });
      var info = UI.el("div", { class: "w-author-info" });
      info.appendChild(UI.el("div", { class: "w-author-name", text: aname }));
      info.appendChild(UI.el("div", { class: "w-author-sub", text: isLib ? "平台精选 · 官方制作" : "这片风景由你生成" }));
      var fk = "slowscape.follow." + (isLib ? "lib" : (window.Auth && window.Auth.username) || "me");
      var on = false; try { on = localStorage.getItem(fk) === "1"; } catch (e) {}
      var follow = UI.el("button", { class: "w-follow" + (on ? " is-on" : ""), type: "button", text: on ? "已关注" : (isLib ? "关注" : "收藏作者") });
      follow.addEventListener("click", function () {
        on = !on; try { localStorage.setItem(fk, on ? "1" : "0"); } catch (e) {}
        follow.classList.toggle("is-on", on);
        follow.textContent = on ? "已关注" : (isLib ? "关注" : "收藏作者");
      });
      author.appendChild(avatar); author.appendChild(info); author.appendChild(follow);
    }

    function renderStats(a) {
      stats.innerHTML = "";
      var metaBits = [];
      if (a.duration) metaBits.push(a.duration + " 秒");
      if (a.resolution) metaBits.push(a.resolution);
      if (a.created_at) { try { metaBits.push(new Date(a.created_at).toLocaleDateString("zh-CN")); } catch (e) {} }
      var metaLine = UI.el("div", { class: "w-meta-line", text: metaBits.join(" · ") });
      var heatRow = UI.el("div", { class: "w-heat" });
      heatRow.appendChild(UI.el("div", { class: "w-heat-item" }, [UI.icon("play", 18), UI.el("span", { text: "你看过 " + getPlay(a.video_id) + " 次" })]));
      cmtLabel = UI.el("span", { text: "0 评论" });
      heatRow.appendChild(UI.el("div", { class: "w-heat-item" }, [UI.icon("message-circle", 18), cmtLabel]));
      stats.appendChild(metaLine);
      stats.appendChild(heatRow);
    }

    function fmtTime(iso) {
      try {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        var diff = (Date.now() - d.getTime()) / 1000;
        if (diff < 60) return "刚刚";
        if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
        if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
        return d.toLocaleDateString("zh-CN");
      } catch (e) { return ""; }
    }

    function renderComment(c) {
      var item = UI.el("div", { class: "cd-item" });
      var avatar = UI.el("div", { class: "cd-avatar", text: ((c.username || "?").slice(0, 1) || "?").toUpperCase() });
      var bodyEl = UI.el("div", { class: "cd-body" });
      bodyEl.appendChild(UI.el("div", { class: "cd-meta" }, [
        UI.el("span", { class: "cd-name", text: c.username || "匿名" }),
        UI.el("span", { class: "cd-time", text: fmtTime(c.created_at) })
      ]));
      bodyEl.appendChild(UI.el("div", { class: "cd-text", text: c.content }));
      item.appendChild(avatar);
      item.appendChild(bodyEl);
      return item;
    }

    function updateTitleCount(n) {
      cdTitle.textContent = n > 0 ? "评论 " + n : "评论";
      if (cmtLabel) cmtLabel.textContent = n + " 评论";
    }

    function loadComments(a) {
      if (!a || !a.video_id) return;
      currentVideoId = a.video_id;
      cdList.innerHTML = "";
      cdList.appendChild(UI.el("div", { class: "cd-loading", text: "加载中…" }));
      window.API.comments(currentVideoId).then(function (list) {
        cdList.innerHTML = "";
        var arr = Array.isArray(list) ? list : [];
        if (!arr.length) {
          cdList.appendChild(UI.el("div", { class: "cd-empty", text: "还没有评论，来写第一条吧" }));
        } else {
          arr.forEach(function (c) { cdList.appendChild(renderComment(c)); });
        }
        updateTitleCount(arr.length);
        buildFoot();
      }).catch(function () {
        cdList.innerHTML = "";
        cdList.appendChild(UI.el("div", { class: "cd-empty", text: "评论加载失败，请稍后再试" }));
        buildFoot();
      });
    }

    function buildFoot() {
      cdFoot.innerHTML = "";
      var loggedIn = window.Auth && window.Auth.isLoggedIn && window.Auth.isLoggedIn();
      if (loggedIn) {
        var input = UI.el("input", { class: "cd-input", type: "text", placeholder: "说点什么…", "aria-label": "评论内容", maxlength: "500" });
        var send = UI.el("button", { class: "cd-send", type: "button", onclick: function () {
          var v = input.value.trim();
          if (!v) return;
          send.disabled = true;
          window.API.postComment(currentVideoId, v).then(function (d) {
            if (d && d.code === 0) {
              input.value = "";
              loadComments({ video_id: currentVideoId });
              UI.toast("评论已发布");
            } else {
              UI.toast((d && d.message) || "评论失败");
            }
            send.disabled = false;
          }).catch(function () { UI.toast("评论失败，请稍后再试"); send.disabled = false; });
        } }, [UI.icon("send", 18)]);
        cdFoot.appendChild(input);
        cdFoot.appendChild(send);
      } else {
        cdFoot.appendChild(UI.el("a", { class: "cd-login-hint", href: "#/login", text: "登录后参与评论" }));
      }
    }

    function buildPacer() {
      var orb = UI.el("div", { class: "orb" }, UI.el("div", { class: "inner" }));
      var phase = UI.el("div", { class: "phase", text: "吸气" });
      var count = UI.el("div", { class: "count", text: "4" });
      pacerAnchor.appendChild(orb); pacerAnchor.appendChild(phase); pacerAnchor.appendChild(count);
      pacer = UI.makePacer(orb, phase, count);
      // 默认关闭，由控制条"呼吸"按钮按需启动
    }
    function togglePacer(btn) {
      var running = pacerAnchor.classList.toggle("is-running");
      if (running) { if (pacer) pacer.start(); } else { if (pacer) pacer.stop(); }
      if (btn) btn.classList.toggle("is-on", running);
    }

    function buildControls() {
      function av() { return roam.getActive(); }
      function grp(btns) { var d = UI.el("div", { class: "ctrl-group" }); btns.forEach(function (b) { d.appendChild(b); }); return d; }
      var btnPlay = UI.ctrlButton("pause", function () { var v = av(); if (!v) return; if (v.paused) { v.play(); UI.setBtnIcon(btnPlay, "pause"); roam.resumeRoam(); startIdleTimer(); } else { v.pause(); UI.setBtnIcon(btnPlay, "play"); roam.pauseRoam(); cancelIdle(); } }, false, "ctrl-primary");
      var btnPrev = UI.ctrlButton("chevron-left", function () { roam.prev(); UI.setBtnIcon(btnPlay, "pause"); resetIdle(); });
      var btnNext = UI.ctrlButton("chevron-right", function () { roam.next(); UI.setBtnIcon(btnPlay, "pause"); resetIdle(); });
      var fa = roam.getActiveAsset(), fav0 = fa && MOCK.isFavorite(fa.video_id);
      var btnFav = UI.ctrlButton("heart", function () { var a = roam.getActiveAsset(); if (!a) return; MOCK.toggleFavorite(a); var f = MOCK.isFavorite(a.video_id); btnFav.classList.toggle("fav-on", f); UI.toast(f ? "已收进我的风景库" : "已移出收藏"); }, fav0);
      if (fav0) btnFav.classList.add("fav-on");
      var btnDl = UI.ctrlButton("download", function () { var a = roam.getActiveAsset(); if (!a || !a.master) return; var d = document.createElement("a"); d.href = a.master; d.download = (a.title || "slowscape") + ".mp4"; d.click(); UI.toast("视频下载中…"); resetIdle(); });
      var btnFs = UI.ctrlButton("maximize", function () { if (!document.fullscreenElement) { (root.requestFullscreen || root.webkitRequestFullscreen || function () {}).call(root); } else if (document.exitFullscreen) { document.exitFullscreen(); } });
      // 功能分组：[播放] | [上一张 下一张] | [点赞 下载] | [全屏]
      [grp([btnPlay]), grp([btnPrev, btnNext]), grp([btnFav, btnDl]), grp([btnFs])].forEach(function (g) { controls.appendChild(g); });
    }

    return function () { if (roam) roam.destroy(); if (pacer) pacer.stop(); if (star) star.destroy(); };
  };

  // ============================================================
  // 我的风景库
  // ============================================================
  window.Pages = window.Pages || {};
  window.Pages.mine = function (view) {
    view.innerHTML = "";
    var wrap = UI.el("div", { class: "section container" });
    wrap.appendChild(UI.el("div", { class: "section-head" }, [
      UI.el("h2", { class: "section-title", text: "我的风景库" }),
      UI.el("a", { class: "btn btn-ghost", href: "#/generate" }, [UI.icon("plus", 20), document.createTextNode("生成一片")])
    ]));
    var host = UI.el("div", { class: "bento", id: "mine-grid" });
    var pager = paginate(host, unionFavFeed, { step: 12, generated: true });
    function paint() {
      var olds = wrap.querySelectorAll(".empty");
      for (var i = 0; i < olds.length; i++) olds[i].remove();
      if (!wrap.contains(host)) wrap.appendChild(host);
      var all = pager.render();
      if (all.length === 0 && !wrap.querySelector(".empty")) wrap.appendChild(emptyState());
    }
    view.appendChild(wrap);
    paint();
    // 首次加载：从后端 feed 同步真实生成历史（其他途径生成的），结束后重绘。
    syncBackendFeed().then(paint);
    return function () {};
  };
  function unionFavFeed() {
    var favs = MOCK.favoriteAssets(), feed = MOCK.feedAssets(), seen = {}, out = [];
    favs.concat(feed).forEach(function (a) { if (!seen[a.video_id]) { seen[a.video_id] = 1; out.push(a); } });
    return out;
  }
  function emptyState() {
    return UI.el("div", { class: "empty" }, [
      UI.el("div", { class: "ic" }, UI.icon("image", 24)),
      UI.el("h3", { text: "还没有收藏的风景" }),
      UI.el("p", { text: "挑一片，先喘口气。生成或收藏后，它们会安静地待在这里。" }),
      UI.el("div", { class: "chips", style: "justify-content:center" }, [
        UI.el("a", { class: "btn btn-primary", href: "#/generate" }, [UI.icon("plus", 20), document.createTextNode("生成一片风景")]),
        UI.el("a", { class: "btn btn-ghost", href: "#/" }, [UI.icon("home", 20), document.createTextNode("去首页看看")])
      ])
    ]);
  }
})();
