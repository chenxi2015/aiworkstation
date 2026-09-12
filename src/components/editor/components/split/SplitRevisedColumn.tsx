import { Skeleton } from "@heroui/react";
import { Loader2, Pencil } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { computeFineDiff } from "../../utils/diffHelper";
import { SplitBlockEditor } from "./SplitBlockEditor";
import type { DocBlock, ViewMode } from "./types";

export interface SplitRevisedColumnProps {
	blocks: DocBlock[];
	revisedLen: number;
	isStreaming: boolean;
	viewMode: ViewMode;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: () => void;
	onUpdateBlockText?: (id: string, text: string) => void;
	onResetBlockText?: (id: string) => void;
}

function getSkeletonLineCount(text: string): number {
	const len = text.trim().length;
	if (len <= 40) return 1;
	if (len <= 100) return 2;
	if (len <= 200) return 3;
	return 4;
}

/**
 * Right column rendering the AI streaming revised document with skeleton overlays,
 * diff insertions, and direct inline manual editing.
 */
export function SplitRevisedColumn({
	blocks,
	revisedLen,
	isStreaming,
	viewMode,
	scrollRef,
	onScroll,
	onUpdateBlockText,
	onResetBlockText,
}: SplitRevisedColumnProps) {
	const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

	return (
		<section className="flex-1 flex flex-col min-w-0 bg-surface dark:bg-background">
			{/* Top Column Header */}
			<div className="h-8 px-4 border-b border-border/60 bg-accent/5 flex items-center justify-between text-xs font-medium shrink-0 text-accent">
				<span className="flex items-center gap-1.5">
					<span
						className={`w-2 h-2 rounded-full bg-accent ${
							isStreaming ? "animate-ping" : ""
						}`}
					/>
					{isStreaming
						? "右栏 · AI 实时数据流写入"
						: "右栏 · 改写成果 (支持直接点击修改)"}
				</span>
				<div className="flex items-center gap-2">
					{!isStreaming && (
						<span className="text-[10px] text-accent/80 bg-accent/10 px-1.5 py-0.5 rounded font-normal">
							点击段落可手动微调
						</span>
					)}
					<span className="text-[11px] text-muted">{revisedLen} 字</span>
				</div>
			</div>

			<div
				ref={scrollRef as any}
				onScroll={onScroll}
				className="flex-1 overflow-y-auto px-6 py-8 select-text"
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
							const isEditing = editingBlockId === block.id;

							// 1. Pending block: graceful skeleton preview while waiting in queue
							if (block.status === "pending") {
								const lineCount = isHeading
									? 1
									: getSkeletonLineCount(block.originalText);
								return (
									<div
										key={block.id}
										data-block-id={block.id}
										className="p-3.5 rounded-xl border border-dashed border-border/60 bg-surface-secondary/20 space-y-2 opacity-70 transition-all select-none"
									>
										<div className="flex items-center justify-between text-[10px] text-muted">
											<span>第 {block.textIndex} 段待处理</span>
											<span className="font-mono">等待排队…</span>
										</div>
										{isHeading ? (
											<Skeleton className="h-5 rounded-md w-3/5" />
										) : (
											<div className="space-y-1.5 pt-0.5">
												{Array.from({ length: lineCount }).map((_, idx) => (
													<Skeleton
														// biome-ignore lint/suspicious/noArrayIndexKey: skeleton lines
														key={idx}
														className="h-2.5 rounded"
														style={{
															width:
																idx === lineCount - 1 && lineCount > 1
																	? "65%"
																	: `${100 - idx * 8}%`,
														}}
													/>
												))}
											</div>
										)}
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
											<div className="space-y-2 py-1">
												{isHeading ? (
													<Skeleton className="h-6 rounded-lg w-3/5" />
												) : (
													Array.from({
														length: Math.max(
															2,
															getSkeletonLineCount(block.originalText),
														),
													}).map((_, idx, arr) => (
														<Skeleton
															// biome-ignore lint/suspicious/noArrayIndexKey: skeleton lines
															key={idx}
															className="h-3.5 rounded-md"
															style={{
																width:
																	idx === arr.length - 1
																		? "65%"
																		: `${100 - idx * 10}%`,
															}}
														/>
													))
												)}
											</div>
										) : (
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

							// 3. Active inline manual editor
							if (isEditing && onUpdateBlockText) {
								return (
									<SplitBlockEditor
										key={block.id}
										block={block}
										isHeading={isHeading}
										onUpdate={onUpdateBlockText}
										onReset={onResetBlockText}
										onExit={() => setEditingBlockId(null)}
									/>
								);
							}

							// 4. Completed block (done) - clickable to edit
							const isModifiedFromAi =
								Boolean(block.aiRevisedText) &&
								block.revisedText !== block.aiRevisedText;

							// Common wrapper styling for click-to-edit affordance
							const hoverAffordance =
								"group relative p-2 -m-1 rounded-lg border border-transparent hover:border-accent/30 hover:bg-accent/[0.02] cursor-text transition-all";

							if (viewMode === "diff") {
								const diffs = computeFineDiff(
									block.originalText,
									block.revisedText,
								);
								return (
									<div
										key={block.id}
										data-block-id={block.id}
										onClick={() => setEditingBlockId(block.id)}
										className={`${hoverAffordance} leading-relaxed ${
											isHeading
												? "font-bold text-lg text-foreground"
												: "text-sm text-foreground"
										}`}
										title="点击可直接编辑修改"
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

										{/* Hover quick edit button & modified badge */}
										<div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-[11px] select-none">
											{isModifiedFromAi && (
												<span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/20">
													已手动修改
												</span>
											)}
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													setEditingBlockId(block.id);
												}}
												className="bg-surface/95 dark:bg-background/95 hover:bg-accent/10 hover:border-accent/40 text-accent px-1.5 py-0.5 rounded shadow-xs border border-border/60 flex items-center gap-1 text-[10px] cursor-pointer transition-colors"
											>
												<Pencil className="w-2.5 h-2.5" />
												点击修改
											</button>
										</div>
									</div>
								);
							}

							// Clean preview mode: pure clean text, also clickable to edit
							return (
								<div
									key={block.id}
									data-block-id={block.id}
									onClick={() => setEditingBlockId(block.id)}
									className={`${hoverAffordance} leading-relaxed ${
										isHeading
											? "font-bold text-lg text-foreground"
											: "text-sm text-foreground"
									}`}
									title="点击可直接编辑修改"
								>
									{block.revisedText}

									{/* Hover quick edit button & modified badge */}
									<div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-[11px] select-none">
										{isModifiedFromAi && (
											<span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/20">
												已手动修改
											</span>
										)}
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												setEditingBlockId(block.id);
											}}
											className="bg-surface/95 dark:bg-background/95 hover:bg-accent/10 hover:border-accent/40 text-accent px-1.5 py-0.5 rounded shadow-xs border border-border/60 flex items-center gap-1 text-[10px] cursor-pointer transition-colors"
										>
											<Pencil className="w-2.5 h-2.5" />
											点击修改
										</button>
									</div>
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
