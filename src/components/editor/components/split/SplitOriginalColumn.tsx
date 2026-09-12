import { Sparkles } from "lucide-react";
import type React from "react";
import { computeFineDiff } from "../../utils/diffHelper";
import type { DocBlock, ViewMode } from "./types";

export interface SplitOriginalColumnProps {
	blocks: DocBlock[];
	originalLen: number;
	viewMode: ViewMode;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: () => void;
}

/**
 * Left column rendering the pristine original document with live diff deletions.
 */
export function SplitOriginalColumn({
	blocks,
	originalLen,
	viewMode,
	scrollRef,
	onScroll,
}: SplitOriginalColumnProps) {
	return (
		<section className="flex-1 flex flex-col min-w-0 border-r border-border/80 bg-surface/50 dark:bg-background/50">
			<div className="h-8 px-4 border-b border-border/60 bg-surface-secondary/40 flex items-center justify-between text-xs text-muted font-medium shrink-0">
				<span className="flex items-center gap-1.5">
					<span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
					左栏 · 原文 (只读)
				</span>
				<span className="text-[11px] opacity-75">{originalLen} 字</span>
			</div>
			<div
				ref={scrollRef as any}
				onScroll={onScroll}
				className="flex-1 overflow-y-auto px-6 py-8"
			>
				<div className="max-w-2xl mx-auto space-y-4">
					{blocks.map((block) => {
						if (block.type === "image") {
							return (
								<div
									key={block.id}
									data-block-id={block.id}
									className="my-4 rounded-xl overflow-hidden border border-border/60 bg-muted/10 shadow-xs max-w-full"
								>
									<img
										src={block.attrs?.src}
										alt={block.attrs?.alt || ""}
										className="w-full h-auto object-cover max-h-[420px]"
									/>
								</div>
							);
						}

						if (block.type === "video") {
							return (
								<div
									key={block.id}
									data-block-id={block.id}
									className="my-4 rounded-xl overflow-hidden border border-border/60 shadow-xs"
								>
									<video
										src={block.attrs?.src}
										controls
										className="w-full max-h-[360px]"
									/>
								</div>
							);
						}

						if (block.type === "text") {
							const isCurrentStreaming = block.status === "streaming";
							const hasRevised = block.revisedText.length > 0;
							const isHeading = block.nodeType === "heading";

							// 1. Actively streaming block
							if (isCurrentStreaming) {
								const diffs = hasRevised
									? computeFineDiff(block.originalText, block.revisedText)
									: null;

								return (
									<div
										key={block.id}
										data-block-id={block.id}
										className="relative p-3 rounded-xl border-2 border-accent/40 bg-accent/[0.03] transition-all leading-relaxed shadow-xs"
									>
										<div className="flex items-center justify-between text-[10px] font-medium text-accent mb-2 pb-1.5 border-b border-accent/15 select-none">
											<span className="flex items-center gap-1.5">
												<Sparkles className="w-3 h-3 animate-spin text-accent" />
												<span>原文对照中 (第 {block.textIndex} 段)</span>
											</span>
											<span className="text-[10px] bg-accent/10 px-1.5 py-0.5 rounded text-accent/80 font-mono">
												只读对比
											</span>
										</div>

										<div
											className={
												isHeading
													? "font-bold text-lg text-foreground"
													: "text-sm text-foreground/90"
											}
										>
											{diffs
												? diffs.map((d, idx) => {
														if (d.status === "removed") {
															return (
																<del
																	key={`del_${idx}`}
																	className="bg-red-500/15 text-red-700 dark:text-red-300 line-through px-0.5 rounded mx-0.5 decoration-red-500/60"
																>
																	{d.text}
																</del>
															);
														}
														if (d.status === "same") {
															return <span key={`same_${idx}`}>{d.text}</span>;
														}
														return null;
													})
												: block.originalText}
										</div>
									</div>
								);
							}

							// 2. Completed block in diff mode
							if (viewMode === "diff" && hasRevised) {
								const diffs = computeFineDiff(
									block.originalText,
									block.revisedText,
								);
								return (
									<div
										key={block.id}
										data-block-id={block.id}
										className={`p-1.5 rounded transition-all leading-relaxed ${
											isHeading
												? "font-bold text-lg text-foreground"
												: "text-sm text-foreground/90"
										}`}
									>
										{diffs.map((d, idx) => {
											if (d.status === "removed") {
												return (
													<del
														key={`del_${idx}`}
														className="bg-red-500/15 text-red-700 dark:text-red-300 line-through px-0.5 rounded mx-0.5 decoration-red-500/60"
													>
														{d.text}
													</del>
												);
											}
											if (d.status === "same") {
												return <span key={`same_${idx}`}>{d.text}</span>;
											}
											return null;
										})}
									</div>
								);
							}

							// 3. Default text view (pending or clean mode)
							return (
								<div
									key={block.id}
									data-block-id={block.id}
									className={`p-1.5 rounded leading-relaxed ${
										isHeading
											? "font-bold text-lg text-foreground"
											: "text-sm text-foreground/80"
									}`}
								>
									{block.originalText}
								</div>
							);
						}

						return null;
					})}
				</div>
			</div>
		</section>
	);
}
