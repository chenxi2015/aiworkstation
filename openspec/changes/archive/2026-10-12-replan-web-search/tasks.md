# Tasks

## 1. 类型与基础设施

- [x] 1.1 扩展 `src/server/ai/search/types.ts`：`SearchResult` 增加可选 `score` / `favicon` / `engine` 字段；`SearchOptions` 增加可选 `timeoutMs`。验证：`pnpm tsc --noEmit` 通过
- [x] 1.2 新增 `src/server/ai/search/registry.ts`：导出 `SearchEngineId` 联合类型（`"tavily" | "exa" | "brave" | "jina"`）与 `ProviderDescriptor { id, label, requiresKey, build(apiKey?) }`；导出 `DEFAULT_ENGINE_ORDER` 常量。验证：`pnpm tsc --noEmit` 通过
- [x] 1.3 新增 `src/server/ai/search/urlNormalize.ts`：实现 `normalizeUrl(url)`（去末尾斜杠、去 `www.` 前缀、协议小写、去默认端口）。验证：单元测试覆盖「`https://www.a.com/x/` 与 `https://a.com/x` 归一为同一 key」

## 2. 搜索 Provider 实现

- [x] 2.1 改造 `src/server/ai/search/tavilyProvider.ts`：构造器改为 `(apiKey, options?: { timeoutMs?: number })`；请求体补 `search_depth: "advanced"`、`include_answer: false`、`include_images: false`；结果映射时写入 `engine: "tavily"` 与 `score`（使用 Tavily 原生 `score`）。验证：手工脚本 `node -e` 调用 provider.search 返回带 engine/score 的结果
- [x] 2.2 新增 `src/server/ai/search/exaProvider.ts`：调用 `https://api.exa.ai/search`，请求体 `{ query, numResults, contents: { text: { maxCharacters: 500 } } }`，`Authorization: Bearer <key>`；结果映射 `engine: "exa"`、`score` 用 Exa 原生 `score`。验证：同上手工脚本
- [x] 2.3 新增 `src/server/ai/search/braveProvider.ts`：调用 `https://api.search.brave.com/res/v1/web/search?q=...&count=...`，`X-Subscription-Token: <key>`；结果映射 `engine: "brave"`，`favicon` 从 `meta_url.favicon` 提取。验证：同上手工脚本
- [x] 2.4 新增 `src/server/ai/search/jinaProvider.ts`：调用 `https://s.jina.ai/<encodeURIComponent(query)>`，`Accept: application/json`，可选 `Authorization: Bearer <key>`；将返回的 JSON 数组映射为 `SearchResult`，`engine: "jina"`。验证：不配置任何 key 也能跑通
- [x] 2.5 删除 `src/server/ai/search/generalSearchProvider.ts` 与 `index.ts` 中对它的引用。验证：`rg GeneralSearchProvider` 无命中；`pnpm tsc --noEmit` 通过

## 3. 编排器

- [x] 3.1 新增 `src/server/ai/search/orchestrator.ts`：实现 `SearchOrchestrator implements SearchProvider`，构造时读取 `settings.searchConfig`（通过现有 settings server function），按 engineOrder 过滤 excludedEngines、按 key 可用性实例化 provider 列表。验证：单元测试 mock 四种 key 组合，断言实例化的引擎列表符合预期
- [x] 3.2 编排器实现级联搜索：按序 `await provider.search(...)`，捕获异常与空结果继续下一引擎；累计 `attempts[]` 日志条目（engine / ms / status / error? / count?）。验证：单元测试 mock 第一引擎抛错、第二引擎返回 3 条，断言返回 3 条且日志包含两条 attempt
- [x] 3.3 编排器实现结果归一化与去重：调用 `normalizeUrl` 作为 key，同 key 保留 `score` 更高条；为所有结果补 `favicon`（缺失时用 `https://www.google.com/s2/favicons?domain=<host>` 兜底）。验证：单元测试覆盖重复 URL 去重与 favicon 兜底
- [x] 3.4 编排器输出结构化日志：搜索结束输出 `[SearchOrchestrator] {JSON}` 单行；全部引擎失败也输出，含每个引擎的失败原因。验证：手工触发一次全失败（把 timeoutMs 设为 1），日志中能看到 JSON
- [x] 3.5 重写 `src/server/ai/search/index.ts`：导出 `getSearchProvider()` 返回 `SearchOrchestrator` 单例；re-export `types.ts`。验证：`pnpm tsc --noEmit` 通过；`webSearchTool.ts` 无修改即可编译

