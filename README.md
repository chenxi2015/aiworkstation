# AI Workstation (本地优先的个人知识 Agent 工作台)

<p align="center">
  <img src="./public/logo.svg" alt="AI Workstation Logo" width="84" height="84" style="border-radius: 18px; margin-bottom: 14px;" />
</p>

<p align="center">
  <strong>将散落在全网的灵感、推文与资料归集于本地，用 AI Agent 赋能知识治理、深度调研、AI 创作与安全分发。</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TanStack-Start-blue?style=flat-square&logo=react" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/WXT-Extension-orange?style=flat-square" alt="WXT" />
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8?style=flat-square&logo=tailwindcss" alt="TailwindCSS v4" />
  <img src="https://img.shields.io/badge/HeroUI-v3-purple?style=flat-square" alt="HeroUI" />
  <img src="https://img.shields.io/badge/TipTap-v3-black?style=flat-square" alt="TipTap" />
  <img src="https://img.shields.io/badge/Local--First-SQLite-green?style=flat-square" alt="Local-First" />
  <img src="https://img.shields.io/badge/License-MIT-gray?style=flat-square" alt="License" />
</p>

---

## 📖 项目定位

**AI Workstation** 是一款**本地优先（Local-First）**的个人知识 Agent 工作台。

日常在推特（X）、微信公众号、小红书、GitHub、技术博客等平台浏览时，优质内容往往散落各处、难以沉淀与再利用。市面上的书签管理工具（Raindrop / Pocket / Notion Web Clipper）多停留在「人驱动 → 系统响应」的被动存储模式。

AI Workstation 打通了**浏览器采集端**、**本地知识治理中心**与**内容创作分发台**：
1. **输入端（手）**：Chrome 浏览器扩展（Sidepanel 侧边栏），一键提取正文 Markdown、整页/局部长截图、图片与富媒体素材，支持 Word / ZIP 归档。支持作为静默爬虫通道突破 SPA 和登录态屏障。
2. **中心脑（脑）**：本地 TanStack Start 服务与 SQLite 单文件数据库。按工作主题沉淀资产，借助 RAG 混合检索激活沉睡收藏；内置自主 ReAct 多步 Agent，主动完成分类归档、健康巡检、知识重组与深度研报。
3. **创作与分发（笔与桥）**：内置 TipTap AI 富文本创作台，支持划词润色、扩写、版本 Diff 与多格式导出；通过浏览器控制通道，辅助将二创内容安全、受控地回填至目标发布平台。

> **核心原则**：
> - **数据完全属于用户**：本地单文件持久化（`better-sqlite3`），可自由冷备份迁移，不上云。
> - **发布动作保留人工确认**：采集与 AI 处理自动化，最终外发保留确认闭环，保障账号安全。

---

## ✨ 核心特性

### 1. 🗂️ 7 大核心功能模块体系
采用「导航即能力地图、分类即数据维度」的设计理念（约定大于配置，支持用户自定义导航排序与显隐）：
- **工作台 (`/workbench`)**：个人工作首页，沉淀高频入口、数据统计与功能卡片。
- **书签 (`/bookmarks`)**：完整书签知识库与**未分类缓冲池**，按分类筛选、批量管理与标签沉淀。
- **自媒体 (`/creator`)**：专为自媒体打造的「采集 ➔ AI 二创 ➔ 审稿 ➔ 发布」流水线。
- **创作台 (`/editor`)**：基于 TipTap 3 的 AI 富文本创作中心，深度融合素材库引用与划词交互。
- **学习 (`/learn`)**：学习主题聚合与成长路径跟踪。
- **电商 (`/ecommerce`)**：电商选品、灵感素材与竞品调研归集。
- **Skills (`/skills`)**：本地 Agent Skills 集合管理与调度。

### 2. 🧩 浏览器采集扩展 (`AI Workstation Collector`)
- **原生 Sidepanel 侧边栏**：沉浸式浏览，无需离开当前页面即可完成收藏、分类与打标。
- **全方位网页内容提取**：
  - **正文智能提纯**：一键抽取纯净 Markdown，自动剔除广告、导航与无关噪声；
  - **DOM 局部选区**：可视化框选指定区域定向提取；
  - **整页长截图 & 局部滚动截屏**：精准捕捉长图文与代码段落。
- **多格式导出与离线归档**：
  - 📄 **Markdown (.md)**：纯净格式，即存即用；
  - 📑 **Word (.docx)**：排版工整的 Office 文档；
  - 📦 **ZIP 归档包**：自动打包图文与本地关联静态素材。
