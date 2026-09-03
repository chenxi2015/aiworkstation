# AI Workstation (本地优先的个人知识 Agent 工作台)

<p align="center">
  <img src="./public/favicon.ico" alt="AI Workstation Logo" width="80" height="80" style="border-radius: 16px; margin-bottom: 12px;" />
</p>

<p align="center">
  <strong>将散落在全网的灵感与素材归集于本地，用 AI Agent 赋能知识整理、深度调研、内容二创与一键分发。</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TanStack-Start-blue?style=flat-square&logo=react" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/WXT-Extension-orange?style=flat-square" alt="WXT" />
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8?style=flat-square&logo=tailwindcss" alt="TailwindCSS v4" />
  <img src="https://img.shields.io/badge/HeroUI-v3-purple?style=flat-square" alt="HeroUI" />
  <img src="https://img.shields.io/badge/Local--First-SQLite-green?style=flat-square" alt="Local-First" />
  <img src="https://img.shields.io/badge/License-MIT-gray?style=flat-square" alt="License" />
</p>

---

## 📖 项目定位

**AI Workstation** 是一款**本地优先（Local-First）**的个人知识 Agent 工作台。

日常在推特（X）、微信公众号、小红书、技术博客等平台浏览时，优质内容往往散落各处、难以沉淀与再利用。AI Workstation 将采集端与处理端打通，并通过 AI Agent 实现知识的主动整理与洞察：
1. **输入端（手）**：通过强劲的 Chrome 浏览器扩展（Sidepanel 侧边栏），一键抓取正文 Markdown、整页长截图、图片素材，支持 Word / ZIP 归档。
2. **中心脑（脑）**：本地 TanStack Start 服务与 SQLite 数据库，按主题文件夹沉淀资产，借助 RAG 混合检索激活沉睡收藏，AI Agent 自主完成智能归类、知识巡检、深度调研与内容二创。
3. **输出端（分发）**：通过浏览器控制通道，辅助将二创内容安全、可控地回填到目标平台。

> **产品愿景**：从「收藏工具」进化为「个人知识 Agent」——Agent 不只等你提问，还能自主规划、多步执行、主动发现。
>
> **核心原则**：数据完全属于用户（本地单文件存储，支持备份迁移，不上云），发布动作保留人工最终确认（保障账号合规安全）。

---

## ✨ 核心特性

### 1. 🗂️ 主题文件夹资产归集 (Workbench UI)
- **类似手机 App 分组的文件夹网格**：将收藏的网站、推文、提示词、工具链接与本地素材按工作主题分类。
- **未分类缓冲池**：所有新采集内容的暂存区，支持人工拖拽整理或通过 AI 一键批量自动归类。
- **直观的侧边栏详情面板**：实时查看文件夹内项目、标签、创建时间，快速检索与管理。

### 2. 🧩 强大的采集扩展 (`AI Workstation Collector`)
- **浏览器原生 Sidepanel 侧边栏**：无需离开当前网页即可完成内容提取与整理。
- **全方位网页抓取**：
  - **正文智能提取**：一键转标准 Markdown，自动去除冗余广告与导航。
  - **局部选区提取**：高亮选择指定 DOM 元素抓取。
  - **全网页滚动长截图 & 局部滚动截屏**：精准捕捉长图文与代码段。
- **多格式导出与离线打包**：
  - 📄 **Markdown (.md)**：纯净格式，即存即用。
  - 📑 **Word (.docx)**：一键生成排版工整的 Office 文档。
  - 📦 **ZIP 归档包**：自动打包文章内容与所有离线图片素材。
- **书签同步与历史操作日志**：无缝打通浏览器原生书签与抓取记录。

### 3. 🤖 AI Agent 智能编排与知识活化
- **结构化智能分类**：根据内容语义自动匹配最合适的主题文件夹。
- **RAG 混合检索**：向量语义 + 关键词混合排序，用自然语言精准召回模糊记忆中的工具与资料。
- **Chat with Bookmarks**：基于个人收藏库的 RAG 问答，Agent 自主调用 Tool 查询、创建文件夹、批量归档。
- **文件夹专题综述**：一键将碎片书签总结为体系化研究综述。
- **热帖二创与互动草稿**：支持推文自动生成多种风格的回复草稿与再创作文案。

