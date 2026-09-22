import { toast } from "@heroui/react";
import {
	ArrowDownToLine,
	Columns2,
	FileText,
	ListTree,
	Replace,
	Shuffle,
	Sparkles,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
import { workbenchContextActions } from "../../../stores/workbenchContextStore";
import { useAiPanel } from "../../shell/AppShell";
import type { ObsidianNoteApi } from "../types";

/** 传给 AI 的笔记原文上限（防止超大笔记打爆上下文） */
const NOTE_CONTEXT_LIMIT = 12000;

export interface UseObsidianAiBridgeOptions {
	/** NotePanel 注册的当前笔记操作句柄 */
	noteApiRef: React.RefObject<ObsidianNoteApi | null>;
	/** 当前选中笔记路径（用于空态标题/上下文展示） */
	selectedNotePath: string | null;
}

/**
 * 将 Obsidian 笔记页桥接到全局 AI 侧边栏：
 * - 空态快捷入口：双栏二创改写、双栏全文润色、结构化整理、提炼总结
 * - 消息级动作：把 AI 回复一键追加/替换进当前笔记
 */
export function useObsidianAiBridge({
	noteApiRef,
	selectedNotePath,
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

		registerPageBridge({
			module: "obsidian",
			activeDocumentId: null,
			activeDocumentTitle: noteTitle,
			activeNotePath: selectedNotePath,
			flushSave: async () => {
				await noteApiRef.current?.flushSave();
			},
			actions: [
				{
					id: "stream_spin_rewrite",
					label: "二创洗稿重构",
					icon: Shuffle,
					variant: "accent" as const,
					tooltip:
						"基于当前笔记事实进行深度二创与结构重组，在双栏视图中实时 Diff 审阅",
					emptyState: {
						title: "二创洗稿重构",
						subtitle:
							"在双栏视图中对当前笔记进行叙事与表达重构，支持红绿 Diff 审阅。",
						badge: "二创",
						actionText: "开启重构 ↗",
					},
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
					emptyState: {
						title: "双栏全文润色",
						subtitle: "保持 Markdown 原结构与链接，双栏实时对比精细润色。",
						badge: "Diff",
						actionText: "开始润色 ↗",
					},
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
				{
					id: "note_summarize",
					label: "总结当前笔记",
					icon: FileText,
					emptyState: {
						title: "总结当前笔记",
						subtitle: "提炼当前打开笔记的核心要点与结构脉络进对话。",
						badge: "对话",
						actionText: "立即总结 ↗",
					},
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
					showOnMessages: true,
					onAction: applyToNote("append"),
				},
				{
					id: "note_replace",
					label: "替换整篇",
					icon: Replace,
					tooltip: "用该回复替换当前笔记全文（编辑器内可撤销）",
					showOnMessages: true,
					onAction: applyToNote("replace"),
				},
			],
		});
		return () => registerPageBridge(null);
	}, [registerPageBridge, noteApiRef, noteTitle, selectedNotePath]);
}
