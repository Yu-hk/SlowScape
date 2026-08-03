/* =========================================================================
   漫溯 · app.js
   启动器：主题管理、底部/侧边导航、hash 路由、全局「生成中」呼吸指示。
   ========================================================================= */
(function () {
  "use strict";
  var UI = window.UI, MOCK = window.MOCK, Pages = window.Pages;

  // ---------- 主题（mist 默认 / deep 夜间；watch 强制 deep） ----------
  var LS_THEME = "slowscape.theme";
  function getTheme() { return localStorage.getItem(LS_THEME) || "mist"; }
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); }
  function updateThemeBtn() {
    if (!themeBtn) return;
    var deep = getTheme() === "deep";
    themeBtn.innerHTML = ""; themeBtn.appendChild(UI.icon(deep ? "sun" : "moon", 20));
    themeBtn.setAttribute("aria-label", deep ? "切换到日间" : "切换到夜间");
  }
  function toggleTheme() {
    var t = getTheme() === "mist" ? "deep" : "mist";
    localStorage.setItem(LS_THEME, t); applyTheme(t); updateThemeBtn();
  }

  // ---------- 导航 ----------
  var NAV = [
    { route: "home", hash: "#/", label: "首页", icon: "home" },
    { route: "generate", hash: "#/generate", label: "生成", icon: "plus" },
    { route: "mine", hash: "#/mine", label: "风景库", icon: "heart" }
  ];
  var view, topbar, tabbar, themeBtn, breathInd, userBtn;

  function buildShell() {
    topbar = document.getElementById("topbar");
    tabbar = document.getElementById("tabbar");
    view = document.getElementById("view");

    var brand = UI.el("div", { class: "brand" }, [
      UI.el("span", { class: "zh", text: "漫溯" })
    ]);
    breathInd = UI.el("div", { class: "breath-indicator" }, [
      UI.el("span", { class: "dot" }), UI.el("span", { text: "生成中" })
    ]);
    themeBtn = UI.el("button", { class: "btn-icon", type: "button", onclick: toggleTheme, "aria-label": "切换主题" });
    userBtn = UI.el("button", { class: "btn-icon", type: "button", id: "user-btn", "aria-label": "用户" });
    userBtn.innerHTML = window.Auth && window.Auth.currentUser() ? UI.icon("log-out", 20).outerHTML : UI.icon("log-in", 20).outerHTML;
    var actions = UI.el("div", { class: "topbar-actions" }, [breathInd, themeBtn, userBtn]);
    topbar.appendChild(brand); topbar.appendChild(actions);

    NAV.forEach(function (n) {
      var tab = UI.el("a", { class: "tab", href: n.hash, "data-route": n.route }, [
        UI.icon(n.icon, 24), UI.el("span", { class: "lab", text: n.label })
      ]);
      tabbar.appendChild(tab);
    });
    updateThemeBtn();
  }

  function updateNav(routeName) {
    tabbar.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-route") === routeName);
    });
  }

  function updateBreath() {
    if (breathInd) breathInd.classList.toggle("active", MOCK.hasActiveTask());
  }

  // ---------- 路由 ----------
  window.App = {
    navigate: function (hash) { if (location.hash === hash) render(); else location.hash = hash; },
    setTheme: applyTheme, getTheme: getTheme
  };

  function parseHash() {
    var h = (location.hash || "").replace(/^#/, "") || "/";
    var parts = h.split("/");
    if (parts[1] === "watch" && parts[2]) return { name: "watch", id: decodeURIComponent(parts[2]) };
    if (parts[1] === "generate") return { name: "generate" };
    if (parts[1] === "mine") return { name: "mine" };
    if (parts[1] === "login") return { name: "login" };
    if (parts[1] === "register") return { name: "register" };
    if (parts[1] === "admin-login") return { name: "adminLogin" };
    if (parts[1] === "admin") return { name: "admin" };
    if (parts[1] === "admin-config") return { name: "adminConfig" };
    if (parts[1] === "admin-metrics") return { name: "adminMetrics" };
    return { name: "home" };
  }

  var current = null, watchTheme = null;
  // 登录/注册/管理员页面不显示 tabbar 和右上角按钮
  var AUTH_PAGES = { login: 1, register: 1, adminLogin: 1, admin: 1, adminConfig: 1, adminMetrics: 1 };
  function render() {
    var route = parseHash();
    // 已登录用户访问登录/注册 → 跳回首页
    if ((route.name === "login" || route.name === "register") && window.Auth && window.Auth.isLoggedIn()) {
      location.hash = "#/";
      return;
    }
    // watch 页需登录：未登录强制跳登录页（登录后可再进入）
    if (route.name === "watch" && window.Auth && !window.Auth.isLoggedIn()) {
      location.hash = "#/login";
      return;
    }
    if (current && current.cleanup) { try { current.cleanup(); } catch (e) {} }
    view.innerHTML = "";
    document.body.classList.remove("watch-mode");

    if (route.name !== "watch" && watchTheme) { applyTheme(watchTheme); watchTheme = null; updateThemeBtn(); }
    if (route.name === "watch") { document.body.classList.add("watch-mode"); watchTheme = getTheme(); applyTheme("deep"); updateThemeBtn(); }

    // 登录/注册页隐藏 tabbar 和右上角按钮 + body 锁滚动
    // 注意：classList.toggle(token, force) 当 force 为 undefined 时会走「切换」语义（不是「强制移除」），
    // 必须用 !! 转成真正布尔，否则非 auth 页（generate/mine/home）会让 is-auth 在前置状态间翻转，
    // 导致偶发把 body.is-auth 挂上 → overflow:hidden 吞掉整页滚动条。
    var isAuth = !!AUTH_PAGES[route.name];
    if (tabbar) tabbar.style.display = isAuth ? "none" : "";
    if (themeBtn) themeBtn.style.visibility = isAuth ? "hidden" : "";
    if (userBtn) userBtn.style.visibility = isAuth ? "hidden" : "";
    document.body.classList.toggle("is-auth", isAuth);

    var cleanup = Pages[route.name] ? Pages[route.name](view, route) : null;
    current = { cleanup: cleanup || null };
    updateNav(route.name);
  }

  // ---------- 启动 ----------
  function boot() {
    buildShell();
    applyTheme(getTheme());
    updateBreath();
    MOCK.onAnyTask(updateBreath);
    window.addEventListener("hashchange", render);
    // 默认页：已登录 → 首页；未登录 → 登录页
    var authed = window.Auth && window.Auth.isLoggedIn();
    if (!location.hash || location.hash === "#" || location.hash === "#/") {
      location.hash = authed ? "#/" : "#/login";
    } else if (!authed && (location.hash === "#/login" || location.hash === "#/register")) {
      // 未登录用户访问登录/注册 → 没问题，让他们继续
    }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
