import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import type React from "react";
import { SplitVersionSelector } from "./SplitVersionSelector";
import type { DocumentVersion, ViewMode } from "./types";

export interface SplitOriginalColumnProps {
	selectedVersionId: string;
	versions: DocumentVersion[];
	onSelectVersion: (id: string) => void;
	wordCount: number;
	diffViewMode?: ViewMode;
	highlightedMarkdown?: string;
	editor: Editor | null;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: () => void;
}

/**
 * Left Column: Base Version
 * - Unified TipTap rich-text rendering for both Clean mode and Diff mode
 */
export function SplitOriginalColumn({
	selectedVersionId,
	versions,
	onSelectVersion,
	wordCount,
	diffViewMode: _diffViewMode,
	highlightedMarkdown: _highlightedMarkdown,
	editor,
	scrollRef,
	onScroll,
}: SplitOriginalColumnProps) {
	return (
		<section className="flex-1 flex flex-col min-w-0 border-r border-border/80 bg-surface/50 dark:bg-background/50">
			{/* Left Header with Version Selector */}
			<div className="h-9 px-4 border-b border-border/60 bg-surface-secondary/40 flex items-center justify-between text-xs text-muted font-medium shrink-0 select-none">
				<SplitVersionSelector
					labelPrefix="左栏 · 基准"
					selectedVersionId={selectedVersionId}
					versions={versions}
					onSelectVersion={onSelectVersion}
				/>
				<span className="text-[11px] opacity-75 font-mono">{wordCount} 字</span>
			</div>

			{/* Left Content Area */}
			<div
				ref={scrollRef}
				onScroll={onScroll}
				className="flex-1 overflow-y-auto px-8 py-6 pb-48 select-text"
			>
				<div className="max-w-2xl mx-auto">
					<EditorContent
						editor={editor}
						className="tiptap-editor prose prose-neutral dark:prose-invert max-w-none focus:outline-none"
					/>
				</div>
			</div>
		</section>
	);
}