- **静默爬虫通道 (Headless Crawler Channel)**：
  - 突破传统爬虫的 SPA 客户端渲染、反爬风控与登录态壁垒；
  - 工作台下发指令，插件后台静默调度秒级开合 Tab 提纯正文并回传，零成本复用登录会话。

### 3. 🤖 ReAct 多步智能 Agent (Batch-First 治理体系)
内置 TanStack AI 驱动的 ReAct 多步自主执行引擎，具备 **17+ 维系统治理与探索工具**：
- **Batch-First 批量治理**：支持原子级批量创建、批量迁移、批量归类与标签打标，杜绝单步循环刷屏。
- **复合归集工具 (`merge_folders`)**：一键将多个散乱目录的所有书签安全合并至新体系，并自动清理空壳目录。
- **标签治理体系**：支持标签批量创建、绑定、解绑、重命名与合并（`rename_or_merge_tags`）。
- **实时步骤时间轴 (`AgentStepTimeline`)**：类似 Cursor / Claude 的极简折叠轨，毫秒级透明展示 Agent 思考过程与工具调用入参结果。
- **Executive Dashboard 成果看板交付契约**：
  - 拒绝过程碎碎念流水账；
  - 产出标准的专业报告：**成效指标看板 ➔ 架构矩阵全景 ➔ 代表性资产亮点 ➔ 启发式演进指引**。
- **外脑探索**：集成网页读取（`read_webpage_content`）、插件静默抓取（`crawl_webpage_via_extension`）与联网搜索（`web_search`）。

### 4. 📝 AI 富文本创作中心 (`/editor`)
- **现代编辑器内核**：基于 TipTap 3 + TailwindCSS Typography 构建，支持表格、任务列表、代码块高亮与 Mermaid 流程图渲染。
- **AI 协同创作面板**：
  - 划词一键润色、续写、纠错、长文扩写、提炼金句；
  - **版本 Diff 对比**：AI 改写前后直观呈现新增与删除差异，支持单段接受或还原；
- **多模态导入导出**：支持 Markdown、Docx、PDF、Excel 导入与预览。

### 5. 🔍 混合 RAG 检索与知识活化
- **Hybrid Search 融合排序**：`0.6 * 语义向量相似度 (Embedding) + 0.4 * 关键词精准匹配 (BM25 权重)`，模糊记忆也能秒级定位目标。
- **多 Provider Embedding 适配**：支持 SiliconFlow (`bge-m3`)、OpenAI (`text-embedding-3-small`)、本地 Ollama 向量模型等。
- **Chat with Bookmarks**：基于个人知识库进行多轮问答对话，智能溯源定位参考出处。
- **专题综述 (Dossier)**：一键将指定文件夹中的碎片资料提炼为体系化调研报告与备忘单。

---

## 🏗️ 总体架构

```
┌────────────────────────────────────────┐       ┌────────────────────────────────────────────────────────┐
│      Chrome 插件端（"手"）             │       │              本地工作台 TanStack Start（"脑"）          │
│      extensions/aicollector            │       │              src/                                      │
│                                        │       │                                                        │
│  - Sidepanel 交互侧边栏                │ ──1──>│  - 7 大核心模块 (Workbench / Bookmarks / Editor 等)    │
│  - 网页 DOM 智能提纯 (转 MD)           │ (HTTP)│  - 本地 SQLite 存储 (better-sqlite3 + 本地单文件)      │
│  - 整页长截图 / 局部截屏               │       │  - 混合 RAG 引擎 (向量化 + 关键词加权)                 │
│  - DOCX 导出 & ZIP 离线归档            │ <──2──│  - TanStack AI Agent 编排 (Claude / OpenAI / Gemini / │
│  - 静默后台爬虫 (免登录态抓取)         │ (Job) │    DeepSeek / Ollama)                                  │
│  - 网页编辑器回填驱动 (小红书/公众号)  │ <──3──│  - TipTap AI 富文本创作内核与版本对比引擎              │
└────────────────────────────────────────┘(Port) └────────────────────────────────────────────────────────┘
```

### 通信三通道设计
1. **数据通道（HTTP API）**：插件 → `POST http://localhost:3888/api/collect`，常态可用，负责大文本、图片与素材入库。
2. **爬虫任务通道（Crawler Polling）**：工作台下发抓取任务进入队列，插件后台长轮询 `/api/crawler` 认领任务，静默打开 Tab 提纯后回传。
3. **控制信令通道（Port 长连接）**：工作台 ↔ 插件（`externally_connectable`），工作台页面打开时自动建立，用于指令下发、进度回传与网页编辑器辅助回填。

