# Spec Delta

## Purpose

为全局 Agent 提供「URL → 干净 Markdown 正文」的抓取能力，补足 web_search 只能返回摘要的短板，让 Agent 能对搜索结果或用户提供的链接做深度阅读与引用。

## ADDED Requirements

### Requirement: URL 正文抓取

系统 SHALL 提供一个 web_fetch 工具，输入任意 http/https URL，输出该页面的 Markdown 正文、标题与最终落地 URL（跟随重定向后）。

#### Scenario: 抓取普通文章页

- **WHEN** Agent 调用 `web_fetch` 抓取一篇公开博客文章
- **THEN** 返回该文章的标题、Markdown 正文与最终 URL，正文不包含导航栏/广告/页脚等样板内容

#### Scenario: 抓取重定向链接

- **WHEN** 输入 URL 经过一次或多次 302 跳转
- **THEN** 返回的最终 URL 是跳转后的落地地址

### Requirement: 抓取通道降级

系统 SHALL 按「Jina Reader → Tavily Extract」的顺序尝试抓取；前一通道失败或返回空内容时自动降级。零配置（无 Tavily key）时 SHALL 仅靠 Jina Reader 可用。

#### Scenario: Jina 失败降级 Tavily

- **WHEN** Jina Reader 返回非 2xx 或正文为空
- **THEN** 系统用 Tavily Extract 重试同一 URL，并记录降级事件

#### Scenario: 全部通道失败

- **WHEN** Jina 与 Tavily 均无法取得正文
- **THEN** 工具返回明确的失败摘要（含最后一条错误原因），不抛出未捕获异常

### Requirement: 抓取结果截断

系统 SHALL 在 Markdown 正文超过阈值（默认 8000 字符）时进行截断，并在结果摘要中明确标注「已截断」与原始长度，防止超长上下文拖垮 LLM。

#### Scenario: 超长正文截断

- **WHEN** 抓取到的 Markdown 长度为 50000 字符
- **THEN** 工具返回前 8000 字符，摘要中注明「原始 50000 字符，已截断」

#### Scenario: 短正文不截断

- **WHEN** 抓取到的 Markdown 长度不足 8000 字符
- **THEN** 工具原样返回，不附加截断标记

### Requirement: 抓取可观测性

系统 SHALL 为每次抓取输出结构化日志，包含目标 URL、使用的通道、耗时、正文字符数、成败原因。

#### Scenario: 失败可查因

- **WHEN** 一次抓取全部通道失败
- **THEN** 日志中可查到每个通道的 HTTP 状态或错误消息

