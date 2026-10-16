# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**AI Workstation** — 本地优先（Local-First）的个人知识 Agent 工作台（pnpm 9 monorepo，中文产品文档与 UI）。核心原则：**数据属于用户**（SQLite 单文件 + 本地 Markdown 直读直写，不上云）；**发布动作保留人工确认**。

动代码前先读 `PROJECT.md`（产品宪法，已定案的架构决策勿随意推翻）和 `AGENTS.md`（TanStack Intent 指引——编辑 TanStack 相关文件前必须先运行对应的 `pnpm dlx @tanstack/intent@latest load <id>` 命令加载技能指引）。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动工作台 dev server（端口 **3888**，首次运行自动创建 `.aiworkstation/workbench.db`） |
| `pnpm build` / `pnpm preview` | 生产构建（Nitro Node server，产物在 `.output/`）/ 预览 |
| `pnpm check` / `pnpm lint` / `pnpm format` | Biome 检查 / lint / 格式化（无 `--write` 时只报告） |
| `pnpm generate-routes` | 手动重新生成 `src/routeTree.gen.ts`（dev 时 TanStack Router 插件自动做） |
| `pnpm dev:extension` | Chrome 采集扩展开发热更（WXT，端口 3889；产物加载目录 `extensions/aicollector/.output/chrome-mv3`） |
| `pnpm zip:extension` | 打包 Chrome 扩展发布 ZIP |
| `pnpm electron:dev` | 构建 + 打包 main/preload + 启动 Electron 桌面壳 |
| `pnpm electron:dist` / `electron:dist:mac` / `electron:dist:win` | electron-builder 打包发行 |
| `pnpm electron:rebuild` | 重编译 better-sqlite3 原生模块（Electron Node 版本变化后必跑） |
| `pnpm dev:server` / `deploy:server:cf` | 云端服务器（`server/`，Hono + Drizzle + Postgres，可部署 Cloudflare Workers） |
| `pnpm release:patch` 等 | 发版脚本 `scripts/release.mjs` |

**测试**：vitest 已安装但根 package.json 无 `test` script——直接跑 `pnpm vitest run`（全部）或 `pnpm vitest run src/server/ai/tools/documentTools.test.ts`（单文件）。现有测试仅 4 个 `*.test.ts`（draftStore、documentTools、resolveActionTarget、elementFactory）。`server/` 包的 `pnpm --filter @aiworkstation/cloud-server test` 是 tsx 端点冒烟脚本，非 vitest。

## Monorepo 结构

- **根包（`.`）= 工作台本体**：TanStack Start (React 19) + Vite 8 应用，`src/`。
- **`server/`（`@aiworkstation/cloud-server`）**：独立的云端服务器（Hono + Drizzle ORM + Postgres + JWT），负责账号/支付/微信扫码登录。与本地工作台是两套体系，本地优先场景不依赖它。
- **`packages/shared-types`**：根包与 cloud-server 共享的 TS 类型，改动后需 `pnpm --filter @aiworkstation/shared-types build`（多数 script 已带 pre* 钩子）。
- **`extensions/aicollector`**：WXT 框架的 Chrome MV3 扩展（React 19 sidepanel + background service worker + content scripts）。
- **`electron/`**：桌面壳——Electron main 进程 spawn 内嵌 Nitro server（`electron/server.ts`，自动找空闲端口，默认 3888，绑 127.0.0.1），窗口加载本地服务；含 tray、electron-updater 自更新。main/preload 用 `electron/build.mjs`（esbuild）打包到 `dist-electron/`。

## 核心架构（本地工作台，`src/`）

### 运行形态与构建目标

同一份代码三种形态，由 Vite mode 区分（`vite.config.ts`）：
- **dev / Node 生产**（默认）：Nitro 打包 SSR server + 扩展 API 路由，产物 `.output/server/index.mjs`，可用原生 `better-sqlite3`。
- **Cloudflare Workers**（`--mode cloudflare`）：启用 `@cloudflare/vite-plugin`，不能用原生 SQLite。
- **Electron**：跑上面的 Node 产物。
- 注意 `vite.config.ts` 里的 `excalidrawSsrStubPlugin`：SSR 时 stub 掉 `@excalidraw/*`（浏览器全局在 Node 下不存在），改 Excalidraw 相关代码时别删它。

