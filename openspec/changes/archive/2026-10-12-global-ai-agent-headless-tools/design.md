# Design

## Context

当前 AI 工具链路的五道串联门（详见 proposal - Why）：

1. `AppShell.tsx` 由路由推导 `activeModule`
2. `agentRunner.ts:126-131` 按 `module === "obsidian"` 条件实例化 excalidraw/canvas 工具
3. `agentRunner.ts:136-146` 用 `ai-contributions[module].tools` 白名单硬过滤
4. `toolIntentRouter.ts` 意图命中后经 `availableToolNames` 检查，被白名单拦截返回 null
5. `ChatWithBookmarksPanel.tsx:218` 的 `onCanvasAction` 依赖当前页面注册的 `pageBridge`，跨模块时桥不存在

关键已有基础：
- `createVaultExcalidraw`（`src/server/services/obsidian/note.ts:256`）是纯服务端函数，原子写文件，天然支持无头创建
- `buildExcalidrawElements`（`src/components/obsidian/excalidraw/utils/excalidrawLayout.ts:191`）的 DAG 排版核心已是纯函数，但依赖前端 `@excalidraw/excalidraw` 的 `convertToExcalidrawElements` 做 skeleton→element 转换；converter 缺省时有 raw fallback 路径
- `AppShell` 已有 `PendingFolderNavigation` 跨页跳转暂存模式，可类比扩展
- `.excalidraw` 文件就是 JSON（`{type, version, elements, appState, files}`），无头写入与前端写入格式天然一致

## Goals / Non-Goals

**Goals:**

- 建立工具三分法元数据体系，并在注册与路由层生效
- excalidraw + canvas 的 create/draw 链在任意模块可用：创建静默落盘，绘制按视图是否打开自动分流
- 聊天消息内渲染结果卡片，点击跳转到产物所在路由
- 白名单改为软分层，意图命中的工具强制放行

**Non-Goals:**

- 不改动 `context-dependent` 工具的模块锁定行为（居中/规整/改元素仍需打开视图）
- 不纳入 editor 文档创建、creator 素材等其他模块工具（验证模式后另行推广）
- 不改动 LLM 规划能力（不引入 Plan-Execute 多步自主规划，仍走现有 agent loop）
- 不做"后台定时巡检"类 L4 自治 Agent

## Decisions

### D1: 工具分类元数据挂在 toolDefinition 上，而非维护单独注册表

在每个工具的 `toolDefinition` 增加 `executionClass: "global-headless" | "content-generating" | "context-dependent"` 字段。`agentRunner` 实例化全部工具后按分类与当前模块/视图状态决定可用集合与执行路径。

**为什么**：分类是工具自身的固有属性（由其实现决定），与工具定义同处一地，避免双重事实源。`ai-contributions` 的 `tools` 列表只保留"排序优先"语义，不再承担分类职责。

**备选**：在 `ai-contributions.ts` 里为每个模块维护三分法列表。否决——模块视角是"优先级"而非"所有权"，把分类塞进模块配置会重新耦合两者。

### D2: 无头执行走服务端闭环，不经前端桥

`global-headless` 工具的 server executor 直接调用 `createVaultExcalidraw` / `createVaultCanvas` 等服务函数落盘，不再通过 `toolHooks → SSE → 前端 onCanvasAction` 链路。`content-generating` 工具在执行前检查"目标文件是否正打开"（由前端 bridge 注册时上报 `activeNotePath`）：打开则走桥（保留动画），未打开则由服务端生成元素 JSON 直写文件。

**为什么**：桥链路的本质是"服务端出参数、前端执行"，目的是让 mounted 视图能实时渲染。视图不在场时这个理由不成立，服务端闭环更可靠（无页面生命周期依赖、无桥时序等待）。

**备选**：pendingAction 队列 + 自动跳转执行。否决——违背"静默不打扰"的既定交互方向，且引入导航副作用。

### D3: 元素生成 core 下沉为无依赖纯函数，服务端用 raw JSON 路径

将 `buildExcalidrawElements` 拆为两层：
- `src/shared/excalidraw/elementFactory.ts`（新）：DAG 排版 + raw element JSON 生成，补齐 `seed`/`versionNonce`/`updated`/`boundElements` 等 Excalidraw schema 必填字段，不 import `@excalidraw/excalidraw`
- 前端 `ExcalidrawView` 继续用官方 `convertToExcalidrawElements` 增强（保留手绘风格转换的最优路径），服务端用共享纯函数产出合法 element JSON

两端产出同一文件格式，用户跳转后打开即见成品。

**为什么**：`@excalidraw/excalidraw` 整包数 MB 且面向浏览器，拖进 server bundle 为一个函数不划算；raw fallback 路径已存在，验证过可行性。

**风险**：raw JSON 与官方 converter 产出可能有细微字段差异。缓解——以 Excalidraw 文件 schema 为准补齐必填字段，并用"前端打开无头生成文件"作为验收用例。

### D4: 结果卡片通过 `ToolExecutionResult.navigation` 传递

`ToolExecutionResult` 增加可选字段：

```ts
navigation?: {
  route: string;              // e.g. "/obsidian"
  searchParams?: Record<string, string>; // e.g. { note: "codex流程.excalidraw" }
  label: string;              // e.g. "打开画板"
};
```

服务端执行器填充；`ChatMessageItem` 检测到该字段时渲染结果卡片（图标 + 名称 + 位置 + 操作按钮），点击走 `router.navigate`。

**为什么**：复用现有 tool result → 消息时间轴的渲染管线，不引入新消息类型；navigation 是结果的一部分而非独立事件，与会话持久化天然兼容（历史消息重放时卡片仍在）。

### D5: 白名单软分层的实现：filter 改 sort + 意图强制放行

`agentRunner.ts` 的白名单过滤逻辑改为：
1. 全部已注册工具进入候选池（不再按模块白名单剔除）
2. `declaredTools` 仅用于排序——模块声明的工具排在 LLM tool list 前部
3. `resolveRequiredToolIntent` 命中时，无论排序如何，该工具强制可用

**为什么**：用户已确认接受"LLM 能看到非本模块工具、偶尔误触发"的 trade-off，换取模糊意图（"画个图总结一下这个文件夹"）也能命中的能力。

## Risks / Trade-offs

- **LLM 误触发跨模块工具** → 软分层把模块工具排前降低误选概率；`context-dependent` 类仍硬锁定，误调时返回明确提示而非静默失败
- **无头写入与前端同时编辑同一文件产生冲突** → 沿用现有 `mtime` 乐观并发机制（`note.ts` 已有）；无头写入前重新读 mtime 校验，冲突时返回错误让 AI 重试或告知用户
- **raw JSON 与官方 converter 格式漂移** → 验收标准包含"无头生成的画板在前端打开渲染正确"；若漂移发生，补齐字段而非引入整包依赖
- **结果卡片点击跳转后视图状态** → 跳转到 `/obsidian` 需顺带选中目标文件；复用现有 note 选中的 search param 机制（`useObsidianAiBridge` 已按 `selectedNotePath` 工作）

## Migration Plan

无数据迁移。`.excalidraw` / `.canvas` 文件格式不变。行为变化仅体现在：原先在非笔记模块会被拦截的意图现在会真实执行——这是本变更的目的本身。回滚 = revert 工具分类与无头执行器，白名单恢复硬过滤。

## Open Questions

- canvas（`.canvas` 白板）的 `canvas_create_elements` 无头路径：React Flow 节点 JSON 结构比 excalidraw 简单（纯 `{nodes, edges}`），预计可直接服务端生成，但实施时需确认排版算法是否同样无浏览器依赖
