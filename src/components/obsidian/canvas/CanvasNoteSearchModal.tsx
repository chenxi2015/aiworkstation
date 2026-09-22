import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchObsidianTree } from "../../../services/api/obsidianClient";
import type { ObsidianTreeNode } from "../types";
import { getVaultFileCategory } from "../utils/vaultFileUtils";

export interface CanvasNoteSearchModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (relPath: string) => void;
	onCreate?: (name?: string) => Promise<string | null>;
	filterCategory?: "all" | "note" | "media";
	title?: string;
}

interface FileItem {
	name: string;
	relPath: string;
	kind: "note" | "file";
}

type ListItem =
	| { type: "file"; item: FileItem }
	| { type: "create"; query: string };

/**
 * Extract all non-folder file entries from the Obsidian tree hierarchy.
 */
function flattenTreeFiles(nodes: ObsidianTreeNode[]): FileItem[] {
	const result: FileItem[] = [];
	const walk = (list: ObsidianTreeNode[]) => {
		for (const node of list) {
			if (node.kind === "folder") {
				if (node.children) walk(node.children);
			} else {
				result.push({
					name: node.name,
					relPath: node.relPath,
					kind: node.kind,
				});
			}
		}
	};
	walk(nodes);
	return result;
}

/**
 * Search and select vault files to link in Obsidian Canvas,
 * matching the Quick Switcher style with keyboard navigation.
 */
