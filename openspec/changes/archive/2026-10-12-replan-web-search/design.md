# Design

## Context

现有搜索实现（`src/server/ai/search/`）是典型的「单主力 + 静态 fallback」：Tavily 有 key 就用，失败落到百度 HTML 抓取。百度抓取对反爬极度敏感，且没有任何多引擎聚合与可观测能力。业界 Agent 搜索的标准做法（Perplexity / Devin / 各类 Deep Research 实现）都是「多引擎 + 摘要 + 全文抓取」三段式，本设计对齐这一形态。

约束：

- `SearchProvider` 接口签名必须保持不变（`search(query, options) → SearchResult[]`），否则要连带改 `webSearchTool` 与上游 `agentRunner`
- 不引入新的重型依赖（不引入 Playwright / Puppeteer 做无头渲染），所有 provider 均为纯 HTTP API
- 配置必须走 settings 表（与项目「导航可自定义」「工作台布局持久化」同一约定），不引入新的配置文件

## Goals / Non-Goals

**Goals:**

- 任意 key 配置下搜索都能返回结果（零配置至少有 Jina 兜底）
- 单次搜索可追溯到具体引擎与失败原因
- Agent 能在拿到搜索结果后继续调用 web_fetch 读全文
- 用户可在 UI / settings 里调整引擎优先级与超时

**Non-Goals:**

- 搜索结果持久化到 SQLite / 进入 RAG 索引
- 无头浏览器渲染抓取（JS-heavy 页面仍可能抓不到正文，接受这一限制）
- 多引擎并行聚合（竞速模式）；第一期只做级联，竞速留作后续增强
- 定时搜索 / 监控订阅

## Decisions

### D1: 编排器保持 `SearchProvider` 接口，内部做级联

`getSearchProvider()` 返回值从「CompositeSearchProvider（也是 SearchProvider）」换成「SearchOrchestrator（同样是 SearchProvider）」。对 `webSearchTool` 完全透明。

**替代方案**：把编排器暴露成新接口（`searchWithTrace()` 返回 `{ results, trace }`）。被否：会迫使所有调用方改签名，违背「BREAKING 仅限删除 GeneralSearchProvider」的范围约束。trace 通过结构化日志输出即可。

### D2: 级联而非竞速作为默认策略

级联策略：按序尝试，首个非空结果胜出。理由：

- 省钱——竞速会向所有引擎发请求，Tavily/Exa 都按次计费
- 日志清晰——每次搜索有明确的「主力引擎」归属
- 失败语义简单——级联的「全部失败」等价于「每个引擎都失败一次」

竞速模式的价值（降低 P99 延迟）在本项目场景不显著：Agent 搜索本来就是异步工具调用，用户对 2s vs 5s 不敏感。留作将来配置项 `strategy: "cascade" | "race"`。

### D3: Jina Search 替代百度抓取作为零配置兜底

Jina 的 `s.jina.ai/<query>` 端点：

- 无需 API key（带 key 有更高额度，key 可选）
- 返回结构化文本（JSON 模式需 `Accept: application/json`，无 key 时也支持）
- 自带相关性排序

百度 HTML 抓取的所有短板（反爬、改版、正则脆弱）在 Jina 上都不存在。

**替代方案**：SearXNG 自托管。被否：违背「本地优先但不要求用户部署额外服务」的产品形态，用户没有义务再跑一个容器。

### D4: Exa / Brave 作为可选增强，而非必需

Exa 是 Agent 生态主流的语义搜索（对「找出与 X 类似的页面」类查询效果好），Brave 是独立索引（不依赖 Google/Bing）。两者都需要 key，不做为零配置路径，只在用户配置后进入注册表。

### D5: web_fetch 双通道：Jina Reader 主，Tavily Extract 备

Jina Reader（`r.jina.ai/<url>`）零配置、输出干净 Markdown、对中文站点支持好，是天然主力。Tavily Extract 只在 `TAVILY_API_KEY` 存在时作为降级通道。

**替代方案**：Firecrawl。被否：必须 API key、免费额度紧、对本项目「本地优先」调性不符。

### D6: SearchResult 扩展而非替换

```ts
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  // 新增：
  score?: number;      // 引擎原生相关性分数（归一化到 0-1）
  favicon?: string;    // 站点图标 URL（Brave/Exa 原生支持，Jina/Tavily 由 google favicon 服务推导）
  engine?: string;     // 结果来源引擎名（"tavily" | "exa" | "brave" | "jina"）
}
```

所有新字段可选，现有调用方（`webSearchTool.ts`）不需要修改即可继续工作；工具层随后再读出这些字段丰富摘要。

### D7: 配置模型

新增 settings key `searchConfig`：

```ts
{
  engineOrder?: string[];        // 缺省 ["tavily","exa","brave","jina"]
  excludedEngines?: string[];    // 缺省 []
  timeoutMs?: number;            // 单引擎超时，缺省 10000
}
```

API key 仍走环境变量（`TAVILY_API_KEY` / `EXA_API_KEY` / `BRAVE_API_KEY` / `JINA_API_KEY`），不入 settings 表——与项目现有 key 管理约定一致。

### D8: 可观测性走 console 结构化日志

沿用 TanStack AI debug-logging 约定，每次搜索输出一行 JSON：

```
[SearchOrchestrator] {"query":"...","attempts":[{"engine":"tavily","ms":1234,"status":"failed","error":"..."},{"engine":"jina","ms":876,"status":"success","count":5}],"totalMs":2110}
```

不引入 pino/winston，保持与项目现有 `console.warn` 风格一致，只是改为 JSON 字符串便于 grep。

## Risks / Trade-offs

- [Jina 零配置额度有限，频繁搜索会触发 429] → 编排器将 429 视为「该引擎本次失败」自动降级；用户可配 `JINA_API_KEY` 提升额度；文档注明零配置仅适合轻量使用
- [Exa 对中文查询效果弱于英文] → 默认 engineOrder 把 Tavily 放最前（对中文更友好），Exa 作为语义补充；用户可按需调整
- [web_fetch 对 JS 渲染重站（如某些 SPA）仍拿不到正文] → 接受限制，在工具描述中告知 Agent「抓不到就让用户贴正文」；不引入无头浏览器
- [Tavily Extract 计费按页面计] → web_fetch 默认只用 Jina，Tavily 仅在 Jina 失败时启用，且在日志中明确计费事件
- [引擎优先级放在 settings，多实例（工作台 + 插件）可能读到不同快照] → settings 读取走 server functions 每次实时读表，不缓存；编排器在每次 search 调用时重建

## Migration Plan

1. 新增 provider 与 fetch 通道文件（纯新增，零风险）
2. 重构 `index.ts` 为 SearchOrchestrator（接口不变，现有调用方无感）
3. 删除 `generalSearchProvider.ts`（BREAKING，但项目内无外部消费方，只有 `index.ts` 引用）
4. 扩展 `SearchResult`（可选字段，向后兼容）
5. 新增 `webFetchTool` 并注册
6. 前端结果卡片读取 `engine` 字段显示徽标（可选增强，不阻塞）

回滚：`git revert` 单次提交即可，无 schema 迁移、无配置迁移。

