import { Button, Tooltip } from "@heroui/react";
import { Pencil, Sparkles } from "lucide-react";
import type { Folder } from "../types";
import { FolderAppGridCover } from "./FolderAppGridCover";

export interface FolderHeaderProps {
	folder: Folder;
	onEdit: (folder: Folder) => void;
	onAskAI?: (prompt: string) => void;
}

/**
 * Top metadata, description and action header for selected folder in detail panel
 */
export function FolderHeader({ folder, onEdit, onAskAI }: FolderHeaderProps) {
	const count = folder.items?.length || 0;

	return (
		<div className="flex flex-col gap-1.5 mb-3">
			<div className="flex items-center justify-between gap-2">
				{/* Folder Title & Cover */}
				<div className="flex items-center gap-2.5 min-w-0 flex-1">
					<FolderAppGridCover folder={folder} size="sm" />
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<h2
								className="text-sm font-bold text-foreground tracking-tight truncate"
								title={folder.name}
							>
								{folder.name}
							</h2>
							<span className="text-[10px] font-mono font-medium text-muted bg-surface-secondary px-1.5 py-0.2 rounded-full shrink-0">
								{count}
							</span>
						</div>
						{folder.desc && (
							<p
								className="text-[11px] text-muted line-clamp-1 leading-normal mt-0.5"
								title={folder.desc}
							>
								{folder.desc}
							</p>
						)}
					</div>
				</div>

				{/* Quick Actions (AI Summary + Edit) */}
				<div className="flex items-center gap-1 shrink-0">
					{onAskAI && count > 0 && (
						<Tooltip>
							<Tooltip.Trigger>
								<Button
									variant="ghost"
									size="sm"
									className="rounded-lg shrink-0 h-7 w-7 p-0 text-accent hover:bg-accent-soft cursor-pointer"
									onPress={() =>
										onAskAI(
											`请深度总结与盘点「${folder.name}」文件夹中的 ${count} 个书签条目，分析核心亮点、适用场景与推荐使用工作流。`,
										)
									}
									aria-label="让 AI 总结与盘点此文件夹"
								>
									<Sparkles className="w-3.5 h-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								让 AI 总结与盘点此文件夹
							</Tooltip.Content>
						</Tooltip>
					)}

					<Tooltip>
						<Tooltip.Trigger>
							<Button
								variant="ghost"
								size="sm"
								className="rounded-lg shrink-0 h-7 w-7 p-0 text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer"
								onPress={() => onEdit(folder)}
								aria-label="编辑文件夹"
							>
								<Pencil className="w-3.5 h-3.5" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-xs py-1 px-2">
							编辑文件夹
						</Tooltip.Content>
					</Tooltip>
				</div>
			</div>
		</div>
	);
}
