import { Input, Modal, toast } from "@heroui/react";
import {
	BookOpen,
	Check,
	ChevronDown,
	ChevronRight,
	ChevronsDownUp,
	ChevronsUpDown,
	FileText,
	Folder,
	FolderOpen,
	LayoutDashboard,
	Loader2,
	PenTool,
	Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchObsidianTree } from "../../../../services/api/obsidianClient";
import {
	type ChatContextItem,
	MAX_CHAT_ATTACHMENTS,
} from "../../../../types/chatContext";
import {
	collectFolderPaths,
	filterVaultTree,
	flattenVaultTree,
} from "../../../obsidian/tree/vaultTreeUtils";
import type { ObsidianTreeNode } from "../../../obsidian/types";

export interface VaultNotePickerProps {
	isOpen: boolean;
	onClose: () => void;
	/** Select single note and attach as context item */
	onPick: (item: ChatContextItem) => void;
	/** Batch select multiple notes */
	onPickBatch?: (items: ChatContextItem[]) => void;
	/** Maximum selectable count based on remaining quota */
	maxSelectable?: number;
}

/** Check if node is an importable note or board file */
function isImportableNote(node: ObsidianTreeNode): boolean {
	if (node.kind === "note") return true;
	if (node.kind === "file") {
		const lower = node.name.toLowerCase();
		return (
			lower.endsWith(".canvas") ||
			lower.endsWith(".excalidraw") ||
			lower.endsWith(".excalidraw.md")
		);
	}
	return false;
}

/** Recursively filter tree to retain only notes, boards, and folders containing them */
function pruneNonNoteNodes(nodes: ObsidianTreeNode[]): ObsidianTreeNode[] {
	const out: ObsidianTreeNode[] = [];
	for (const node of nodes) {
		if (node.kind === "folder") {
			const validChildren = pruneNonNoteNodes(node.children ?? []);
			if (validChildren.length > 0) {
				out.push({ ...node, children: validChildren });
			}
		} else if (isImportableNote(node)) {
			out.push(node);
		}
	}
	return out;
}

/** Count total notes in a subtree */
function countDescendantNotes(node: ObsidianTreeNode): number {
	if (node.kind === "note" || isImportableNote(node)) return 1;
	if (!node.children) return 0;
	return node.children.reduce((acc, cur) => acc + countDescendantNotes(cur), 0);
}

function formatBytes(bytes?: number): string {
	if (!bytes || bytes <= 0) return "";
	const kb = Math.max(1, Math.round(bytes / 1024));
	return `${kb} KB`;
}

