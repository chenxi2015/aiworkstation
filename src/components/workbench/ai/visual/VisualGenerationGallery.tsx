import { ScrollShadow } from "@heroui/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageBridge } from "../../../../types/pageBridge.ts";
import type {
	VisualGenerationItem,
	VisualPendingRequest,
} from "../../../../types/visualGeneration.ts";
import { VisualChatTurnItem } from "./VisualChatTurnItem.tsx";
import { VisualEmptyState } from "./VisualEmptyState.tsx";
import { VisualGeneratingCard } from "./VisualGeneratingCard.tsx";

export interface VisualGenerationGalleryProps {
	items: VisualGenerationItem[];
	pendingRequest?: VisualPendingRequest | null;
	pageBridge?: PageBridge | null;
	onDeleteItem?: (id: string) => void;
	onDeleteItems?: (ids: Set<string>) => void;
	onEditAndResend?: (item: VisualGenerationItem, newPrompt: string) => void;
	onClearAll?: () => void;
	onSelectPrompt?: (prompt: string) => void;
}

/**
 * Visual Generation Chat Stream Gallery:
 * Renders empty inspiration state or historical chat turns with ScrollShadow,
 * maintaining identical margin, padding, and layout consistency with ChatMessageList.
 * Strictly maintains chronological order (oldest turns on top, newest at bottom).
 */
export const VisualGenerationGallery = memo(function VisualGenerationGallery({
	items,
	pendingRequest,
	pageBridge,
	onDeleteItem,
	onDeleteItems,
	onEditAndResend,
	onClearAll,
	onSelectPrompt,
}: VisualGenerationGalleryProps) {
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);

	// Multi-select delete mode state matching ChatMessageList
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	// Ensure turns are displayed chronologically (oldest at top, newest at bottom)
	const sortedItems = useMemo(() => {
		return [...items].sort((a, b) => a.createdAt - b.createdAt);
	}, [items]);

	// Auto-scroll to bottom whenever a new turn is appended or generation begins
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on items change
	useEffect(() => {
		if (!isSelectMode) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [items.length, pendingRequest, isSelectMode]);

	// Enter select mode when user clicks delete on an item
	const handleStartSelectDelete = useCallback((initialId: string) => {
		setIsSelectMode(true);
		setSelectedIds(new Set([initialId]));
	}, []);

	const handleCancelSelect = useCallback(() => {
		setIsSelectMode(false);
		setSelectedIds(new Set());
	}, []);

	const handleToggleSelect = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const handleToggleSelectAll = useCallback(() => {
		setSelectedIds((prev) => {
			if (prev.size === items.length) {
				return new Set();
			}
			return new Set(items.map((i) => i.id));
		});
	}, [items]);

	const handleConfirmDelete = useCallback(() => {
		if (selectedIds.size === 0) return;
		if (onDeleteItems) {
			onDeleteItems(selectedIds);
		} else if (onDeleteItem) {
			for (const id of selectedIds) {
				onDeleteItem(id);
			}
		}
		handleCancelSelect();
	}, [selectedIds, onDeleteItems, onDeleteItem, handleCancelSelect]);

	const hasContent = items.length > 0 || Boolean(pendingRequest);

	return (
		<div className="relative flex-1 min-h-0 flex flex-col">
			<ScrollShadow
				ref={scrollContainerRef}
				size={40}
				className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
			>
				{/* Empty State matching ChatEmptyState style and effect */}
				{!hasContent && (
					<VisualEmptyState onSelectPrompt={onSelectPrompt || (() => {})} />
				)}

				{/* Top header stats and clear button */}
				{items.length > 0 && !isSelectMode && (
					<div className="flex items-center justify-between px-1 py-0.5 text-[11px] text-muted select-none border-b border-border/30 mb-2">
						<span>共 {items.length} 条视觉对话</span>
						{onClearAll && (
							<button
								type="button"
								onClick={onClearAll}
								className="text-[10px] text-muted hover:text-red-500 transition-colors cursor-pointer"
							>
								清空记录
							</button>
						)}
					</div>
				)}

				{/* Render historical visual chat turns (User on right, AI card on left) */}
				{sortedItems.map((item) => (
					<VisualChatTurnItem
						key={item.id}
						item={item}
						pageBridge={pageBridge}
						isSelectMode={isSelectMode}
						isSelected={selectedIds.has(item.id)}
						onToggleSelect={handleToggleSelect}
						onDeleteItem={onDeleteItem}
						onStartSelectDelete={handleStartSelectDelete}
						onEditAndResend={onEditAndResend}
						isGenerating={Boolean(pendingRequest)}
					/>
				))}

				{/* Render active generating turn */}
				{!isSelectMode && pendingRequest && (
					<VisualGeneratingCard
						request={pendingRequest}
						onSelectPrompt={onSelectPrompt}
					/>
				)}

				{/* Batch Delete Action Bar (Fixed Overlay at bottom of scroll area) matching ChatMessageList */}
				{isSelectMode && (
					<div className="sticky bottom-2 z-30 mx-auto w-[90%] max-w-sm p-2.5 rounded-2xl bg-surface/95 dark:bg-neutral-900/95 border border-border shadow-xl backdrop-blur-md flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-200">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-foreground">
								已选 {selectedIds.size} 条
							</span>
							<button
								type="button"
								onClick={handleToggleSelectAll}
								className="text-[11px] text-muted hover:text-foreground underline cursor-pointer"
							>
								{selectedIds.size === items.length ? "取消全选" : "全选"}
							</button>
						</div>

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={handleCancelSelect}
								className="h-8 px-3 text-xs font-medium rounded-xl text-muted hover:text-foreground hover:bg-surface-secondary transition-colors cursor-pointer"
							>
								取消
							</button>
							<button
								type="button"
								disabled={selectedIds.size === 0}
								onClick={handleConfirmDelete}
								className="h-8 px-5 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 active:bg-red-700 disabled:opacity-50 text-white shadow-xs cursor-pointer transition-colors"
							>
								删除
							</button>
						</div>
					</div>
				)}

				{/* Auto-scroll target anchor */}
				<div ref={messagesEndRef} className="h-1 shrink-0" />
			</ScrollShadow>
		</div>
	);
});
