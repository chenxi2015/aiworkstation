import type React from "react";
import { useMemo } from "react";
import { buildHighlightedMarkdown } from "../../utils/diffHelper";
import { SplitMarkdownBlock } from "./SplitMarkdownBlock";
import { SplitVersionSelector } from "./SplitVersionSelector";
import type { DocumentVersion, ViewMode } from "./types";

export interface SplitOriginalColumnProps {
	version: DocumentVersion;
	compareVersion?: DocumentVersion;
	versions: DocumentVersion[];
	selectedVersionId: string;
	onSelectVersion: (id: string) => void;
	viewMode: ViewMode;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: () => void;
}

/**
 * Left column rendering the selected base version document:
 * Displays pristine structured Markdown or diff deletions when compared against the right canvas.
 */
export function SplitOriginalColumn({
	version,
	compareVersion,
	versions,
	selectedVersionId,
	onSelectVersion,
	viewMode,
	scrollRef,
	onScroll,
}: SplitOriginalColumnProps) {
	const textLen = version?.content?.length || 0;

	// Build highlighted markdown when in diff mode
	const renderedMarkdown = useMemo(() => {
		if (!version?.content) return "";
		if (viewMode !== "diff" || !compareVersion?.content) {
			return version.content;
		}
		return buildHighlightedMarkdown(
			version.content,
			compareVersion.content,
			"base",
		);
	}, [viewMode, version.content, compareVersion?.content]);

	return (
		<section className="flex-1 flex flex-col min-w-0 border-r border-border/80 bg-surface/50 dark:bg-background/50">
			{/* Top column version bar */}
			<div className="h-9 px-4 border-b border-border/60 bg-surface-secondary/40 flex items-center justify-between text-xs text-muted font-medium shrink-0">
				<SplitVersionSelector
					labelPrefix="左栏基准"
					selectedVersionId={selectedVersionId}
					versions={versions}
					onSelectVersion={onSelectVersion}
				/>
				<span className="text-[11px] opacity-75 font-mono">{textLen} 字</span>
			</div>

			{/* Main scrollable content */}
			<div
				ref={scrollRef}
				onScroll={onScroll}
				className="flex-1 overflow-y-auto px-6 py-8 select-text"
			>
				<div className="max-w-2xl mx-auto">
					{!version.content ? (
						<div className="text-center py-16 text-muted text-xs">
							该版本暂无内容
						</div>
					) : (
						<SplitMarkdownBlock
							markdownText={renderedMarkdown}
							viewMode="clean"
						/>
					)}
				</div>
			</div>
		</section>
	);
}
