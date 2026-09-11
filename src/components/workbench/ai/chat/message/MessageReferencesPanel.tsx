import { Button } from "@heroui/react";
import {
	BookOpen,
	CheckSquare,
	ChevronDown,
	FolderInput,
	FolderPlus,
	Square,
} from "lucide-react";
import { memo, useState } from "react";
import type { Category, SearchResultItem } from "../../../types";
import { ChatReferenceCard } from "../ChatReferenceCard";

export interface MessageReferencesPanelProps {
	references: SearchResultItem[];
	selectedRefKeys: Set<string | number>;
	onToggleRefCheck: (refKey: string | number) => void;
	onToggleSelectGroup?: (items: SearchResultItem[]) => void;
	onOpenAssignSingle: (item: SearchResultItem, e?: React.MouseEvent) => void;
	onOpenAssignMultiple: (
		items: SearchResultItem[],
		createMode?: boolean,
	) => void;
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
}

/**
 * Collapsible panel displaying matched web references and batch folder assignment actions
 */
export const MessageReferencesPanel = memo(function MessageReferencesPanel({
	references,
	selectedRefKeys,
	onToggleRefCheck,
	onToggleSelectGroup,
	onOpenAssignSingle,
	onOpenAssignMultiple,
	onNavigateToFolder,
}: MessageReferencesPanelProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	const selectedInPanel = references.filter((r) =>
		selectedRefKeys.has(r.id || r.url || ""),
	);
	const isAllChecked =
		references.length > 0 &&
		references.every((r) => selectedRefKeys.has(r.id || r.url || ""));
	const effectiveExpanded = isExpanded || selectedInPanel.length > 0;

	if (references.length === 0) return null;

	return (
		<div className="mt-2 w-full flex flex-col rounded-xl bg-surface/90 border border-border animate-in fade-in duration-200 overflow-hidden">
			{/* Toggle Header Bar */}
			{/* biome-ignore lint/a11y/useSemanticElements: panel header contains nested action buttons */}
			<div
				role="button"
				tabIndex={0}
				onClick={() => setIsExpanded(!effectiveExpanded)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setIsExpanded(!effectiveExpanded);
					}
				}}
				className="px-2.5 py-2 flex items-center justify-between text-[11px] font-medium text-muted hover:bg-surface-secondary/50 transition-colors cursor-pointer select-none"
			>
				{/* Left: icon + title + badge counts */}
				<div className="flex items-center gap-1.5 min-w-0">
					<BookOpen className="w-3.5 h-3.5 text-accent shrink-0" />
					<span className="font-semibold text-xs text-foreground truncate">
						命中的网址列表
					</span>
					<span className="px-1.5 py-0.2 text-[10px] font-medium rounded-full bg-surface-secondary text-muted border border-border/60 shrink-0">
						{references.length}
					</span>
					{selectedInPanel.length > 0 && (
						<span className="px-1.5 py-0.2 text-[10px] font-medium rounded-full bg-accent-soft text-accent border border-accent/30 shrink-0">
							已选 {selectedInPanel.length} 项
						</span>
					)}
				</div>

				{/* Right: select-all button + collapse chevron */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: stop propagation for action buttons */}
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: stop propagation for action buttons */}
				<div
					className="flex items-center gap-1.5 shrink-0"
					onClick={(e) => e.stopPropagation()}
				>
					{effectiveExpanded && onToggleSelectGroup && (
						<button
							type="button"
							onClick={() => onToggleSelectGroup(references)}
							className={`text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors px-1.5 py-0.5 rounded-md border ${
								isAllChecked
									? "text-accent bg-accent-soft/60 border-accent/30 hover:bg-accent-soft"
									: "text-muted hover:text-foreground bg-surface-secondary/50 hover:bg-surface-secondary border-border/40"
							}`}
							aria-label={isAllChecked ? "取消全选" : "全选全部网址"}
						>
							{isAllChecked ? (
								<CheckSquare className="w-3 h-3 text-accent" />
							) : (
								<Square className="w-3 h-3 opacity-60" />
							)}
							<span>{isAllChecked ? "取消全选" : "全选"}</span>
						</button>
					)}

					<button
						type="button"
						onClick={() => setIsExpanded(!effectiveExpanded)}
						className="p-0.5 rounded-md text-muted hover:text-foreground transition-colors cursor-pointer"
						aria-label={effectiveExpanded ? "收起列表" : "展开列表"}
					>
						<ChevronDown
							className={`w-3.5 h-3.5 transition-transform duration-200 ${
								effectiveExpanded ? "rotate-180" : ""
							}`}
						/>
					</button>
				</div>
			</div>

			{/* Collapsible Content */}
			{effectiveExpanded && (
				<div className="flex flex-col border-t border-border/50">
					{/* Reference items list */}
					<div
						className={`flex flex-col gap-1.5 max-h-72 sm:max-h-80 overflow-y-auto pl-2.5 py-2 ${
							references.length > 3 ? "pr-1" : "pr-2.5"
						}`}
					>
						{references.map((ref: SearchResultItem, rIdx: number) => {
							const refKey = ref.id || ref.url || rIdx;
							const isChecked = selectedRefKeys.has(refKey);

							return (
								<ChatReferenceCard
									key={`${ref.id ?? ref.url ?? "ref"}_${refKey}`}
									reference={ref}
									isChecked={isChecked}
									onToggleCheck={() => onToggleRefCheck(refKey)}
									onOpenAssign={(e) => onOpenAssignSingle(ref, e)}
									onNavigateToFolder={onNavigateToFolder}
								/>
							);
						})}
					</div>

					{/* Batch Actions Bar for selected references */}
					{selectedInPanel.length > 0 && (
						<div className="border-t border-border flex items-center justify-between gap-1 flex-wrap bg-surface-secondary/40 px-2.5 py-2">
							<span className="text-[10px] text-foreground font-medium">
								已选 {selectedInPanel.length} 个书签
							</span>
							<div className="flex items-center gap-1">
								<Button
									variant="secondary"
									size="sm"
									className="h-6 px-2 text-[10px] rounded-md cursor-pointer flex items-center gap-1"
									onPress={() => onOpenAssignMultiple(selectedInPanel, false)}
								>
									<FolderInput className="w-2.5 h-2.5" />
									<span>归入已有</span>
								</Button>
								<Button
									variant="primary"
									size="sm"
									className="h-6 px-2 text-[10px] rounded-md cursor-pointer flex items-center gap-1"
									onPress={() => onOpenAssignMultiple(selectedInPanel, true)}
								>
									<FolderPlus className="w-2.5 h-2.5" />
									<span>新建归入</span>
								</Button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
});
