import { Loader2 } from "lucide-react";
import type React from "react";
import { computeFineDiff } from "../../utils/diffHelper";
import type { DocBlock, ViewMode } from "./types";

export interface SplitRevisedColumnProps {
	blocks: DocBlock[];
	revisedLen: number;
	isStreaming: boolean;
	viewMode: ViewMode;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: () => void;
}

/**
 * Right column rendering the AI streaming revised document with skeleton overlays and diff insertions.
 */
export function SplitRevisedColumn({
	blocks,
	revisedLen,
	isStreaming,
	viewMode,
	scrollRef,
	onScroll,
}: SplitRevisedColumnProps) {
	return (
		<section className="flex-1 flex flex-col min-w-0 bg-surface dark:bg-background">
			<div className="h-8 px-4 border-b border-border/60 bg-accent/5 flex items-center justify-between text-xs font-medium shrink-0 text-accent">
				<span className="flex items-center gap-1.5">
					<span
						className={`w-2 h-2 rounded-full bg-accent ${
							isStreaming ? "animate-ping" : ""
						}`}
					/>
					右栏 · AI 实时数据流写入
				</span>
				<span className="text-[11px] text-muted">{revisedLen} 字</span>
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
							const isHeading = block.nodeType === "heading";
							const isCurrentStreaming = block.status === "streaming";

							// 1. Pending block: graceful skeleton preview while waiting in queue
							if (block.status === "pending") {
								return (
									<div
										key={block.id}
										data-block-id={block.id}
										className="p-3 rounded-lg border border-dashed border-border/50 bg-muted/[0.02] space-y-1.5 opacity-40 transition-all select-none"
									>
										<div className="flex items-center justify-between text-[10px] text-muted">
											<span>第 {block.textIndex} 段待处理</span>
											<span>等待排队</span>
										</div>
										<div className="h-2.5 bg-muted/20 rounded w-full" />
										<div className="h-2 bg-muted/15 rounded w-3/4" />
									</div>
								);
							}

							// 2. Actively streaming block: skeleton overlay when buffering, or live diff typing with glow
							if (isCurrentStreaming) {
								const hasOutput = block.revisedText.length > 0;
								const diffs = hasOutput
									? computeFineDiff(block.originalText, block.revisedText)
									: [];

								return (
									<div
										key={block.id}
										data-block-id={block.id}
										className="relative p-3.5 rounded-xl border-2 border-accent/60 bg-accent/[0.05] transition-all leading-relaxed shadow-sm overflow-hidden"
									>
										{/* Processing header badge */}
										<div className="flex items-center justify-between text-[11px] font-medium text-accent mb-2.5 pb-1.5 border-b border-accent/20 select-none">
											<span className="flex items-center gap-1.5">
												<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
												<span>
													{hasOutput
														? `AI 实时重构中 (第 ${block.textIndex} 段)`
														: `AI 正在深度思考第 ${block.textIndex} 段…`}
												</span>
											</span>
											<span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full font-mono animate-pulse">
												{hasOutput ? "实时流式写入" : "正在处理"}
											</span>
										</div>

										{/* If AI has not yielded text yet: show animated skeleton shimmer bars */}
										{!hasOutput ? (
											<div className="space-y-2 py-1 animate-pulse">
												<div className="h-3.5 bg-accent/25 rounded-md w-full" />
												<div
													className="h-3.5 bg-accent/20 rounded-md w-4/5"
													style={{ animationDelay: "150ms" }}
												/>
												<div
													className="h-3.5 bg-accent/15 rounded-md w-2/3"
													style={{ animationDelay: "300ms" }}
												/>
											</div>
										) : (
											/* Streaming text output with green diffs & cursor */
											<div
												className={
													isHeading
														? "font-bold text-lg text-foreground"
														: "text-sm text-foreground"
												}
											>
												{diffs.map((d, idx) => {
													if (d.status === "added") {
														return (
															<ins
																key={`ins_${idx}`}
																className="no-underline bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium px-0.5 rounded mx-0.5 border-b-2 border-emerald-500/50"
															>
																{d.text}
															</ins>
														);
													}
													if (d.status === "same") {
														return <span key={`same_${idx}`}>{d.text}</span>;
													}
													return null;
												})}
												{/* Pulsating typing cursor */}
												<span className="inline-block w-1.5 h-4 bg-accent animate-pulse ml-1 align-middle rounded-full" />
											</div>
										)}
									</div>
								);
							}

							// 3. Completed block (done) in diff view
							if (viewMode === "diff") {
								const diffs = computeFineDiff(
									block.originalText,
									block.revisedText,
								);
								return (
									<div
										key={block.id}
										data-block-id={block.id}
										className={`p-1.5 rounded transition-colors leading-relaxed ${
											isHeading
												? "font-bold text-lg text-foreground"
												: "text-sm text-foreground"
										}`}
									>
										{diffs.map((d, idx) => {
											if (d.status === "added") {
												return (
													<ins
														key={`ins_${idx}`}
														className="no-underline bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium px-0.5 rounded mx-0.5 border-b border-emerald-500/40"
													>
														{d.text}
													</ins>
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

							// Clean preview mode: pure clean text
							return (
								<div
									key={block.id}
									data-block-id={block.id}
									className={`p-1.5 rounded leading-relaxed ${
										isHeading
											? "font-bold text-lg text-foreground"
											: "text-sm text-foreground"
									}`}
								>
									{block.revisedText}
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