function formatDate(ms?: number): string {
	if (!ms || ms <= 0) return "";
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Dialog for selecting notes from the local Obsidian vault with an infinite tree hierarchy.
 */
export function VaultNotePicker({
	isOpen,
	onClose,
	onPick,
	onPickBatch,
	maxSelectable = MAX_CHAT_ATTACHMENTS,
}: VaultNotePickerProps) {
	const [rawTree, setRawTree] = useState<ObsidianTreeNode[]>([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

	// Load vault tree on open
	useEffect(() => {
		if (!isOpen) return;
		setQuery("");
		setSelectedPaths(new Set());
		setLoading(true);

		void fetchObsidianTree()
			.then((tree) => {
				const pruned = pruneNonNoteNodes(tree?.tree ?? []);
				setRawTree(pruned);

				// Initially expand top-level folders for convenience
				const topFolderPaths = pruned
					.filter((n) => n.kind === "folder")
					.map((n) => n.relPath);
				setExpanded(new Set(topFolderPaths));
			})
			.finally(() => setLoading(false));
	}, [isOpen]);

	// Filter tree by search query
	const filteredTree = useMemo(() => {
		if (!query.trim()) return rawTree;
		return filterVaultTree(rawTree, query);
	}, [rawTree, query]);

	// Auto-expand all folders when query is non-empty so results are visible
	const effectiveExpanded = useMemo(() => {
		if (query.trim()) {
			return new Set(collectFolderPaths(filteredTree));
		}
		return expanded;
	}, [query, filteredTree, expanded]);

	// Flatten tree based on expanded folders
	const flatItems = useMemo(
		() => flattenVaultTree(filteredTree, effectiveExpanded),
		[filteredTree, effectiveExpanded],
	);

	// Count total notes
	const totalNoteCount = useMemo(() => {
		return rawTree.reduce((acc, cur) => acc + countDescendantNotes(cur), 0);
	}, [rawTree]);

	// Check if all visible folders are expanded
	const allFolderPaths = useMemo(
		() => collectFolderPaths(filteredTree),
		[filteredTree],
	);
	const areAllExpanded =
		allFolderPaths.length > 0 &&
		allFolderPaths.every((p) => effectiveExpanded.has(p));

	const handleToggleExpandAll = useCallback(() => {
		if (areAllExpanded) {
			setExpanded(new Set());
		} else {
			setExpanded(new Set(allFolderPaths));
		}
	}, [areAllExpanded, allFolderPaths]);

	const toggleFolder = useCallback((relPath: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(relPath)) {
				next.delete(relPath);
			} else {
				next.add(relPath);
			}
			return next;
		});
	}, []);

	const toggleSelect = useCallback(
		(relPath: string) => {
			setSelectedPaths((prev) => {
				const next = new Set(prev);
				if (next.has(relPath)) {
					next.delete(relPath);
				} else {
					if (maxSelectable !== undefined && next.size >= maxSelectable) {
						toast.warning(
							`最多还能选择 ${maxSelectable} 个附件（上限 ${MAX_CHAT_ATTACHMENTS} 个）`,
						);
						return prev;
					}
					next.add(relPath);
				}
				return next;
			});
		},
		[maxSelectable],
	);

	const toContextItem = (node: ObsidianTreeNode): ChatContextItem => {
		const bare = node.name.replace(/\.(canvas|excalidraw(\.md)?|md)$/i, "");
		const dir = node.relPath.includes("/")
			? node.relPath.split("/").slice(0, -1).join("/")
			: "根目录";

		return {
			id: `note_${node.relPath}`,
			type: "note",
			title: bare,
			subtitle: dir,
			notePath: node.relPath,
		};
	};

	const handlePickSingle = (node: ObsidianTreeNode) => {
		if (maxSelectable !== undefined && maxSelectable <= 0) {
			toast.warning(
				`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件，请先移除已有附件`,
			);
			return;
		}
		onPick(toContextItem(node));
		onClose();
	};

	const handlePickBatch = () => {
		if (selectedPaths.size === 0) return;
		const items: ChatContextItem[] = [];

		const findNodes = (list: ObsidianTreeNode[]) => {
			for (const item of list) {
				if (item.kind === "folder") {
					if (item.children) findNodes(item.children);
				} else if (selectedPaths.has(item.relPath)) {
					items.push(toContextItem(item));
				}
			}
		};
		findNodes(rawTree);

		const safeItems =
			maxSelectable !== undefined && items.length > maxSelectable
				? items.slice(0, maxSelectable)
				: items;

		if (onPickBatch) {
			onPickBatch(safeItems);
		} else {
			for (const item of safeItems) onPick(item);
		}
		onClose();
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog
					aria-label="从笔记库导入"
					className="!max-w-2xl w-full max-h-[75vh] flex flex-col"
				>
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading className="flex items-center gap-2">
							<BookOpen className="w-4 h-4 text-emerald-500" />
							从笔记库导入
						</Modal.Heading>
					</Modal.Header>
					<Modal.Body className="flex-1 overflow-hidden flex flex-col gap-2 mt-2">
						{/* Upper Limit Warning Banner */}
						{maxSelectable <= 0 && (
							<div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between shrink-0">
								<span>当前附件已达上限（{MAX_CHAT_ATTACHMENTS} 个），请先在对话框中移除部分附件</span>
							</div>
						)}

						{/* Search Bar */}
						<div className="flex items-center gap-2 shrink-0">
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="搜索笔记名称或相对路径..."
								className="flex-1"
							/>
							<Search className="w-4 h-4 text-muted shrink-0 -ml-8 pointer-events-none" />
						</div>

						{/* Tree Action Toolbar */}
						<div className="flex items-center justify-between text-[11px] text-muted px-1 shrink-0 pt-0.5">
							<div className="flex items-center gap-2">
								<span>共 {totalNoteCount} 篇笔记</span>
								{selectedPaths.size > 0 && (
									<span className="text-accent font-medium">
										（已勾选 {selectedPaths.size} 项）
									</span>
								)}
							</div>
							<div className="flex items-center gap-2.5">
								{allFolderPaths.length > 0 && (
									<button
										type="button"
										onClick={handleToggleExpandAll}
										className="text-muted hover:text-foreground cursor-pointer transition-colors flex items-center gap-1 text-[11px]"
										title={areAllExpanded ? "全部折叠" : "全部展开"}
									>
										{areAllExpanded ? (
											<>
												<ChevronsDownUp className="w-3.5 h-3.5" />
												全部折叠
											</>
										) : (
											<>
												<ChevronsUpDown className="w-3.5 h-3.5" />
												全部展开
											</>
										)}
									</button>
								)}
								{selectedPaths.size > 0 && (
									<button
										type="button"
										onClick={() => setSelectedPaths(new Set())}
										className="text-muted hover:text-foreground cursor-pointer transition-colors text-[11px]"
									>
										清空已选
									</button>
								)}
							</div>
						</div>

						{/* Directory Tree View */}
						<div className="flex-1 overflow-y-auto -mx-1 px-1 border border-border/50 rounded-xl bg-surface-secondary/20 p-1.5">
							{loading ? (
								<div className="flex items-center justify-center py-12 text-muted">
									<Loader2 className="w-4 h-4 animate-spin mr-2" />
									<span className="text-xs">加载笔记目录树...</span>
								</div>
							) : flatItems.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-12 text-muted gap-1">
									<BookOpen className="w-6 h-6 opacity-50" />
									<span className="text-xs">
										{rawTree.length === 0
											? "暂无笔记，可在 Obsidian 模块创建"
											: "没有找到匹配的笔记"}
									</span>
								</div>
							) : (
								<div className="flex flex-col gap-0.5">
									{flatItems.map(({ node, depth, isFolder, isExpanded }) => {
										const indentPx = depth * 18 + 6;

										if (isFolder) {
											const childCount = countDescendantNotes(node);
											return (
												<button
													key={node.relPath}
													type="button"
													onClick={() => toggleFolder(node.relPath)}
													style={{ paddingLeft: `${indentPx}px` }}
													className="w-full flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-surface-secondary/80 text-foreground cursor-pointer transition-colors select-none group text-left"
												>
													<span className="text-muted group-hover:text-foreground transition-colors shrink-0">
														{isExpanded ? (
															<ChevronDown className="w-3.5 h-3.5" />
														) : (
															<ChevronRight className="w-3.5 h-3.5" />
														)}
													</span>
													{isExpanded ? (
														<FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
													) : (
														<Folder className="w-4 h-4 text-amber-500 shrink-0" />
													)}
													<span className="text-xs font-medium truncate flex-1">
														{node.name}
													</span>
													<span className="text-[10px] text-muted/60 shrink-0 pr-1">
														{childCount}
													</span>
												</button>
											);
										}

										// File / Note row
										const lowerName = node.name.toLowerCase();
										const isCanvas = lowerName.endsWith(".canvas");
										const isExcalidraw =
											lowerName.endsWith(".excalidraw") ||
											lowerName.endsWith(".excalidraw.md");
										const displayName = node.name.replace(
											/\.(canvas|excalidraw(\.md)?|md)$/i,
											"",
										);
										const isChecked = selectedPaths.has(node.relPath);
										const sizeText = formatBytes(node.size);
										const dateText = formatDate(node.mtime);

										return (
											<div
												key={node.relPath}
												style={{ paddingLeft: `${indentPx}px` }}
												className={`relative flex items-center gap-2 py-1 px-2 rounded-lg border transition-colors group select-none ${
													isChecked
														? "bg-accent/10 border-accent/40"
														: "border-transparent hover:bg-surface-secondary/80 hover:border-border/60"
												}`}
											>
												{/* Checkbox */}
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														toggleSelect(node.relPath);
													}}
													className={`shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors cursor-pointer ${
														isChecked
															? "bg-accent border-accent text-accent-foreground"
															: "border-border/80 hover:border-accent/60 bg-surface/50"
													}`}
													title={isChecked ? "取消勾选" : "勾选此笔记"}
												>
													{isChecked && (
														<Check className="w-2.5 h-2.5 stroke-[3]" />
													)}
												</button>

												{/* Icon */}
												<div className="shrink-0 flex items-center justify-center">
													{isCanvas ? (
														<LayoutDashboard className="w-3.5 h-3.5 text-indigo-500" />
													) : isExcalidraw ? (
														<PenTool className="w-3.5 h-3.5 text-purple-500" />
													) : (
														<FileText className="w-3.5 h-3.5 text-emerald-500" />
													)}
												</div>

												{/* Title and metadata */}
												<button
													type="button"
													onClick={() => toggleSelect(node.relPath)}
													onDoubleClick={() => handlePickSingle(node)}
													className="flex-1 min-w-0 text-left cursor-pointer flex items-center justify-between gap-2 py-0.5"
												>
													<div className="flex items-center gap-1.5 min-w-0 truncate">
														<span
															className={`text-xs truncate transition-colors ${
																isChecked
																	? "font-medium text-accent"
																	: "text-foreground group-hover:text-accent"
															}`}
														>
															{displayName}
														</span>
														{isCanvas && (
															<span className="shrink-0 text-[8px] px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-500 font-medium">
																白板
															</span>
														)}
														{isExcalidraw && (
															<span className="shrink-0 text-[8px] px-1 py-0.2 rounded bg-purple-500/15 text-purple-500 font-medium">
																画板
															</span>
														)}
													</div>

													<div className="flex items-center gap-1.5 text-[10px] text-muted/60 shrink-0">
														{sizeText && <span>{sizeText}</span>}
														{dateText && (
															<>
																<span>·</span>
																<span>{dateText}</span>
															</>
														)}
													</div>
												</button>

												{/* Hover Quick Action */}
												<div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity pl-4 z-10 bg-gradient-to-l from-surface via-surface to-transparent">
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															handlePickSingle(node);
														}}
														className="h-5 px-2 rounded text-[10px] font-medium bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer transition-colors shadow-2xs"
														title="快捷导入此篇"
													>
														选择
													</button>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</Modal.Body>
					{selectedPaths.size > 0 && (
						<Modal.Footer className="flex items-center justify-between border-t border-border/60 pt-2.5 pb-1 px-1 shrink-0">
							<div className="text-xs text-muted flex items-center gap-1.5">
								<span>已选择</span>
								<span className="font-semibold text-accent">
									{selectedPaths.size}
								</span>
								<span>篇笔记</span>
								{maxSelectable !== undefined && (
									<span className="text-[11px] text-muted/70">
										（最多可选 {maxSelectable} 篇）
									</span>
								)}
							</div>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => setSelectedPaths(new Set())}
									className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer transition-colors"
								>
									清空
								</button>
								<button
									type="button"
									onClick={handlePickBatch}
									className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
								>
									<Check className="w-3.5 h-3.5 stroke-[2.5]" />
									导入已选（{selectedPaths.size}）
								</button>
							</div>
						</Modal.Footer>
					)}
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
