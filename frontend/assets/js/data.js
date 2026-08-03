/* =========================================================================
   漫溯 · data.js
   Mock 数据层（Phase 3 前端原型，无后端时直接驱动 UI）。
   媒体源：Mixkit CC0 视频（已 curl 校验 206 可用）。
   视频资产三件套严格按 openapi.yaml：poster / preview / master。
   ========================================================================= */
(function () {
  "use strict";



  // ---- 媒体工厂：poster(720缩略图) · preview(360p) · master(1080p) ----
  function asset(id, scene, title, opts) {
    opts = opts || {};
    var base = "https://assets.mixkit.co/videos/" + id;
    return {
      video_id: "v-" + id,
      poster: base + "/" + id + "-thumb-720-0.jpg",
      preview: base + "/" + id + "-360.mp4",
      master: base + "/" + id + "-1080.mp4",
      duration: opts.duration || 12,
      width: 1920,
      height: 1080,
      resolution: "1080p",
      loop: true,
      scene_tags: [scene],
      mood: opts.mood || scene,
      title: title,
      source: opts.source || "library",
      created_at: opts.created_at || new Date(Date.now() - Math.floor(Math.random() * 86400000 * 20)).toISOString()
    };
  }

  // ---- 预生成舒缓库（首页 Bento / 空态精选） ----
  var library = [
    asset("529",  "rainy_forest", "雨后森林小径"),
    asset("1218", "rainy_forest", "林间薄雾漫过肩头"),
    asset("570",  "rainy_forest", "溪水漫过青苔石"),
    asset("572",  "rainy_forest", "雨后的针叶林"),
    asset("1082", "dusk_coast",   "黄昏的海岸线", { mood: "rainy_forest" }),
    asset("1114", "dusk_coast",   "退潮后安静的礁石"),
    asset("1013", "dusk_coast",   "海面初阳，浪很轻"),
    asset("3350", "snowy_pine",   "飘雪的松林"),
    asset("3317", "snowy_pine",   "雪落山脊"),
    asset("3335", "snowy_pine",   "静夜的雪原"),
    asset("1173", "misty_wheat",  "晨雾里的麦田"),
    asset("513",  "misty_wheat",  "风过整片草甸")
  ];

  // ---- 场景预设词库（生成页 chip，与 spec 名称一致） ----
  var presets = [
    { id: "forest_rain", name: "雨后森林小径", prompt: "雨后森林小径，水珠从叶尖滑落，光线柔和",   style_preset: "rainy_forest" },
    { id: "dusk_coast",  name: "黄昏的海岸线", prompt: "黄昏时分的海岸线，浪很轻，天色暖",         style_preset: "dusk_coast" },
    { id: "snowy_pine",  name: "飘雪的松林",   prompt: "飘雪的松林，雪落得很慢，安静",            style_preset: "snowy_pine" },
    { id: "misty_wheat", name: "晨雾里的麦田", prompt: "晨雾里的麦田，风很轻，光线朦胧",           style_preset: "misty_wheat" }
  ];

  // ---- 本地持久化：收藏 + 生成历史 ----
  var LS_FAV = "slowscape.favorites";
  var LS_FEED = "slowscape.feed";
  function load(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch (e) { return def; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var favorites = load(LS_FAV, []);   // [video_id]
  var feed = load(LS_FEED, []);       // [VideoAsset] 用户生成历史

  function isFavorite(id) { return favorites.indexOf(id) >= 0; }
  function toggleFavorite(a) {
    var i = favorites.indexOf(a.video_id);
    if (i >= 0) { favorites.splice(i, 1); }
    else {
      favorites.push(a.video_id);
      if (feed.indexOf(a.video_id) < 0) { feed.unshift(a); save(LS_FEED, feed); }
    }
    save(LS_FAV, favorites);
    return isFavorite(a.video_id);
  }
  function favoriteAssets() {
    // 收藏优先展示生成历史中的；库里的也纳入
    var byId = {};
    feed.concat(library).forEach(function (a) { byId[a.video_id] = a; });
    return favorites.map(function (id) { return byId[id]; }).filter(Boolean);
  }
  function feedAssets() { return feed.slice(); }
  // 后端生成成功后注入 SPA 视图（首页流 / 我的风景库），与 MOCK 路径一致
  function pushGenerated(a) {
    if (!a || !a.video_id) return;
    if (feed.indexOf(a.video_id) < 0) { feed.unshift(a); save(LS_FEED, feed); }
  }
  // 把 localStorage 中"后端没有"的过期项清掉，防旧会话/旧后端的孤儿视频污染前端视图
  function removeStaleFeed(backendIds) {
    var before = feed.length;
    feed = feed.filter(function (a) { return !!backendIds[a.video_id]; });
    if (feed.length !== before) save(LS_FEED, feed);
    return before - feed.length;
  }

  // ---- 异步生成引擎（mock 队列 + 阶段推进） ----
  var tasks = {};
  var listeners = {};      // task_id -> [cb]
  var anyListeners = [];    // 全局任务事件
  function emit(id) {
    var t = tasks[id];
    (listeners[id] || []).forEach(function (cb) { try { cb(t); } catch (e) {} });
    anyListeners.forEach(function (cb) { try { cb(t); } catch (e) {} });
  }
  function setTask(id, patch) {
    var t = tasks[id];
    if (!t) return;
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    t.updated_at = new Date().toISOString();
    emit(id);
  }
  function subscribe(id, cb) {
    (listeners[id] = listeners[id] || []).push(cb);
    return function () { listeners[id] = (listeners[id] || []).filter(function (c) { return c !== cb; }); };
  }
  function onAnyTask(cb) { anyListeners.push(cb); return function () { anyListeners = anyListeners.filter(function (c) { return c !== cb; }); }; }

  function buildGeneratedAsset(req, sceneKey) {
    // 按场景挑一个库内素材作为「生成结果」占位（真实由后端 Worker 产出）
    var pool = library.filter(function (a) { return a.scene_tags[0] === sceneKey; });
    var src = pool.length ? pool[Math.floor(Math.random() * pool.length)] : library[Math.floor(Math.random() * library.length)];
    var title = (req.prompt || "").trim().slice(0, 16) || "为你酝酿的风景";
    var copy = JSON.parse(JSON.stringify(src));
    copy.video_id = "v-gen-" + Math.random().toString(36).slice(2, 9);
    copy.title = title;
    copy._generated = true;
    copy.source = "generated";
    copy.created_at = new Date().toISOString();
    return copy;
  }

  function createGeneration(req) {
    var id = "task-" + Math.random().toString(36).slice(2, 10);
    var sceneKey = req.style_preset && req.style_preset !== "free" ? req.style_preset : pickSceneFromPrompt(req.prompt);
    var t = {
      task_id: id, status: "queued", prompt: req.prompt, stage: null,
      asset: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    tasks[id] = t;
    // 阶段词推进：构图 · 上色 · 起风（不显示百分比）
    setTimeout(function () { setTask(id, { status: "processing", stage: "构图" }); }, 1200);
    setTimeout(function () { setTask(id, { status: "processing", stage: "上色" }); }, 3600);
    setTimeout(function () { setTask(id, { status: "processing", stage: "起风" }); }, 6200);
    setTimeout(function () {
      var a = buildGeneratedAsset(req, sceneKey);
      feed.unshift(a); save(LS_FEED, feed);
      setTask(id, { status: "succeeded", stage: "完成", asset: a });
    }, 9000);
    return t;
  }

  function pickSceneFromPrompt(p) {
    p = (p || "");
    if (/雨|林|森|苔|竹/.test(p)) return "rainy_forest";
    if (/海|岸|浪|滩|洋/.test(p)) return "dusk_coast";
    if (/雪|松|霜/.test(p)) return "snowy_pine";
    if (/雾|麦|田|草|原|野/.test(p)) return "misty_wheat";
    return "misty_wheat";
  }

  function getTask(id) { return tasks[id] || null; }
  function hasActiveTask() {
    return Object.keys(tasks).some(function (k) { var s = tasks[k].status; return s === "queued" || s === "processing"; });
  }

  window.MOCK = {
    library: library,
    presets: presets,
    asset: asset,
    isFavorite: isFavorite,
    toggleFavorite: toggleFavorite,
    favoriteAssets: favoriteAssets,
    feedAssets: feedAssets,
    pushGenerated: pushGenerated,
    removeStaleFeed: removeStaleFeed,
    createGeneration: createGeneration,
    getTask: getTask,
    subscribe: subscribe,
    onAnyTask: onAnyTask,
    hasActiveTask: hasActiveTask
  };
})();
