# Design

## Context

现状的执行路径分散且硬编码：

- `ChatWithBookmarksPanel.tsx` 的 `sendPrompt` 里写死了 obsidian 专属短路：`module === "obsidian" && activeNotePath && matchRewritePipelineIntent(prompt) && !hasSkillOrFileContext → runBridgeRewriteAction`。
- `runBridgeRewriteAction` 依赖目标页面已通过 PageBridge 注册 `stream_*_rewrite` actions；未注册时返回 false，静默回落通用 Agent。
- 带 skill/file 上下文时同样静默回落通用 Agent，因为双栏流水线的 prompt 构造不消费这些上下文。
- 双栏组件（`SplitCompareView` / `SplitFloatingPromptDock`）分别挂在 editor 与 obsidian 页面内，由各自页面的 PageBridge actions 拉起。

约束（来自 PROJECT.md 已定案决策，不可推翻）：

- 决策 8：obsidian 纯文件直读直写，不进 documents 表；editor 文档与 obsidian 笔记严格解耦。
- 双栏保持「页面归属」形态：不引入全局覆盖层双栏（用户已拍板，确认动作 = 导航到目标模块执行）。

## Goals / Non-Goals

**Goals**

- 单一决策入口：任何输入来源（chat 文本、`/` skill、选区动作）对「文章/笔记的可写操作」都经过同一个解析层，产出「直达执行」或「提议卡片」两种结果之一。
- 提议卡片是 chat 消息流中的一等公民：可确认、可换方式、可忽略，且确认后自动完成「导航 + 打开对象 + 执行动作」。
- 双栏流水线可消费 skill 上下文（SKILL.md 内容拼入 instruction）。

**Non-Goals**

- 不做全局覆盖层双栏。
- 不改变通用 Agent 对非文档类请求（问答、搜索、分类等）的现有行为。
- 不改写流式端点 `/api/editor/rewrite/stream` 的协议，只扩展 prompt 构造入参。
- 不处理「Agent 产出成品后送入双栏审阅」的回流入口（proposal 提及，作为后续 change，不在本期任务内）。

## Decisions

### D1：抽象层落在客户端 chat 面板侧，而不是服务端 Agent 循环里

解析与提议发生在 `ChatWithBookmarksPanel` 发送前的拦截层（新模块 `src/components/workbench/ai/chat/proposal/`）。理由：直达/提议的判断需要 PageBridge（纯客户端概念）与会话上下文 items；服务端 Agent 看不到页面注册能力。替代方案（服务端意图路由）被否：会复制一份页面能力视图到服务端，违反单一事实源。

### D2：目标对象解析为一个纯函数 `resolveActionTarget`

```text
resolveActionTarget(input: {
  prompt, skillContextItems, pageBridge, contextItems
}) →
  | { kind: "direct", target, actionId }        // 当前查看对象，直达
  | { kind: "proposal", target, actionId, ... } // 跨对象/跨模块/带skill，提议卡片
  | { kind: "agent" }                            // 无可写对象，通用 Agent
```

「直达」的判定：target 就是 `pageBridge` 当前打开的对象（同一篇笔记/文档），且操作形态明确（md 笔记/创作文档的改写类意图）。「提议」的判定：target 来自会话上下文 items 而非当前页面、target 归属模块 ≠ 当前模块、或携带 skill 上下文。纯函数便于单测，也让规则集中可读——替代了散落 if/else。

### D3：skill 上下文进入双栏流水线，走 instruction 拼接而非新协议

`runBridgeRewriteAction` 扩展为接受解析后的 skill 内容，拼入改写 prompt 的补充要求段（与现有 `customRequirement` 拼接方式一致）。不引入新的流式协议字段。理由：改写端点本来就是自由文本 prompt，拼接即可；新增协议字段是过度设计。

### D4：提议卡片确认 = 导航 + 延迟执行

确认后：记录 pending action（目标对象 + actionId + payload）→ `router.navigate` 到目标模块 → 目标页面 mount 后 PageBridge 注册完成 → 执行 pending action。pending action 存于 `workbenchContextStore`（已有跨页面状态约定），带 TTL 与一次性消费。替代方案（把双栏做成可跨页面渲染的覆盖层）被否：违反页面归属决策，且 obsidian 双栏深度依赖笔记页面状态。

### D5：删除 obsidian 专属短路，关键词意图识别保留但降级为「候选信号」

`matchRewritePipelineIntent` 保留，但从「触发器」降级为 `resolveActionTarget` 的一个输入信号（帮助识别操作形态）。没有命中关键词但目标对象明确的输入仍走通用 Agent——关键词只决定「是否考虑双栏」，不再决定「是否绕过 Agent 决定权」。

## Risks / Trade-offs

- [确认卡片打断高频路径] → 直达规则覆盖「当前查看对象」这一最高频场景；提议仅出现在跨对象/跨模块/带 skill 场景，这些场景原本就没有好体验。
- [pending action 跨导航丢失或误执行] → TTL（如 60s）+ 一次性消费 + 目标页面校验对象仍存在，失败时 toast 说明并清除。
- [规则仍需随模块扩展] → 新模块只需在 PageBridge actions 上声明目标对象元数据（模块、对象 id、形态），解析层无需改动；规则本身集中在一个纯函数。

## Migration Plan

无数据迁移。行为变更点：obsidian 改写短路逻辑被解析层替代（行为等价或扩大）；带 skill 的改写从通用 Agent 改为提议卡片。回滚 = revert 本 change 的代码，无状态残留。

## Open Questions

- 提议卡片是否需要「记住我的选择」（对同类目标对象跳过确认）？本期不做，观察实际使用频率再定。
