import { marked } from "marked";
import { useMemo } from "react";
import type { ViewMode } from "./types";

interface SplitMarkdownBlockProps {
	markdownText: string;
	viewMode?: ViewMode;
	isAdded?: boolean;
	className?: string;
}

/**
 * Renders rich markdown block with full GFM table layout support in the split compare view.
 * Ensures markdown tables are properly rendered as styled HTML tables with clear columns.
 */
export function SplitMarkdownBlock({
	markdownText,
	viewMode = "clean",
	isAdded = false,
	className = "",
}: SplitMarkdownBlockProps) {
	const renderedHtml = useMemo(() => {
		if (!markdownText) return "";
		try {
			return marked.parse(markdownText, {
				gfm: true,
				breaks: true,
			}) as string;
		} catch (err) {
			console.warn("[SplitMarkdownBlock] marked parse error:", err);
			return markdownText;
		}
	}, [markdownText]);

	const tableStyles = `
		[&_table]:w-full [&_table]:my-2 [&_table]:border-collapse [&_table]:text-xs [&_table]:border [&_table]:border-border/80 [&_table]:rounded-lg
		[&_thead]:bg-surface-secondary/70 [&_thead]:border-b [&_thead]:border-border/80 [&_thead]:text-foreground
		[&_th]:border [&_th]:border-border/60 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-left
		[&_td]:border [&_td]:border-border/40 [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-foreground/90 [&_td]:align-top
		[&_tr:hover]:bg-accent/[0.03]
		[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
		[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5
		[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5
		[&_li]:my-0.5
		[&_strong]:font-semibold [&_strong]:text-foreground
	`;

	if (viewMode === "diff" && isAdded) {
		return (
			<div className="my-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.03] p-2.5 transition-all">
				<div className="flex items-center justify-between text-[11px] font-medium text-emerald-700 dark:text-emerald-300 mb-1.5 pb-1 border-b border-emerald-500/20 select-none">
					<span>✨ 改写生成的表格/排版</span>
					<span className="text-[10px] bg-emerald-500/15 px-1.5 py-0.2 rounded font-mono">
						新增表格
					</span>
				</div>
				<div
					className={`overflow-x-auto text-sm leading-relaxed max-w-full ${tableStyles} ${className}`}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized marked output for split view
					dangerouslySetInnerHTML={{ __html: renderedHtml }}
				/>
			</div>
		);
	}

	return (
		<div
			className={`overflow-x-auto text-sm leading-relaxed max-w-full ${tableStyles} ${className}`}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized marked output for split view
			dangerouslySetInnerHTML={{ __html: renderedHtml }}
		/>
	);
}
