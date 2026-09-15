import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import type React from "react";
import type { SlashMenuState } from "../../hooks/useRichTextEditor";
import {
	SlashCommandMenu,
	type SlashCommandMenuRef,
} from "../SlashCommandMenu";
import { SplitFloatingPromptDock } from "./SplitFloatingPromptDock";
import { SplitVersionSelector } from "./SplitVersionSelector";
import type { DocumentVersion, SplitCanvasMode, ViewMode } from "./types";

export interface SplitRevisedColumnProps {
	selectedVersionId: string;
	versions: DocumentVersion[];
	onSelectVersion: (id: string) => void;
	wordCount: number;
	diffDelta: number;
	diffViewMode: ViewMode;
	onChangeDiffViewMode: (mode: ViewMode) => void;
	highlightedMarkdown?: string;
	editor: Editor | null;
	isStreaming: boolean;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: () => void;
	slashMenu: SlashMenuState | null;
	slashMenuRef: React.RefObject<SlashCommandMenuRef | null>;
	onCloseSlashMenu: () => void;
	selectedMode: SplitCanvasMode | null;
	onSelectMode: (mode: SplitCanvasMode | null) => void;
	customPrompt: string;
	onChangeCustomPrompt: (prompt: string) => void;
	onStartGenerate: () => void;
	onStopGenerate: () => void;
	canAccept?: boolean;
	onAccept?: () => void;
	onReject?: () => void;
}

/**
 * Right Column: Draft Practice Canvas
 * - Unified TipTap rich-text rendering with suggestion marks for diff visualization
 * - Floating AI dock at bottom for continuous prompt revisions
 */
export function SplitRevisedColumn({
	selectedVersionId,
	versions,
	onSelectVersion,
	wordCount,
	diffDelta,
	diffViewMode,
	onChangeDiffViewMode,
	highlightedMarkdown: _highlightedMarkdown,
	editor,
	isStreaming,
	scrollRef,
	onScroll,
	slashMenu,
	slashMenuRef,
	onCloseSlashMenu,
	selectedMode,
	onSelectMode,
	customPrompt,
	onChangeCustomPrompt,
	onStartGenerate,
	onStopGenerate,
	canAccept,
	onAccept,
	onReject,
}: SplitRevisedColumnProps) {
	return (
		<section className="flex-1 flex flex-col min-w-0 bg-surface dark:bg-background relative">
			{/* Right Header with Version Selector, Status & Stats */}
			<div className="h-9 px-4 border-b border-border/60 bg-accent/5 flex items-center justify-between text-xs font-medium shrink-0 text-accent select-none">
				<div className="flex items-center gap-2">
					<span
						className={`w-2 h-2 rounded-full bg-accent ${
							isStreaming ? "animate-ping" : ""
						}`}
					/>
					<SplitVersionSelector
						labelPrefix="右栏 · 演练"
						selectedVersionId={selectedVersionId}
						versions={versions}
						onSelectVersion={onSelectVersion}
						disabled={isStreaming}
						fallbackLabel="当前草稿 (未保存)"
					/>
				</div>
				<div className="flex items-center gap-2">
					{diffViewMode === "diff" && (
						<>
							{diffDelta !== 0 && (
								<span
									className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
										diffDelta > 0
											? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
											: "bg-rose-500/15 text-rose-600 dark:text-rose-400"
									}`}
								>
									{diffDelta > 0 ? `+${diffDelta}` : diffDelta} 字
								</span>
							)}
							<button
								type="button"
								onClick={() => onChangeDiffViewMode("clean")}
								className="text-[11px] text-accent/80 hover:text-accent underline cursor-pointer hidden sm:inline"
							>
								切回纯净编辑
							</button>
						</>
					)}
					<span className="text-[11px] text-muted font-mono">
						{wordCount} 字
					</span>
				</div>
			</div>

			{/* Right Content Area */}
			<div
				ref={scrollRef}
				onScroll={onScroll}
				className="flex-1 overflow-y-auto px-8 py-6 pb-48 select-text relative"
			>
				<div className="max-w-2xl mx-auto">
					<EditorContent
						editor={editor}
						className="tiptap-editor prose prose-neutral dark:prose-invert max-w-none focus:outline-none"
					/>
				</div>
			</div>

			{/* Slash Commands Floating Popup Menu */}
			{slashMenu && editor && (
				<SlashCommandMenu
					ref={slashMenuRef}
					editor={editor}
					range={slashMenu.range}
					query={slashMenu.query}
					clientRect={slashMenu.clientRect}
					onClose={onCloseSlashMenu}
				/>
			)}

			{/* Floating AI Prompt Input anchored at bottom of right column */}
			<SplitFloatingPromptDock
				selectedMode={selectedMode}
				onSelectMode={onSelectMode}
				customPrompt={customPrompt}
				onChangeCustomPrompt={onChangeCustomPrompt}
				isStreaming={isStreaming}
				onStartGenerate={onStartGenerate}
				onStopGenerate={onStopGenerate}
				canAccept={canAccept}
				onAccept={onAccept}
				onReject={onReject}
			/>
		</section>
	);
}
