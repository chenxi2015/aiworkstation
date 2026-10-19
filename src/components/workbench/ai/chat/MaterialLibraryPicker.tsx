import { Modal, toast } from "@heroui/react";
import { Check, LibraryBig, Loader2 } from "lucide-react";
import { useState } from "react";
import { MAX_CHAT_ATTACHMENTS } from "../../../../types/chatContext";
import {
	getAudioAssets,
	getImageAssets,
	getMaterialKind,
	getVideoAssets,
} from "../../../creator/materials/utils";
import type { Material } from "../../../creator/types";
import { MaterialPickerFilters } from "./material-picker/MaterialPickerFilters";
import { MaterialPickerPreviews } from "./material-picker/MaterialPickerPreviews";
import { MaterialPickerRow } from "./material-picker/MaterialPickerRow";
import type {
	MaterialLibraryPickerProps,
	PreviewState,
} from "./material-picker/types";
import {
	INITIAL_PAGE_SIZE,
	useMaterialPicker,
} from "./material-picker/useMaterialPicker";
import { toMaterialContextItem } from "./material-picker/utils";

export type { MaterialLibraryPickerProps } from "./material-picker/types";

/**
 * Chat attachment material library picker modal.
 * Allows selecting existing materials from the creator module as chat context items.
 * Supports multi-selection, search, folder & type filtering, previewing, and infinite scrolling.
 */
