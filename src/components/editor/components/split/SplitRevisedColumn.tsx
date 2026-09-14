import { Edit3, Eye, Loader2 } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { buildHighlightedMarkdown } from "../../utils/diffHelper";
import { SplitMarkdownBlock } from "./SplitMarkdownBlock";
import { SplitVersionSelector } from "./SplitVersionSelector";
import type { DocumentVersion, ViewMode } from "./types";

export interface SplitRevisedColumnProps {
	version: DocumentVersion;
	compareVersion?: DocumentVersion;
	versions: DocumentVersion[];
	selectedVersionId: string;
	onSelectVersion: (id: string) => void;
	isStreaming: boolean;
	viewMode: ViewMode;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: () => void;
	onUpdateVersionContent: (versionId: string, content: string) => void;
}

/**
 * Right column rendering the draft practice canvas:
 * Supports AI dynamic streaming, structured rich markdown with diff insertion highlights,
 * and direct inline editing mode.
 */
export function SplitRevisedColumn({
	version,
	compareVersion,
	versions,
	selectedVersionId,
	onSelectVersion,
	isStreaming,
	viewMode,
	scrollRef,
	onScroll,
	onUpdateVersionContent,
}: SplitRevisedColumnProps) {
	const [isManualEditing, setIsManualEditing] = useState(false);
	const textLen = version?.content?.length || 0;

	// Build highlighted markdown when in diff mode
	const renderedMarkdown = useMemo(() => {
		if (!version?.content) return "";
		if (viewMode !== "diff" || !compareVersion?.content || isStreaming) {
			return version.content;
		}
		return buildHighlightedMarkdown(
			compareVersion.content,
			version.content,
			"revised",
		);
	}, [viewMode, version.content, compareVersion?.content, isStreaming]);

	return (
		<section className="flex-1 flex flex-col min-w-0 bg-surface dark:bg-background relative">
			{/* Top column header with version dropdown and manual edit switch */}
			<div className="h-9 px-4 border-b border-border/60 bg-accent/5 flex items-center justify-between text-xs font-medium shrink-0 text-accent">
				<div className="flex items-center gap-2">
					<span
						className={`w-2 h-2 rounded-full bg-accent ${
							isStreaming ? "animate-ping" : ""
						}`}
					/>
					<SplitVersionSelector
						labelPrefix="右栏演练"
						selectedVersionId={selectedVersionId}
						versions={versions}
						onSelectVersion={onSelectVersion}
						disabled={isStreaming}
					/>
				</div>

				<div className="flex items-center gap-2">
					{!isStreaming && (
						<button
							type="button"
							onClick={() => setIsManualEditing((prev) => !prev)}
							className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-normal transition-colors cursor-pointer ${
								isManualEditing
									? "bg-accent text-accent-foreground font-medium shadow-xs"
									: "bg-surface-secondary/80 text-muted hover:text-foreground"
							}`}
							title={
								isManualEditing ? "完成微调并预览排版" : "就地微调草稿内容"
							}
						>
							{isManualEditing ? (
								<>
									<Eye className="w-3 h-3" />
									<span>完成编辑</span>
								</>
							) : (
								<>
									<Edit3 className="w-3 h-3" />
									<span>就地微调</span>
								</>
							)}
						</button>
					)}
					<span className="text-[11px] text-muted font-mono">{textLen} 字</span>
				</div>
			</div>

			{/* Main Content Area */}
			<div
				ref={scrollRef}
				onScroll={onScroll}
				className="flex-1 overflow-y-auto px-6 py-8 select-text pb-28"
			>
				<div className="max-w-2xl mx-auto">
					{isStreaming && !version.content ? (
						<div className="flex flex-col items-center justify-center py-20 text-muted space-y-3">
							<Loader2 className="w-6 h-6 text-accent animate-spin" />
							<p className="text-xs text-muted/80">AI 正在构思与梳理脉络...</p>
						</div>
					) : isManualEditing && !isStreaming ? (
						<div className="space-y-2">
							<div className="flex items-center justify-between text-[11px] text-muted mb-1 select-none">
								<span>直接编辑 Markdown 草稿（修改自动保存至此版本）：</span>
								<span className="text-accent font-medium">手动精修模式</span>
							</div>
							<textarea
								value={version.content}
								onChange={(e) =>
									onUpdateVersionContent(version.id, e.target.value)
								}
								rows={22}
								className="w-full font-mono text-xs leading-relaxed p-4 rounded-xl border border-accent/40 bg-surface dark:bg-zinc-900/60 text-foreground outline-none focus:ring-2 focus:ring-accent/20 resize-y shadow-inner"
								placeholder="在此直接输入或修剪文章..."
							/>
						</div>
					) : (
						<div>
							<SplitMarkdownBlock
								markdownText={renderedMarkdown}
								viewMode="clean"
							/>
							{isStreaming && (
								<span className="inline-block w-2 h-4 bg-accent ml-1 animate-pulse align-middle" />
							)}
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
