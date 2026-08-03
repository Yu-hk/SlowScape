// api.js — 后端 API 客户端。后端不可达时回退到 window.MOCK（前端自带 mock 引擎）。
// 路径相对当前 origin，配合后端静态托管可单端口运行，无需跨域。
(function () {
  "use strict";
  var API_BASE = (window.SLOWSCAPE_API_BASE || "/api/v1/videos");

  function req(path, opts) {
    opts = opts || {};
    return fetch(API_BASE + path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) { return r.json(); });
  }

  function dataOf(d) { return d && d.code === 0 ? d.data : null; }
  function mockLib() { return window.MOCK ? window.MOCK.library : []; }
  function mockFeed() { return window.MOCK ? window.MOCK.feedAssets() : []; }
  function findMock(id) {
    if (!window.MOCK) return null;
    return mockFeed().concat(window.MOCK.library).find(function (a) { return a.video_id === id; }) || null;
  }

  // 预生成库；失败回退 MOCK.library
  function library(params) {
    params = params || {};
    var q = [];
    if (params.scene) q.push("scene=" + encodeURIComponent(params.scene));
    if (params.page) q.push("page=" + params.page);
    if (params.limit) q.push("limit=" + params.limit);
    var qs = q.length ? "?" + q.join("&") : "";
    return req("/library" + qs).then(function (d) {
      var data = dataOf(d);
      if (data && data.items) return data.items;
      return mockLib();
    }).catch(function () { return mockLib(); });
  }

  // 我的风景（生成历史）；失败回退 MOCK.feedAssets
  function feed() {
    return req("/feed").then(function (d) {
      var data = dataOf(d);
      if (data && data.items) return data.items;
      return mockFeed();
    }).catch(function () { return mockFeed(); });
  }

  // 生成：后端返回 {task_id, status}，失败回退 MOCK.createGeneration
  function generate(body) {
    return req("/generate", { method: "POST", body: body }).then(function (d) {
      var data = dataOf(d);
      if (data && data.task_id) return { backend: true, task_id: data.task_id };
      throw new Error("no task_id");
    }).catch(function () {
      if (window.MOCK) {
        var t = window.MOCK.createGeneration(body);
        return { backend: false, task: t };
      }
      throw new Error("generate unavailable");
    });
  }

  function getTask(id) {
    return req("/tasks/" + encodeURIComponent(id)).then(function (d) { return dataOf(d); })
      .catch(function () { return window.MOCK ? window.MOCK.getTask(id) : null; });
  }

  function getVideo(id) {
    return req("/" + encodeURIComponent(id)).then(function (d) {
      var v = dataOf(d); if (v) return v;
      return findMock(id);
    }).catch(function () { return findMock(id); });
  }

  // 评论区（真实后端，需登录态带 token）
  function comments(videoId) {
    return req("/" + encodeURIComponent(videoId) + "/comments").then(function (d) {
      if (d && d.code === 0 && Array.isArray(d.data)) return d.data;
      return [];
    }).catch(function () { return []; });
  }
  function postComment(videoId, content) {
    var token = (window.Auth && window.Auth.token && window.Auth.token()) || "";
    return fetch(API_BASE + "/" + encodeURIComponent(videoId) + "/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ content: content })
    }).then(function (r) { return r.json(); });
  }

  // 场景预设词库；失败回退 MOCK.presets（与 spec 四个预设一致）
  function mockPresets() { return window.MOCK ? window.MOCK.presets : []; }
  function getPresets() {
    return req("/presets").then(function (d) {
      var data = dataOf(d);
      if (data && data.presets && data.presets.length) return { presets: data.presets };
      return { presets: mockPresets() };
    }).catch(function () { return { presets: mockPresets() }; });
  }

  // 生成：后端返回 {task_id, status}（openapi GenerateAccept），失败回退 MOCK.createGeneration
  // 返回统一形态 { task_id, backend }，供 pages.js 订阅/轮询。
  function createGeneration(payload) {
    return req("/generate", { method: "POST", body: payload }).then(function (d) {
      var data = dataOf(d);
      if (data && data.task_id) return { task_id: data.task_id, backend: true };
      throw new Error("no task_id");
    }).catch(function () {
      if (window.MOCK) {
        var t = window.MOCK.createGeneration(payload);
        return { task_id: t.task_id, backend: false };
      }
      throw new Error("generate unavailable");
    });
  }

  // r2v 选图预览：POST /suggest-references，返回 AI 挑选的参考图 + 过渡 prompt
  function suggestReferences(prompt) {
    return req("/suggest-references", { method: "POST", body: { prompt: prompt || "" } }).then(function (d) {
      var data = dataOf(d);
      if (data) return data;
      return mockSuggest(prompt);
    }).catch(function () { return mockSuggest(prompt); });
  }
  function mockSuggest(prompt) {
    return { references: [], suggested_prompt: prompt || "", strategy: "mock", reason: "前端 mock 模式" };
  }

  window.API = {
    library: library, feed: feed, generate: generate,
    getTask: getTask, getVideo: getVideo,
    getPresets: getPresets, createGeneration: createGeneration,
    suggestReferences: suggestReferences,
    comments: comments, postComment: postComment,
    base: API_BASE,
  };
})();
