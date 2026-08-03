# 参考图自动选择 · 前端对接说明（r2v）

> 适用版本：后端 `slowscape-backend-1.0.0-SNAPSHOT`（含 `ReferenceSelectorService` + `POST /api/v1/videos/suggest-references`）
> 目标：让用户在生成 r2v 视频前，**先看到 AI 为你挑了哪两张参考图、可确认/可改**，再提交生成。

---

## 1. 背景与链路

后端已支持 r2v 模式的参考图自动选择：

- `ReferenceSelectorService` 按「用户给图 ≥2 → 尊重选择；给 1 张 + prompt → 向量搜互补景；给 0 张 → 自动挑起止」逐级降级。
- `POST /api/v1/videos/generate` 时，若模型为 `happyhorse-r2v` 且用户未提供 ≥2 张参考图、且开关 `feature.r2v.auto-select=true`（默认开），后端会**自动**补全参考图再生成。
- 但「自动」对用户是黑盒。新增 `suggest-references` 预览接口，让前端把这一步**可视化、可确认**。

前端当前状态（`pages.js` 的 `generate` 页）：用 `UI.refPicker({max:2})` 让用户**手动**选参考图，`startGenerate` 取 `rp.get()` 或 `rp.fallback()`，再调 `API.createGeneration({..., references: refs})`。**`api.js` 已实现 `suggestReferences(prompt)`（含 mock 回退），并在 `generate` 页接入「AI 帮我挑参考图」按钮 + 预览卡（`UI.refPicker.set()` 回填）。**

---

## 2. 后端接口契约：`suggest-references`

```
POST /api/v1/videos/suggest-references
Content-Type: application/json
```

**请求体**

```json
{
  "prompt": "雪地营地的清晨，缓缓过渡到绿意盎然的溪流山谷",
  "references": []
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `prompt` | 是 | 生成描述。用于向量语义匹配库内最像的过渡景 |
| `references` | 否 | 用户已手动选的图 URL 数组。传了且 ≥2 张，后端直接尊重，不再自动选 |

**响应**（统一 envelope `{ code, message, data }`，`code=0` 成功）

```json
{
  "code": 0,
  "message": "",
  "data": {
    "start": "https://assets.mixkit.co/videos/3350/3350-thumb-720-0.jpg",
    "end":   "https://assets.mixkit.co/videos/1082/1082-thumb-720-0.jpg",
    "references": [
      "https://assets.mixkit.co/videos/3350/3350-thumb-720-0.jpg",
      "https://assets.mixkit.co/videos/1082/1082-thumb-720-0.jpg"
    ],
    "strategy": "embedding",
    "reason": "基于素材库挑选起始景与互补过渡景，让画面在参考图之间自然演变",
    "suggested_prompt": "雪地营地的清晨，缓缓过渡到绿意盎然的溪流山谷，整段过程是同一景的有机自然演变，光影与季节缓缓流转，柔和连续、不做突兀切换，画面在参考图之间缓缓自然过渡、同一景有机生长"
  }
}
```

**字段说明**

| 字段 | 含义 | 前端用法 |
|------|------|----------|
| `references` | AI 推荐用作 r2v 的两张参考图（顺序：起始 → 过渡） | 直接当作 `createGeneration.references` 的值 |
| `suggested_prompt` | 在原 prompt 上追加了「同一景有机生长、缓缓过渡」后缀 | 建议作为最终生成 prompt（用户可再编辑） |
| `strategy` | `embedding`=向量语义精准匹配（已配置向量 Key）；`fallback`=向量不可用退化为互补/随机 | 用于预览卡上的小提示文案 |
| `reason` | 选择理由的一句话 | 预览卡副文案 |
| `start` / `end` | 同 `references[0]` / `references[1]`，便于直接取用 | 预览图展示 |

---

## 3. 前端改动点

### 3.1 `assets/js/api.js` — 新增 `suggestReferences`

在 `window.API` 暴露对象里加一个方法（与 `generate` / `createGeneration` 同级），复用现有 `req` / `dataOf` 封装：

```js
// 参考图预览：AI 根据用户 prompt 从素材库挑选 r2v 起始/过渡图
function suggestReferences(body) {
  return req("/suggest-references", { method: "POST", body: body }).then(function (d) {
    var data = dataOf(d);
    if (data && data.references && data.references.length) return data;
    return null;
  }).catch(function () { return null; });
}

window.API = {
  library: library, feed: feed, generate: generate,
  getTask: getTask, getVideo: getVideo,
  getPresets: getPresets, createGeneration: createGeneration,
  suggestReferences: suggestReferences,   // ← 新增
  base: API_BASE,
};
```

### 3.2 `assets/js/pages.js` — generate 页接入「AI 选图预览」

现在 `generate` 页（约第 76–180 行）的提交区是：

```js
var rp = UI.refPicker({ max: 2 });
form.appendChild(rp.el); form.appendChild(submitZone);
// ...
function startGenerate(prompt) {
  var refs = rp.get(); if (!refs.length) refs = rp.fallback();
  // ...
  API.createGeneration({ prompt: prompt, duration: 10, resolution: "720p", aspect_ratio: "16:9", references: refs })
}
```

在 `submitZone` 里「生成一片风景」按钮**旁边**加一个「AI 帮我挑参考图」按钮，调 `API.suggestReferences` 把结果回填到 `refPicker` 并展示预览卡：

```js
// —— 新增：AI 选图按钮 + 预览区 ——
var aiBtn = UI.el("button", { class: "btn btn-ghost", type: "button" }, [
  UI.icon("sparkles", 20), document.createTextNode("AI 帮我挑参考图")
]);
submitZone.insertBefore(aiBtn, btn);

