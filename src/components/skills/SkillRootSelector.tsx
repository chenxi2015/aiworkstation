import {
	Check,
	ChevronDown,
	FolderGit2,
	Globe,
	Laptop,
	Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SkillRootInfo } from "./types";

export interface SkillRootOption {
	value: string;
	label: string;
	category: "workspace" | "global" | "tools";
}

export interface SkillRootSelectorProps {
	value: string;
	onChange: (val: string) => void;
	availableRoots: SkillRootInfo[];
	className?: string;
}

/**
 * Optimized skill root directory selector with categorised grouping,
 * instant search, and self-contained drop-down positioning to prevent viewport cutoff.
 */
export function SkillRootSelector({
	value,
	onChange,
	availableRoots,
	className = "",
}: SkillRootSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Group and deduplicate roots
	const options = useMemo(() => {
		const list: SkillRootOption[] = [
			{
				value: ".agents/skills",
				label: "当前项目工作区 (Workspace)",
				category: "workspace",
			},
			{
				value: "~/.gemini/config/skills",
				label: "全局通用配置 (Global Antigravity)",
				category: "global",
			},
		];

		const seenValues = new Set([".agents/skills", "~/.gemini/config/skills"]);

		for (const r of availableRoots) {
			if (!seenValues.has(r.path)) {
				seenValues.add(r.path);
				list.push({
					value: r.path,
					label: r.label || r.path,
					category: "tools",
				});
			}
		}

		return list;
	}, [availableRoots]);

	// Filter options by search query
	const filteredOptions = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return options;
		return options.filter(
			(opt) =>
				opt.label.toLowerCase().includes(q) ||
				opt.value.toLowerCase().includes(q),
		);
	}, [options, searchQuery]);

	// Categorize filtered options
	const { workspaceGroup, globalGroup, toolsGroup } = useMemo(() => {
		const workspace: SkillRootOption[] = [];
		const global: SkillRootOption[] = [];
		const tools: SkillRootOption[] = [];

		for (const opt of filteredOptions) {
			if (opt.category === "workspace") workspace.push(opt);
			else if (opt.category === "global") global.push(opt);
			else tools.push(opt);
		}

		return {
			workspaceGroup: workspace,
			globalGroup: global,
			toolsGroup: tools,
		};
	}, [filteredOptions]);

	// Currently selected option
	const currentOption =
		options.find((opt) => opt.value === value) || options[0];

	// Close on outside click
	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	// Focus search input when dropdown opens
	useEffect(() => {
		if (isOpen) {
			setSearchQuery("");
			setTimeout(() => {
				searchInputRef.current?.focus();
			}, 50);
		}
	}, [isOpen]);

	return (
		<div ref={containerRef} className={`relative w-full ${className}`}>
			{/* Trigger Button */}
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-expanded={isOpen}
				className="w-full h-10 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/60 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/60 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 transition-all flex items-center justify-between gap-2 text-left"
			>
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<div className="w-5 h-5 rounded-md bg-zinc-200/70 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0">
						{currentOption?.category === "workspace" ? (
							<FolderGit2 className="w-3.5 h-3.5 text-blue-500" />
						) : currentOption?.category === "global" ? (
							<Globe className="w-3.5 h-3.5 text-emerald-500" />
						) : (
							<Laptop className="w-3.5 h-3.5 text-purple-500" />
						)}
					</div>
					<div className="flex flex-col min-w-0 flex-1">
						<span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate leading-tight">
							{currentOption?.label || value}
						</span>
						<span className="text-[10px] text-zinc-400 font-mono truncate leading-none mt-0.5">
							{currentOption?.value || value}
						</span>
					</div>
				</div>
				<ChevronDown
					className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
			</button>

			{/* Dropdown Floating Panel */}
			{isOpen && (
				<div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-1.5 flex flex-col gap-1 text-xs animate-in fade-in zoom-in-95 duration-100">
					{/* Search Box */}
					<div className="relative px-1 pt-1 pb-1.5 border-b border-zinc-100 dark:border-zinc-800/80">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
						<input
							ref={searchInputRef}
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="搜索目录 (如 trae, workspace...)"
							className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
						/>
					</div>

					{/* Options List with constrained height to prevent viewport cutoff */}
					<div className="max-h-48 overflow-y-auto overscroll-contain space-y-1.5 px-0.5 py-1">
						{/* Workspace Group */}
						{workspaceGroup.length > 0 && (
							<div>
								<div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
									推荐工作区
								</div>
								{workspaceGroup.map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => {
											onChange(opt.value);
											setIsOpen(false);
										}}
										className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left group ${
											opt.value === value
												? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
												: "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
										}`}
									>
										<div className="flex flex-col min-w-0 pr-2">
											<span className="truncate">{opt.label}</span>
											<span className="text-[10px] text-zinc-400 font-mono truncate">
												{opt.value}
											</span>
										</div>
										{opt.value === value && (
											<Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
										)}
									</button>
								))}
							</div>
						)}

						{/* Global Group */}
						{globalGroup.length > 0 && (
							<div>
								<div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
									全局配置
								</div>
								{globalGroup.map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => {
											onChange(opt.value);
											setIsOpen(false);
										}}
										className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left group ${
											opt.value === value
												? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
												: "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
										}`}
									>
										<div className="flex flex-col min-w-0 pr-2">
											<span className="truncate">{opt.label}</span>
											<span className="text-[10px] text-zinc-400 font-mono truncate">
												{opt.value}
											</span>
										</div>
										{opt.value === value && (
											<Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
										)}
									</button>
								))}
							</div>
						)}

						{/* Tools Group */}
						{toolsGroup.length > 0 && (
							<div>
								<div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
									已检测开发工具 / 编辑器
								</div>
								{toolsGroup.map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => {
											onChange(opt.value);
											setIsOpen(false);
										}}
										className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left group ${
											opt.value === value
												? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
												: "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
										}`}
									>
										<div className="flex flex-col min-w-0 pr-2">
											<span className="truncate">{opt.label}</span>
											<span className="text-[10px] text-zinc-400 font-mono truncate">
												{opt.value}
											</span>
										</div>
										{opt.value === value && (
											<Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
										)}
									</button>
								))}
							</div>
						)}

						{filteredOptions.length === 0 && (
							<div className="py-4 text-center text-xs text-zinc-400">
								未找到匹配的目录
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