---

## 🏗️ 总体架构

```
┌────────────────────────────────────────┐       ┌────────────────────────────────────────┐
│      Chrome 插件端（"手"）             │       │     本地工作台 TanStack Start（"脑"）   │
│  extensions/aicollector                │       │     src/                               │
│                                        │       │                                        │
│  - Sidepanel 交互侧边栏                │       │  - 文件夹网格 / 未分类缓冲池 UI        │
│  - 网页 DOM 提取 & 智能降噪转 MD        │ ──1──>│  - 本地 SQLite 存储 (drizzle)           │
│  - 整页长截图 / 局部滚动截图           │       │  - AI 编排 (TanStack AI / Claude /     │
│  - DOCX 导出 & ZIP 离线打包            │ <──2──│    OpenAI / Gemini)                    │
│  - 网页编辑器回填驱动 (小红书/公众号)  │       │  - 定时任务与批处理（Node 常驻进程）   │
└────────────────────────────────────────┘       └────────────────────────────────────────┘
```

### 通信机制
1. **数据通道（HTTP API）**：插件 → `POST http://localhost:3888/api/*`（携带 Local Bearer Token 认证），常态可用，负责大文本、图片与素材入库。
2. **控制信令通道（Port 连接）**：工作台 ↔ 插件（`externally_connectable`），工作台激活时建立长连接，用于指令下发、进度回传与编辑器回填。

---

## 📁 目录结构

本项目采用 Monorepo 组织结构，工作台本体与 Chrome 扩展统一管理：

```bash
aiworkstation/
├── src/                          # 【本地工作台】TanStack Start 应用源码
│   ├── components/               # 公共 UI 组件与工作台模块
│   │   ├── workbench/            # 文件夹卡片、详情侧栏、新建弹窗、图标库
│   │   └── ThemeToggle.tsx       # 明暗主题切换
│   ├── routes/                   # TanStack Router 文件路由系统
│   │   ├── __root.tsx            # 全局根布局
│   │   └── index.tsx             # 工作台首页（文件夹网格 + 分类 Tab）
│   ├── integrations/             # AI 与第三方服务集成
│   └── styles.css                # TailwindCSS v4 全局样式配置
│
├── extensions/aicollector/       # 【采集扩展】Chrome Extension (WXT 框架)
│   ├── entrypoints/
│   │   ├── sidepanel/            # 浏览器侧边栏页面 (React + TailwindCSS)
│   │   │   ├── components/tabs/  # 采集 (Grab)、书签 (Bookmarks)、日志 (Logs)、设置 (Settings)
│   │   │   ├── components/actions/ # 导出工具条 (MD, DOCX, ZIP, 截图)
│   │   │   └── components/modals/ # 批量打包导出弹窗
│   │   ├── background.ts         # Service Worker 后台脚本与消息调度
│   │   ├── content.ts            # 网页内容注入脚本 (DOM 采集/截图辅助)
│   │   ├── doc-viewer/           # 独立文档预览窗口
│   │   └── viewer/               # 语法高亮预览页面
│   ├── src/utils/                # 导出器 (zipExporter, docxExporter, imageDownloader)
│   └── wxt.config.ts             # WXT 配置文件与 Manifest MV3 声明
│
├── public/                       # 静态资源文件
├── PROJECT.md                    # 🌟 产品宪法与核心设计决策文档
├── AGENTS.md                     # AI Agent 开发规范与 TanStack Intent 指引
└── package.json                  # 工作区根依赖配置
```

---

## 🛠️ 技术栈

