# 慢境 SlowScape

一个沉浸式的慢节奏视频漫游平台。用户可以像在夜空下一样，慢慢浏览、收藏、评论那些"值得慢下来看"的视频内容。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Spring Boot 3.x (Maven 单模块) · `com.slowscape` · H2 (开发) |
| 前端 | 原生 HTML / CSS / JavaScript（无构建步骤，静态托管） |
| 设计 | 自然主义 UI (Biophilic) + Calm 式克制 · 图标库 lucide |

## 目录结构

```
SlowScape/
├── backend/                 # Spring Boot 后端
│   ├── src/main/java/com/slowscape/   # 应用源码（SlowScapeApplication 入口）
│   ├── src/main/resources/            # application.properties
│   └── pom.xml
├── frontend/                # 前端静态资源（直接由后端或静态服务器托管）
│   ├── index.html
│   ├── assets/
│   │   ├── css/styles.css             # 全局样式 + 各场景氛围调色板
│   │   ├── js/                        # app.js auth.js data.js pages.js starfield.js ui.js ...
│   │   └── img/{ocean,aurora,land}/   # 图像资源
│   └── R2V_REFERENCE_SELECTION_GUIDE.md
└── design-tokens.json       # 设计系统 Token（Design Token 单一来源）
```

## 本地运行

### 后端

```bash
cd backend
mvn spring-boot:run          # 默认端口见 application.properties
```

### 前端

前端为静态资源，由后端托管（或任意静态服务器）。开发期可直接用 `mvn spring-boot:run` 一并 serve，
默认访问 `http://localhost:8080`（或后端配置的端口）。

## 核心亮点

- **沉浸式 watch 页**：视频与内容居中左右分栏，两侧留白透出程序化渲染的星空背景。
- **零图片星空背景**（`assets/js/starfield.js`）：canvas 实时绘制 fbm 星云气体云 + 斜向银河带 + 多色温星点 +
  亮星衍射十字 + 镜头暗角 + 大气辉光，全程序化、无外部图片依赖、无模糊/撞色问题。
- **场景氛围系统**：6 套调色板（`dusk_coast` / `misty_wheat` / `rainy_forest` / `snowy_pine` / `free` / `gradient`），
  颜色全部由 CSS 变量承载，切换时平滑过渡。可通过 `pages.js` 的 `WATCH_MOOD_OVERRIDE` 统一锁定某个氛围。
- **设计系统 Token**：`design-tokens.json` 为单一来源，前端样式全程引用。

## 说明

- 本地 H2 数据库文件（`*.mv.db` / `*.trace.db` / `*.lock.db`）不纳入版本控制。
- 构建产物（`backend/target/`、`backend/BOOT-INF/`）不纳入版本控制。
