import { Button, Modal, ScrollShadow } from "@heroui/react";
import {
	Check,
	Folder,
	HardDrive,
	Loader2,
	NotebookPen,
	Search,
} from "lucide-react";
import { memo } from "react";
import type { ChatDraftPayload } from "../../../../../hooks/ai/useChatMessages";
import type { VaultFolderItem } from "../../../../obsidian/tree/vaultTreeUtils";
import { getDraftKindMeta } from "./draftMeta";

export interface DraftFolderPickerModalProps {
	isOpen: boolean;
	onClose: () => void;
	draft: ChatDraftPayload;
	loading: boolean;
	actionLoading: boolean;
	search: string;
	onSearchChange: (val: string) => void;
	folders: VaultFolderItem[];
	selectedDir: string;
	onSelectDir: (dir: string) => void;
	onConfirm: () => void;
}

/**
 * Modern folder selection dialog for archiving drafts to Obsidian.
 */
export const DraftFolderPickerModal = memo(function DraftFolderPickerModal({
	isOpen,
	onClose,
	draft,
	loading,
	actionLoading,
	search,
	onSearchChange,
	folders,
	selectedDir,
	onSelectDir,
	onConfirm,
}: DraftFolderPickerModalProps) {
	const meta = getDraftKindMeta(draft);

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
			className="z-60"
		>
			<Modal.Container size="md" className="w-full">
				<Modal.Dialog
					aria-label={`选择保存 Obsidian ${meta.kindLabel} 的目标文件夹`}
					className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl bg-surface border border-border/70 shadow-xl overflow-hidden"
				>
					<Modal.CloseTrigger />
					<Modal.Header className="shrink-0 px-5 pt-4 pb-3 border-b border-border/40">
						<div className="flex items-center gap-2.5">
							<div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
								<NotebookPen className="w-4 h-4" />
							</div>
							<div className="min-w-0">
								<Modal.Heading className="text-sm font-semibold text-foreground">
									存为 Obsidian {meta.kindLabel}
								</Modal.Heading>
								<p className="text-[11px] text-muted truncate mt-0.5">
									选择保存「{draft.title}」的目标文件夹
								</p>
							</div>
						</div>
					</Modal.Header>

					<Modal.Body className="flex flex-col flex-1 min-h-0 gap-2.5 p-4">
						<div className="relative shrink-0">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
							<input
								type="text"
								value={search}
								onChange={(e) => onSearchChange(e.target.value)}
								placeholder="快速搜索目录…"
								className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-surface-secondary/40 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1.5 focus:ring-accent/40 transition-shadow"
							/>
						</div>

						<div className="flex-1 min-h-48 overflow-hidden rounded-xl border border-border/60 bg-surface-secondary/15">
							{loading ? (
								<div className="flex flex-col items-center justify-center h-48 gap-2 text-muted">
									<Loader2 className="w-5 h-5 animate-spin text-accent" />
									<span className="text-xs">正在扫描目录结构…</span>
								</div>
							) : folders.length === 0 ? (
								<div className="flex items-center justify-center h-48 text-xs text-muted">
									未找到匹配的文件夹
								</div>
							) : (
								<ScrollShadow className="h-48 p-1.5 divide-y divide-border/20">
									{folders.map((item) => {
										const isSelected = selectedDir === item.relPath;
										return (
											<button
												key={item.relPath || "__root__"}
												type="button"
												onClick={() => onSelectDir(item.relPath)}
												className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
													isSelected
														? "bg-accent/15 text-accent font-medium"
														: "text-foreground hover:bg-surface-secondary/60"
												}`}
												style={{ paddingLeft: `${10 + item.depth * 14}px` }}
											>
												<div className="flex items-center gap-1.5 truncate">
													{item.relPath === "" ? (
														<HardDrive className="w-3.5 h-3.5 shrink-0 text-muted" />
													) : (
														<Folder className="w-3.5 h-3.5 shrink-0 text-muted" />
													)}
													<span className="truncate">{item.name}</span>
												</div>
												{isSelected && (
													<Check className="w-3.5 h-3.5 shrink-0 text-accent" />
												)}
											</button>
										);
									})}
								</ScrollShadow>
							)}
						</div>
					</Modal.Body>

					<Modal.Footer className="shrink-0 px-5 py-2.5 border-t border-border/40 flex items-center justify-end gap-2 bg-surface-secondary/15">
						<Button
							size="sm"
							variant="secondary"
							className="h-7.5 px-3 text-xs rounded-lg cursor-pointer font-medium"
							onPress={onClose}
						>
							取消
						</Button>
						<Button
							size="sm"
							className="h-7.5 px-3.5 text-xs font-semibold rounded-lg bg-accent text-white hover:opacity-90 cursor-pointer shadow-xs"
							onPress={onConfirm}
							isDisabled={actionLoading}
						>
							{actionLoading ? (
								<Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
							) : (
								<Check className="w-3.5 h-3.5 mr-1" />
							)}
							确认存入
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
});
