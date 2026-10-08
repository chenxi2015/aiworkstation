import { Button, Modal, ScrollShadow } from "@heroui/react";
import { Check, Folder, FolderInput, HardDrive, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ObsidianTreeNode } from "./types";
import {
	canMoveEntry,
	collectAllFolders,
	type VaultFolderItem,
} from "./tree/vaultTreeUtils";

export interface MoveEntryModalProps {
	/** Entry being moved; null when modal is closed */
	target: ObsidianTreeNode | null;
	/** Entire vault tree to extract available folders */
	tree: ObsidianTreeNode[];
	onClose: () => void;
	onConfirmMove: (
		sourceRelPath: string,
		targetDir: string,
	) => Promise<void> | void;
}

/**
 * Modal dialog for selecting target folder to move a note or folder into.
 */
export function MoveEntryModal({
	target,
	tree,
	onClose,
	onConfirmMove,
}: MoveEntryModalProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedDir, setSelectedDir] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const isFolder = target?.kind === "folder";
	const typeLabel = isFolder ? "文件夹" : "文件";

	// Collect all available destination folders including vault root
	const allFolderOptions = useMemo<VaultFolderItem[]>(() => {
		const list: VaultFolderItem[] = [
			{ name: "Vault 根目录 (/) ", relPath: "", depth: 0 },
		];
		list.push(...collectAllFolders(tree, 1));
		return list;
	}, [tree]);

	// Filter folders by search query
	const filteredOptions = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return allFolderOptions;
		return allFolderOptions.filter(
			(item) =>
				item.name.toLowerCase().includes(q) ||
				item.relPath.toLowerCase().includes(q),
		);
	}, [allFolderOptions, searchQuery]);

	if (!target) return null;

	const handleConfirm = async (destDir: string) => {
		if (submitting) return;
		const check = canMoveEntry(target, destDir);
		if (!check.allowed) return;
		setSubmitting(true);
		try {
			await onConfirmMove(target.relPath, destDir);
			onClose();
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Modal.Backdrop
			isOpen
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
			className="z-60"
		>
			<Modal.Container size="md" className="w-full">
				<Modal.Dialog
					aria-label={`将${typeLabel}移动到`}
					className="w-full max-w-md max-h-[80vh] flex flex-col"
				>
					<Modal.CloseTrigger />
					<Modal.Header className="shrink-0 pb-1">
						<div className="flex items-center gap-2">
							<div className="p-1.5 rounded-lg bg-accent/10 text-accent">
								<FolderInput className="w-4 h-4" />
							</div>
							<div>
								<Modal.Heading className="text-sm font-semibold">
									移动{typeLabel}
								</Modal.Heading>
								<p className="text-[11px] text-muted truncate max-w-[320px]">
									将「{target.name}」移动到指定文件夹
								</p>
							</div>
						</div>
					</Modal.Header>

					<Modal.Body className="flex flex-col flex-1 min-h-0 gap-2 pt-1 pb-2">
						{/* Search filter input */}
						<div className="relative shrink-0">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="搜索目标文件夹…"
								className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-surface-secondary/40 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
							/>
						</div>

						{/* Folder tree list */}
						<ScrollShadow className="h-[46vh] min-h-48 overflow-y-auto rounded-lg border border-border/70 p-1 bg-surface-secondary/20">
							{filteredOptions.length === 0 ? (
								<p className="py-8 text-center text-xs text-muted">
									未找到匹配的文件夹
								</p>
							) : (
								filteredOptions.map((item) => {
									const check = canMoveEntry(target, item.relPath);
									const isCurrentSelected = selectedDir === item.relPath;
									const disabled = !check.allowed;

									return (
										<button
											key={item.relPath || "__root__"}
											type="button"
											disabled={disabled}
											onClick={() => {
												if (!disabled) setSelectedDir(item.relPath);
											}}
											onDoubleClick={() => {
												if (!disabled) void handleConfirm(item.relPath);
											}}
											style={{
												paddingLeft: `${Math.min(item.depth, 6) * 12 + 8}px`,
											}}
											className={`w-full group flex items-center gap-2 py-1.5 pr-2 rounded-md text-left text-xs transition-colors ${
												isCurrentSelected
													? "bg-accent text-accent-foreground font-medium"
													: disabled
														? "opacity-40 cursor-not-allowed text-muted"
														: "text-foreground/90 hover:bg-surface-secondary"
											}`}
											title={check.reason || item.relPath || "Vault 根目录"}
										>
											{item.relPath === "" ? (
												<HardDrive
													className={`w-3.5 h-3.5 shrink-0 ${
														isCurrentSelected
															? "text-accent-foreground"
															: "text-muted"
													}`}
												/>
											) : (
												<Folder
													className={`w-3.5 h-3.5 shrink-0 ${
														isCurrentSelected
															? "text-accent-foreground"
															: "text-muted"
													}`}
												/>
											)}
											<span className="truncate flex-1">{item.name}</span>
											{disabled && check.reason && (
												<span className="text-[10px] text-muted/70 shrink-0">
													{check.reason}
												</span>
											)}
											{isCurrentSelected && (
												<Check className="w-3.5 h-3.5 shrink-0 ml-1" />
											)}
										</button>
									);
								})
							)}
						</ScrollShadow>
					</Modal.Body>

					<Modal.Footer className="flex items-center justify-between gap-2 shrink-0 pt-2 border-t border-border/60">
						<span className="text-[11px] text-muted truncate">
							{selectedDir !== null
								? `目标：${selectedDir ? selectedDir : "Vault 根目录"}`
								: "请选择目标文件夹（支持双击直接移动）"}
						</span>
						<div className="flex gap-2">
							<Button variant="secondary" size="sm" onPress={onClose}>
								取消
							</Button>
							<Button
								variant="primary"
								size="sm"
								isDisabled={
									selectedDir === null ||
									!canMoveEntry(target, selectedDir).allowed ||
									submitting
								}
								isPending={submitting}
								onPress={() => {
									if (selectedDir !== null) void handleConfirm(selectedDir);
								}}
							>
								移动到此处
							</Button>
						</div>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
