import { toast } from "@heroui/react";
import { ArrowDownToLine, FileText, Replace, Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
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
 * - 空态快捷入口：总结 / 润色当前笔记（携带笔记原文进对话）
 * - 消息级动作：把 AI 回复一键追加/替换进当前笔记（写入 draft 后自动保存落盘）
 */
export function useObsidianAiBridge({
	noteApiRef,
	selectedNotePath,
}: UseObsidianAiBridgeOptions) {
	const { registerPageBridge, sendPrompt } = useAiPanel();
	// sendPrompt 的引用随 context 重建，用 ref 固定，避免桥接反复重注册
	const sendPromptRef = useRef(sendPrompt);
	sendPromptRef.current = sendPrompt;

	const noteTitle = selectedNotePath
		? (selectedNotePath.split("/").pop()?.replace(/\.md$/i, "") ?? null)
		: null;

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
			flushSave: async () => {
				await noteApiRef.current?.flushSave();
			},
			actions: [
				{
					id: "note_summarize",
					label: "总结当前笔记",
					icon: FileText,
					variant: "accent" as const,
					emptyState: {
						title: "总结当前笔记",
						subtitle: "提炼当前打开笔记的核心要点与结构脉络。",
						badge: "笔记",
						actionText: "立即总结 ↗",
					},
					onAction: () => {
						sendWithNote(
							"请总结这篇笔记：提炼核心要点（分条列出），并简述其结构与可改进之处。",
						);
					},
				},
				{
					id: "note_polish",
					label: "润色当前笔记",
					icon: Sparkles,
					emptyState: {
						title: "润色当前笔记",
						subtitle: "保持原意与 Markdown 结构，优化语言表达与流畅度。",
						badge: "Markdown",
						actionText: "立即润色 ↗",
					},
					onAction: () => {
						sendWithNote(
							"请润色这篇笔记：保持原意、Wiki 链接与 Markdown 结构不变，优化语言表达，直接输出润色后的完整笔记 Markdown（不要用代码块包裹）。",
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
	}, [registerPageBridge, noteApiRef, noteTitle]);
}