---

## 📁 目录结构

本项目采用清晰整洁的工程目录组织，工作台本体与 Chrome 扩展统一管理：

```bash
aiworkstation/
├── src/                          # 【本地工作台】TanStack Start 应用源码
│   ├── components/               # 公共 UI 组件与业务组件
│   │   ├── workbench/            # 文件夹卡片、详情侧栏、新建弹窗、图标选择器
│   │   ├── bookmarks/            # 书签列表、未分类缓冲池、同步弹窗、巡检面板
│   │   ├── editor/               # TipTap 编辑器、工具栏、AI 贡献面板与 Diff 视图
│   │   └── chat/                 # Agent 对话面板、时间轴 (AgentStepTimeline)
│   ├── routes/                   # TanStack Router 文件路由系统
│   │   ├── __root.tsx            # 全局根布局（含统一顶部导航条）
│   │   ├── index.tsx             # 重定向至 /workbench
│   │   ├── workbench.tsx         # 工作台首页
│   │   ├── bookmarks.tsx         # 书签知识库与缓冲池
│   │   ├── creator.tsx           # 自媒体工作流
│   │   ├── editor.tsx            # AI 富文本创作台
│   │   ├── learn.tsx             # 学习模块
│   │   ├── ecommerce.tsx         # 电商模块
│   │   └── skills.tsx            # Skills 模块
│   ├── modules/                  # 模块注册表（registry.ts，统一路由与别名契约）
│   ├── server/                   # 服务端代码（Node 运行时）
│   │   ├── ai/                   # AI 编排层
│   │   │   ├── tools/            # Agent 治理工具体系 (17+ 维原子与复合 Tool)
│   │   │   └── prompt.ts         # Agent System Prompt 与契约规范
│   │   ├── db/                   # better-sqlite3 数据库配置、Schema 与迁移
│   │   └── functions/            # TanStack Start Server Functions (RPC)
│   ├── stores/                   # 客户端状态管理与主题控制
│   └── styles.css                # TailwindCSS v4 全局样式设计
│
├── extensions/aicollector/       # 【采集扩展】Chrome Extension (WXT 框架)
│   ├── entrypoints/
│   │   ├── sidepanel/            # 浏览器侧边栏页面 (React + TailwindCSS)
│   │   ├── background.ts         # 后台 Service Worker（消息分发、静默爬虫执行）
│   │   ├── content.ts            # 网页注入脚本（DOM 提取、截图与编辑器回填）
│   │   └── doc-viewer/           # 独立离线文档预览窗口
│   └── wxt.config.ts             # WXT 配置文件与 MV3 权限声明
│
├── .aiworkstation/               # 运行时持久化目录（本地单文件，不上云）
│   ├── workbench.db              # SQLite 数据库本体
│   └── pages/                    # 离线抓取全文存档
├── docs/                         # 需求设计与演进规划文档
├── PROJECT.md                    # 🌟 产品宪法与设计决策准则
├── AGENTS.md                     # AI Agent 开发规范与 TanStack Intent 指引
└── package.json                  # 项目依赖与构建脚本
```

---

## 🛠️ 技术栈