| 模块 | 关键技术 / 库 |
|---|---|
| **工作台前端** | [TanStack Start](https://tanstack.com/start), [TanStack Router](https://tanstack.com/router), [React 19](https://react.dev/), [HeroUI](https://heroui.com/), [Tailwind CSS v4](https://tailwindcss.com/) |
| **工作台 AI 编排** | [TanStack AI](https://tanstack.com/ai) (支持 Anthropic Claude, OpenAI, Gemini, Ollama 等) |
| **浏览器扩展** | [WXT Framework](https://wxt.dev/), React 19, Chrome Extension Manifest V3, `@tailwindcss/vite` |
| **内容解析与导出** | `marked`, `prismjs`, `highlight.js`, `docx`, `jszip`, `streamdown` |
| **工程化 & 规范** | [Biome](https://biomejs.dev/) (格式化与 Lint), [Vite](https://vitejs.dev/), TypeScript 5.9+ |

---

## 🚀 快速上手

### 1. 启动本地工作台

```bash
# 1. 安装项目依赖
pnpm install

# 2. 启动开发服务器 (默认运行在 http://localhost:3888)
pnpm dev
```

浏览器访问 [http://localhost:3888](http://localhost:3888) 即可进入 AI Workstation。

### 2. 开发与加载 Chrome 采集插件

```bash
# 启动插件开发模式（固定在 3889 端口，支持 HMR 热重载）
pnpm --filter ./extensions/aicollector dev
```

**加载插件到 Chrome：**
1. 打开 Chrome 浏览器，访问 `chrome://extensions/`；
2. 开启右上角的 **「开发者模式」**；
3. 点击 **「加载已解压的扩展程序」**；
4. 选择项目中的 `extensions/aicollector/.output/chrome-mv3` 目录；
5. 点击浏览器右上角扩展栏图标或快捷键打开 **AI Workstation Collector 侧边栏**。

---

## 📋 常用开发命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动 TanStack Start 本地工作台 (端口 3888) |
| `pnpm --filter ./extensions/aicollector dev` | 启动 Chrome 插件开发热更服务 (端口 3889) |
| `pnpm build` | 构建工作台生产产物 |
| `pnpm --filter ./extensions/aicollector build` | 构建 Chrome 插件生产包 |
| `pnpm --filter ./extensions/aicollector zip` | 打包生成 Chrome 插件发布 .zip 文件 |
| `pnpm check` | 运行 Biome 代码检查与修复 |
| `pnpm format` | 运行 Biome 代码格式化 |

---

## 🗺️ 产品规划路线图 (Roadmap)

- [x] **M1: 采集与工作台基础 (进行中)**
  - [x] 主题文件夹网格与详情面板 UI
  - [x] Chrome 扩展 Sidepanel 架构与内容抓取
  - [x] Markdown、Word (DOCX)、ZIP 打包多格式导出
  - [x] 整页滚动与局部滚动区域截屏
  - [ ] 本地 SQLite 持久化接入 (`better-sqlite3` + `drizzle`)
  - [ ] 插件一键推送数据至工作台 API
- [ ] **M2: 推特 / 社交媒体工作流**
  - [ ] 社交平台页面内嵌“收藏与 AI 回复”快捷按钮
  - [ ] 服务端批量生成回复草稿与二创内容
  - [ ] 工作台审稿流与控制通道回填
- [ ] **M3: 多平台发布矩阵**
  - [ ] 微信公众号、小红书网页编辑器辅助填充
  - [ ] 浏览器原生书签拦截与旁路监听
  - [ ] 热帖自动巡检与采集
- [ ] **M4: 深度打磨与扩展**
  - [ ] 数据一键导出与冷备份恢复
  - [ ] Local AI Skills 深度自定义编排
- [ ] **M5: AI Agent 智能体演进 (L2 → L3 → L4)**
  - [ ] Tool 集扩展（统计分析 / 重复检测 / 批量分类 / URL 巡检）
  - [ ] 多步 Agent 编排（复杂意图自动拆解为多步 Tool 链执行）
  - [ ] 后台自治 Agent（自动归档 / 定期巡检 / 知识资产周报）
  - [ ] 联网研究 Agent（搜索补充 + 深度调研对比报告）
  - [ ] 跨源知识联邦（Connector Plugin 架构）

---

## 📄 开源协议

本项目采用 [MIT License](./LICENSE) 协议。