var previewZone = UI.el("div", { class: "ref-preview hidden" });
wrap.appendChild(previewZone);

aiBtn.addEventListener("click", function () {
  var prompt = (ta.value || "").trim();
  if (!prompt) { ta.focus(); return; }
  aiBtn.disabled = true; aiBtn.textContent = "正在挑选…";
  API.suggestReferences({ prompt: prompt, references: rp.get() }).then(function (res) {
    aiBtn.disabled = false;
    aiBtn.textContent = "";
    aiBtn.appendChild(UI.icon("sparkles", 20));
    aiBtn.appendChild(document.createTextNode("AI 帮我挑参考图"));
    if (!res) { previewZone.classList.add("hidden"); return; }

    // 回填 refPicker（若 refPicker 暂无 set 方法，按下方备注补一个）
    if (typeof rp.set === "function") rp.set(res.references);

    // 展示预览卡
    previewZone.innerHTML = "";
    previewZone.appendChild(UI.el("div", {
      class: "ref-preview-title",
      text: res.strategy === "embedding" ? "AI 按语义为你挑了这两张" : "AI 为你挑了这两张"
    }));
    var imgs = UI.el("div", { class: "ref-preview-imgs" });
    res.references.forEach(function (u, i) {
      imgs.appendChild(UI.el("div", { class: "ref-preview-item" }, [
        UI.el("img", { src: u, alt: i === 0 ? "起始" : "过渡" }),
        UI.el("span", { class: "ref-preview-tag", text: i === 0 ? "起始" : "过渡" })
      ]));
    });
    previewZone.appendChild(imgs);
    previewZone.appendChild(UI.el("p", { class: "ref-preview-note", text: res.reason || "" }));
    previewZone.classList.remove("hidden");

    // 用 AI 建议的 prompt 覆盖（用户可在文本框继续编辑）
    ta.value = res.suggested_prompt; syncCount(); syncBtn();
  }).catch(function () {
    aiBtn.disabled = false;
    aiBtn.textContent = "";
    aiBtn.appendChild(UI.icon("sparkles", 20));
    aiBtn.appendChild(document.createTextNode("AI 帮我挑参考图"));
  });
});
```

**备注**
- 图标使用项目图标库实际存在的 `image`（`assets/js/icons.js` 中已定义）；不要使用 `sparkles` 等不存在的名称。
- 若 `UI.refPicker` 暂未提供 `set(urls)` 方法，补一个即可（参考 `get()` 的逆向实现，把 URL 设进内部状态并渲染缩略图）。
- 预览卡样式 `.ref-preview` / `.ref-preview-imgs` / `.ref-preview-item` / `.ref-preview-tag` / `.ref-preview-note` / `.ref-preview-title` / `.hidden` 请在 `assets/css/styles.css` 自行补充（两图并排 + 起止标签，风格沿用现有 `.chip` / `.btn` 体系）。
- 点「生成一片风景」仍走原有 `startGenerate`，此时 `rp.get()` 已是 AI 挑的（或用户改过的）图，无需改 `createGeneration` 调用。

---

## 4. 开关说明：`feature.r2v.auto-select`

| 值 | 行为 |
|----|------|
| `true`（默认） | 用户不传 `references` 时，后端在 `generate` 时也会自动挑选。前端预览是为了「看得见、可确认」，二者互补 |
| `false` | 后端不自动选，必须由前端传 `references`。此时务必让用户用「AI 选图」按钮或手动选满 2 张，否则 r2v 会因参考图不足而退化 |

热切换（无需重启）：`PUT /api/v1/config/feature.r2v.auto-select` → body `true` / `false`。

---

## 5. 端到端验证

```bash
# 1) 预览接口（确认 strategy=embedding 且返回 2 张库图）
curl -X POST http://localhost:56010/api/v1/videos/suggest-references \
  -H "Content-Type: application/json" \
  -d '{"prompt":"雪地营地的清晨缓缓过渡到绿意盎然的溪流山谷"}'

# 2) 用预览结果生成（把 references / suggested_prompt 填进去）
curl -X POST http://localhost:56010/api/v1/videos/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"<suggested_prompt>","references":["<start>","<end>"],"duration":10,"resolution":"720p","aspect_ratio":"16:9"}'
```

预期：
- `suggest-references` 返回 `strategy: "embedding"`（已配置向量 Key）、`references` 含 2 张 URL。
- `generate` 返回 `task_id`，轮询 `/tasks/{task_id}` 至 `succeeded`，成片 `references` 字段记录 AI 挑的两张图。

---

## 6. 已落地的后端改动（供前端同学知悉，无需前端处理）

| 文件 | 改动 |
|------|------|
| `ReferenceSelectorService.java` | 新增，封装 r2v 选图 + 降级 + `buildR2VPrompt()` |
| `GenerationService.java` | `createTask` 在 happyhorse+r2v+图<2 时自动调选图；新增 `suggestReferences()` 方法供控制器调用 |
| `HappyHorseProvider.java` | r2v 下追加过渡 prompt 后缀 |
| `GenerationController.java` | 新增 `POST /api/v1/videos/suggest-references` |
| `ConfigService.java` | 新增 `feature.r2v.auto-select`（默认 true）、`prompt.happyhorse.r2v.suffix` |
| `EmbeddingService.java` | 修复 `input` 应为 `{"texts":[...]}` 对象；`slowscape.wan.api-key` 已配置（向量选图生效） |