### 服务端分层（`src/server/`，全部跑在 Node 运行时）

- **`functions/`**：TanStack Start Server Functions（`createServerFn` RPC），按模块分文件（workbench、dashboard、obsidian、editor、creator、publish、rag、skills…）。前端通过它读写 SQLite 与本地文件。
- **`db/`**：`better-sqlite3` 连接、原生 SQL schema 与幂等迁移（`schema.ts`）、`repositories/`。数据库文件 `.aiworkstation/workbench.db`。AI 密钥等配置也存 SQLite（`settings` 表），**不用 .env**。
- **`api/`**：给 Chrome 扩展的 HTTP API（`/api/collect`、`/api/crawler` 等）。`router.ts` 是共享路由表，dev 下经 `extensionApiPlugin`（Vite middleware）挂载，Node 生产下经 `extensionApi.nitro.ts` 挂载——**改 API 路由只需改 `router.ts` + `handlers/`，两个入口自动同步**。
- **`ai/`**：TanStack AI 编排层。`tools/`（30+ 个 Agent 工具：书签批量治理、merge_folders、标签治理、web_search、read_webpage、crawl_webpage_via_extension、Excalidraw/Canvas/文档工具）、`prompts/`（System Prompt 与交付契约）、`drafts/`、`search/`（混合 RAG：0.6 向量 + 0.4 BM25）。
- **`services/obsidian/`**：本地 Obsidian Vault 文件服务——直接读写真实 `.md` 文件树，**不进 SQLite**（PROJECT.md 决策 #8），删除必须走系统回收站（决策 #9）。

### 前端结构

- **`routes/`**：TanStack Router 文件路由，8 大模块：`/workbench`（widget 仪表盘首页）、`/bookmarks`、`/obsidian`、`/creator`（创作一体化：`/editor` 已定案并入其中）、`/learn`、`/ecommerce`、`/skills`。`routeTree.gen.ts` 自动生成，勿手改。
- **`modules/registry.ts` / `widgetRegistry.ts`**：模块与 widget 注册表（约定大于配置）。新增导航模块 = 注册表加一行 + 建 route 文件；新增仪表盘 widget = 注册表加一行 + `components/dashboard/widgets/` 建组件。
- **`components/`**：按模块组织（workbench、obsidian、editor、creator、dashboard、chat…）。
- **`stores/`**：TanStack Store 客户端状态；**`services/`（src 下的）是客户端服务**，与 `src/server/services/` 区分。

### 与 Chrome 扩展的通信三通道（已定案，勿推翻）

1. **数据通道（HTTP）**：扩展 → `POST localhost:3888/api/collect`，大文本/图片入库。
2. **爬虫任务通道**：工作台下发任务入队，扩展 background 长轮询认领，静默开 Tab 提纯回传（突破 SPA 渲染与登录态）。
3. **控制信令通道**：工作台 ↔ 扩展 `chrome.runtime.connect` port 长连接（`externally_connectable`），用于指令下发与网页编辑器辅助回填（公众号/小红书）。仅工作台标签页打开时可用。

## 代码规范要点

- **Biome**（`biome.json`）：tab 缩进、双引号、organize imports 开启；检查范围含 `**/src/**`，**排除 `src/routeTree.gen.ts` 与 `src/styles.css`**。electron/ 与 extensions/ 的部分文件不在默认 includes 内。
- 注释与 commit message 用中文（见 git log 风格：`feat(editor): 增强…`）。
- TanStack 相关编辑前必须先看 `AGENTS.md` 里对应的 intent id 并运行其 guidance 命令（尤其 ai-core、router、start、table 相关）。

## 关键约束（来自 PROJECT.md，改动前先讨论）

1. SQLite 用 better-sqlite3 + 原生 SQL 迁移，不用浏览器 IndexedDB/OPFS。
2. 定时任务只放服务端 Node 进程（MV3 service worker 会休眠）。
3. Obsidian 模块纯文件直读直写，与 editor 的 documents 表严格解耦。
4. 文件删除严禁 `fs.unlink`，统一 `trash` 移入系统回收站。
5. 不 hook 目标站点 fetch/XHR；插件采集失败进 chrome.storage 队列补发。
6. 服务端绑 127.0.0.1；`/api/collect` 的 Bearer token 校验是目标态，当前仅有 CORS 放行——做安全相关改动时注意这个差距。