export function CanvasNoteSearchModal({
	isOpen,
	onClose,
	onSelect,
	onCreate,
	filterCategory = "all",
	title,
}: CanvasNoteSearchModalProps) {
	const [allFiles, setAllFiles] = useState<FileItem[]>([]);
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Load vault files on open
	useEffect(() => {
		if (!isOpen) return;
		setQuery("");
		setSelectedIndex(0);
		setLoading(true);

		let active = true;
		void fetchObsidianTree().then((res) => {
			if (!active) return;
			setAllFiles(flattenTreeFiles(res.tree));
			setLoading(false);
		});

		return () => {
			active = false;
		};
	}, [isOpen]);

	// Focus input on mount
	useEffect(() => {
		if (isOpen) {
			requestAnimationFrame(() => {
				inputRef.current?.focus();
			});
		}
	}, [isOpen]);

	// Filter files based on category and search query
	const items: ListItem[] = useMemo(() => {
		let scopedFiles = allFiles;
		if (filterCategory === "note") {
			scopedFiles = allFiles.filter(
				(f) => getVaultFileCategory(f.relPath) === "markdown",
			);
		} else if (filterCategory === "media") {
			scopedFiles = allFiles.filter(
				(f) => getVaultFileCategory(f.relPath) === "image",
			);
		}

		const trimmed = query.trim().toLowerCase();
		const matchedFiles: FileItem[] = trimmed
			? scopedFiles.filter(
					(f) =>
						f.name.toLowerCase().includes(trimmed) ||
						f.relPath.toLowerCase().includes(trimmed),
				)
			: scopedFiles;

		const list: ListItem[] = matchedFiles.map((item) => ({
			type: "file",
			item,
		}));

		// If query is present and no exact match, show create option (only for notes/all)
		if (filterCategory !== "media") {
			const hasExactMatch = matchedFiles.some(
				(f) => f.name.toLowerCase() === trimmed,
			);
			if (trimmed && !hasExactMatch) {
				list.push({ type: "create", query: query.trim() });
			}
		}

		return list;
	}, [allFiles, query, filterCategory]);

	// Scroll active item into view
	useEffect(() => {
		const container = listRef.current;
		if (!container) return;
		const activeEl = container.children[selectedIndex] as
			| HTMLElement
			| undefined;
		if (activeEl) {
			activeEl.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	const handleConfirm = useCallback(
		async (targetItem?: ListItem) => {
			const active = targetItem ?? items[selectedIndex];
			if (!active) {
				if (query.trim()) {
					const relPath = await onCreate?.(query.trim());
					if (relPath) onSelect(relPath);
				}
				onClose();
				return;
			}

			if (active.type === "file") {
				onSelect(active.item.relPath);
				onClose();
			} else {
				const relPath = await onCreate?.(active.query);
				if (relPath) onSelect(relPath);
				onClose();
			}
		},
		[items, selectedIndex, query, onCreate, onSelect, onClose],
	);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelectedIndex((prev) =>
				items.length > 0 ? (prev + 1) % items.length : 0,
			);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelectedIndex((prev) =>
				items.length > 0 ? (prev - 1 + items.length) % items.length : 0,
			);
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) {
				// Shift + Enter: Force create with query
				void (async () => {
					const nameToCreate = query.trim() || undefined;
					const relPath = await onCreate?.(nameToCreate);
					if (relPath) onSelect(relPath);
					onClose();
				})();
			} else {
				void handleConfirm();
			}
		} else if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		}
	};

	if (!isOpen) return null;

	const modalTitle =
		title ??
		(filterCategory === "media"
			? "选择媒体文件"
			: filterCategory === "note"
				? "选择或搜索笔记"
				: "搜索与关联文件");
	const inputPlaceholder =
		filterCategory === "media"
			? "搜索媒体文件（图片等）..."
			: filterCategory === "note"
				? "搜索笔记..."
				: "搜索文件...";

	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-xs select-none"
			role="dialog"
			aria-modal="true"
			aria-label={modalTitle}
		>
			<button
				type="button"
				tabIndex={-1}
				aria-label="关闭搜索"
				onClick={onClose}
				className="absolute inset-0 w-full h-full cursor-default bg-transparent border-none outline-none"
			/>
			<div className="relative w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
				{/* Top input bar */}
				<div className="relative flex items-center px-4 py-3 border-b border-border/50">
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setSelectedIndex(0);
						}}
						onKeyDown={handleKeyDown}
						placeholder={inputPlaceholder}
						className="w-full bg-transparent text-sm text-foreground placeholder:text-muted outline-none pr-7"
					/>
					{query ? (
						<button
							type="button"
							aria-label="清空搜索"
							onClick={() => {
								setQuery("");
								setSelectedIndex(0);
								inputRef.current?.focus();
							}}
							className="absolute right-3.5 p-1 rounded-full text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					) : (
						<div className="absolute right-3.5 w-3.5 h-3.5 rounded-full border border-muted/40 flex items-center justify-center text-muted/50 text-[10px]">
							×
						</div>
					)}
				</div>

				{/* Search results list */}
				<div
					ref={listRef}
					role="listbox"
					className="max-h-80 overflow-y-auto p-1.5 space-y-0.5"
				>
					{loading && items.length === 0 ? (
						<div className="py-6 text-center text-xs text-muted">
							加载文件中...
						</div>
					) : items.length === 0 ? (
						<div className="py-6 text-center text-xs text-muted">
							未找到匹配文件，按 Shift + ↵ 可直接创建
						</div>
					) : (
						items.map((entry, idx) => {
							const isSelected = idx === selectedIndex;
							if (entry.type === "create") {
								return (
									<button
										key="__create_link__"
										type="button"
										role="option"
										aria-selected={isSelected}
										onMouseEnter={() => setSelectedIndex(idx)}
										onClick={() => void handleConfirm(entry)}
										className={`w-full text-left px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
											isSelected
												? "bg-surface-secondary text-foreground font-medium"
												: "text-foreground/80 hover:bg-surface-secondary/50"
										}`}
									>
										<span>
											创建链接 {entry.query ? `「${entry.query}」` : ""}
										</span>
									</button>
								);
							}

							const { item } = entry;
							return (
								<button
									key={item.relPath}
									type="button"
									role="option"
									aria-selected={isSelected}
									onMouseEnter={() => setSelectedIndex(idx)}
									onClick={() => void handleConfirm(entry)}
									className={`w-full text-left px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
										isSelected
											? "bg-surface-secondary text-foreground font-medium"
											: "text-foreground/80 hover:bg-surface-secondary/50"
									}`}
								>
									<span className="truncate">{item.name}</span>
									{item.relPath.includes("/") && (
										<span className="text-[10px] text-muted truncate ml-2 max-w-[40%]">
											{item.relPath}
										</span>
									)}
								</button>
							);
						})
					)}
				</div>

				{/* Bottom footer tips */}
				<div className="flex items-center justify-center gap-3 py-2 border-t border-border/40 text-[11px] text-muted">
					<span>↑↓ 导航</span>
					<span>↵ 打开</span>
					<span>shift ↵ 创建</span>
					<span>esc 退出</span>
				</div>
			</div>
		</div>
	);
}
