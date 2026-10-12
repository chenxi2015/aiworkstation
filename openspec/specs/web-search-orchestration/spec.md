# Web Search Orchestration Specification

## Purpose

为全局 Agent 提供稳定、可观测的联网搜索能力：通过多引擎编排、结果去重重排与失败降级，确保任意配置下都能返回可用的外部信息来源。

## Requirements

### Requirement: 多引擎 provider 注册表

系统 SHALL 维护一个搜索 provider 注册表，按优先级顺序登记所有可用引擎，并根据对应 API key 是否配置动态启停每个 provider。零配置（无任何 key）时 SHALL 至少有 Jina Search 一个 provider 可用。

#### Scenario: 只配置 Tavily key

- **WHEN** 环境只存在 `TAVILY_API_KEY`
- **THEN** 注册表按序启用 Tavily、Jina Search，未配置的 Exa/Brave 不参与任何搜索

#### Scenario: 零配置

- **WHEN** 环境不存在任何搜索 API key
- **THEN** 注册表仅启用 Jina Search，搜索功能仍可使用

#### Scenario: 全部 key 配置

- **WHEN** 环境同时存在 Tavily、Exa、Brave、Jina 的 key
- **THEN** 注册表按用户配置的优先级（缺省为 Tavily → Exa → Brave → Jina）启用全部引擎

### Requirement: 级联搜索与失败降级

系统 SHALL 按注册表顺序级联调用搜索引擎：当前引擎抛错、超时或返回 0 条结果时，自动落到下一引擎，直到取得非空结果或全部引擎耗尽。

#### Scenario: 主力引擎抛错

- **WHEN** 第一优先级引擎网络失败或返回非 2xx
- **THEN** 编排器记录失败原因，立即用下一引擎重试同一查询，不向调用方抛错

#### Scenario: 主力引擎空结果

- **WHEN** 第一优先级引擎成功返回但结果数为 0
- **THEN** 编排器记录空结果事件，继续用下一引擎查询

#### Scenario: 全部引擎失败

- **WHEN** 注册表中所有引擎均失败或返回空
- **THEN** 编排器返回空数组，调用链日志中可查到每个引擎的失败原因

### Requirement: 结果去重与统一模型

系统 SHALL 将所有引擎的结果归一化到统一 `SearchResult` 模型（title / url / snippet / publishedDate / score / favicon / engine），并按规范化 URL 去重，保留 score 更高的一条。

#### Scenario: 跨引擎重复结果

- **WHEN** 同一 URL 被两台引擎同时返回
- **THEN** 最终结果只保留一条，engine 字段标记为 score 更高的来源引擎

#### Scenario: URL 规范化

- **WHEN** 两条结果的 URL 仅差末尾斜杠或 `www.` 前缀
- **THEN** 视为同一条结果进行去重

### Requirement: 搜索可观测性

系统 SHALL 为每一次搜索输出结构化调用链日志，包含查询词、依次尝试的引擎、每个引擎的耗时与成败、最终结果数；失败原因 MUST 可被日志检索。

#### Scenario: 级联路径可查

- **WHEN** 一次搜索经过两台引擎才取得结果
- **THEN** 日志包含两条引擎记录，分别携带各自耗时与状态（failed / empty / success）

#### Scenario: 用户排查搜索质量

- **WHEN** 用户反馈「搜索结果不准」
- **THEN** 可从日志确认本次查询实际命中的引擎、返回条数与每条结果的 engine 标记

### Requirement: 搜索行为可配置

系统 SHALL 允许用户通过设置项调整引擎优先级、停用特定引擎、修改单引擎超时毫秒数；配置变更 SHALL 在下次搜索即时生效，无需重启进程。

#### Scenario: 停用某引擎

- **WHEN** 用户在 `settings.searchConfig.excludedEngines` 中加入 `brave`
- **THEN** 后续搜索不再调用 Brave，即使其 API key 存在

#### Scenario: 调整优先级

- **WHEN** 用户将 `settings.searchConfig.engineOrder` 改为 `["jina", "tavily"]`
- **THEN** 后续搜索优先调用 Jina，Tavily 作为次级

#### Scenario: 修改超时

- **WHEN** 用户将 `settings.searchConfig.timeoutMs` 改为 15000
- **THEN** 单引擎请求超过 15 秒视为超时并降级到下一引擎

