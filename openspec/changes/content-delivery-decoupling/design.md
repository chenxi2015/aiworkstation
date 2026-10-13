# Design

## Context

现状链路（See proposal.md - Why）：Agent 调 `trigger_document_create` → `createDocumentCreateTool` 按 studioMounted 分流 → headless 直接写 documents 表 / 交互式流式写编辑器。内容本体不进对话上下文（Agent 只产出大纲 prompt），但**产出即写入**，用户没有落点决策权，且已出现双写、空文档事故（已在 action-proposal-layer 之后单独修复）。

约束（已定案，不可推翻）：

- 决策 8：obsidian 纯文件直读直写，不进 documents 表；创作文档主存储为 SQLite documents 表（不改）。
- 决策 3/9：发布与删除保留人工确认；文件删除走 trash。
- 双栏保持页面归属形态；action-proposal 层只管改写类意图的目标解析。

## Goals / Non-Goals

**Goals**

- AI 产出与用户落点决策解耦：产出 → 草稿 → 用户选落点 → 持久化。
- 长文正文不进入对话消息体，上下文只携带 draft 元数据。
- 草稿区是本地文件（用户可见、可备份、可被外部工具读取），不是黑盒。
- 交付卡片是一等消息公民：预览、三个落点动作、已归档后变惰性态。

**Non-Goals**

- 不改创作文档主存储（SQLite documents 表不动）。
- 不改写类双栏流水线的任何行为。
- 不做草稿的多版本历史（一期覆盖式更新；版本化留待后续）。
- 不做草稿在创作模块 UI 中的可见分组（一期草稿只通过交付卡片触达）。

## Decisions

### D1：草稿区 = 目录约定 + 元数据索引文件

草稿落在 `~/.aiworkstation/drafts/`：每份草稿一个 `.md` 文件（正文 + frontmatter 标题），另有一个 `index.json` 维护 `{ id, title, wordCount, createdAt, updatedAt, sessionId, status: "pending" | "archived", archivedTo?: { kind: "document" | "note", ref: string } }`。

理由：文件即内容本体（Markdown 外部可读、可 git、可 rg 全文搜），索引只存元数据供列表/清理用——避免把正文再拷一份进 JSON。替代方案（草稿也进 SQLite 新表）被否：违背"草稿不进库、确认才入库"的核心动机，且失去外部可读性。

### D2：Agent 侧用「草稿产出工具」替代 trigger_document_create

新增 `draft_article` 工具：Agent 产出全文 → 服务端写草稿文件 → 返回 `{ draftId, title, wordCount }` 的 navigation 负载。原 `trigger_document_create` 从全局工具注册表移除（编辑器人格 prompt 同步删除相关指引）。

关键约束：工具产出只有元数据，正文不回传 LLM（字数已在服务端可算）。`headlessCreateDocument` 的生成核心 `generateArticleContent` 被复用，只是写入目标从 documents 表换成草稿文件。

### D3：交付卡片 = 消息上的 draft 负载，不是新消息类型

复用 action-proposal 已建立的模式：`ChatItem` 增加 `draft?: { draftId, title, wordCount, status }` 负载，`ChatMessageItem` 顶层 dispatch 渲染 `DraftDeliveryCard`。卡片动作：

- 预览：读草稿文件全文，弹层展示（不落任何状态）。
- 存为创作文档：server function 读草稿 → markdown 转 TipTap JSON → 入 documents 表 → 索引标记 archivedTo=document → toast + 跳转卡片。
- 存为笔记：弹目录选择（默认当前目录/Vault 根）→ 移动草稿 .md 到 Vault 目标目录（改名去重）→ 索引标记 archivedTo=note。
- 丢弃：删草稿文件 + 索引标记清理（走 trash 约定）。

「在创作台里边写边看」不作为卡片动作保留——简化决策面；有观摩需求的用户话术（「在创作台里写」）由后续 change 再评估。

### D4：追问修改 = read 工具 + 草稿覆盖更新

用户对已交付草稿的修改请求（「第三段展开」）走通用 Agent + `fs_read_file`/`fs_patch_file`（fs 工具集已有，草稿目录加入白名单）。Agent 改的是草稿文件本体，索引的 updatedAt/wordCount 同步刷新。一期不做版本快照——草稿本质是未确认的中间态，覆盖即可。

### D5：清理 = 启动时清扫 + 保留期

app 启动时扫 `index.json`：`status=pending` 且 `updatedAt` 超过 7 天 → 移入 trash（决策 9 约定）。已 archived 的草稿默认立即删除文件（内容已在目标存储），索引记录保留供会话卡片渲染惰性态。

替代方案（系统定时任务）被否：本地单机应用，启动时清扫足够，不引入额外调度复杂度。

## Risks / Trade-offs

- [草稿堆积占盘] → 7 天 TTL + 启动清扫；单份草稿几十 KB，量级可控。
- [会话卡片引用已清理的草稿] → 卡片渲染时草稿不存在则显示「草稿已过期」惰性态，不报错。
- [Agent 改写草稿时把全文读回上下文] → read 工具带分页（offset/limit 已有约定），prompt 指引按需读片段；一期接受最坏情况下全文读回（几 KB 级，可承受）。
- [用户绕过卡片直接让 Agent「存进创作」] → Agent 工具表中没有直写创建工具（D2 已移除），只能改草稿；落库动作只有卡片按钮一个入口，行为收敛。

## Migration Plan

无数据迁移。行为变更点：创作类请求不再自动落库（用户需多点一次「存为创作文档」）。回滚 = revert 本 change，恢复 `trigger_document_create` 注册。草稿区目录在首次产出时自动创建，回滚后残留草稿不影响任何功能。

## Open Questions

- 「存为笔记」的目录选择器形态（下拉树 vs 输入路径自动补全）实现时按 obsidian 模块现有目录组件复用情况定。
