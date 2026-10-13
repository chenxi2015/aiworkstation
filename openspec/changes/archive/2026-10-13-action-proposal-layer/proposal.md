# Proposal

## Why

AI 助手当前对「改写类」意图的处理是写死在 chat 面板里的一组硬编码条件：只有 obsidian 模块 + 已打开笔记 + 命中关键词 + 无 skill/file 上下文时才直达双栏流水线；其余情况一律静默降级为通用 Agent 直出成品文件。这导致两个用户可感知的问题：

1. **双栏比对能力被锁死在特定模块**，在书签/工作台等模块中即便会话上下文里有一篇文章，也拉不起双栏；
2. **Agent 在含糊场景下替用户做决定**（直接产出文件、或静默不走双栏），用户失去了对「这次操作落到哪个对象、以什么形态执行」的掌控。

用户明确期望一个通用原则：**意图或目标对象不明确时，AI 不做决定，交给用户确认**。这需要一个统一的抽象层，而不是继续在 chat 面板里堆 if/else。

## What Changes

- 新增 **Action Proposal 抽象层**：在用户输入（chat 文本、`/` 选择的 skill、选区动作）和执行动作之间插入统一的「意图→目标对象解析→直达或提议」决策层，替换现有 `ChatWithBookmarksPanel` 中 obsidian 专属的改写短路逻辑。
- **目标对象解析**：从当前页面 PageBridge（打开的笔记/文档）与会话上下文 items（attach 的文章/笔记）中解析出可写目标对象及其归属模块。
- **直达规则**：当目标对象就是用户当前正在查看的笔记/文档、且操作形态明确（md 笔记 → 双栏 diff；创作文档 → 双栏）时，直接拉起双栏，不加确认摩擦。
- **提议-确认卡片**：跨对象、跨模块（如在工作台操作一篇 obsidian 笔记、在笔记里操作创作文档）、带 skill 上下文、或对象含糊时，渲染确认卡片，说明目标对象、归属模块与执行形态，由用户确认后才执行；确认动作默认为「导航到目标模块并执行」。
- **双栏流水线支持 skill 上下文**：改写流水线的 prompt 构造接受解析后的 SKILL.md 内容，消除「带 skill 就必须走通用 Agent」的限制。
- 无明确可写对象时保持通用 Agent 对话形态，但 Agent 产出成品后提供「送入双栏审阅」回流入口。

## Capabilities

### New Capabilities

- `action-proposal`: AI 助手执行动作前的意图解析与提议-确认机制：目标对象解析、直达规则、跨模块/跨对象提议卡片、确认后的导航与执行。该能力长期拥有「何时直达、何时提议、提议如何呈现」的规则。

### Modified Capabilities

- `ai-agent-tool-governance`: 原有「context-dependent tools stay module-locked」要求跨模块请求仅返回导航提示；本 change 将其演进为「导航提示升级为可确认的提议卡片，确认后自动导航并执行」，属于该 requirement 的行为变更。

## Impact

- **代码**：`ChatWithBookmarksPanel.tsx`（移除硬编码短路）、`rewriteIntent.ts`（并入目标对象解析）、chat 消息渲染（新增提议卡片组件）、`useEditorAiBridge` / `useObsidianAiBridge`（action 元数据补充目标对象声明）、改写流式端点 prompt 构造（接受 skill 内容）。
- **行为**：chat 中改写类意图的触发面扩大（不再限 obsidian）；带 skill 的改写请求从通用 Agent 改为双栏提议；跨模块操作从「导航提示文本」改为「确认卡片」。
- **架构约定**：双栏仍为「页面归属」形态，确认后导航到目标模块执行，不引入全局覆盖层双栏；obsidian 纯文件直读直写约定不变。
