import { toast } from "@heroui/react";
import { Columns2, ListTree, Shuffle, Sparkles } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { workbenchContextActions } from "../../../stores/workbenchContextStore";
import { useAiPanel } from "../../shell/AppShell";
import type {
	ObsidianCanvasApi,
	ObsidianExcalidrawApi,
	ObsidianMutationResult,
	ObsidianNoteApi,
} from "../types";

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
	/** 按相对路径直接打开 Vault 条目（用于无头创建后跳转查看） */
	onOpenPath?: (relPath: string) => void;
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
 * - 空态快捷入口：双栏二创改写、双栏全文润色、结构化整理
 * - 画布/画板工具联动：提供无头操作句柄供 AI Agent 实时绘制与编辑
 */
export function useObsidianAiBridge({
	noteApiRef,
	selectedNotePath,
	onOpenPath,
	onCreateCanvas,
	onCreateExcalidraw,
}: UseObsidianAiBridgeOptions) {
	const { registerPageBridge } = useAiPanel();

	const noteTitle = selectedNotePath
		? (selectedNotePath.split("/").pop()?.replace(/\.md$/i, "") ?? null)
		: null;

	// 同步全局 activeNote 状态，供输入框将「当前笔记」合成为内建上下文 chip（可 × 解除）
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
		const isCanvas = Boolean(selectedNotePath?.endsWith(".canvas"));
		const isExcalidraw = Boolean(selectedNotePath?.endsWith(".excalidraw"));

		const noteActions =
			isCanvas || isExcalidraw
				? []
				: [
						{
							id: "stream_spin_rewrite",
							label: "二创洗稿重构",
							icon: Shuffle,
							variant: "accent" as const,
							target: {
								kind: "note" as const,
								module: "obsidian",
								executionForm: "双栏比对改写",
							},
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
							target: {
								kind: "note" as const,
								module: "obsidian",
								executionForm: "双栏比对改写",
							},
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
							target: {
								kind: "note" as const,
								module: "obsidian",
								executionForm: "双栏比对改写",
							},
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
				...noteActions,
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
					id: "excalidraw_insert_library_item",
					label: "插入图库素材",
					onAction: async (payload?: string | Record<string, unknown>) => {
						if (!payload) return;
						try {
							const data =
								typeof payload === "string" ? JSON.parse(payload) : payload;
							const excalidrawApi = await waitForExcalidrawApi(noteApiRef);
							if (!excalidrawApi) {
								toast.info("当前未处于 Excalidraw 画板视图，无法插入素材");
								return;
							}
							const ok = excalidrawApi.insertLibraryItems(
								data as { elements: Record<string, unknown>[] },
							);
							if (ok) {
								toast.success("AI 已向 Excalidraw 插入图库素材");
							} else {
								toast.info("图库素材插入失败");
							}
						} catch (err) {
							console.error("[excalidraw_insert_library_item] error:", err);
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
			],
		});
		return () => registerPageBridge(null);
	}, [
		registerPageBridge,
		noteApiRef,
		noteTitle,
		selectedNotePath,
		onOpenPath,
		onCreateCanvas,
		onCreateExcalidraw,
	]);

	// Consume cross-module pending actions after PageBridge registration:
	// a confirmed proposal card navigates here (note opened via ?note= search
	// param) and expects the action to run once the note panel is ready
	// (single-slot, one-time consume, 60s TTL).
	useEffect(() => {
		if (!selectedNotePath) return;
		if (
			selectedNotePath.endsWith(".canvas") ||
			selectedNotePath.endsWith(".excalidraw")
		) {
			return;
		}
		const pending = workbenchContextActions.getPendingAction();
		if (!pending || pending.targetObject.kind !== "note") return;
		if (pending.targetObject.notePath !== selectedNotePath) return;

		let cancelled = false;
		const attempt = async (retries: number): Promise<void> => {
			if (cancelled) return;
			const api = noteApiRef.current;
			if (api?.hasNote() && api.onStartRewritePipeline) {
				const consumed = workbenchContextActions.consumePendingAction();
				if (!consumed) return;
				await api.flushSave();
				await api.onStartRewritePipeline(
					consumed.payload || undefined,
					"双栏比对改写",
				);
				return;
			}
			if (retries > 0) {
				setTimeout(() => void attempt(retries - 1), 120);
			}
		};
		void attempt(25);
		return () => {
			cancelled = true;
		};
	}, [selectedNotePath, noteApiRef]);
}
