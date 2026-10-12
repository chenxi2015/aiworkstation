# Proposal

## Why

AI 助手当前被锁死在导航模块里：工具按"模块所有制"注册与过滤（`agentRunner.ts` 中 `module === "obsidian"` 硬门 + `ai-contributions.ts` 白名单硬过滤），前端执行桥由当前页面注册。用户在非笔记模块（如工作台）提出"创建一个新画板画一个 codex 使用流程"时，意图路由命中但工具被白名单拦截，退化为普通问答；即使放行，前端桥也不存在，执行必败。AI 助手应该是超脱各模块的全局 Agent，模块只是"能力供应商"，不该是"权限边界"。

## What Changes

- **工具三分法落地**：将全部 Agent 工具按"全局无头型 / 内容生成型 / 上下文依赖型"重新分类，替代现在的"模块所有制"
- **无头执行引擎（Headless Tools）**：`excalidraw_create_board` / `canvas_create_board` 等"创建即文件操作"的工具服务端闭环执行（直写 Vault 文件），不再依赖前端页面桥
- **内容生成型工具双路径分流**：`excalidraw_draw_elements` / `canvas_create_elements` 按"目标文件是否正打开"自动分流——打开时走前端桥（保留实时渲染动画），未打开时走无头写文件
- **白名单硬过滤 → 软分层**：`ai-contributions` 的 `tools` 从"唯一可用集合"改为"排序优先提示"，意图路由（`toolIntentRouter`）命中的工具强制放行
- **元素生成纯函数下沉**：`buildExcalidrawElements` 拆出不依赖 `@excalidraw/excalidraw` 包的 core（DAG 排版 + raw element JSON 生成），搬到共享层供服务端无头执行复用
- **结果卡片跳转协议**：`ToolExecutionResult` 增加 `navigation` 字段（route + params），聊天消息渲染为可点击结果卡片（"已创建画板「X」 [打开 →]"），点击跳转对应路由查看

第一期范围：仅验证 excalidraw + canvas 两个创建链（创建 + 绘制 + 结果卡片跳转）。editor 文档创建、creator 素材管理等其他模块工具暂不纳入。

## Capabilities

### New Capabilities

- `ai-agent-tool-governance`: Agent 工具的分类治理体系——工具三分法定义、全局注册与白名单软分层规则、意图路由放行契约。约束"哪些工具在何种模块上下文中可用、以何种路径执行"的系统行为
- `headless-tool-execution`: 无头执行引擎——服务端闭环完成文件型工具的创建与内容写入，按目标视图是否打开自动分流执行路径，产出含跳转协议的结果

### Modified Capabilities

（无现存 specs，全部为新增能力）

## Impact

- **服务端**：`src/server/ai/agentRunner.ts`（工具实例化条件与白名单过滤逻辑）、`src/server/ai/toolIntentRouter.ts`（意图命中放行契约）、`src/server/ai/tools/excalidrawTools.ts` / `canvasTools.ts`（无头执行器）、`src/server/ai/tools/types.ts`（`ToolExecutionResult.navigation` 字段）
- **共享层**：新增 `src/shared/excalidraw/`（元素生成纯函数下沉，`buildExcalidrawElements` core 从 `src/components/obsidian/excalidraw/utils/excalidrawLayout.ts` 拆出）
- **模块注册**：`src/modules/ai-contributions.ts`（白名单语义从硬过滤改为软分层，工具元数据增加分类标记）
- **前端**：`src/components/workbench/ai/chat/ChatMessageItem.tsx`（结果卡片渲染 + 路由跳转）、`ChatWithBookmarksPanel.tsx`（`onCanvasAction` 分流逻辑保留，仅作为"视图已打开"路径）
- **提示词**：`src/server/ai/prompts/modules/obsidian.ts` 等模块提示词补充"静默执行 + 结果卡片"心智说明
- **不影响**：Chrome 插件通道、SQLite schema、Obsidian Vault 文件格式（无头写入与前端写入产出同一格式）
