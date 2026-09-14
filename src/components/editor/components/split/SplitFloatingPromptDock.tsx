import {
	ArrowUp,
	Check,
	Maximize2,
	Mic,
	Minimize2,
	Shuffle,
	Sparkles,
	Square,
	WandSparkles,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { PRESET_MODES, type SplitCanvasMode } from "./types";

export interface SplitFloatingPromptDockProps {
	selectedMode: SplitCanvasMode | null;
	onSelectMode: (mode: SplitCanvasMode | null) => void;
	customPrompt: string;
	onChangeCustomPrompt: (prompt: string) => void;
	isStreaming: boolean;
	onStartGenerate: () => void;
	onStopGenerate: () => void;
	canAccept?: boolean;
	onAccept?: () => void;
	onReject?: () => void;
}

const MODE_ICONS: Record<string, React.ReactNode> = {
	Shuffle: <Shuffle className="w-3.5 h-3.5" />,
	Sparkles: <Sparkles className="w-3.5 h-3.5" />,
	Maximize2: <Maximize2 className="w-3.5 h-3.5" />,
	Minimize2: <Minimize2 className="w-3.5 h-3.5" />,
	Mic: <Mic className="w-3.5 h-3.5" />,
};

/**
 * Floating AI prompt dock (TipTap AI Toolkit "Agent editor" 风格):
 * - 胶囊输入条：快捷操作菜单 + 预设模式 chip + 圆形发送按钮
 * - 流式生成中：三点跳动 + 状态文案 + 圆形停止按钮
 * - 生成完毕待采纳：Reject / Accept 审核胶囊
 */
export function SplitFloatingPromptDock({
	selectedMode,
	onSelectMode,
	customPrompt,
	onChangeCustomPrompt,
	isStreaming,
	onStartGenerate,
	onStopGenerate,
	canAccept,
	onAccept,
	onReject,
}: SplitFloatingPromptDockProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [reviewDismissed, setReviewDismissed] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const activePreset = PRESET_MODES.find((m) => m.id === selectedMode) || null;
	const canGenerate = Boolean(selectedMode || customPrompt.trim());

	// 新一轮生成完成后重新展示审核条
	useEffect(() => {
		if (canAccept) setReviewDismissed(false);
	}, [canAccept]);

	// 点击外部关闭快捷操作菜单
	useEffect(() => {
		if (!menuOpen) return;
		const handlePointerDown = (e: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [menuOpen]);

	const autoGrow = () => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (!isStreaming && canGenerate) {
				setMenuOpen(false);
				onStartGenerate();
			}
		}
	};

	const showReviewBar = !isStreaming && canAccept && !reviewDismissed;

	return (
		<div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 w-[min(560px,92%)] select-none">
			{/* 审核胶囊：采纳 / 放弃（对应参考图 Accept / Reject） */}
			{showReviewBar && (
				<div className="mb-2.5 flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-200">
					<div className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-border/80 shadow-lg">
						<button
							type="button"
							onClick={onReject}
							className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
						>
							<X className="w-3.5 h-3.5" />
							<span>放弃并退出</span>
						</button>
						<button
							type="button"
							onClick={onAccept}
							className="flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground hover:opacity-90 transition-opacity cursor-pointer shadow-xs active:scale-95"
						>
							<Check className="w-3.5 h-3.5" />
							<span>采纳至正文</span>
						</button>
						<button
							type="button"
							onClick={() => setReviewDismissed(true)}
							title="继续编辑，暂不处理"
							className="p-1 rounded-full text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
						>
							<X className="w-3 h-3" />
						</button>
					</div>
				</div>
			)}

			{isStreaming ? (
				/* 流式状态胶囊（对应参考图 Using AI toolkit） */
				<div className="flex items-center gap-3 px-5 py-3 rounded-full bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-border/80 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
					<span className="flex items-center gap-1 pl-1">
						<span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
						<span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
						<span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
					</span>
					<span className="text-xs font-medium text-accent flex-1 truncate">
						AI 正在创作中…
					</span>
					<button
						type="button"
						onClick={onStopGenerate}
						title="停止生成"
						className="p-1.5 rounded-full text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer shrink-0"
					>
						<Square className="w-3 h-3 fill-current" />
					</button>
				</div>
			) : (
				/* 胶囊输入条（对应参考图 Ask about this document...） */
				<div className="relative">
					{/* 快捷操作菜单（对应参考图 AI Toolkit examples 下拉） */}
					{menuOpen && (
						<div
							ref={menuRef}
							className="absolute bottom-full mb-2 left-0 w-60 p-1.5 rounded-2xl bg-surface dark:bg-zinc-900 border border-border/80 shadow-xl ring-1 ring-black/5 dark:ring-white/10 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150"
						>
							<div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-muted">
								AI 快捷操作
							</div>
							{PRESET_MODES.map((mode) => {
								const isSelected = mode.id === selectedMode;
								return (
									<button
										key={mode.id}
										type="button"
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => {
											onSelectMode(isSelected ? null : mode.id);
											setMenuOpen(false);
											textareaRef.current?.focus();
										}}
										title={mode.desc}
										className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left ${
											isSelected
												? "bg-accent/15 text-accent font-medium"
												: "text-foreground hover:bg-muted/10"
										}`}
									>
										<span
											className={`shrink-0 ${isSelected ? "text-accent" : "text-muted"}`}
										>
											{MODE_ICONS[mode.iconName] || (
												<Sparkles className="w-3.5 h-3.5" />
											)}
										</span>
										<span className="flex-1 truncate">{mode.label}</span>
										{isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
									</button>
								);
							})}
						</div>
					)}

					<div className="flex items-end gap-1.5 pl-2 pr-1.5 py-1.5 rounded-[26px] bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-border/80 shadow-xl transition-all focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
						{/* 快捷操作触发按钮 */}
						<button
							type="button"
							onClick={() => setMenuOpen((prev) => !prev)}
							title="AI 快捷操作"
							className={`p-2 mb-0.5 rounded-full transition-colors cursor-pointer shrink-0 ${
								menuOpen || activePreset
									? "text-accent bg-accent/10"
									: "text-muted hover:text-accent hover:bg-accent/10"
							}`}
						>
							<WandSparkles className="w-4 h-4" />
						</button>

						{/* 已选预设 chip */}
						{activePreset && (
							<span className="mb-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[11px] font-medium shrink-0">
								{activePreset.label}
								<button
									type="button"
									onClick={() => onSelectMode(null)}
									className="hover:opacity-70 cursor-pointer"
									title="取消预设"
								>
									<X className="w-3 h-3" />
								</button>
							</span>
						)}

						<textarea
							ref={textareaRef}
							rows={1}
							value={customPrompt}
							onChange={(e) => {
								onChangeCustomPrompt(e.target.value);
								autoGrow();
							}}
							onKeyDown={handleKeyDown}
							placeholder={
								activePreset
									? `补充要求（当前：${activePreset.label}），Enter 发送…`
									: "询问 AI 或描述修改要求，Enter 发送…"
							}
							className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted/60 outline-none resize-none leading-relaxed py-2 max-h-[120px]"
						/>

						{/* 圆形发送按钮 */}
						<button
							type="button"
							disabled={!canGenerate}
							onClick={() => {
								setMenuOpen(false);
								onStartGenerate();
							}}
							title="开始生成"
							className={`p-2 mb-0.5 rounded-full transition-all shrink-0 ${
								canGenerate
									? "bg-accent text-accent-foreground hover:opacity-90 cursor-pointer active:scale-90 shadow-xs"
									: "bg-muted/15 text-muted/50 cursor-not-allowed"
							}`}
						>
							<ArrowUp className="w-4 h-4" />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
