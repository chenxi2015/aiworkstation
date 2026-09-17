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
import { SkillSelectedBadge } from "../../../common/slash/SkillSelectedBadge";
import { SlashSkillMenu } from "../../../common/slash/SlashSkillMenu";
import {
	type SlashItem,
	useSlashSkills,
} from "../../../common/slash/useSlashSkills";
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
	/**
	 * 是否展示输入胶囊与审核条。右侧完整 AI Agent 面板展开时传 false：
	 * 浮动 Dock 退化为纯流式状态指示（含停止按钮），避免两个 AI 入口并存
	 */
	inputVisible?: boolean;
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
 * - 胶囊输入条：快捷操作菜单 + 预设模式 chip + 选定 Skill badge + 圆形发送按钮
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
	inputVisible = true,
}: SplitFloatingPromptDockProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Slash Command / Skill Menu (/ slash) state
	const [slashQuery, setSlashQuery] = useState<string | null>(null);
	const [slashSelectedIndex, setSlashSelectedIndex] = useState<number>(0);
	const [selectedSkills, setSelectedSkills] = useState<SlashItem[]>([]);

	const { filteredItems: slashCandidates } = useSlashSkills(slashQuery);

	const activePreset = PRESET_MODES.find((m) => m.id === selectedMode) || null;
	const canGenerate = Boolean(
		selectedMode || selectedSkills.length > 0 || customPrompt.trim(),
	);

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

	const handleSelectSlash = (item: SlashItem) => {
		const el = textareaRef.current;
		const cursor = el?.selectionStart ?? customPrompt.length;
		const textBeforeCursor = customPrompt.slice(0, cursor);
		const slashIndex = textBeforeCursor.lastIndexOf("/");

		let nextVal = customPrompt;
		if (slashIndex !== -1) {
			nextVal = customPrompt.slice(0, slashIndex) + customPrompt.slice(cursor);
		}

		setSelectedSkills((prev) => {
			if (prev.some((s) => s.id === item.id || s.name === item.name))
				return prev;
			return [...prev, item];
		});
		onChangeCustomPrompt(nextVal);
		setSlashQuery(null);
		setTimeout(() => {
			el?.focus();
			autoGrow();
		}, 50);
	};

	const handleRemoveSkill = (id: string) => {
		setSelectedSkills((prev) => prev.filter((s) => s.id !== id));
	};

	const handleStartGenerate = () => {
		if (!canGenerate || isStreaming) return;
		setMenuOpen(false);
		setSlashQuery(null);
		if (selectedSkills.length > 0) {
			const skillsHeader = selectedSkills
				.map((s) => `[Skill: ${s.name}]`)
				.join("\n");
			const fullPrompt = customPrompt.trim()
				? `${skillsHeader}\n\n${customPrompt.trim()}`
				: skillsHeader;
			onChangeCustomPrompt(fullPrompt);
			setSelectedSkills([]);
			setTimeout(() => {
				onStartGenerate();
			}, 0);
		} else {
			onStartGenerate();
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (slashQuery !== null && slashCandidates.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSlashSelectedIndex((prev) =>
					prev + 1 < slashCandidates.length ? prev + 1 : 0,
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSlashSelectedIndex((prev) =>
					prev - 1 >= 0 ? prev - 1 : slashCandidates.length - 1,
				);
				return;
			}
			if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
				e.preventDefault();
				const target = slashCandidates[slashSelectedIndex];
				if (target) {
					handleSelectSlash(target);
				}
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setSlashQuery(null);
				return;
			}
		}

		// Backspace on empty input removes the last selected skill
		if (e.key === "Backspace" && !customPrompt && selectedSkills.length > 0) {
			e.preventDefault();
			setSelectedSkills((prev) => prev.slice(0, -1));
			return;
		}

		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (!isStreaming && canGenerate) {
				handleStartGenerate();
			}
		}
	};

	// 面板展开时代理输入入口：非流式期间整个 Dock 退场
	if (!inputVisible && !isStreaming) return null;

	return (
		<div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 w-[min(560px,92%)] select-none">
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

					{/* Slash commands & skills dropdown menu */}
					<SlashSkillMenu
						isOpen={slashQuery !== null}
						query={slashQuery || ""}
						items={slashCandidates}
						selectedIndex={slashSelectedIndex}
						onSelectIndexChange={setSlashSelectedIndex}
						onSelect={handleSelectSlash}
						onClose={() => setSlashQuery(null)}
						className="inset-x-0"
					/>

					<div className="flex flex-wrap items-center gap-1.5 pl-2 pr-1.5 py-1.5 rounded-[26px] bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-border/80 shadow-xl transition-all focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
						{/* 快捷操作触发按钮 */}
						<button
							type="button"
							onClick={() => setMenuOpen((prev) => !prev)}
							title="AI 快捷操作"
							className={`p-2 rounded-full transition-colors cursor-pointer shrink-0 ${
								menuOpen || activePreset
									? "text-accent bg-accent/10"
									: "text-muted hover:text-accent hover:bg-accent/10"
							}`}
						>
							<WandSparkles className="w-4 h-4" />
						</button>

						{/* 已选预设 chip */}
						{activePreset && (
							<span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[11px] font-medium shrink-0">
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

						{/* 选定 Skills 标签（多选） */}
						{selectedSkills.map((skill) => (
							<SkillSelectedBadge
								key={skill.id}
								name={skill.name}
								onRemove={() => handleRemoveSkill(skill.id)}
							/>
						))}

						<textarea
							ref={textareaRef}
							rows={1}
							value={customPrompt}
							onChange={(e) => {
								const val = e.target.value;
								onChangeCustomPrompt(val);
								autoGrow();

								const cursor = e.target.selectionStart ?? val.length;
								const textBeforeCursor = val.slice(0, cursor);

								// Check slash menu trigger (/)
								const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
								if (
									lastSlashIndex !== -1 &&
									(lastSlashIndex === 0 ||
										/\s/.test(textBeforeCursor[lastSlashIndex - 1]))
								) {
									const query = textBeforeCursor.slice(lastSlashIndex + 1);
									if (
										!query.includes("\n") &&
										!query.includes(" ") &&
										query.length <= 30
									) {
										setSlashQuery(query);
										setSlashSelectedIndex(0);
										setMenuOpen(false);
										return;
									}
								}
								setSlashQuery(null);
							}}
							onKeyDown={handleKeyDown}
							placeholder={
								selectedSkills.length > 0
									? "输入修改要求，Enter 发送…"
									: activePreset
										? `补充要求（当前：${activePreset.label}），Enter 发送…`
										: "询问 AI 或描述修改要求，输入 / 读取 Skills…"
							}
							className="flex-1 min-w-[120px] bg-transparent text-xs text-foreground placeholder:text-muted/60 outline-none resize-none h-6 min-h-6 leading-6 py-0 my-0 max-h-[120px]"
						/>

						{/* 圆形发送按钮 */}
						<button
							type="button"
							disabled={!canGenerate}
							onClick={handleStartGenerate}
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