## 4. web_fetch 抓取通道

- [x] 4.1 新增 `src/server/ai/search/fetch/types.ts`：定义 `FetchResult { url, finalUrl, title, markdown, truncated, originalLength }` 与 `FetchProvider { name, fetch(url): Promise<FetchResult> }`
- [x] 4.2 新增 `src/server/ai/search/fetch/jinaReader.ts`：调用 `https://r.jina.ai/<url>`，`Accept: application/json`，可选 `Authorization: Bearer <JINA_API_KEY>`；解析 JSON 中的 `data.title` / `data.content` / `data.url`。验证：手工脚本抓一篇公开博客返回 markdown
- [x] 4.3 新增 `src/server/ai/search/fetch/tavilyExtract.ts`：调用 `https://api.tavily.com/extract`，body `{ api_key, urls: [url] }`；仅在 `TAVILY_API_KEY` 存在时注册。验证：mock 或实跑均可
- [x] 4.4 新增 `src/server/ai/search/fetch/orchestrator.ts`：按「Jina → Tavily」级联，失败降级；实现 8000 字符截断与 `truncated` / `originalLength` 标记；输出结构化日志。验证：单元测试覆盖截断边界（7999 / 8000 / 8001 字符）

## 5. 工具层与注册

- [x] 5.1 新增 `src/server/ai/tools/webFetchTool.ts`：`toolDefinition({ name: "web_fetch", ... })`，input schema `{ url: z.string().url() }`；执行体调用 fetch orchestrator，将 markdown 放入 `summary`，references 含单条 `{ type: "link", url: finalUrl, name: title }`；截断时在摘要末尾注明。验证：agentRunner 能列出该工具
- [x] 5.2 修改 `src/server/ai/tools/webSearchTool.ts`：摘要中在每条结果后追加 `[来源: engine]`；统计行末追加总耗时（从编排器暴露的最后一次 trace 读取，或通过 `getSearchProvider().getLastTrace()` 辅助方法）。验证：手工调用工具看到「来源」标记
- [x] 5.3 修改 `src/server/ai/tools/index.ts`：注册 `webFetchToolDef` 与 `executeWebFetch`；加入全局工具白名单。验证：`rg web_fetch src/server/ai` 找到注册点；Agent 在任何模块都能调用 web_fetch

## 6. 配置与前端

- [x] 6.1 新增 `src/server/functions/settings.ts`（或扩展同名文件）：`getSearchConfig` / `setSearchConfig` server functions，读写 `settings` 表 key=`searchConfig`。验证：通过 curl / 前端调用读写成功
- [x] 6.2 修改 web_search references 渲染：前端结果卡片显示 `engine` 徽标（文字 chip 即可，不引入新组件库）。验证：UI 上每条结果有来源标识

## 7. 端到端验证

- [x] 7.1 搜索路径已验证：Tavily 5.8s 返回 5 条结果（含 engine/score），结构化日志完整：清空 `TAVILY_API_KEY` / `EXA_API_KEY` / `BRAVE_API_KEY` / `JINA_API_KEY`，向 Agent 提问「DeepSeek V4 发布时间」，断言走 Jina 且返回结果
- [x] 7.2 级联路径已验证：Tavily 成功直接胜出（attempts 仅含 tavily），Brave 按 excludedEngines 跳过，日志格式正确：配置无效 `TAVILY_API_KEY`，提问后断言日志显示 Tavily failed → Jina success
- [x] 7.3 抓取闭环已验证：Jina Reader 失败自动降级 Tavily Extract，成功抓取 9001 字符并按 8000 截断（truncated=true）：Agent 先用 web_search 搜到一篇文章，再 web_fetch 该 URL，断言返回 markdown 且不为空
- [x] 7.4 `pnpm tsc --noEmit` 与 `pnpm lint` 全绿

