import {
	ArrowDown,
	ArrowUp,
	ChevronDown,
	ChevronRight,
	Replace,
	ReplaceAll,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";

export interface DocumentSearchBarProps {
	/** Whether the search bar is visible */
	isOpen: boolean;
	/** Close search bar callback */
	onClose: () => void;
	/** Whether the replace input row is expanded */
	isReplaceOpen?: boolean;
	/** Toggle expand/collapse replace row */
	onToggleReplaceOpen?: () => void;
	/** Current search query string */
	query: string;
	/** Query change callback */
	onQueryChange: (query: string) => void;
	/** Current replace text string */
	replaceText?: string;
	/** Replace text change callback */
	onReplaceTextChange?: (text: string) => void;
	/** Match case state */
	caseSensitive: boolean;
	/** Toggle match case */
	onToggleCaseSensitive: () => void;
	/** Match whole word state */
	wholeWord: boolean;
	/** Toggle match whole word */
	onToggleWholeWord: () => void;
	/** Regex search state */
	isRegex: boolean;
	/** Toggle regex search */
	onToggleRegex: () => void;
	/** Preserve case in replace state */
	preserveCase?: boolean;
	/** Toggle preserve case */
	onTogglePreserveCase?: () => void;
	/** 0-based index of current match (-1 if none) */
	currentIndex: number;
	/** Total count of matches */
	totalMatches: number;
	/** Optional syntax or validation error message */
	errorMessage?: string | null;
	/** Navigate to next match */
	onFindNext: () => void;
	/** Navigate to previous match */
	onFindPrev: () => void;
	/** Execute single replacement */
	onReplaceNext?: () => void;
	/** Execute all replacements (Batch replace) */
	onReplaceAll?: () => void;
	/** Optional extra container class name */
	className?: string;
}

/**
 * VS Code style in-document search and batch replace widget.
 * Floats in top-right corner of active document/note canvas.
 */
export function DocumentSearchBar({
	isOpen,
	onClose,
	isReplaceOpen = false,
	onToggleReplaceOpen,
	query,
	onQueryChange,
	replaceText = "",
	onReplaceTextChange,
	caseSensitive,
	onToggleCaseSensitive,
	wholeWord,
	onToggleWholeWord,
	isRegex,
	onToggleRegex,
	preserveCase = false,
	onTogglePreserveCase,
	currentIndex,
	totalMatches,
	errorMessage,
	onFindNext,
	onFindPrev,
	onReplaceNext,
	onReplaceAll,
	className = "",
}: DocumentSearchBarProps) {
	const searchInputRef = useRef<HTMLInputElement>(null);
	const replaceInputRef = useRef<HTMLInputElement>(null);

	// Focus search input on open
	useEffect(() => {
		if (isOpen) {
			requestAnimationFrame(() => {
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
			});
		}
	}, [isOpen]);

	if (!isOpen) return null;

	// Keyboard navigation in search input
	const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) {
				onFindPrev();
			} else {
				onFindNext();
			}
		} else if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		} else if (e.altKey && e.key.toLowerCase() === "c") {
			e.preventDefault();
			onToggleCaseSensitive();
		} else if (e.altKey && e.key.toLowerCase() === "w") {
			e.preventDefault();
			onToggleWholeWord();
		} else if (e.altKey && e.key.toLowerCase() === "r") {
			e.preventDefault();
			onToggleRegex();
		} else if (e.key === "ArrowDown" && (e.altKey || isReplaceOpen)) {
			e.preventDefault();
			if (!isReplaceOpen) onToggleReplaceOpen?.();
			requestAnimationFrame(() => replaceInputRef.current?.focus());
		}
	};

	// Keyboard navigation in replace input
	const handleReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (e.altKey) {
				onReplaceAll?.();
			} else {
				onReplaceNext?.();
			}
		} else if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		} else if (e.altKey && e.key.toLowerCase() === "p") {
			e.preventDefault();
			onTogglePreserveCase?.();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			searchInputRef.current?.focus();
		}
	};

	// Determine match count text and status style
	let statusText = "";
	const isError = Boolean(errorMessage);
	let isNoResult = false;

	if (errorMessage) {
		statusText = errorMessage;
	} else if (query.trim().length > 0) {
		if (totalMatches === 0) {
			statusText = "无结果";
			isNoResult = true;
		} else {
			statusText = `${currentIndex >= 0 ? currentIndex + 1 : 0}/${totalMatches}`;
		}
	}

	return (
		<search
			aria-label="文档内查找与替换"
			className={`absolute top-3 right-5 z-[70] flex items-stretch gap-1.5 p-1.5 rounded-lg bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-md border border-border/80 shadow-2xl text-foreground text-xs select-none animate-in fade-in zoom-in-95 duration-150 ${className}`}
		>
			{/* Left toggle button for Replace row */}
			<button
				type="button"
				title={isReplaceOpen ? "收起替换" : "展开替换 (Alt+Cmd+F)"}
				onClick={onToggleReplaceOpen}
				className={`w-5 flex items-center justify-center rounded transition-all ${
					isReplaceOpen
						? "bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/50"
						: "text-muted hover:text-foreground hover:bg-default/60"
				}`}
			>
				{isReplaceOpen ? (
					<ChevronDown className="w-3.5 h-3.5" />
				) : (
					<ChevronRight className="w-3.5 h-3.5" />
				)}
			</button>

			{/* Main columns: Find row (and optional Replace row below) */}
			<div className="flex flex-col gap-1.5">
				{/* 1. Find Row */}
				<div className="flex items-center gap-1.5">
					{/* Search input with embedded mode toggles */}
					<div className="relative flex items-center rounded border border-border bg-background focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500/50 transition-colors">
						<input
							ref={searchInputRef}
							type="text"
							value={query}
							onChange={(e) => onQueryChange(e.target.value)}
							onKeyDown={handleSearchKeyDown}
							placeholder="查找"
							className="w-44 sm:w-52 h-6 pl-2 pr-16 bg-transparent text-xs text-foreground placeholder:text-muted/60 outline-none"
						/>

						{/* In-box modifier toggles (Aa, ab, .*) */}
						<div className="absolute right-1 flex items-center gap-0.5">
							<button
								type="button"
								title="区分大小写 (Alt+C)"
								onClick={onToggleCaseSensitive}
								className={`px-1 py-0.5 rounded text-[11px] font-mono leading-none transition-colors ${
									caseSensitive
										? "bg-sky-500/20 text-sky-500 dark:text-sky-400 border border-sky-500/40"
										: "text-muted hover:text-foreground hover:bg-default/60"
								}`}
							>
								Aa
							</button>

							<button
								type="button"
								title="全词匹配 (Alt+W)"
								onClick={onToggleWholeWord}
								className={`px-1 py-0.5 rounded text-[11px] font-mono leading-none underline decoration-1 underline-offset-2 transition-colors ${
									wholeWord
										? "bg-sky-500/20 text-sky-500 dark:text-sky-400 border border-sky-500/40"
										: "text-muted hover:text-foreground hover:bg-default/60"
								}`}
							>
								ab
							</button>

							<button
								type="button"
								title="使用正则表达式 (Alt+R)"
								onClick={onToggleRegex}
								className={`px-1 py-0.5 rounded text-[11px] font-mono leading-none transition-colors ${
									isRegex
										? "bg-sky-500/20 text-sky-500 dark:text-sky-400 border border-sky-500/40"
										: "text-muted hover:text-foreground hover:bg-default/60"
								}`}
							>
								.*
							</button>
						</div>
					</div>

					{/* Match count / No result indicator */}
					{statusText && (
						<span
							className={`px-1 whitespace-nowrap text-xs font-medium min-w-[36px] text-center ${
								isError || isNoResult
									? "text-red-500 dark:text-red-400 font-semibold"
									: "text-muted"
							}`}
						>
							{statusText}
						</span>
					)}

					{/* Previous match button */}
					<button
						type="button"
						title="上一个匹配项 (Shift+Enter)"
						disabled={totalMatches === 0}
						onClick={onFindPrev}
						className="p-1 rounded text-muted hover:text-foreground hover:bg-default/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
					>
						<ArrowUp className="w-3.5 h-3.5" />
					</button>

					{/* Next match button */}
					<button
						type="button"
						title="下一个匹配项 (Enter)"
						disabled={totalMatches === 0}
						onClick={onFindNext}
						className="p-1 rounded text-muted hover:text-foreground hover:bg-default/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
					>
						<ArrowDown className="w-3.5 h-3.5" />
					</button>

					{/* Close search button */}
					<button
						type="button"
						title="关闭 (Esc)"
						onClick={onClose}
						className="p-1 rounded text-muted hover:text-foreground hover:bg-default/60 transition-colors ml-0.5"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				</div>

				{/* 2. Replace Row (Expanded) */}
				{isReplaceOpen && (
					<div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
						{/* Replace input with Preserve Case toggle */}
						<div className="relative flex items-center rounded border border-border bg-background focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500/50 transition-colors">
							<input
								ref={replaceInputRef}
								type="text"
								value={replaceText}
								onChange={(e) => onReplaceTextChange?.(e.target.value)}
								onKeyDown={handleReplaceKeyDown}
								placeholder="替换"
								className="w-44 sm:w-52 h-6 pl-2 pr-9 bg-transparent text-xs text-foreground placeholder:text-muted/60 outline-none"
							/>

							{/* Preserve Case (AB toggle) */}
							<div className="absolute right-1 flex items-center">
								<button
									type="button"
									title="保留大小写 (Preserve Case)"
									onClick={onTogglePreserveCase}
									className={`px-1 py-0.5 rounded text-[11px] font-mono leading-none transition-colors ${
										preserveCase
											? "bg-sky-500/20 text-sky-500 dark:text-sky-400 border border-sky-500/40"
											: "text-muted hover:text-foreground hover:bg-default/60"
									}`}
								>
									AB
								</button>
							</div>
						</div>

						{/* Action: Replace Single Match */}
						<button
							type="button"
							title="替换 (Enter)"
							disabled={totalMatches === 0}
							onClick={onReplaceNext}
							className="p-1 rounded text-muted hover:text-foreground hover:bg-default/60 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1"
						>
							<Replace className="w-3.5 h-3.5" />
						</button>

						{/* Action: Replace All Matches (Batch) */}
						<button
							type="button"
							title="全部替换 (Alt+Enter)"
							disabled={totalMatches === 0}
							onClick={onReplaceAll}
							className="p-1 rounded text-muted hover:text-foreground hover:bg-default/60 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1"
						>
							<ReplaceAll className="w-3.5 h-3.5" />
						</button>
					</div>
				)}
			</div>
		</search>
	);
}