| 分类 | 核心技术 / 选型 |
|---|---|
| **前端框架** | [TanStack Start](https://tanstack.com/start), [TanStack Router](https://tanstack.com/router), [React 19](https://react.dev/) |
| **UI & 样式** | [TailwindCSS v4](https://tailwindcss.com/), [HeroUI v3](https://heroui.com/), [Lucide React](https://lucide.dev/) |
| **富文本创作** | [TipTap v3](https://tiptap.dev/), `@tailwindcss/typography`, `@streamdown/mermaid` |
| **AI 编排** | [TanStack AI](https://tanstack.com/ai) (支持 Claude, OpenAI, Gemini, DeepSeek, Ollama) |
| **本地存储** | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (SQLite 本地单文件 + 向量存储) |
| **浏览器扩展** | [WXT Framework](https://wxt.dev/) (Manifest V3 + React 19 + Vite) |
| **导出与解析** | `docx`, `jszip`, `marked`, `mammoth`, `pdfjs-dist`, `xlsx`, `html-to-image` |
| **代码工程** | [Biome](https://biomejs.dev/) (格式化与 Lint), TypeScript 5.9+, Vite 8 |

---

## 🚀 快速上手

### 1. 环境准备
- Node.js >= 20.x
- pnpm >= 9.x

### 2. 启动本地工作台

```bash
# 1. 安装项目依赖
pnpm install

# 2. 启动开发服务器 (默认端口 3888)
pnpm dev
```

浏览器访问 [http://localhost:3888](http://localhost:3888) 即可进入 AI Workstation。首次运行会自动在根目录下创建 `.aiworkstation/workbench.db` 数据库并完成表初始化。

> 💡 **免配置 .env 文件**：所有 AI 服务密钥（OpenAI、DeepSeek、Claude、Gemini、Ollama 等）与 Embedding 向量检索模型参数，均直接保存在本地 SQLite 数据库中。进入工作台后点击右上角 **「设置」** 即可直接可视化配置与切换。

### 3. 开发与安装 Chrome 采集插件

```bash
# 启动插件开发热更新模式 (固定端口 3889)
pnpm --filter ./extensions/aicollector dev
```

**加载到 Chrome 浏览器：**
1. 打开 Chrome 浏览器，进入 `chrome://extensions/`；
2. 开启右上角 **「开发者模式」**；
3. 点击 **「加载已解压的扩展程序」**；
4. 选择项目中的 `extensions/aicollector/.output/chrome-mv3` 目录；
5. 在任意网页按快捷键或点击扩展栏图标唤起 **AI Workstation Collector 侧边栏**。

---

## 📋 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动 TanStack Start 本地工作台 (端口 3888) |
| `pnpm --filter ./extensions/aicollector dev` | 启动 Chrome 插件开发热更服务 (端口 3889) |
| `pnpm build` | 构建工作台生产产物 |
| `pnpm --filter ./extensions/aicollector build` | 构建 Chrome 插件生产包 |
| `pnpm zip:extension` | 打包生成 Chrome 扩展发布 ZIP 包 |
| `pnpm check` | 运行 Biome 代码检查与修复 |
| `pnpm format` | 运行 Biome 自动格式化 |

---

## 🗺️ 产品路线图 (Roadmap)

- [x] **M1: 采集闭环与工作台基座**
  - [x] 主题文件夹 App 网格布局与详情侧栏
  - [x] WXT Chrome 扩展 Sidepanel 架构与正文提取
  - [x] Markdown、Word (DOCX)、ZIP 打包导出
  - [x] 整页滚动长截图与局部选区截图
  - [x] SQLite 单文件持久化 (`better-sqlite3`)
  - [x] 插件一键推送数据至工作台 API
- [x] **M2: RAG 混合检索与 Agent 治理体系**
  - [x] 混合检索（Hybrid Search）：向量语义 + 关键词精准召回
  - [x] 浏览器原生书签导入同步（BookmarkSyncModal）
  - [x] 失效链接巡检与死链清理（DeadLinksModal）
  - [x] 17+ 维 Agent Tools（批量建/删/移、`merge_folders` 原子归集、标签管理）
  - [x] Batch-First 原则与 Executive Dashboard 交付物契约
  - [x] 实时折叠步骤时间轴（AgentStepTimeline）
- [x] **M3: 智能爬虫通道与 Browser Co-Pilot**
  - [x] 插件静默抓取通道（调度扩展后台抓取，突破 SPA 客户端渲染与登录态）
  - [x] 联网搜索工具集成（`web_search`）
  - [ ] 选区规则模板化（Recipe：可视化点选录制选择器 ➔ 持久化精准定向爬取）
  - [ ] 浏览器原子动作驱动（点击、滚动翻页、表单填写交互流）
- [x] **M4: 创作台与自媒体工作流**
  - [x] 基于 TipTap 3 的 AI 富文本创作台架构
  - [x] 划词 AI 润色/扩写/改写与版本 Diff 差异对比
  - [x] Mermaid 图表与代码高亮静态渲染
  - [ ] 推文/小红书二创流水线与草稿生成
  - [ ] 控制通道回灌至网页编辑器并保留人工确认发布
- [ ] **M5: 知识自治与跨源生态**
  - [ ] 后台自治 Agent（自动入库分类 / 定期知识库体检周报）
  - [ ] 跨源知识联邦（Connector Plugin：联动 Notion、Raindrop 等外部源）
  - [ ] 个人专属视觉展示页（Showcase）一键导出

---

## 📄 开源协议

本项目采用 [MIT License](./LICENSE) 协议。
