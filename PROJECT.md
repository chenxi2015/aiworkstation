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
         1. 数据通道：插件 → fetch localhost:3888/api/*（Bearer token），永远可用
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
| side panel 内嵌工作台 | iframe localhost:3888 | P0 |
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

- `pnpm dev`：启动工作台（localhost:3888）
- 插件：`extension/` 目录用 Chrome「加载已解压的扩展程序」安装，改 content script 后需刷新目标页

## RAG 知识检索与书签活化架构（已接入）

针对“收藏即吃灰”的痛点，工作台引入了 **混合检索（Hybrid Search）+ 本地 RAG 知识活化引擎**：

1. **向量化与特征提取（Embedding Pipeline）**：
   - 自动提取书签标题、TDK、分类、标签与 AI 摘要，构建语义特征文本；
   - 接入 OpenAI 兼容 Embedding API（SiliconFlow `bge-m3` / OpenAI `text-embedding-3-small` / Ollama 本地模型）；
   - 向量浮点数组持久化至本地 SQLite `bookmarks` 表的 `embedding` 字段。
2. **多模态检索策略（Hybrid Engine）**：
   - **语义检索（Semantic）**：基于余弦相似度（Cosine Similarity），理解自然语言意图；
   - **精准匹配（Keyword）**：加权匹配标题、标签、域名与关键词；
   - **混合加权（Hybrid）**：`0.6 * 语义 + 0.4 * 关键词` 动态融合排序。
3. **书签活化与二创赋能**：
   - **全局快捷搜索（Cmd+K）**：随时唤起，精准快速找到模糊记忆中的工具与资料；
   - **Chat with Bookmarks（RAG 问答）**：基于个人收藏库向 AI 提问并获取引用佐证；
   - **文件夹专题提炼（Dossier）**：一键将成批碎片书签总结为体系化研究综述与备忘单；
   - **每日灵感胶囊（Daily Capsule）**：主动唤醒沉睡的高价值工具与干货。

## Roadmap

1. **M1 采集闭环**（✅ 已完成）：folders/items 数据模型 + SQLite 落盘 + Chrome 插件主动同步 + DeepSeek 批量智能归类 + 文件夹网格 UI
2. **M2 搜索与 RAG 知识活化**：
   - **阶段一（✅ 已完成）**：全局快捷搜索（Cmd+K）+ SQLite 向量持久化 + TS 高效余弦相似度引擎 + 混合检索 + 索引构建流水线
   - **阶段二（🚀 进行中）**：RAG 智能问答侧栏（Chat with Bookmarks）+ 文件夹一键专题综述提炼 + 首页每日灵感胶囊
3. **M3 创作与二创矩阵**：
   - 写作时自动关联并引用收藏库中的工具/素材
   - 推文/小红书/视频脚本二创与草稿生成
   - 指令通道回灌至网页编辑器并保留人工确认发布
4. **M4 打磨与分发矩阵**：
   - Chrome side panel 深度联动
   - 个人专属视觉导航页（Showcase）一键导出
   - 数据备份迁移与 skills 深度集成