export function MaterialLibraryPicker({
	isOpen,
	onClose,
	onPick,
	onPickBatch,
	maxSelectable = MAX_CHAT_ATTACHMENTS,
}: MaterialLibraryPickerProps) {
	const [preview, setPreview] = useState<PreviewState>(null);

	const {
		materials,
		folders,
		loading,
		query,
		setQuery,
		folderFilter,
		setFolderFilter,
		typeTab,
		setTypeTab,
		selectedIds,
		setSelectedIds,
		displayedMaterials,
		filtered,
		hasMore,
		sentinelRef,
		listContainerRef,
		typeCounts,
		folderName,
		toggleSelect,
		toggleSelectAll,
		isAllFilteredSelected,
		clearSelection,
	} = useMaterialPicker({ isOpen, maxSelectable });

	const handlePickSingle = (m: Material) => {
		if (maxSelectable !== undefined && maxSelectable <= 0) {
			toast.warning(
				`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件，请先移除已有附件`,
			);
			return;
		}
		onPick(toMaterialContextItem(m, folderName(m.folderId)));
		onClose();
	};

	const handlePickBatch = () => {
		const picked = materials.filter((m) => selectedIds.has(m.id));
		if (picked.length === 0) return;
		const safePicked =
			maxSelectable !== undefined && picked.length > maxSelectable
				? picked.slice(0, maxSelectable)
				: picked;
		const items = safePicked.map((m) =>
			toMaterialContextItem(m, folderName(m.folderId)),
		);
		if (onPickBatch) {
			onPickBatch(items);
		} else {
			for (const item of items) onPick(item);
		}
		onClose();
	};

	const handlePreview = (m: Material) => {
		const kind = getMaterialKind(m);
		if (kind === "video" && getVideoAssets(m).length > 0) {
			setPreview({ kind: "video", material: m });
			return;
		}
		if (kind === "image" && getImageAssets(m).length > 0) {
			setPreview({ kind: "image", material: m });
			return;
		}
		if (kind === "audio" && getAudioAssets(m).length > 0) {
			setPreview({ kind: "audio", material: m });
			return;
		}
		// Fallback to text document preview
		setPreview({ kind: "doc", material: m });
	};

	return (
		<>
			<Modal.Backdrop
				isOpen={isOpen}
				onOpenChange={(open) => !open && onClose()}
				variant="blur"
			>
				<Modal.Container size="lg" className="w-full">
					<Modal.Dialog
						aria-label="从素材库导入"
						className="!max-w-2xl w-full max-h-[70vh] flex flex-col"
					>
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading className="flex items-center gap-2">
								<LibraryBig className="w-4 h-4 text-violet-500" />
								从素材库导入
							</Modal.Heading>
						</Modal.Header>
						<Modal.Body className="flex-1 overflow-hidden flex flex-col gap-2 mt-2">
							{/* Upper limit warning banner */}
							{maxSelectable <= 0 && (
								<div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between shrink-0">
									<span>
										当前附件已达上限（{MAX_CHAT_ATTACHMENTS} 个），请先在对话框中移除部分附件
									</span>
								</div>
							)}

							{/* Search, filter tabs, folder capsules, and select-all bar */}
							<MaterialPickerFilters
								query={query}
								onQueryChange={setQuery}
								typeTab={typeTab}
								onTypeTabChange={setTypeTab}
								folderFilter={folderFilter}
								onFolderFilterChange={setFolderFilter}
								totalMaterialsCount={materials.length}
								folders={folders}
								filteredCount={filtered.length}
								selectedCount={selectedIds.size}
								isAllFilteredSelected={isAllFilteredSelected}
								onToggleSelectAll={toggleSelectAll}
								onClearSelection={clearSelection}
								typeCounts={typeCounts}
							/>

							{/* Material item list with infinite scrolling */}
							<div
								ref={listContainerRef}
								className="flex-1 overflow-y-auto -mx-1 px-1"
							>
								{loading ? (
									<div className="flex items-center justify-center py-10 text-muted">
										<Loader2 className="w-4 h-4 animate-spin mr-2" />
										<span className="text-xs">加载素材库...</span>
									</div>
								) : filtered.length === 0 ? (
									<div className="flex flex-col items-center justify-center py-10 text-muted gap-1">
										<LibraryBig className="w-6 h-6 opacity-50" />
										<span className="text-xs">
											{materials.length === 0
												? "素材库为空，可先在创作模块添加素材"
												: "没有匹配的素材"}
										</span>
									</div>
								) : (
									<div className="flex flex-col gap-1 py-0.5">
										{displayedMaterials.map((m) => (
											<MaterialPickerRow
												key={m.id}
												material={m}
												isChecked={selectedIds.has(m.id)}
												folderName={folderName(m.folderId)}
												onToggleSelect={toggleSelect}
												onPickSingle={handlePickSingle}
												onPreview={handlePreview}
											/>
										))}

										{/* Infinite scroll sentinel and end indicator */}
										{hasMore && (
											<div
												ref={sentinelRef}
												className="py-3 flex items-center justify-center text-muted gap-1.5"
											>
												<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
												<span className="text-[11px] text-muted">
													正在加载更多素材（已显示 {displayedMaterials.length} /
													共 {filtered.length} 条）...
												</span>
											</div>
										)}
										{!hasMore && filtered.length > INITIAL_PAGE_SIZE && (
											<div className="py-2.5 text-center text-[10px] text-muted/60">
												已显示全部（共 {filtered.length} 条）
											</div>
										)}
									</div>
								)}
							</div>
						</Modal.Body>

						{/* Modal footer for batch actions */}
						{selectedIds.size > 0 && (
							<Modal.Footer className="flex items-center justify-between border-t border-border/60 pt-2.5 pb-1 px-1 shrink-0">
								<div className="text-xs text-muted flex items-center gap-1.5">
									<span>已选择</span>
									<span className="font-semibold text-accent">
										{selectedIds.size}
									</span>
									<span>项素材</span>
									{maxSelectable !== undefined && (
										<span className="text-[11px] text-muted/70">
											（最多可选 {maxSelectable} 项）
										</span>
									)}
								</div>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => setSelectedIds(new Set())}
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
										导入已选（{selectedIds.size}）
									</button>
								</div>
							</Modal.Footer>
						)}
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>

			{/* Media preview modals */}
			<MaterialPickerPreviews
				preview={preview}
				onClose={() => setPreview(null)}
			/>
		</>
	);
}
