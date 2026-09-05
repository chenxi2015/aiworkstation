# AI Workstation — 项目指导文档

> 本文件是这个项目的"产品宪法"。任何 AI Agent 或开发者在动代码之前，先读完这份文档。
> 技术栈细则见 `AGENTS.md`（TanStack Intent 指引）。

## 一句话定位

**本地优先的个人知识 Agent 工作台**：把散落在各平台（推特、小红书、微信公众号等）的收藏/点赞内容归集到本地，以"文件夹"（类似手机 App 分组）的方式按工作主题组织，通过 RAG 混合检索激活沉睡收藏，借助 AI Agent 自主完成知识整理、深度调研、趋势洞察与内容二创，最终一键分发回各平台。

> **产品愿景**：从「收藏工具」进化为「个人知识 Agent」——市面上的书签管理工具（Raindrop / Pocket / Notion Web Clipper）停留在「人驱动 → 系统响应」的被动模式。AI Workstation 的终极目标是让 Agent 自主规划、多步执行、主动发现，从「管理工具」跃迁为「知识 Agent」。

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

1. **SQLite 落本地真实文件**（better-sqlite3 + 原生 SQL 建表/迁移，见 `src/server/db/schema.ts`），不用浏览器 IndexedDB/OPFS —— 要可备份、可被其他工具读取
2. **定时任务只放服务端 Node 进程** —— MV3 service worker 会休眠，网页标签页会关闭，都不可靠
3. **发布动作保留人工确认** —— 采集和 AI 生成可全自动，但"点发送"由人确认，避免推特等平台风控封号
4. **指令总线与数据通道分离** —— 大内容（正文/图片）走 HTTP API 入库；实时控制信令走 port 长连接，互不阻塞
5. **插件采集失败要进 chrome.storage 队列**，检测到工作台恢复后批量补发 —— 不丢数据
6. **服务端绑定 127.0.0.1 + 本地 token 认证**（⚠️ 目标态，当前 `/api/collect` middleware 尚未做 token 校验，仅有 CORS 放行）—— 防本机其他网页恶意调用
7. **不 hook 目标站点的 fetch/XHR** —— DOM 级监听（MutationObserver）够用且稳定，hook 网络层易碎且有合规风险

## 插件能力清单（规划）

| 能力 | 机制 | 阶段 |
|---|---|---|
| 收藏当前页到工作台 | action / 快捷键 / 右键菜单 → content script 提取 → POST /api/collect | P0 ✅ 已实现 |
| AI 自动归类到文件夹 | 服务端 chat() + outputSchema 结构化分类，低置信度留"未分类" | P0 ✅ 已实现（DeepSeek 批量分类 + AIClassifyModal） |
| side panel 内嵌工作台 | iframe localhost:3888 | P0 ✅ 已实现（WXT sidepanel） |
| 浏览器原生收藏（Ctrl+D）拦截 | chrome.bookmarks.onCreated 转发 | P1 |
| 推特推文内嵌"AI 回复/二创"按钮 | content script 注入，内容回传工作台处理 | P1 |
| 推特热帖自动收集 | 时间线 DOM 监听，互动数超阈值自动入库 | P1 |
| 发布到公众号/小红书 | content script 操作网页版编辑器填充 | P2 |
| 插件管理页（chrome 插件文件夹） | externally_connectable + chrome.management | P2 |
| 各平台点赞/收藏旁路同步 | 监听原生收藏按钮状态变化 | P2 |

## 典型工作流（推特场景，📋 规划中的架构"标准走查用例"，尚未实现）

> 注：`tweets` / `drafts` 数据表与 `/api/tweets` 接口目前均不存在，以下为 M3 的目标设计。

1. 采集：推特推文下的嵌入按钮 → 抓取作者/正文/互动数据 → POST /api/tweets 入库（status: pending）
2. 处理：服务端定时任务批量调 AI 生成回复草稿 / 二创文案（status: draft_ready）
3. 审稿：工作台 UI 人工过一遍草稿
4. 发布：点"发送" → 控制通道下发指令 → content script 填充回复框 → **人点发布**

## 数据模型（当前实现，见 `src/server/db/schema.ts`）

- `folders`：id, name, category(tab), parent_id, description, color, icon, sort_order, created_at, updated_at
- `bookmarks`：id, url(unique), title, description, keywords, summary, item_type, tags(json), favicon, parent_title, folder_path, reason, source, date_added, embedding, embedding_text, created_at, updated_at
  - 未归属任何文件夹的 bookmark 即"未分类"（buffer pool）
- `folder_items`：folder_id ↔ item_id 多对多绑定表（含 sort_order）
- `settings`：key/value（token、AI 配置、分类偏好）

