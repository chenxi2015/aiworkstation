import { Button, Card, Chip, Tooltip } from "@heroui/react";
import { Clock, FolderOpen, Pencil, Sparkles } from "lucide-react";
import type { Folder } from "../types";

export interface FolderHeaderProps {
	folder: Folder;
	onEdit: (folder: Folder) => void;
	onOpenDossier?: (folder: Folder) => void;
}

/**
 * Top metadata, description and action header for selected folder in detail panel
 */
export function FolderHeader({
	folder,
	onEdit,
	onOpenDossier,
}: FolderHeaderProps) {
	return (
		<div className="flex flex-col gap-3 mb-5">
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-1.5 flex-wrap">
					<Chip
						size="sm"
						variant="secondary"
						className="font-medium text-[11px] text-accent bg-accent-soft border-accent/20"
					>
						{folder.category || "工作台"}
					</Chip>
					<span className="text-[11px] text-muted flex items-center gap-1">
						<Clock className="w-3 h-3 opacity-60" />
						{folder.createdAt || "刚刚"}
					</span>
				</div>

				<Tooltip>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="sm"
							className="rounded-full shrink-0 h-7 w-7 p-0 text-muted hover:text-foreground"
							onPress={() => onEdit(folder)}
							aria-label="编辑文件夹"
						>
							<Pencil className="w-3.5 h-3.5" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						编辑文件夹名称与分类
					</Tooltip.Content>
				</Tooltip>
			</div>

			<div>
				<h2 className="text-lg font-bold text-foreground tracking-tight leading-snug break-all flex items-center gap-2">
					<FolderOpen className="w-5 h-5 text-accent shrink-0" />
					<span>{folder.name}</span>
				</h2>
			</div>

			{/* Folder Description Card */}
			<Card className="bg-surface-secondary/50 border-border/60 p-3 shadow-none">
				<p className="text-xs text-foreground/80 leading-relaxed break-words">
					{folder.desc || (
						<span className="text-muted italic">暂无文件夹描述信息</span>
					)}
				</p>
			</Card>

			{/* AI Dossier Button */}
			{onOpenDossier && folder.items.length > 0 && (
				<Button
					variant="secondary"
					size="sm"
					className="w-full flex items-center justify-center gap-1.5 text-xs font-medium rounded-xl bg-accent-soft text-accent border border-accent/30 py-2 h-9 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
					onPress={() => onOpenDossier(folder)}
				>
					<Sparkles className="w-3.5 h-3.5" />
					<span>🧠 一键生成专题全景综述与指南</span>
				</Button>
			)}
		</div>
	);
}
