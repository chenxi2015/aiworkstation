# Tasks

## 1. 共享层：元素生成纯函数下沉

- [x] 1.1 新建 `src/shared/excalidraw/elementFactory.ts`：从 `src/components/obsidian/excalidraw/utils/excalidrawLayout.ts` 拆出 DAG 排版 + raw element JSON 生成核心，不依赖 `@excalidraw/excalidraw` 包
- [x] 1.2 在 elementFactory 中补齐 Excalidraw element schema 必填字段（`seed`/`versionNonce`/`updated`/`boundElements`/角度与透明度默认值等），产出无需 converter 即合法的文件级 element JSON
- [x] 1.3 改造前端 `excalidrawLayout.ts` 复用共享 core（保留官方 converter 增强路径），确认现有画板绘制行为无回归

## 2. 服务端：工具分类与无头执行引擎

- [x] 2.1 `src/server/ai/tools/` 为 excalidraw/canvas 工具定义增加 `executionClass` 元数据（`global-headless` / `content-generating` / `context-dependent`）
- [x] 2.2 `excalidraw_create_board` 无头执行器：服务端直调 `createVaultExcalidraw` 落盘，返回含实际路径与名称的结果（含重名自动加后缀场景）
- [x] 2.3 `excalidraw_draw_elements` 双路径分流：检测 `activeNotePath` 是否为目标文件且视图已打开——打开走前端桥，未打开用共享 elementFactory 生成元素并直写文件
- [x] 2.4 canvas 对应工具（`canvas_create_board` / `canvas_create_elements`）同款改造；实施时确认 canvas 排版算法的浏览器依赖情况（design.md Open Questions）
- [x] 2.5 无头写入前 mtime 乐观并发校验：与 Vault 现有并发机制对齐，冲突时返回明确错误

## 3. 服务端：注册与路由层放开

- [x] 3.1 `agentRunner.ts` 移除 excalidraw/canvas 工具实例化的 `module === "obsidian"` 硬门，全局实例化
- [x] 3.2 白名单硬过滤改软分层：全部工具进候选池，`declaredTools` 仅控制 LLM tool list 排序（模块声明工具排前）
- [x] 3.3 `toolIntentRouter.ts` 意图命中工具强制放行（不受模块白名单约束）；`context-dependent` 工具跨模块请求时返回"需在笔记模块打开"的导航提示而非静默失败
- [x] 3.4 `ai-contributions.ts` 注释与类型语义更新：`tools` 字段标注为"优先展示"而非"白名单"

## 4. 结果卡片协议与前端渲染

- [x] 4.1 `src/server/ai/tools/types.ts` 的 `ToolExecutionResult` 增加 `navigation` 可选字段（route / searchParams / label）
- [x] 4.2 无头执行器与桥执行器统一填充 navigation（画板/白板创建与绘制结果）
- [x] 4.3 `ChatMessageItem.tsx` 渲染结果卡片：图标 + 产物名称 + 位置 + 「打开 →」按钮，点击 `router.navigate` 跳转并选中目标文件
- [x] 4.4 确认跳转后 `/obsidian` 路由按 search param 选中并打开目标画板（复用现有 `selectedNotePath` 机制，缺口则补齐）

## 5. 提示词与验收

- [x] 5.1 模块提示词（obsidian 等）补充"静默执行 + 结果卡片"心智：非笔记模块创建画板时告知用户已静默完成、可点击卡片查看
- [x] 5.2 端到端验收：在工作台模块对话"创建一个新画板画一个 codex 的使用流程"→ 无导航打断 → 消息出现结果卡片 → 点击跳转 `/obsidian` 打开画板且图形渲染正确
- [x] 5.3 回归验收：笔记模块内打开画板时绘制仍走前端桥（实时动画保留）；`context-dependent` 工具（居中/规整）跨模块调用返回导航提示