> 规划中未落地：`tweets`、`drafts` 表（推特工作流用，见上节）。

## 目录约定

```
src/routes/            # 工作台 UI（文件夹网格、详情侧栏、未分类、设置）
src/server/functions/  # server functions：workbench / search(embedding) / rag / models
src/server/db/         # better-sqlite3 + 原生 SQL schema 与迁移
src/server/ai/tools/   # ReAct Agent 的 8 个书签/文件夹 Tool
src/server/maintenance.ts # 死链巡检等后台维护任务
vite.config.ts         # 插件 HTTP API（/api/collect）以 Vite dev middleware 形式挂在这里
extensions/aicollector/ # Chrome 插件（WXT 框架）：background / content / sidepanel 等 entrypoints
~/.aiworkstation/      # 运行时数据目录：workbench.db、assets/
```

## 开发命令

- `pnpm dev`：启动工作台（localhost:3888）
- 插件：`pnpm --filter ./extensions/aicollector dev` 启动 WXT 热更（端口 3889），
  或在 Chrome「加载已解压的扩展程序」中选择 `extensions/aicollector/.output/chrome-mv3`

## RAG 知识检索与书签活化架构（已接入）

针对“收藏即吃灰”的痛点，工作台引入了 **混合检索（Hybrid Search）+ 本地 RAG 知识活化引擎**：

1. **向量化与特征提取（Embedding Pipeline）**：
   - 自动提取书签标题、TDK、分类、标签与 AI 摘要，构建语义特征文本；
   - 接入 OpenAI 兼容 Embedding API（SiliconFlow `bge-m3` / OpenAI `text-embedding-3-small` / Ollama 本地模型）；
   - 向量浮点数组持久化至本地 SQLite `bookmarks` 表的 `embedding` 字段。
   - 由 `batchGenerateEmbeddings`（`src/server/functions/search.ts`）触发，服务于搜索/RAG。
     ⚠️ 与「AI 一键智能分类」是两条独立流水线：分类直接调 LLM（提示词携带已有 tags），不依赖向量索引，无需先建索引再分类。
2. **多模态检索策略（Hybrid Engine）**：
   - **语义检索（Semantic）**：基于余弦相似度（Cosine Similarity），理解自然语言意图；
   - **精准匹配（Keyword）**：加权匹配标题、标签、域名与关键词；
   - **混合加权（Hybrid）**：`0.6 * 语义 + 0.4 * 关键词` 动态融合排序。
3. **书签活化与二创赋能**：
   - **全局快捷搜索（Cmd+K）**：随时唤起，精准快速找到模糊记忆中的工具与资料；
   - **Chat with Bookmarks（RAG 问答）**：基于个人收藏库向 AI 提问并获取引用佐证；
   - **文件夹专题提炼（Dossier）**：一键将成批碎片书签总结为体系化研究综述与备忘单。

## AI Agent 能力演进（规划方向）

### Agent 成熟度模型

| 等级 | 能力描述 | 当前状态 |
|------|---------|----------|
| **L0 — 纯检索** | 用户搜索 → 返回列表 | ✅ 已实现 (`searchWorkbenchItems`) |
| **L1 — RAG 问答** | 检索 + LLM 总结回答 | ✅ 已实现 (`chatWithBookmarks`) |
| **L2 — ReAct Tool Calling** | LLM 自主决定调用哪个 Tool | ✅ 已实现（8 个 Tool：query_bookmarks / create_folder / update_folder / delete_folder / move_bookmarks_to_folder / remove_bookmarks_from_folder / move_folder / reorder_folders） |
| **L3 — 多步规划执行** | Agent 拆解复杂任务 → 多步 Tool 链式执行 | 🎯 下一阶段目标 |
| **L4 — 自主后台 Agent** | 无需用户触发，后台持续运行巡检 | 📋 远期规划 |
| **L5 — 多 Agent 协作** | 多个专业 Agent 协同完成复杂任务 | 📋 远期规划 |

> **核心策略**：不引入重量级 Agent 框架。TanStack AI 的 `chat()` 天然支持 agent loop（多轮 Tool Calling），只需扩展 Tool 集 + 增强 System Prompt 的规划引导，即可自然演化为多步 Agent。

### 六大 Agent 方向

1. **🏠 知识管家 Agent（后台自治）**
   - 新书签入库自动触发 AI 分类归档
   - 定期巡检：失效 URL 检测、重复合并、大文件夹拆分建议
   - 知识库健康报告推送

