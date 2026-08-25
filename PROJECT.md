# AI Workstation — 项目指导文档

> 本文件是这个项目的"产品宪法"。任何 AI Agent 或开发者在动代码之前，先读完这份文档。
> 技术栈细则见 `AGENTS.md`（TanStack Intent 指引）。

## 一句话定位

**本地优先的 AI 内容工作台**：把散落在各平台（推特、小红书、微信公众号等）的收藏/点赞内容归集到本地，以"文件夹"（类似手机 App 分组）的方式按工作主题组织，并借助 AI 完成热帖回复、内容二创，最终一键分发回各平台。

## 核心产品形态

参考草图：顶部是工作分类 tab（首页、自媒体、作品、创作、工具、chrome 插件、未分类、添加），
主体是文件夹网格，右侧滑出文件夹详情面板（创建时间、包含内容、编辑入口）。

- **文件夹 = 某项工作的归集**：里面可以混放收藏的网站、推文、工具链接、素材文件、本地目录引用
- **未分类**：所有新采集内容的缓冲池，由"一键整理"（AI 分类）或人工拖拽归入文件夹
- **一键整理能力**：调用本地 skills + 在线 AI，把未分类内容批量归类
- **数据库**：本地 SQLite 单文件，支持备份迁移（数据属于用户，不上云）

## 总体架构（已定案，勿随意推翻）

```
┌─ Chrome 插件（"手"）────────────┐   ┌─ 本地工作台 TanStack Start（"脑"）──┐
│ content script 注入按钮/采集      │   │ UI：文件夹网格 + 详情侧栏            │
│ 收藏/点赞旁路监听                 │──→│ server functions：SQLite/本地文件/skills│
│ 发布时操作网页编辑器（公众号/小红书） │←──│ AI 编排 + 定时任务（node 常驻进程）    │
│ side panel iframe 内嵌工作台      │   │ API：/api/collect、/api/tweets ...   │
└────────────────────────────────┘   └───────────────────────────────────┘
         通信：
         1. 数据通道：插件 → fetch localhost:3000/api/*（Bearer token），永远可用
         2. 控制通道：工作台页面 ↔ 插件，externally_connectable + chrome.runtime.connect 长连接，
            仅工作台标签页打开时可用，用于实时指令下发/进度回传
```

**为什么不做纯插件或纯客户端**：插件沙箱无法自由读写本地文件、无法常驻跑定时任务；
客户端无法操作公众号/小红书（无公开 API，只能驱动网页编辑器）。插件+本地服务是唯一两全的形态。

## 关键设计决策（有理由的，改动前先讨论）

1. **SQLite 落本地真实文件**（better-sqlite3 + drizzle），不用浏览器 IndexedDB/OPFS —— 要可备份、可被其他工具读取
2. **定时任务只放服务端 Node 进程** —— MV3 service worker 会休眠，网页标签页会关闭，都不可靠
3. **发布动作保留人工确认** —— 采集和 AI 生成可全自动，但"点发送"由人确认，避免推特等平台风控封号
4. **指令总线与数据通道分离** —— 大内容（正文/图片）走 HTTP API 入库；实时控制信令走 port 长连接，互不阻塞
5. **插件采集失败要进 chrome.storage 队列**，检测到工作台恢复后批量补发 —— 不丢数据
6. **服务端绑定 127.0.0.1 + 本地 token 认证** —— 防本机其他网页恶意调用
7. **不 hook 目标站点的 fetch/XHR** —— DOM 级监听（MutationObserver）够用且稳定，hook 网络层易碎且有合规风险

## 插件能力清单（规划）

| 能力 | 机制 | 阶段 |
|---|---|---|
| 收藏当前页到工作台 | action / 快捷键 / 右键菜单 → content script 提取 → POST /api/collect | P0 |
| AI 自动归类到文件夹 | 服务端 chat() + outputSchema 结构化分类，低置信度留"未分类" | P0 |
| side panel 内嵌工作台 | iframe localhost:3000 | P0 |
| 浏览器原生收藏（Ctrl+D）拦截 | chrome.bookmarks.onCreated 转发 | P1 |
| 推特推文内嵌"AI 回复/二创"按钮 | content script 注入，内容回传工作台处理 | P1 |
| 推特热帖自动收集 | 时间线 DOM 监听，互动数超阈值自动入库 | P1 |
| 发布到公众号/小红书 | content script 操作网页版编辑器填充 | P2 |
| 插件管理页（chrome 插件文件夹） | externally_connectable + chrome.management | P2 |
| 各平台点赞/收藏旁路同步 | 监听原生收藏按钮状态变化 | P2 |

## 典型工作流（推特场景，架构的"标准走查用例"）

1. 采集：推特推文下的嵌入按钮 → 抓取作者/正文/互动数据 → POST /api/tweets 入库（status: pending）
2. 处理：服务端定时任务批量调 AI 生成回复草稿 / 二创文案（status: draft_ready）
3. 审稿：工作台 UI 人工过一遍草稿
4. 发布：点"发送" → 控制通道下发指令 → content script 填充回复框 → **人点发布**

## 数据模型（初版草案）

- `folders`：id, name, icon, category(tab), sortOrder, createdAt
- `items`：id, folderId(null=未分类), type(tweet/link/article/image/file...), url, title, content, siteMeta(json), createdAt
- `tweets`：id, itemId, author, handle, text, metrics(json), status(pending/draft_ready/replied), createdAt
- `drafts`：id, tweetId, kind(reply/remake), content, status, createdAt
- `settings`：key/value（token、AI 配置、分类偏好）

## 目录约定

```
src/routes/            # 工作台 UI（文件夹网格、详情侧栏、未分类、设置）
src/server/            # server functions：folders / collect / tweets / drafts / files / skills
src/server/db/         # better-sqlite3 + drizzle schema 与迁移
src/server/api/        # 供插件调用的 HTTP API（server routes，token 校验）
extension/             # Chrome 插件（MV3）：manifest、background、content scripts、side panel
~/.aiworkstation/      # 运行时数据目录：workbench.db、assets/
```

## 开发命令

- `pnpm dev`：启动工作台（localhost:3000）
- 插件：`extension/` 目录用 Chrome「加载已解压的扩展程序」安装，改 content script 后需刷新目标页

## Roadmap

1. **M1 采集闭环**：folders/items 数据模型 + /api/collect + 插件主动收藏 + AI 归类 + 文件夹网格 UI
2. **M2 推特链路**：推文嵌入按钮 + /api/tweets + 定时生成回复草稿 + 审稿 UI + 指令回灌填充
3. **M3 发布矩阵**：公众号/小红书编辑器填充 + 书签拦截 + 热帖自动收集
4. **M4 打磨**：side panel、插件管理页、数据备份导出、skills 深度集成
