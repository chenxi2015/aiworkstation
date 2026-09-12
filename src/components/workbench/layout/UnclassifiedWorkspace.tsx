import { UNCLASSIFIED_CATEGORY } from "../../../modules/registry";
import type { Folder, WorkbenchItem } from "../types";
import { UnclassifiedView } from "./UnclassifiedView";

export interface UnclassifiedWorkspaceProps {
	unclassified: WorkbenchItem[];
	totalCount: number;
	folders: Folder[];
	onOpenAIClassify: () => void;
	onClearUnclassified: () => void;
	onDeleteItem: (item: WorkbenchItem) => void;
	onMoveItem: (item: WorkbenchItem, targetFolderId: number) => void;
}

/**
 * Workspace view for the unclassified bookmarks inbox buffer.
 */
export function UnclassifiedWorkspace({
	unclassified,
	totalCount,
	folders,
	onOpenAIClassify,
	onClearUnclassified,
	onDeleteItem,
	onMoveItem,
}: UnclassifiedWorkspaceProps) {
	return (
		<main className="flex-1 p-6 lg:p-8 min-w-0 flex flex-col overflow-y-auto h-full">
			{/* Workspace Title */}
			<div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-6">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-bold tracking-tight text-foreground">
							{UNCLASSIFIED_CATEGORY}
						</h1>
						<span className="text-xs font-medium text-muted">
							{totalCount} 条待整理书签
						</span>
					</div>
					<p className="text-xs text-muted mt-1 leading-relaxed max-w-3xl">
						从 Chrome 扩展同步的未分类书签缓冲池。点击下方「启动 DeepSeek
						一键智能分类」，将深度分析并自动生成主题文件夹入库。
					</p>
				</div>
			</div>

			<UnclassifiedView
				unclassified={unclassified}
				folders={folders}
				onOpenAIClassify={onOpenAIClassify}
				onClearUnclassified={onClearUnclassified}
				onDeleteItem={onDeleteItem}
				onMoveItem={onMoveItem}
			/>
		</main>
	);
}
