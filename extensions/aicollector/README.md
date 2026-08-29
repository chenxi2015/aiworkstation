# AI Workstation Collector (Chrome 浏览器扩展)

<p align="center">
  <img src="./public/icon/128.png" alt="AI Collector Logo" width="80" height="80" style="border-radius: 16px; margin-bottom: 12px;" />
</p>

<p align="center">
  <strong>AI Workstation 的内容感知与全能采集助手。</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-brightgreen?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/WXT-Framework-orange?style=flat-square" alt="WXT" />
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8?style=flat-square&logo=tailwindcss" alt="TailwindCSS v4" />
  <img src="https://img.shields.io/badge/HeroUI-v3-purple?style=flat-square" alt="HeroUI" />
</p>

---

## 📖 简介

**AI Workstation Collector** 是 AI Workstation 配套的 Chrome 浏览器扩展（Manifest V3）。作为整个工作台的“采集触手”，它能够在用户日常浏览网页时，以最小的干扰提供沉浸式的内容提取、长图截屏、格式转换与多端投递能力。

---

## ✨ 核心功能

### 1. 🗂️ 侧边栏（Sidepanel）无缝交互
- 支持浏览器右侧 Sidepanel 侧边栏常驻，不遮挡主网页阅读。
- 包含 **采集 (Grab)**、**书签 (Bookmarks)**、**日志 (Logs)**、**设置 (Settings)** 四大核心功能标签页。

### 2. 📝 智能内容抓取与处理
- **正文智能提取**：一键解析网页主体结构，剔除广告与导航杂音，直接转换为标准 Markdown。
- **局部元素拾取**：自由框选页面中的特定段落、卡片或代码块进行提取。
- **代码高亮与格式化**：内置 PrismJS 语法高亮引擎，完整保留各类编程语言排版。

### 3. 📸 智能截屏矩阵
- **整页滚动长截图**：自动遍历计算页面完整高度，平滑滚动拼接超长网页长图。
- **局部滚动区域截图**：精准捕捉带有内部滚动条（如代码窗口、推文流、聊天框）的局部长图。

### 4. 📦 多格式导出与离线资产打包
- **Markdown (.md)**：纯净 Markdown 文本导出，保留原网页元数据与链接。
- **Word (.docx)**：基于 `docx` 引擎生成格式规范的 Microsoft Word 文档。
- **ZIP 归档包**：由 `jszip` 驱动，自动将文章内容与其引用的所有网络图片打包下载到本地。
- **独立文档阅读器 (`doc-viewer`)**：支持在新标签页中以沉浸式排版阅读或编辑抓取到的文档。

### 5. 🔌 本地工作台数据联动
- 支持一键将提取的内容、元数据与图片打包直接推送到本地 **AI Workstation** 工作台（`http://localhost:3000/api/collect`）。
- 网络故障或工作台未开启时，自动进入本地 `chrome.storage` 队列暂存，待工作台连通后自动同步。

---

## 📁 目录结构

```bash
extensions/aicollector/
├── entrypoints/
│   ├── sidepanel/               # 侧边栏主应用 (React App)
│   │   ├── components/
│   │   │   ├── actions/         # 采集操作工具栏 (GrabActionToolbar 等)
│   │   │   ├── cards/           # 采集内容预览卡片 (GrabbedContentCard 等)
│   │   │   ├── modals/          # 弹窗组件 (BundleExportModal 离线打包导出等)
│   │   │   └── tabs/            # 核心标签页 (GrabTab, BookmarksTab, LogsTab, SettingsTab)
│   │   ├── hooks/               # 自定义 React Hooks
│   │   ├── App.tsx              # 侧边栏根组件
│   │   └── style.css            # 侧边栏样式与 Tailwind 导入
│   ├── background.ts            # 后台 Service Worker（消息通信、侧边栏唤起）
│   ├── content.ts               # Content Script 注入脚本（DOM 提取、滚动截图辅助）
│   ├── doc-viewer/              # 独立文档预览窗口
│   └── viewer/                  # 代码与 Markdown 语法高亮预览页面
│
├── src/
│   ├── services/                # 业务逻辑与 API 调用封装
│   ├── types/                   # TypeScript 类型定义
│   └── utils/                   # 工具函数库
│       ├── exporters/           # 导出器 (zipExporter, docxExporter)
│       └── imageDownloader.ts   # 图片下载与处理工具
│
├── public/                      # 插件图标与静态资源
├── package.json                 # 依赖包配置
└── wxt.config.ts                # WXT 框架配置与 Manifest 声明
```

---

## 🚀 开发与构建

### 1. 安装依赖

在仓库根目录下执行：
```bash
pnpm install
```

### 2. 启动开发模式 (HMR)

```bash
# 仅启动采集插件热更开发服务器
pnpm --filter ./extensions/aicollector dev
```

### 3. 加载到浏览器

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`。
2. 打开右上角的 **「开发者模式」** 开关。
3. 点击 **「加载已解压的扩展程序」**。
4. 选择本项目中的 `extensions/aicollector/.output/chrome-mv3` 目录。

### 4. 生产打包

```bash
# 构建生产产物
pnpm --filter ./extensions/aicollector build

# 构建并打包为发布 zip 文件
pnpm --filter ./extensions/aicollector zip
```

---

## 🔒 权限说明

本插件在 `wxt.config.ts` 中声明了以下权限，用于保障核心功能的正常运行：

| 权限名称 | 用途说明 |
|---|---|
| `sidePanel` | 打开并管理浏览器原生侧边栏界面 |
| `activeTab` / `tabs` | 获取当前活动标签页的信息并注入抓取逻辑 |
| `scripting` | 动态执行页面内容提取和滚动截图脚本 |
| `bookmarks` | 读取和管理浏览器书签，支持书签同步与整理 |
| `storage` | 本地存储配置项、抓取草稿以及离线等待同步的数据队列 |
| `downloads` | 支持用户导出 Markdown、DOCX、ZIP 和长截图文件到本地 |
| `<all_urls>` | 允许用户在任意网站上进行内容提取与素材采集 |
