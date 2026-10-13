# Proposal

## Why

当前 AI 长文创作把「产出内容」和「写入存储」耦合在一次工具调用里：Agent 调 `trigger_document_create`，内容直接落 documents 表或流式写入编辑器。这带来三个已观测到的问题：

1. **AI 替用户决定产物落点**——「帮我写一篇文章」直接进创作模块 documents 表，用户还没看到内容，库里已经多了一篇；在笔记模块说「新建文档」会被错误地带到创作模块；
2. **执行链路脆弱**——交互式流水线依赖创作台页面挂载与编辑器实例存活，已出现「一次对话双写两篇」「打开是空文档」的实际事故；
3. **数据库被未确认内容灌入**——所有 AI 产出无论用户是否满意都入库，长期累积垃圾内容，撑大备份体积。

用户已明确产品原则：**AI 专心产出内容，存储落点由用户在看到成品后决定**。这需要一个「产出 → 草稿 → 用户选落点 → 入库」的解耦交付层，替代现在的「产出即写入」。

## What Changes

- 新增 **草稿交付层**：Agent 产出的长文内容先写入本地草稿区（`~/.aiworkstation/drafts/`，Markdown 文件 + 元数据索引），对话中呈现交付卡片（标题、字数、预览入口），**不自动落库**。
- 交付卡片提供三个显式落点动作：**存为创作文档**（headless 入 documents 表）、**存为笔记**（写入 obsidian Vault 选定目录）、**丢弃**（草稿定期自动清理）。
- 上下文卸载：长文正文不进入 chat 消息体与历史回传，消息中只携带 draft id 与元数据；后续「改第三段」类请求由 Agent 通过 read 工具按 draft id 按需读取。
- **BREAKING（行为级）**：退役 `trigger_document_create` 的自动写入路径。Agent 不再直接调用创建工具落库；创作请求统一走「产出草稿 → 交付卡片」。「在创作台里边写边看」的流式观摩链路降级为显式话术（如「在创作台里写」）才触发，或作为交付卡片上的「流式写入创作台」可选动作。
- 改写类双栏流水线不受影响：双栏只改已存在的文档/笔记，目标对象明确，继续走 action-proposal 解析层。

## Capabilities

### New Capabilities

- `content-delivery`: AI 长文产出的草稿化交付能力：草稿区读写与生命周期、交付卡片呈现、用户选择的落点分发（创作文档 / 笔记 / 丢弃）、长文内容的上下文卸载。该能力长期拥有「AI 产出如何交付、何时入库、草稿何时清理」的规则。

### Modified Capabilities

- `headless-tool-execution`: 原有「Dual-path execution for content-generating tools」要求 content-generating 工具按视图是否打开分流执行并直接写入目标文件；本 change 将长文创建从「直接写入目标存储」演进为「先写草稿区、用户确认后才落目标存储」，属于该 requirement 的行为变更（改写类 content-generating 工具不受影响）。

## Impact

- **代码**：`src/server/ai/tools/documentTools.ts`（退役自动创建路径）、`src/server/ai/editorTools.ts`（createDocumentCreateTool 改为草稿产出工具）、新增草稿区服务（`src/server/ai/drafts/`）、chat 消息渲染（新增交付卡片组件）、`useAiChat`（draft id 元数据而非全文）、obsidian 保存动作（Vault 目录选择 + 写入）。
- **行为**：创作类请求从「直接落库/流式写入」变为「草稿交付 + 用户选落点」；长文内容不再进入会话历史正文；数据库只接收用户确认保存的内容。
- **架构约定**：草稿区为本地文件（`.md` + 索引 JSON），不进 SQLite；创作文档主存储仍为 SQLite documents 表（已定案不动）；obsidian 纯文件直读直写约定不变。
