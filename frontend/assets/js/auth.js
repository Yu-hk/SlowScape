/* =========================================================================
   漫溯 · auth.js
   认证客户端 + Token 管理 + 登录/注册页面函数。
   使用 Lucide 图标 + Token 颜色，无 emoji、无裸 hex。
   ========================================================================= */
(function () {
  "use strict";
  var UI = window.UI, API = window.API, Pages = window.Pages || {};
  var LS_TOKEN = "slowscape.token";
  var LS_USER = "slowscape.user";

  function token() { return localStorage.getItem(LS_TOKEN); }
  function saveToken(data) {
    if (data && data.token) { localStorage.setItem(LS_TOKEN, data.token); localStorage.setItem(LS_USER, JSON.stringify(data.user)); }
  }
  function clearToken() { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_USER); }
  var currentUser = (function () {
    try { var u = localStorage.getItem(LS_USER); return u ? JSON.parse(u) : null; } catch (e) { return null; }
  })();

  // 认证请求（自动带 token）
  function authReq(path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (currentUser) headers["Authorization"] = "Bearer " + token();
    return fetch("/api/v1/auth" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) { return r.json(); });
  }

  // 对外 API
  window.Auth = {
    token: token,
    currentUser: function () { return currentUser; },
    isLoggedIn: function () { return !!currentUser; },

    register: function (username, email, password) {
      return authReq("/register", { method: "POST", body: { username: username, email: email, password: password } }).then(function (d) {
        if (d.code === 0 && d.data) { saveToken(d.data); currentUser = d.data.user; return currentUser; }
        throw new Error(d.message || "注册失败");
      });
    },
    login: function (login, password) {
      return authReq("/login", { method: "POST", body: { login: login, password: password } }).then(function (d) {
        if (d.code === 0 && d.data) { saveToken(d.data); currentUser = d.data.user; updateNav(); return currentUser; }
        throw new Error(d.message || "账号或密码错误");
      });
    },
    logout: function () { clearToken(); currentUser = null; updateNav(); if (window.App) window.App.navigate("#/"); },
    me: function () { return authReq("/me"); },
  };

  // ---- 全局导航更新 ----
  var tabbar, userBtn;
  function updateNav() {
    if (!tabbar) { tabbar = document.getElementById("tabbar"); if (!tabbar) return; }
    if (!userBtn) return;
    if (currentUser) {
      userBtn.innerHTML = currentUser.username.slice(0, 4);
      userBtn.title = currentUser.email;
    } else {
      userBtn.innerHTML = UI.icon("log-in", 20).outerHTML;
      userBtn.title = "登录";
    }
  }
  setTimeout(function () {
    userBtn = document.getElementById("user-btn");
    if (userBtn) userBtn.addEventListener("click", function () {
      if (currentUser) { Auth.logout(); }
      else { window.App.navigate("#/login"); }
    });
  }, 200);

  // 登录/注册页左侧品牌语块（卡片靠右时填补左侧留白，窄屏自动隐藏）
  function buildAuthBrand() {
    var brand = UI.el("div", { class: "auth-brand" });
    brand.appendChild(UI.el("div", { class: "auth-brand__mark", text: "漫溯 · SlowScape" }));
    brand.appendChild(UI.el("h1", { class: "auth-brand__title", text: "把风景，慢慢看完" }));
    brand.appendChild(UI.el("p", { class: "auth-brand__sub", text: "用你的呼吸节奏，把一张照片长成一段缓慢流动的电影。" }));
    var feats = UI.el("ul", { class: "auth-brand__feats" });
    [
      ["舒缓生成", "由静到动，自然过渡，不抢眼"],
      ["素材常驻", "你生成的风景永久留在云上"],
      ["极简操作", "一句话，一片流动的风景"]
    ].forEach(function (f) {
      feats.appendChild(UI.el("li", {}, [
        UI.el("span", { class: "auth-brand__dot" }),
        UI.el("div", {}, [
          UI.el("strong", { text: f[0] }),
          UI.el("span", { class: "t-muted", text: f[1] })
        ])
      ]));
    });
    brand.appendChild(feats);
    return brand;
  }

  // ---- 登录页 ----
  Pages.login = function (view) {
    view.innerHTML = "";
    // 5 张纯自然极光照片做渐进式切画背景（仅极光/星空/雪山/枯树/雪原，无人迹/道路/建筑/灯塔）
    var bg = UI.el("div", { class: "auth-bg" });
    var IMG = [
      "/assets/img/aurora/aurora-3.jpg",
      "/assets/img/aurora/aurora-5.jpg",
      "/assets/img/aurora/aurora-2.jpg",
      "/assets/img/aurora/aurora-1.jpg",
      "/assets/img/aurora/aurora-4.jpg",
    ];
    // 创建 5 个 slide 层（第 1 个默认 opacity:1）
    var slides = IMG.map(function (url, i) {
      var s = UI.el("div", { class: "slide", style: "background-image:url('" + url + "')" + (i === 0 ? ";opacity:1" : "") });
      bg.appendChild(s);
      return s;
    });
    // 每 6s 切到下一张（2s transition + 4s 展示）
    var cur = 0;
    setInterval(function () {
      slides[cur].style.opacity = "0";
      cur = (cur + 1) % slides.length;
      slides[cur].style.opacity = "1";
    }, 6000);
    view.appendChild(bg);
    view.appendChild(buildAuthBrand());
    // 卡片（登录页靠右布局，用 auth-card--right 覆盖默认居中）
    var wrap = UI.el("div", { class: "quiet container auth-card auth-card--right" });
    wrap.appendChild(UI.el("h2", { text: "登录漫溯" }));
    wrap.appendChild(UI.el("p", { class: "t-muted", text: "用你的呼吸节奏，一起慢慢来。" }));
    var form = UI.el("form", { class: "form", novalidate: "" });
    var inpLogin = UI.el("input", { class: "field", type: "text", placeholder: "邮箱或用户名", autocomplete: "username", "aria-label": "邮箱或用户名" });
    var inpPass = UI.el("input", { class: "field", type: "password", placeholder: "密码", autocomplete: "current-password", "aria-label": "密码" });
    var err = UI.el("div", { class: "form-error" });
    var submitBtn = UI.el("button", { class: "btn btn-primary", type: "submit", style: "width:100%", text: "登录" });
    form.appendChild(inpLogin); form.appendChild(inpPass); form.appendChild(err); form.appendChild(submitBtn);
    form.appendChild(UI.el("div", { class: "form-foot", style: "text-align:center;margin-top:16px" }, [
      UI.el("a", { class: "link", href: "#/register", text: "还没有账号？注册" })
    ]));
    wrap.appendChild(form);
    // 卡片底部小呼吸点（去掉重复文案，只留视觉痕迹）
    wrap.appendChild(UI.el("div", { class: "auth-footer", style: "margin-top:32px;display:flex;justify-content:center;gap:6px" }, [
      UI.el("span", { style: "width:4px;height:4px;border-radius:50%;background:var(--fg-soft);opacity:0.3;animation:auth-dot 4s var(--ease-soft) infinite" }),
      UI.el("span", { style: "width:4px;height:4px;border-radius:50%;background:var(--fg-soft);opacity:0.5;animation:auth-dot 4s var(--ease-soft) infinite;animation-delay:0.6s" }),
      UI.el("span", { style: "width:4px;height:4px;border-radius:50%;background:var(--fg-soft);opacity:0.3;animation:auth-dot 4s var(--ease-soft) infinite;animation-delay:1.2s" })
    ]));
    view.appendChild(wrap);

    form.addEventListener("submit", function (e) {
      e.preventDefault(); err.textContent = ""; submitBtn.disabled = true;
      Auth.login(inpLogin.value.trim(), inpPass.value).then(function () {
        window.App.navigate("#/");
      }).catch(function (msg) {
        err.textContent = typeof msg === "string" ? msg : (msg.message || "登录失败");
        submitBtn.disabled = false;
      });
    });
    inpLogin.focus();
    return function () {};
  };

  // ---- 注册页 ----
  Pages.register = function (view) {
    view.innerHTML = "";
    var bg = UI.el("div", { class: "auth-bg" });
    var IMG = [
      "/assets/img/aurora/aurora-3.jpg",
      "/assets/img/aurora/aurora-5.jpg",
      "/assets/img/aurora/aurora-2.jpg",
      "/assets/img/aurora/aurora-1.jpg",
      "/assets/img/aurora/aurora-4.jpg",
    ];
    var slides = IMG.map(function (url, i) {
      var s = UI.el("div", { class: "slide", style: "background-image:url('" + url + "')" + (i === 0 ? ";opacity:1" : "") });
      bg.appendChild(s);
      return s;
    });
    var cur = 0;
    setInterval(function () { slides[cur].style.opacity = "0"; cur = (cur + 1) % slides.length; slides[cur].style.opacity = "1"; }, 6000);
    view.appendChild(bg);
    view.appendChild(buildAuthBrand());
    var wrap = UI.el("div", { class: "quiet container auth-card auth-card--right" });
    wrap.appendChild(UI.el("h2", { text: "加入漫溯" }));
    wrap.appendChild(UI.el("p", { class: "t-muted", text: "注册后，你的风景会永久留在这里。" }));
    var form = UI.el("form", { class: "form", novalidate: "" });
    var inpUser = UI.el("input", { class: "field", type: "text", placeholder: "用户名", autocomplete: "username", "aria-label": "用户名" });
    var inpEmail = UI.el("input", { class: "field", type: "email", placeholder: "邮箱", autocomplete: "email", "aria-label": "邮箱" });
    var inpPass = UI.el("input", { class: "field", type: "password", placeholder: "密码（至少 6 位）", autocomplete: "new-password", "aria-label": "密码" });
    var inpConfirm = UI.el("input", { class: "field", type: "password", placeholder: "再次输入密码", autocomplete: "new-password", "aria-label": "确认密码" });
    var err = UI.el("div", { class: "form-error" });
    var submitBtn = UI.el("button", { class: "btn btn-primary", type: "submit", style: "width:100%", text: "注册并进入" });
    form.appendChild(inpUser); form.appendChild(inpEmail); form.appendChild(inpPass); form.appendChild(inpConfirm); form.appendChild(err); form.appendChild(submitBtn);
    form.appendChild(UI.el("div", { class: "form-foot", style: "text-align:center;margin-top:16px" }, [
      UI.el("a", { class: "link", href: "#/login", text: "已有账号？登录" })
    ]));
    wrap.appendChild(form);
    wrap.appendChild(UI.el("div", { class: "auth-footer", style: "margin-top:32px;display:flex;justify-content:center;gap:6px" }, [
      UI.el("span", { style: "width:4px;height:4px;border-radius:50%;background:var(--fg-soft);opacity:0.3;animation:auth-dot 4s var(--ease-soft) infinite" }),
      UI.el("span", { style: "width:4px;height:4px;border-radius:50%;background:var(--fg-soft);opacity:0.5;animation:auth-dot 4s var(--ease-soft) infinite;animation-delay:0.6s" }),
      UI.el("span", { style: "width:4px;height:4px;border-radius:50%;background:var(--fg-soft);opacity:0.3;animation:auth-dot 4s var(--ease-soft) infinite;animation-delay:1.2s" })
    ]));
    view.appendChild(wrap);

    form.addEventListener("submit", function (e) {
      e.preventDefault(); err.textContent = ""; submitBtn.disabled = true;
      if (inpPass.value !== inpConfirm.value) {
        err.textContent = "两次输入的密码不一致";
        submitBtn.disabled = false;
        return;
      }
      Auth.register(inpUser.value.trim(), inpEmail.value.trim(), inpPass.value).then(function () {
        window.App.navigate("#/");
      }).catch(function (msg) {
        err.textContent = typeof msg === "string" ? msg : (msg.message || "注册失败");
        submitBtn.disabled = false;
      });
    });
    inpUser.focus();
    return function () {};
  };

  window.Pages = Pages;
})();
