import { toast } from "@heroui/react";
import {
	ArrowDownToLine,
	Columns2,
	FileText,
	GitFork,
	LayoutGrid,
	ListTree,
	Network,
	Palette,
	PlusSquare,
	Replace,
	Shuffle,
	Sparkles,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
import { workbenchContextActions } from "../../../stores/workbenchContextStore";
import { useAiPanel } from "../../shell/AppShell";
import type {
	ObsidianCanvasApi,
	ObsidianExcalidrawApi,
	ObsidianMutationResult,
	ObsidianNoteApi,
} from "../types";

/** 传给 AI 的笔记原文上限（防止超大笔记打爆上下文） */
const NOTE_CONTEXT_LIMIT = 12000;

/**
 * Wait for canvasApi to become ready (e.g. after creating a new board or switching views)
 */
async function waitForCanvasApi(
	apiRef: React.RefObject<ObsidianNoteApi | null>,
	maxWaitMs = 5000,
	intervalMs = 80,
): Promise<ObsidianCanvasApi | null> {
	const startTime = Date.now();
	while (Date.now() - startTime < maxWaitMs) {
		const canvasApi = apiRef.current?.canvasApi;
		if (canvasApi) {
			return canvasApi;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	return apiRef.current?.canvasApi ?? null;
}

/**
 * Wait for excalidrawApi to become ready
 */
async function waitForExcalidrawApi(
	apiRef: React.RefObject<ObsidianNoteApi | null>,
	maxWaitMs = 5000,
	intervalMs = 80,
): Promise<ObsidianExcalidrawApi | null> {
	const startTime = Date.now();
	while (Date.now() - startTime < maxWaitMs) {
		const excalidrawApi = apiRef.current?.excalidrawApi;
		if (excalidrawApi) {
			return excalidrawApi;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	return apiRef.current?.excalidrawApi ?? null;
}

export interface UseObsidianAiBridgeOptions {
	/** NotePanel 注册的当前笔记操作句柄 */
	noteApiRef: React.RefObject<ObsidianNoteApi | null>;
	/** 当前选中笔记路径（用于空态标题/上下文展示） */
	selectedNotePath: string | null;
	/** 创建新白板回调（来自 useVaultOperations） */
	onCreateCanvas?: (
		dir?: string,
		customName?: string,
		enterRename?: boolean,
	) => Promise<ObsidianMutationResult>;
	/** 创建新 Excalidraw 画板回调 */
	onCreateExcalidraw?: (
		dir?: string,
		customName?: string,
		enterRename?: boolean,
	) => Promise<ObsidianMutationResult>;
}

/**
 * 将 Obsidian 笔记页桥接到全局 AI 侧边栏：
 * - 空态快捷入口：双栏二创改写、双栏全文润色、结构化整理、提炼总结
 * - 消息级动作：把 AI 回复一键追加/替换进当前笔记
 */
export function useObsidianAiBridge({
	noteApiRef,
	selectedNotePath,
	onCreateCanvas,
	onCreateExcalidraw,
}: UseObsidianAiBridgeOptions) {
	const { registerPageBridge, sendPrompt } = useAiPanel();
	const sendPromptRef = useRef(sendPrompt);
	sendPromptRef.current = sendPrompt;

	const noteTitle = selectedNotePath
		? (selectedNotePath.split("/").pop()?.replace(/\.md$/i, "") ?? null)
		: null;

	// 同步全局 activeNote 状态，供输入框 ChatScopePill 切换「限定笔记」与「全局检索」
	useEffect(() => {
		if (selectedNotePath) {
			workbenchContextActions.setActiveNote({
				path: selectedNotePath,
				title:
					noteTitle ||
					selectedNotePath.split("/").pop()?.replace(/\.md$/i, "") ||
					"未命名笔记",
			});
		} else {
			workbenchContextActions.setActiveNote(null);
		}
		return () => {
			workbenchContextActions.setActiveNote(null);
		};
	}, [selectedNotePath, noteTitle]);

	useEffect(() => {
		const sendWithNote = (instruction: string) => {
			const api = noteApiRef.current;
			if (!api?.hasNote()) {
				toast.info("请先在左侧打开一篇笔记");
				return;
			}
			void api.flushSave();
			const title = api.getTitle() ?? "未命名笔记";
			const raw = api.getContent();
			const content =
				raw.length > NOTE_CONTEXT_LIMIT
					? `${raw.slice(0, NOTE_CONTEXT_LIMIT)}\n\n…（笔记过长，已截断）`
					: raw;
			if (!content.trim()) {
				toast.info("当前笔记还没有内容");
				return;
			}
			sendPromptRef.current(
				`${instruction}\n\n以下是我的笔记「${title}」全文：\n\n${content}`,
			);
		};

		const applyToNote = (mode: "append" | "replace") => (content: string) => {
			const api = noteApiRef.current;
			if (!api?.hasNote()) {
				toast.info("请先在左侧打开一篇笔记");
				return;
			}
			const text = content.trim();
			if (!text) return;
			if (
				mode === "replace" &&
				!window.confirm("确认用该回复替换整篇笔记？可在编辑器内 Cmd+Z 撤销。")
			) {
				return;
			}
			const ok =
				mode === "append"
					? api.appendMarkdown(text)
					: api.replaceMarkdown(text);
			if (ok) {
				toast.success(
					mode === "append"
						? "已追加到笔记末尾，将自动保存同步到 Vault"
						: "已替换笔记内容，将自动保存同步到 Vault",
				);
			}
		};

		const isCanvas = Boolean(selectedNotePath?.endsWith(".canvas"));
		const isExcalidraw = Boolean(selectedNotePath?.endsWith(".excalidraw"));

		const canvasActions = isCanvas
			? [
					{
						id: "canvas_mindmap",
						label: "梳理思维导图",
						icon: GitFork,
						variant: "accent" as const,
						tooltip: "根据当前白板主题或关联笔记梳理思维导图，向右延伸层级结构",
						onAction: () => {
							sendPromptRef.current(
								"请根据当前白板内容及关联知识，调用 canvas_create_elements 工具绘制一份结构清晰的思维导图，层级分明地向右延伸。",
							);
						},
					},
					{
						id: "canvas_arch",
						label: "系统架构梳理",
						icon: Network,
						variant: "default" as const,
						tooltip: "规划系统核心模块、数据流向与依赖关系，实时渲染在白板上",
						onAction: () => {
							sendPromptRef.current(
								"请规划当前业务系统的模块架构，调用 canvas_create_elements 工具在白板中绘制出包含核心微服务/模块、数据流与调用关系的架构拓扑图。",
							);
						},
					},
					{
						id: "canvas_quick_tidy",
						label: "规整白板排版",
						icon: LayoutGrid,
						variant: "default" as const,
						tooltip:
							"一键规整当前白板：标准化卡片尺寸、消除节点重叠并优化连线走向",
						onAction: () => {
							sendPromptRef.current(
								"请调用 canvas_tidy_layout 工具，对当前白板进行排版规整，统一卡片尺寸并优化连线走向。",
							);
						},
					},
				]
			: isExcalidraw
				? [
						{
							id: "excalidraw_flowchart",
							label: "绘制业务流程图",
							icon: GitFork,
							variant: "accent" as const,
							tooltip: "在当前 Excalidraw 画板中绘制包含判定与流向的业务流程图",
							onAction: () => {
								sendPromptRef.current(
									"请根据当前画板主题，调用 excalidraw_draw_elements 工具绘制一份结构清晰的手绘流程图（包含关键操作、分支判断与流向箭头）。",
								);
							},
						},
						{
							id: "excalidraw_arch",
							label: "绘制系统架构图",
							icon: Network,
							variant: "default" as const,
							tooltip: "在当前 Excalidraw 画板中绘制系统分层架构拓扑与调用流向",
							onAction: () => {
								sendPromptRef.current(
									"请规划当前系统的分层架构，调用 excalidraw_draw_elements 工具在当前画板中绘制包含展示层、业务层、数据层及依赖关系的架构图。",
								);
							},
						},
						{
							id: "excalidraw_center",
							label: "居中画板视野",
							icon: Palette,
							variant: "default" as const,
							tooltip: "平滑缩放并将当前画板内容居中对齐到视口中央",
							onAction: () => {
								sendPromptRef.current(
									"请调用 excalidraw_center_view 工具，将当前 Excalidraw 画板内容居中显示。",
								);
							},
						},
					]
				: [
						{
							id: "stream_spin_rewrite",
							label: "二创洗稿重构",
							icon: Shuffle,
							variant: "accent" as const,
							tooltip:
								"基于当前笔记事实进行深度二创与结构重组，在双栏视图中实时 Diff 审阅",
							onAction: async (payload?: string) => {
								const api = noteApiRef.current;
								if (!api?.hasNote()) {
									toast.info("请先在左侧打开一篇笔记");
									return;
								}
								await api.flushSave();
								await api.onStartRewritePipeline?.(payload, "二创洗稿");
							},
						},
						{
							id: "stream_full_rewrite",
							label: "双栏全文润色",
							icon: Sparkles,
							variant: "default" as const,
							tooltip: "在双栏中逐句润色语言表达、排版结构，红绿 Diff 直观对比",
							onAction: async (payload?: string) => {
								const api = noteApiRef.current;
								if (!api?.hasNote()) {
									toast.info("请先在左侧打开一篇笔记");
									return;
								}
								await api.flushSave();
								await api.onStartRewritePipeline?.(payload, "全文润色");
							},
						},
						{
							id: "stream_structure_rewrite",
							label: "结构化整理",
							icon: ListTree,
							tooltip: "将凌乱速记重新梳理为层级规范、要点清晰的知识笔记",
							onAction: async (payload?: string) => {
								const api = noteApiRef.current;
								if (!api?.hasNote()) {
									toast.info("请先在左侧打开一篇笔记");
									return;
								}
								await api.flushSave();
								await api.onStartRewritePipeline?.(payload, "结构化整理");
							},
						},
						{
							id: "toggle_split_compare",
							label: "切换双栏比对",
							icon: Columns2,
							tooltip: "手动开启或关闭左右双栏并排比对视图",
							onAction: () => {
								noteApiRef.current?.toggleSplitCompare?.();
							},
						},
					];

		registerPageBridge({
			module: "obsidian",
			activeDocumentId: null,
			activeDocumentTitle: noteTitle,
			activeNotePath: selectedNotePath,
			flushSave: async () => {
				await noteApiRef.current?.flushSave();
			},
			actions: [
				...canvasActions,
				// Canvas tool execution bridges
				{
					id: "canvas_create_board",
					label: "创建新白板",
					onAction: async (payload?: string | Record<string, unknown>) => {
						if (!onCreateCanvas) {
							toast.info("当前环境未提供白板创建能力");
							return;
						}
						try {
							const data = payload
								? typeof payload === "string"
									? JSON.parse(payload)
									: payload
								: {};
							const name = data.name || "未命名白板";
							const dir = data.dir || undefined;
							const res = await onCreateCanvas(dir, name, false);
							if (res.success) {
								toast.success(`AI 已创建并打开空白白板「${name}」`);
								// Fallback for legacy calls containing nodes
								if (
									data.nodes &&
									Array.isArray(data.nodes) &&
									data.nodes.length > 0
								) {
									const canvasApi = await waitForCanvasApi(noteApiRef);
									if (canvasApi) {
										canvasApi.addElements({
											nodes: data.nodes,
											edges: data.edges || [],
											layout: data.layout || "horizontal_tree",
										});
									}
								}
							}
						} catch (err) {
							console.error("[canvas_create_board] execution error:", err);
						}
					},
				},
				{
					id: "canvas_create_elements",
					label: "创建白板节点",
					onAction: async (payload?: string | Record<string, unknown>) => {
						if (!payload) return;
						try {
							const data =
								typeof payload === "string" ? JSON.parse(payload) : payload;
							const canvasApi = await waitForCanvasApi(noteApiRef);
							if (!canvasApi) {
								toast.info("当前未处于 Canvas 可视编辑模式，无法写入节点");
								return;
							}
							const ok = canvasApi.addElements(data);
							if (ok) {
								toast.success("AI 已向白板实时写入新节点并完成排版");
							}
						} catch (err) {
							console.error("[canvas_create_elements] error:", err);
						}
					},
				},
				{
					id: "canvas_create_group",
					label: "创建白板分组框",
					onAction: async (payload?: string | Record<string, unknown>) => {
						if (!payload) return;
						try {
							const data =
								typeof payload === "string" ? JSON.parse(payload) : payload;
							const canvasApi = await waitForCanvasApi(noteApiRef);
							if (!canvasApi) return;
							const ok = canvasApi.createGroup({
								label: data.label,
								nodeIds: data.nodeIds,
								color: data.color,
							});
							if (ok) {
								toast.success(`AI 已创建「${data.label}」分组框`);
							}
						} catch (err) {
							console.error("[canvas_create_group] error:", err);
						}
					},
				},
				{
					id: "canvas_update_node",
					label: "更新白板节点",
					onAction: async (payload?: string | Record<string, unknown>) => {
						if (!payload) return;
						try {
							const data =
								typeof payload === "string" ? JSON.parse(payload) : payload;
							const canvasApi = await waitForCanvasApi(noteApiRef);
							if (!canvasApi) return;
							const ok = canvasApi.updateNode(data.nodeId, {
								text: data.text,
								color: data.color,
							});
							if (ok) {
								toast.success("已更新白板卡片");
							}
						} catch (err) {
							console.error("[canvas_update_node] error:", err);
						}
					},
				},
				{
					id: "canvas_tidy_layout",
					label: "规整白板排版",
					onAction: async (payload?: string | Record<string, unknown>) => {
						try {
							const data = payload
								? typeof payload === "string"
									? JSON.parse(payload)
									: payload
								: undefined;
							const canvasApi = await waitForCanvasApi(noteApiRef);
							if (!canvasApi) {
								toast.info("当前未处于 Canvas 可视编辑模式");
								return;
							}
							const ok = canvasApi.tidyLayout(data);
							if (ok) {
								toast.success("AI 已完成白板规整与连线优化");
							}
						} catch (err) {
							console.error("[canvas_tidy_layout] error:", err);
						}
					},
				},
				{
					id: "canvas_center_view",
					label: "居中白板内容",
					onAction: async (payload?: string | Record<string, unknown>) => {
						try {
							const data = payload
								? typeof payload === "string"
									? JSON.parse(payload)
									: payload
								: undefined;
							const canvasApi = await waitForCanvasApi(noteApiRef);
							if (!canvasApi) {
								toast.info("当前未处于 Canvas 可视编辑模式");
								return;
							}
							const ok = canvasApi.centerView(data?.targetNodeIds);
							if (ok) toast.success("已将白板内容居中显示");
							else toast.info("白板中没有可聚焦的节点");
						} catch (err) {
							console.error("[canvas_center_view] error:", err);
						}
					},
				},
				// Excalidraw tool execution bridges
				{
					id: "excalidraw_create_board",
					label: "新建画板",
					onAction: async (payload?: string | Record<string, unknown>) => {
						try {
							const data = payload
								? typeof payload === "string"
									? JSON.parse(payload)
									: payload
								: {};
							const name = data.name
								? String(data.name).replace(/\.excalidraw$/i, "")
								: "未命名画板";
							const dir = data.dir ? String(data.dir) : undefined;
							if (onCreateExcalidraw) {
								const res = await onCreateExcalidraw(dir, name, false);
								if (res.success) {
									toast.success(`AI 已创建并打开画板「${name}」`);
								}
							} else {
								toast.success(`已创建 Excalidraw 画板「${name}」`);
							}
						} catch (err) {
							console.error("[excalidraw_create_board] execution error:", err);
						}
					},
				},
				{
					id: "excalidraw_draw_elements",
					label: "绘制画板元素",
					onAction: async (payload?: string | Record<string, unknown>) => {
						if (!payload) return;
						try {
							const data =
								typeof payload === "string" ? JSON.parse(payload) : payload;
							const excalidrawApi = await waitForExcalidrawApi(noteApiRef);
							if (!excalidrawApi) {
								toast.info("当前未处于 Excalidraw 画板视图，无法绘制图形");
								return;
							}
							const ok = excalidrawApi.drawElements(data);
							if (ok) {
								toast.success("AI 已向 Excalidraw 绘制图形元素与手绘连线");
							}
						} catch (err) {
							console.error("[excalidraw_draw_elements] error:", err);
						}
					},
				},
				{
					id: "excalidraw_update_element",
					label: "更新画板元素",
					onAction: async (payload?: string | Record<string, unknown>) => {
						if (!payload) return;
						try {
							const data =
								typeof payload === "string" ? JSON.parse(payload) : payload;
							const excalidrawApi = await waitForExcalidrawApi(noteApiRef);
							if (!excalidrawApi) return;
							const ok = excalidrawApi.updateElement(data.elementId, data);
							if (ok) {
								toast.success("已更新画板元素");
							}
						} catch (err) {
							console.error("[excalidraw_update_element] error:", err);
						}
					},
				},
				{
					id: "excalidraw_clear_canvas",
					label: "清空画板",
					onAction: async () => {
						try {
							const excalidrawApi = await waitForExcalidrawApi(noteApiRef);
							if (!excalidrawApi) return;
							const ok = excalidrawApi.clearCanvas();
							if (ok) {
								toast.success("已清空 Excalidraw 画板");
							}
						} catch (err) {
							console.error("[excalidraw_clear_canvas] error:", err);
						}
					},
				},
				{
					id: "excalidraw_center_view",
					label: "居中画板视野",
					onAction: async (payload?: string | Record<string, unknown>) => {
						try {
							const data = payload
								? typeof payload === "string"
									? JSON.parse(payload)
									: payload
								: undefined;
							const excalidrawApi = await waitForExcalidrawApi(noteApiRef);
							if (!excalidrawApi) return;
							const ok = excalidrawApi.centerView(data?.elementIds);
							if (ok) {
								toast.success("已将画板内容居中显示");
							}
						} catch (err) {
							console.error("[excalidraw_center_view] error:", err);
						}
					},
				},
				// Canvas message-level action
				{
					id: "canvas_add_as_card",
					label: "转为白板卡片",
					icon: PlusSquare,
					tooltip: "将此条 AI 回复作为新卡片加入当前白板",
					showOnMessages: isCanvas,
					onAction: (content: string) => {
						const api = noteApiRef.current;
						if (!api?.canvasApi) {
							toast.info("请先打开并聚焦白板视图");
							return;
						}
						const text = content.trim();
						if (!text) return;
						const ok = api.canvasApi.addElements({
							nodes: [
								{
									id: `ai_card_${Date.now().toString(16)}`,
									type: "text",
									text,
									color: "3",
								},
							],
							layout: "free",
						});
						if (ok) {
							toast.success("已将 AI 回复转为白板卡片");
						}
					},
				},
				{
					id: "note_summarize",
					label: "总结当前笔记",
					icon: FileText,
					tooltip: "提炼当前打开笔记的核心要点与结构脉络进对话",
					onAction: () => {
						sendWithNote(
							"请总结这篇笔记：提炼核心要点（分条列出），并简述其结构与可改进之处。",
						);
					},
				},
				{
					id: "note_append",
					label: "追加到笔记",
					icon: ArrowDownToLine,
					tooltip: "将该回复追加到当前笔记末尾",
					showOnMessages: !isCanvas,
					onAction: applyToNote("append"),
				},
				{
					id: "note_replace",
					label: "替换整篇",
					icon: Replace,
					tooltip: "用该回复替换当前笔记全文（编辑器内可撤销）",
					showOnMessages: !isCanvas,
					onAction: applyToNote("replace"),
				},
			],
		});
		return () => registerPageBridge(null);
	}, [
		registerPageBridge,
		noteApiRef,
		noteTitle,
		selectedNotePath,
		onCreateCanvas,
		onCreateExcalidraw,
	]);
}
