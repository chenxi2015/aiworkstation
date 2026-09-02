import { Button, Card, Chip, Tooltip } from "@heroui/react";
import { Clock, FolderOpen, Pencil, Sparkles } from "lucide-react";
import type { Folder } from "../types";

export interface FolderHeaderProps {
	folder: Folder;
	onEdit: (folder: Folder) => void;
	onAskAI?: (prompt: string) => void;
}

/**
 * Top metadata, description and action header for selected folder in detail panel
 */
export function FolderHeader({
	folder,
	onEdit,
	onAskAI,
}: FolderHeaderProps) {
	return (
		<div className="flex flex-col gap-2.5 mb-3.5">
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-1.5 flex-wrap">
					<Chip
						size="sm"
						variant="secondary"
						className="font-medium text-[10px] h-5 px-1.5 text-accent bg-accent-soft border-accent/20"
					>
						{folder.category || "工作台"}
					</Chip>
					<span className="text-[10px] text-muted flex items-center gap-1">
						<Clock className="w-2.5 h-2.5 opacity-60" />
						{folder.createdAt || "刚刚"}
					</span>
				</div>

				<Tooltip>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="sm"
							className="rounded-full shrink-0 h-6 w-6 p-0 text-muted hover:text-foreground"
							onPress={() => onEdit(folder)}
							aria-label="编辑文件夹"
						>
							<Pencil className="w-3 h-3" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						编辑文件夹名称与分类
					</Tooltip.Content>
				</Tooltip>
			</div>

			<div>
				<h2 className="text-base font-bold text-foreground tracking-tight leading-snug break-all flex items-center gap-1.5">
					<FolderOpen className="w-4 h-4 text-accent shrink-0" />
					<span>{folder.name}</span>
				</h2>
			</div>

			{/* Folder Description Card */}
			<Card className="bg-surface-secondary/50 border-border/60 p-2.5 shadow-none rounded-xl">
				<p className="text-[11px] text-foreground/80 leading-relaxed break-words">
					{folder.desc || (
						<span className="text-muted italic">暂无文件夹描述信息</span>
					)}
				</p>
			</Card>

			{/* Quick Ask AI about this folder */}
			{onAskAI && folder.items.length > 0 && (
				<Button
					variant="secondary"
					size="sm"
					className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-xl bg-accent-soft text-accent border border-accent/30 py-1.5 h-8 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
					onPress={() =>
						onAskAI(
							`请深度总结与盘点「${folder.name}」文件夹中的 ${folder.items.length} 个书签条目，分析核心亮点、适用场景与推荐使用工作流。`,
						)
					}
				>
					<Sparkles className="w-3 h-3" />
					<span>让 AI 总结与盘点此文件夹</span>
				</Button>
			)}
		</div>
	);
}