2. **🔬 研究员 Agent（深度调研）**
   - 用户给出研究主题 → Agent 多步执行：先查本地 → 联网搜索补充 → 对比矩阵 → 入库归档 → 生成报告
   - 从「搜存量」升级为「探增量」

3. **⚡ 工作流编排 Agent（Plan-Execute）**
   - 一句话描述复杂意图（如「把所有 AI 相关但未归档的书签按子主题自动整理」）
   - Agent 自动拆解为多步 Tool 调用，逐步执行并汇报进度

4. **📊 资产看板 Agent（定期洞察）**
   - 自动生成知识资产周报：新增趋势、热点主题、未覆盖领域
   - 收藏兴趣漂移分析与工具推荐

5. **🌐 协同 Agent（跨源联邦）**
   - 跨多个知识源协同检索（本地书签 + Notion + Raindrop 等）
   - Connector Plugin 扩展架构

6. **🎯 学习路径 Agent（知识图谱）**
   - 基于收藏资源构建知识图谱，分析难度和依赖关系
   - 自动规划学习路径，发现知识盲区

### Tool 扩展规划

现有 8 个 Tool（`src/server/ai/tools/`）是 Agent 行动的基础，需逐步扩展：

| Tool | 用途 | 优先级 |
|------|------|--------|
| `query_bookmarks` | 结构化条件查询 | ✅ 已有 |
| `create_folder` | 创建文件夹 | ✅ 已有 |
| `move_bookmarks_to_folder` | 批量归档 | ✅ 已有 |
| `update_folder` | 更新文件夹 | ✅ 已有 |
| `delete_folder` | 删除文件夹 | ✅ 已有 |
| `remove_bookmarks_from_folder` | 从文件夹移出书签 | ✅ 已有 |
| `move_folder` | 移动文件夹（跨分类/层级） | ✅ 已有 |
| `reorder_folders` | 文件夹排序 | ✅ 已有 |
| `get_stats` | 统计分析（按分类/时间/标签分布） | P1 |
| `find_duplicates` | 基于 URL 和语义的重复检测 | P1 |
| `batch_classify` | 批量智能分类（复用 AIClassifier） | P1 |
| `delete_bookmark` | 删除书签 | P1 |
| `check_url_health` | 链接有效性检测 | P2 |
| `web_search` | 联网搜索补充本地库外的资源 | P2 |
| `extract_page_info` | 抓取 URL 页面 TDK 信息 | P2 |
| `compare_items` | 多工具结构化对比矩阵 | P2 |
| `get_collection_trends` | 收藏趋势统计与漂移分析 | P3 |

## Roadmap

1. **M1 采集闭环**（✅ 已完成）：folders/items 数据模型 + SQLite 落盘 + Chrome 插件主动同步 + DeepSeek 批量智能归类 + 文件夹网格 UI
2. **M2 搜索与 RAG 知识活化**：
   - **阶段一（✅ 已完成）**：全局快捷搜索（Cmd+K）+ SQLite 向量持久化 + TS 高效余弦相似度引擎 + 混合检索 + 索引构建流水线
   - **阶段二（✅ 已完成）**：RAG 智能问答侧栏（Chat with Bookmarks）+ 文件夹一键专题综述提炼 + ReAct Tool Calling（4 Tools）
   - **阶段三（✅ 已完成）**：浏览器原生书签导入同步（BookmarkSyncModal）+ 死链巡检（DeadLinksModal + maintenance 后台扫描）+ ReAct Tool 扩展至 8 个
3. **M3 创作与二创矩阵**：
   - 写作时自动关联并引用收藏库中的工具/素材
   - 推文/小红书/视频脚本二创与草稿生成
   - 指令通道回灌至网页编辑器并保留人工确认发布
4. **M4 打磨与分发矩阵**：
   - Chrome side panel 深度联动
   - 个人专属视觉导航页（Showcase）一键导出
   - 数据备份迁移与 skills 深度集成
5. **M5 AI Agent 智能体演进**（L2 → L3 → L4）：
   - **搜索增强**：Facet 聚合过滤 + 搜索 Scope 限定 + 搜索结果高亮 + 搜索历史热搜
   - **Tool 集扩展**：`get_stats` / `find_duplicates` / `batch_classify` / `delete_bookmark` / `check_url_health`
   - **多步 Agent**：复杂意图自动拆解为多步 Tool 链执行（Plan → Execute → Verify）
   - **后台自治**：新书签入库自动归档 + 定期知识库巡检 + 知识资产周报
   - **联网研究**：`web_search` + `extract_page_info` 联网补充，深度调研生成对比报告
   - **跨源协同**：Connector Plugin 架构，联邦检索 Notion / Raindrop 等外部知识源
