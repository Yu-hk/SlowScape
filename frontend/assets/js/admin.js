/* =========================================================================
   漫溯 · admin.js
   管理后台页面 — prompt 配置管理，需要 admin token。
   ========================================================================= */
(function () {
  "use strict";
  var UI = window.UI, Pages = window.Pages;
  var API_BASE = "";

  // ---- 管理后台登录页 ----
  Pages.adminLogin = function (view) {
    view.innerHTML = "";
    view.appendChild(UI.el("div", { class: "auth-bg" }));
    var wrap = UI.el("div", { class: "quiet container auth-card" });
    wrap.appendChild(UI.el("h2", { text: "管理后台" }));
    wrap.appendChild(UI.el("p", { class: "t-muted", text: "管理员专用通道" }));
    var form = UI.el("form", { class: "form", novalidate: "" });
    var inpUser = UI.el("input", { class: "field", type: "text", placeholder: "管理员账号", autocomplete: "username", "aria-label": "管理员账号" });
    var inpPass = UI.el("input", { class: "field", type: "password", placeholder: "密码", autocomplete: "current-password", "aria-label": "密码" });
    var err = UI.el("div", { class: "form-error" });
    var btn = UI.el("button", { class: "btn btn-primary", type: "submit", style: "width:100%", text: "登录管理后台" });
    form.appendChild(inpUser); form.appendChild(inpPass); form.appendChild(err); form.appendChild(btn);
    wrap.appendChild(form);
    view.appendChild(wrap);
    inpUser.focus();

    function storeToken(token, username) {
      try { localStorage.setItem("ss_admin_token", token); localStorage.setItem("ss_admin_user", username); } catch (e) {}
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault(); err.textContent = ""; btn.disabled = true;
      var xhr = new XMLHttpRequest();
      xhr.open("POST", API_BASE + "/api/v1/admin/login");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onload = function () {
        btn.disabled = false;
        var resp = JSON.parse(xhr.responseText);
        if (resp.code === 0 && resp.data && resp.data.token) {
          storeToken(resp.data.token, resp.data.username);
          window.App.navigate("#/admin");
        } else {
          err.textContent = "管理员账号或密码错误";
        }
      };
      xhr.onerror = function () { btn.disabled = false; err.textContent = "网络错误"; };
      xhr.send(JSON.stringify({ username: inpUser.value.trim(), password: inpPass.value }));
    });
    return function () {};
  };

  // ---- 管理后台首页 —— 配置管理 ----
  Pages.admin = function (view) {
    view.innerHTML = "";
    // 检查 token
    var token = null;
    try { token = localStorage.getItem("ss_admin_token"); } catch (e) {}
    if (!token) { window.App.navigate("#/admin-login"); return function () {}; }

    // 布局
    var wrap = UI.el("div", { class: "section container", style: "max-width:900px;margin:0 auto;padding:24px 16px" });
    var head = UI.el("div", { class: "section-head", style: "margin-bottom:20px" }, [
      UI.el("h2", { class: "section-title", text: "管理后台" }),
      UI.el("div", { style: "display:flex;gap:8px;align-items:center" }, [
        UI.el("span", { class: "t-muted", text: (function () { try { return localStorage.getItem("ss_admin_user") || ""; } catch(e) { return ""; } })() }),
        UI.el("a", { class: "btn btn-ghost", href: "#/admin-metrics", style: "font-size:var(--fs-sm);padding:4px 10px", text: "监控" }),
        UI.el("a", { class: "btn btn-ghost", href: "#/admin-config", style: "font-size:var(--fs-sm);padding:4px 10px", text: "配置" }),
        UI.el("button", { class: "btn btn-ghost", type: "button", style: "font-size:var(--fs-sm);padding:4px 10px", onclick: function () {
          try { localStorage.removeItem("ss_admin_token"); localStorage.removeItem("ss_admin_user"); } catch(e) {}
          window.App.navigate("#/admin-login");
        }, text: "退出" })
      ])
    ]);
    wrap.appendChild(head);

    // 仪表盘总览
    var dashboard = UI.el("div", { id: "admin-dashboard", style: "margin-bottom:24px" });
    wrap.appendChild(dashboard);
    view.appendChild(wrap);

    loadDashboard(token, dashboard);
    return function () {};
  };

  function loadDashboard(token, container) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", API_BASE + "/api/v1/admin/config");
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.onload = function () {
      var resp = JSON.parse(xhr.responseText);
      if (resp.code !== 0) { container.innerHTML = "<p class='t-muted'>加载失败</p>"; return; }
      var keys = Object.keys(resp.data || {});
      var card = UI.el("div", { style: "background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:20px" });
      card.innerHTML = "<p style='margin:0'><strong>" + keys.length + "</strong> 条运行时配置 · 进入<strong>配置</strong>管理 · <strong>监控</strong>查看系统指标</p>";
      container.appendChild(card);
    };
    xhr.onerror = function () { container.innerHTML = "<p class='t-muted'>网络错误</p>"; };
    xhr.send();
  }

  // ---- 配置管理页 ----
  Pages.adminConfig = function (view) {
    view.innerHTML = "";
    var token = getToken();
    if (!token) { window.App.navigate("#/admin-login"); return function () {}; }

    var wrap = UI.el("div", { class: "section container", style: "max-width:800px;margin:0 auto;padding:24px 16px" });
    wrap.appendChild(UI.el("div", { class: "section-head", style: "margin-bottom:20px" }, [
      UI.el("h2", { class: "section-title", text: "配置管理" }),
      UI.el("a", { class: "btn btn-ghost", href: "#/admin", text: "← 返回" })
    ]));
    var table = UI.el("div", { class: "config-table" });
    wrap.appendChild(table);
    view.appendChild(wrap);
    loadConfig(token, table);
    return function () {};
  };

  function getToken() {
    try { return localStorage.getItem("ss_admin_token"); } catch(e) { return null; }
  }

  // ---- 监控面板页 ----
  Pages.adminMetrics = function (view) {
    view.innerHTML = "";
    var token = getToken();
    if (!token) { window.App.navigate("#/admin-login"); return function () {}; }

    var wrap = UI.el("div", { class: "section container", style: "max-width:900px;margin:0 auto;padding:24px 16px" });
    var head = UI.el("div", { class: "section-head", style: "margin-bottom:20px" }, [
      UI.el("h2", { class: "section-title", text: "系统监控" }),
      UI.el("div", { style: "display:flex;gap:8px;align-items:center" }, [
        UI.el("a", { class: "btn btn-ghost", href: "#/admin", text: "← 返回" }),
        UI.el("button", { class: "btn btn-ghost", type: "button", onclick: function () { reloadMetrics(token, content); location.hash = "#"; setTimeout(function () { location.hash = "#/admin-metrics"; }, 50); }, text: "刷新" })
      ])
    ]);
    wrap.appendChild(head);
    var content = UI.el("div", { id: "metrics-content" });
    wrap.appendChild(content);
    view.appendChild(wrap);
    loadMetrics(token, content);
    return function () {};
  };

  function loadMetrics(token, container) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", API_BASE + "/api/v1/admin/metrics");
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.onload = function () {
      var resp = JSON.parse(xhr.responseText);
      if (resp.code !== 0) { container.innerHTML = "<p class='t-muted'>加载失败</p>"; return; }
      var m = resp.data || {};
      renderMetrics(container, m);
    };
    xhr.onerror = function () { container.innerHTML = "<p class='t-muted'>网络错误</p>"; };
    xhr.send();
  }

  function renderMetrics(container, m) {
    var html = "";
    // 概览卡片
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px">';
    var cards = [
      { label: "总请求", val: m.total_requests },
      { label: "错误率", val: m.error_rate },
      { label: "平均延时", val: m.avg_latency_ms + "ms" },
      { label: "P50", val: (m.global_p50_ms || "-") + "ms" },
      { label: "P95", val: (m.global_p95_ms || "-") + "ms" },
      { label: "P99", val: (m.global_p99_ms || "-") + "ms" }
    ];
    cards.forEach(function (c) {
      html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;text-align:center">';
      html += '<div style="font-size:var(--fs-xs);color:var(--fg-soft)">' + c.label + '</div>';
      html += '<div style="font-size:18px;font-weight:600;margin-top:4px">' + c.val + '</div></div>';
    });
    html += '</div>';

    // 生成任务
    var t = m.generation_tasks || {};
    html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">';
    html += '<h3 style="margin:0 0 12px 0;font-size:14px">生成任务统计</h3>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">';
    html += '<tr><td style="padding:4px 8px">总计</td><td style="padding:4px 8px;font-weight:600">' + (t.total || 0) + '</td></tr>';
    html += '<tr><td style="padding:4px 8px">成功</td><td style="padding:4px 8px;color:var(--success)">' + (t.succeeded || 0) + '</td></tr>';
    html += '<tr><td style="padding:4px 8px">失败</td><td style="padding:4px 8px;color:var(--danger)">' + (t.failed || 0) + '</td></tr>';
    html += '<tr><td style="padding:4px 8px">Mock 回退</td><td style="padding:4px 8px;color:var(--warn)">' + (t.mocked || 0) + '</td></tr>';
    html += '<tr><td style="padding:4px 8px">成功率</td><td style="padding:4px 8px;font-weight:600">' + (t.success_rate || "0%") + '</td></tr>';
    html += '</table></div>';

    // 上游健康
    var u = m.upstream || {};
    html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">';
    html += '<h3 style="margin:0 0 12px 0;font-size:14px">上游服务</h3>';
    html += '<div style="font-size:var(--fs-sm)"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (u.dashscope === "healthy" ? "var(--success)" : "var(--warn)") + ';margin-right:6px"></span> DashScope: ' + (u.dashscope || "unknown") + '</div>';
    html += '</div>';

    // 大模型调用
    var llm = m.llm_models || [];
    if (llm.length > 0) {
      html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">';
      html += '<h3 style="margin:0 0 12px 0;font-size:14px">大模型调用明细</h3>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">';
      html += '<tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:4px 8px">模型</th><th style="text-align:right;padding:4px 8px">调用</th><th style="text-align:right;padding:4px 8px">成功</th><th style="text-align:right;padding:4px 8px">失败</th><th style="text-align:right;padding:4px 8px">平均ms</th><th style="text-align:right;padding:4px 8px">成本¥</th></tr>';
      llm.forEach(function (m) {
        var errs = m.error_breakdown || {};
        var errHtml = Object.keys(errs).map(function (k) { return k + "=" + errs[k]; }).join(" ");
        html += '<tr><td style="padding:4px 8px;font-family:var(--font-mono);font-size:11px">' + (m.model || "?") + '</td>';
        html += '<td style="padding:4px 8px;text-align:right">' + m.calls + '</td>';
        html += '<td style="padding:4px 8px;text-align:right;color:var(--success)">' + m.succeeded + '</td>';
        html += '<td style="padding:4px 8px;text-align:right;' + (m.failed > 0 ? 'color:var(--danger)' : '') + '">' + m.failed + (errHtml ? '<br><span style="font-size:10px;color:var(--fg-soft)">' + errHtml + '</span>' : '') + '</td>';
        html += '<td style="padding:4px 8px;text-align:right">' + m.avg_latency_ms + '</td>';
        html += '<td style="padding:4px 8px;text-align:right;font-weight:600">¥' + m.estimated_cost_yuan + '</td></tr>';
      });
      html += '</table>';
      html += '<div style="font-size:10px;color:var(--fg-soft);margin-top:8px">Token: ' + llm.reduce(function (s, m) { return s + m.total_input_tokens + m.total_output_tokens; }, 0) + ' | 错误分布按模型展开</div>';
      html += '</div>';
    }

    // 按路径
    var paths = m.paths || [];
    if (paths.length > 0) {
      html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px">';
      html += '<h3 style="margin:0 0 12px 0;font-size:14px">接口排行</h3>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm)">';
      html += '<tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:4px 8px">路径</th><th style="text-align:right;padding:4px 8px">次数</th><th style="text-align:right;padding:4px 8px">错误</th><th style="text-align:right;padding:4px 8px">平均ms</th><th style="text-align:right;padding:4px 8px">P50</th></tr>';
      paths.forEach(function (p) {
        html += '<tr><td style="padding:4px 8px;font-family:var(--font-mono);font-size:11px;word-break:break-all">' + p.path + '</td>';
        html += '<td style="padding:4px 8px;text-align:right">' + p.count + '</td>';
        html += '<td style="padding:4px 8px;text-align:right;' + (p.errors > 0 ? 'color:var(--danger)' : '') + '">' + p.errors + '</td>';
        html += '<td style="padding:4px 8px;text-align:right">' + (p.avg_ms || "-") + '</td>';
        html += '<td style="padding:4px 8px;text-align:right">' + (p.p50_ms || "-") + 'ms</td></tr>';
      });
      html += '</table></div>';
    }

    container.innerHTML = html;
  }

  function loadConfig(token, container) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", API_BASE + "/api/v1/admin/config");
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.onload = function () {
      var resp = JSON.parse(xhr.responseText);
      if (resp.code !== 0) {
        container.innerHTML = "<p class='t-muted'>加载失败，请重新登录</p>";
        return;
      }
      var configs = resp.data || {};
      var keys = Object.keys(configs);
      container.innerHTML = "<p class='t-muted' style='margin-bottom:12px'>共 " + keys.length + " 条配置，编辑后自动保存</p>";

      keys.forEach(function (key) {
        var val = configs[key] || "";
        var row = UI.el("div", { class: "config-row", style: "background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:8px" });

        var keyEl = UI.el("div", { style: "font-size:var(--fs-sm);font-family:var(--font-mono);color:var(--accent);margin-bottom:4px;word-break:break-all", text: key });

        var editRow = UI.el("div", { style: "display:flex;gap:8px" });
        var input = UI.el("input", { class: "field", type: "text", style: "flex:1;padding:6px 10px;font-size:var(--fs-sm)", value: val });
        var saveBtn = UI.el("button", { class: "btn btn-primary", type: "button", style: "padding:6px 12px;font-size:var(--fs-sm)", text: "保存" });
        var status = UI.el("span", { style: "font-size:var(--fs-xs);margin-left:8px" });

        saveBtn.addEventListener("click", function () {
          saveBtn.disabled = true; status.textContent = "保存中...";
          var put = new XMLHttpRequest();
          put.open("PUT", API_BASE + "/api/v1/admin/config/" + encodeURIComponent(key));
          put.setRequestHeader("Content-Type", "application/json");
          put.setRequestHeader("Authorization", "Bearer " + token);
          put.onload = function () {
            saveBtn.disabled = false;
            var r = JSON.parse(put.responseText);
            if (r.code === 0) { status.textContent = "✓ 已保存"; setTimeout(function () { status.textContent = ""; }, 2000); }
            else { status.textContent = "保存失败: " + (r.message || ""); }
          };
          put.onerror = function () { saveBtn.disabled = false; status.textContent = "网络错误"; };
          put.send(JSON.stringify({ value: input.value }));
        });

        editRow.appendChild(input); editRow.appendChild(saveBtn); editRow.appendChild(status);
        row.appendChild(keyEl); row.appendChild(editRow);
        container.appendChild(row);
      });
    };
    xhr.onerror = function () { container.innerHTML = "<p class='t-muted'>网络错误</p>"; };
    xhr.send();
  }
})();
