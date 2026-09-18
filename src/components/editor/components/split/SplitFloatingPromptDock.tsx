import { Button, Tooltip } from "@heroui/react";
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
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import { SlashSkillMenu } from "../../../common/slash/SlashSkillMenu";
import {
	type SlashItem,
	useSlashSkills,
} from "../../../common/slash/useSlashSkills";
import {
	ChatRichInlineInput,
	type ChatRichInlineInputHandle,
} from "../../../workbench/ai/chat/inline/ChatRichInlineInput";
import { PRESET_MODES, type SplitCanvasMode } from "./types";

export interface SplitFloatingPromptDockProps {
	selectedMode: SplitCanvasMode | null;
	onSelectMode: (mode: SplitCanvasMode | null) => void;
	customPrompt: string;
	onChangeCustomPrompt: (prompt: string) => void;
	isStreaming: boolean;
	onStartGenerate: (promptOverride?: string) => void;
	onStopGenerate: () => void;
	canAccept?: boolean;
	onAccept?: () => void;
	onReject?: () => void;
	/**
	 * Controls visibility of input card dock. When full AI agent panel is open,
	 * the dock gracefully collapses to streaming state only to avoid duplicate inputs.
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
 * Floating AI Prompt Card for Split Mode (aligned with sidebar ChatInputArea):
 * - Top: Model badge & streaming indicator
 * - Middle: Rich inline input powered by TipTap (inline Skills, multi-line, auto-grow)
 * - Bottom: Preset action menu pill + Send / Stop button
 * - Footer: Keyboard shortcut hints
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
	const currentSettings =
		typeof window !== "undefined"
			? WorkbenchStorageService.getSettings()
			: null;
	const displayModel = currentSettings?.model || "AI";

	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const inlineEditorRef = useRef<ChatRichInlineInputHandle | null>(null);
	const [hasEditorContent, setHasEditorContent] = useState(false);

	// Slash Command / Skill Menu (/ slash) state
	const [slashQuery, setSlashQuery] = useState<string | null>(null);
	const [slashSelectedIndex, setSlashSelectedIndex] = useState<number>(0);

	const { filteredItems: slashCandidates } = useSlashSkills(slashQuery);

	const activePreset = PRESET_MODES.find((m) => m.id === selectedMode) || null;
	const canGenerate = Boolean(
		selectedMode || hasEditorContent || customPrompt.trim(),
	);

	// Close preset mode menu when clicking outside
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

	// Sync external customPrompt into inline editor if editor is empty
	useEffect(() => {
		if (customPrompt && inlineEditorRef.current?.isEmpty()) {
			inlineEditorRef.current.setContent(customPrompt);
			setHasEditorContent(true);
		}
	}, [customPrompt]);

	// Handle selecting a skill candidate from slash menu
	const handleSelectSlash = useCallback((item: SlashItem) => {
		inlineEditorRef.current?.insertSkill(item);
		setSlashQuery(null);
		setHasEditorContent(true);
		setTimeout(() => inlineEditorRef.current?.focus(), 30);
	}, []);

	// Intercept keyboard navigation for slash menu
	const handleMenuKeyDown = useCallback(
		(e: React.KeyboardEvent): boolean => {
			if (slashQuery !== null && slashCandidates.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setSlashSelectedIndex((prev) =>
						prev + 1 < slashCandidates.length ? prev + 1 : 0,
					);
					return true;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setSlashSelectedIndex((prev) =>
						prev - 1 >= 0 ? prev - 1 : slashCandidates.length - 1,
					);
					return true;
				}
				if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
					e.preventDefault();
					const target = slashCandidates[slashSelectedIndex];
					if (target) {
						handleSelectSlash(target);
					}
					return true;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setSlashQuery(null);
					return true;
				}
			}
			return false;
		},
		[slashQuery, slashCandidates, slashSelectedIndex, handleSelectSlash],
	);

	// Send message handler: extracts inline skills & text, synthesizes prompt, and triggers generation
	const handleSendMessage = useCallback(() => {
		if (isStreaming) return;

		const data = inlineEditorRef.current?.getSerializedData();
		const trimmedText = data?.text?.trim() ?? customPrompt.trim();
		const skills = data?.skills ?? [];

		const canSend = Boolean(selectedMode || skills.length > 0 || trimmedText);
		if (!canSend) return;

		let finalPrompt = trimmedText;
		if (
			skills.length > 0 &&
			!skills.some((s) => trimmedText.includes(`[Skill: ${s.name}]`))
		) {
			const skillsHeader = skills.map((s) => `[Skill: ${s.name}]`).join("\n");
			finalPrompt = finalPrompt
				? `${skillsHeader}\n\n${finalPrompt}`
				: skillsHeader;
		}

		onChangeCustomPrompt(finalPrompt);
		inlineEditorRef.current?.clear();
		setHasEditorContent(false);
		setMenuOpen(false);
		setSlashQuery(null);

		onStartGenerate(finalPrompt);
	}, [
		isStreaming,
		customPrompt,
		selectedMode,
		onChangeCustomPrompt,
		onStartGenerate,
	]);

	// When right full AI panel is open and not streaming, hide dock entirely
	if (!inputVisible) {
		if (!isStreaming) return null;
		// Collapsed streaming indicator pill
		return (
			<div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 select-none">
				<div className="flex items-center gap-3 px-4 py-2 rounded-full bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-border/80 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
					<span className="flex items-center gap-1 pl-1">
						<span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
						<span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
						<span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
					</span>
					<span className="text-xs font-medium text-accent truncate">
						AI 正在创作中…
					</span>
					<button
						type="button"
						onClick={onStopGenerate}
						title="停止生成"
						className="p-1 rounded-full text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer shrink-0"
					>
						<Square className="w-3 h-3 fill-current" />
					</button>
				</div>
			</div>
		);
	}

	const placeholder = activePreset
		? `补充要求（当前：${activePreset.label}），Enter 发送…`
		: "询问 AI 或描述修改要求，输入 / 读取 Skills...";

	return (
		<div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 w-[min(580px,94%)] select-none">
			{/* Dropdown Slash Menu for / skills */}
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

			{/* Main Input Card: Matched with AI Sidebar ChatInputArea design */}
			<section
				aria-label="双栏 AI 演练输入区域"
				className="relative flex flex-col bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-border/80 rounded-2xl p-2.5 transition-all shadow-xl group focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15"
			>
				{/* Top toolbar: Active Model Badge, Preset Chip, and Streaming State */}
				<div className="flex items-center justify-between min-w-0 px-0.5 pb-1.5 select-none">
					<div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
						{/* Active Model Badge */}
						<div
							className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-secondary/70 border border-border/60 text-[11px] font-medium text-foreground/90 shadow-2xs select-none shrink-0"
							title={`当前模型: ${displayModel}`}
						>
							<span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-violet-500 via-indigo-500 to-fuchsia-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
								<Sparkles className="w-2 h-2" />
							</span>
							<span className="max-w-[140px] truncate text-[10px] font-semibold text-foreground/80">
								{displayModel}
							</span>
						</div>

						{/* Selected preset mode badge chip */}
						{activePreset && (
							<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-medium shrink-0 animate-in fade-in duration-150">
								<span>{activePreset.label}</span>
								<button
									type="button"
									onClick={() => onSelectMode(null)}
									className="hover:opacity-70 cursor-pointer p-0.5"
									title="取消预设模式"
								>
									<X className="w-2.5 h-2.5" />
								</button>
							</span>
						)}
					</div>

					{/* Streaming indicator if active */}
					{isStreaming && (
						<div className="inline-flex items-center gap-1.5 text-accent animate-in fade-in duration-200 shrink-0">
							<span className="flex items-center gap-1">
								<span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
								<span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
								<span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
							</span>
							<span className="text-[10px] font-medium">AI 正在创作中…</span>
						</div>
					)}
				</div>

				{/* Middle: Modern Inline Rich Input Area powered by TipTap */}
				<div className="px-1 py-0.5 min-h-[40px] flex items-start">
					<ChatRichInlineInput
						ref={inlineEditorRef}
						placeholder={placeholder}
						onSend={handleSendMessage}
						onChangeText={(text) => {
							const hasTokens = !inlineEditorRef.current?.isEmpty();
							setHasEditorContent(hasTokens);
							onChangeCustomPrompt(text);
						}}
						onTriggerMention={() => {
							// Split mode operates on the current document, no external mentions required
						}}
						onTriggerSlash={(query) => {
							setSlashQuery(query);
							setSlashSelectedIndex(0);
						}}
						isMenuOpen={slashQuery !== null}
						onMenuKeyDown={handleMenuKeyDown}
						maxHeight={120}
					/>
				</div>

				{/* Bottom Action Bar: Left Quick Actions Dropdown, Right Send/Stop Button */}
				<div className="flex items-center justify-between pt-1.5 px-0.5 border-t border-border/40">
					{/* Left: AI Quick Preset Actions Dropdown */}
					<div className="relative" ref={menuRef}>
						<button
							type="button"
							onClick={() => setMenuOpen((prev) => !prev)}
							title="选择 AI 快捷操作"
							className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors cursor-pointer select-none border ${
								menuOpen || activePreset
									? "bg-accent/15 text-accent border-accent/30 font-medium"
									: "bg-surface-secondary/80 hover:bg-muted/15 text-muted hover:text-foreground border-border/60"
							}`}
						>
							<WandSparkles className="w-3.5 h-3.5 shrink-0" />
							<span className="text-[11px] max-w-[100px] truncate">
								{activePreset ? activePreset.label : "快捷操作"}
							</span>
						</button>

						{/* Dropdown Menu for preset modes */}
						{menuOpen && (
							<div className="absolute bottom-full mb-2 left-0 w-64 p-1.5 rounded-2xl bg-surface dark:bg-zinc-900 border border-border/80 shadow-xl ring-1 ring-black/5 dark:ring-white/10 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150">
								<div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-muted">
									AI 快捷操作模式
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
												inlineEditorRef.current?.focus();
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
											<div className="flex-1 min-w-0">
												<div className="font-medium truncate">{mode.label}</div>
												<div className="text-[10px] text-muted truncate">
													{mode.desc}
												</div>
											</div>
											{isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
										</button>
									);
								})}
							</div>
						)}
					</div>

					{/* Right: Send / Stop Action Button */}
					<div className="flex items-center gap-1">
						{isStreaming ? (
							<Tooltip>
								<Tooltip.Trigger>
									<Button
										variant="secondary"
										size="sm"
										isIconOnly
										className="h-7 w-7 rounded-xl border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger flex items-center justify-center cursor-pointer shadow-2xs group transition-all"
										onPress={onStopGenerate}
										aria-label="停止生成"
									>
										<Square className="w-2.5 h-2.5 fill-current group-hover:scale-90 transition-transform" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									停止生成
								</Tooltip.Content>
							</Tooltip>
						) : (
							<Tooltip>
								<Tooltip.Trigger>
									<Button
										variant={canGenerate ? "primary" : "secondary"}
										size="sm"
										isIconOnly
										className={`h-7 w-7 rounded-xl flex items-center justify-center cursor-pointer transition-all shadow-xs ${
											canGenerate
												? "bg-accent text-accent-foreground hover:opacity-90 shadow-accent/20"
												: "bg-surface-secondary text-muted/50 border border-border/40 cursor-not-allowed opacity-60"
										}`}
										onPress={handleSendMessage}
										isDisabled={!canGenerate}
										aria-label="开始生成"
									>
										<ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									开始生成 (Enter)
								</Tooltip.Content>
							</Tooltip>
						)}
					</div>
				</div>
			</section>

			{/* Footer Hint */}
			<div className="flex items-center justify-between px-1 pt-1.5 text-[10px] text-muted/70 select-none">
				<span>输入 / 载入 Skills · Enter 发送，Shift + Enter 换行</span>
				<span className="hidden sm:inline">双栏演练画布</span>
			</div>
		</div>
	);
}
