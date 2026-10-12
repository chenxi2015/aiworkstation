# Proposal

## Why

web_search 是全局 Agent 的事实核查与外部信息入口，但当前实现不稳定且能力落后于业界：

1. **零门槛兜底 provider 极不可靠**：`GeneralSearchProvider` 直接抓取百度 SERP 页面并用正则解析 HTML —— 百度改版、反爬风控、海外查询、JS 渲染内容都会让它静默返回 0 条或脏数据，且无任何重试与超时分级
2. **单一主力 + 静态 fallback**：Tavily 是硬编码唯一主力，失败/空结果才落到不可靠的百度抓取；没有多引擎聚合、没有结果去重、没有质量排序
3. **结果信息贫乏**：`SearchResult` 只有 title/url/snippet，没有 relevance score、站点图标、原始内容获取；Agent 无法基于质量信号做引用取舍
4. **无深度内容获取链路**：业界前沿的 Agent 搜索（Tavily extract / Jina Reader / Firecrawl）都提供「搜索 → 抓取正文 → Markdown」闭环，而本项目只有 snippet，Agent 想做深度调研只能碰运气
5. **不可观测、不可配置**：provider 选择、超时、失败原因全部埋在 console.warn，用户无法在设置里切换引擎，也无法知道一次搜索走了哪条路

本变更重新规划搜索能力为「多引擎聚合 + 内容抓取 + 可观测」的现代 Agent 搜索子系统。

## What Changes

- **provider 注册表与编排器重构**：`SearchProvider` 从「单实例复合 fallback」升级为「注册表 + 编排器（orchestrator）」——支持多引擎级联/竞速两种策略、结果去重与相关性重排、单次搜索的调用链记录（哪台引擎、耗时、成败、条数）
- **新增主流搜索 API provider**：Exa（语义搜索，Agent 生态主流）、Brave Search API（独立索引、价格友好）、Jina Search（`s.jina.ai`，零配置兜底替代百度抓取）；保留 Tavily 并补全其 `search_depth` 与 `include_answer` 能力
- **移除百度 HTML 抓取**：`GeneralSearchProvider` 删除，零配置兜底改由 Jina Search（无需 API key、返回结构化结果）承担
- **SearchResult 模型增强**：增加 `score`、`favicon`、`engine`（来自哪台引擎）字段；向后兼容现有 `title/url/snippet/publishedDate`
- **新增 `web_fetch` 工具**：URL → Markdown 正文提取，优先 Jina Reader（`r.jina.ai`，零配置），Tavily Extract 作为有 key 时的增强；与 web_search 组合成「搜到 → 读透」闭环
- **可观测与可配置**：provider 优先级、超时纳入 settings（`settings.searchConfig`）；每次搜索的引擎选择、耗时、失败原因写入结构化日志（沿用 TanStack AI debug-logging 约定）
- **BREAKING**：`GeneralSearchProvider` 类删除；`getSearchProvider()` 返回值从单体 provider 变为编排器，但 `SearchProvider` 接口签名保持不变，调用方（`webSearchTool.ts`）无需改动

第一期范围：搜索编排器 + Exa/Brave/Jina/Tavily 四 provider + web_fetch 工具。结果持久化到 RAG、搜索历史 UI、定时监控订阅等暂不纳入。

## Capabilities

### New Capabilities

- `web-search-orchestration`: 联网搜索的引擎编排体系——provider 注册表、级联/竞速策略、结果去重重排、超时与失败降级、调用链可观测。约束「一次搜索请求如何选择引擎、聚合结果、报告成败」的系统行为
- `web-content-fetch`: URL 正文抓取能力——将任意网页转为干净 Markdown 供 Agent 深读，含 Jina Reader / Tavily Extract 双通道与降级规则。约束「Agent 如何获取搜索结果之外的全文内容」的系统行为

### Modified Capabilities

（无现存 specs，全部为新增能力）

## Impact

- **服务端**：`src/server/ai/search/index.ts`（重构为注册表 + 编排器）、`src/server/ai/search/types.ts`（SearchResult/SearchOptions 扩展）、`src/server/ai/search/tavilyProvider.ts`（补全参数）、`src/server/ai/search/generalSearchProvider.ts`（**删除**）、新增 `exaProvider.ts` / `braveProvider.ts` / `jinaProvider.ts` / `fetch/jinaReader.ts` / `fetch/tavilyExtract.ts`
- **工具层**：`src/server/ai/tools/webSearchTool.ts`（摘要中携带引擎来源与耗时）、新增 `src/server/ai/tools/webFetchTool.ts`、工具注册 `src/server/ai/tools/index.ts`
- **配置**：`settings.searchConfig`（engine 优先级、excludedEngines、timeoutMs）；环境变量新增 `EXA_API_KEY` / `BRAVE_API_KEY` / `JINA_API_KEY`（均可选）
- **前端**：web_search 结果卡片展示来源引擎标识（轻量改动，复用现有 references 渲染）
- **不影响**：SQLite schema（搜索调用链只走日志不落表）、Chrome 插件通道、RAG 检索链路（web_search 与本地检索保持并列，不融合）
