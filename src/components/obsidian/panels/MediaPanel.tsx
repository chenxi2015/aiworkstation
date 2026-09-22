import { Tooltip, toast } from "@heroui/react";
import { ChevronLeft, ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import { Fragment, useCallback, useState } from "react";
import {
	deleteVaultEntryRpc,
	openVaultEntryRpc,
} from "../../../services/api/obsidianClient";
import {
	DeleteEntryDialog,
	shouldSkipDeleteConfirm,
} from "../DeleteEntryDialog";
import { type VaultFileCategory, vaultAssetUrl } from "../utils/vaultFileUtils";

export interface MediaPanelProps {
	relPath: string;
	category: Extract<VaultFileCategory, "image" | "video" | "audio" | "pdf">;
	onMutated: () => void;
	onDeleted: () => void;
	canGoBack?: boolean;
	canGoForward?: boolean;
	onBack?: () => void;
	onForward?: () => void;
	onSelectFolder?: (dir: string) => void;
}

/**
 * 媒体查看器：图片/视频/音频/PDF 在面板内直接展示，
 * 二进制内容走 /api/obsidian/asset 流式回读，不进 CodeMirror 文本模型。
 */
export function MediaPanel({
	relPath,
	category,
	onMutated,
	onDeleted,
	canGoBack,
	canGoForward,
	onBack,
	onForward,
	onSelectFolder,
}: MediaPanelProps) {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const fileName = relPath.split("/").pop() ?? relPath;
	const src = vaultAssetUrl(relPath);

	const performDelete = useCallback(async () => {
		const res = await deleteVaultEntryRpc(relPath);
		if (!res.success) {
			toast.danger(res.error ?? "删除失败");
			return;
		}
		toast.success("已移动到系统回收站");
		onMutated();
		onDeleted();
	}, [relPath, onMutated, onDeleted]);

	const handleDelete = useCallback(() => {
		if (shouldSkipDeleteConfirm()) {
			void performDelete();
			return;
		}
		setDeleteOpen(true);
	}, [performDelete]);

	const handleOpenExternal = useCallback(async () => {
		const res = await openVaultEntryRpc(relPath);
		if (res.success) {
			toast.success(`已在系统默认应用中打开「${fileName}」`);
		} else {
			toast.danger(res.error || `打开文件「${fileName}」失败`);
		}
	}, [relPath, fileName]);

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
				<div className="flex items-center shrink-0">
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								aria-label="返回"
								onClick={onBack}
								disabled={!canGoBack}
								className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
							>
								<ChevronLeft className="w-4 h-4" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content placement="bottom">返回</Tooltip.Content>
					</Tooltip>
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								aria-label="前进"
								onClick={onForward}
								disabled={!canGoForward}
								className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
							>
								<ChevronRight className="w-4 h-4" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content placement="bottom">前进</Tooltip.Content>
					</Tooltip>
				</div>
				<div className="flex-1 min-w-0 flex justify-center px-2">
					<nav
						className="flex items-center min-w-0 max-w-full text-xs text-muted"
						title={relPath}
					>
						{relPath
							.split("/")
							.slice(0, -1)
							.map((seg, i, arr) => (
								<Fragment key={arr.slice(0, i + 1).join("/")}>
									<button
										type="button"
										onClick={() =>
											onSelectFolder?.(arr.slice(0, i + 1).join("/"))
										}
										className="shrink-0 max-w-36 truncate px-1 py-0.5 rounded hover:text-foreground hover:bg-surface-secondary/60 transition-colors"
									>
										{seg}
									</button>
									<span className="shrink-0 text-muted/50">/</span>
								</Fragment>
							))}
						<span className="min-w-0 truncate px-1 py-0.5 text-foreground font-medium">
							{fileName}
						</span>
					</nav>
				</div>
				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							aria-label="在系统应用中打开"
							onClick={() => void handleOpenExternal()}
							className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors shrink-0"
						>
							<ExternalLink className="w-3.5 h-3.5" />
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content placement="bottom">在系统应用中打开</Tooltip.Content>
				</Tooltip>
				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							aria-label="删除文件"
							onClick={handleDelete}
							className="p-1.5 rounded-md text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content placement="bottom">删除</Tooltip.Content>
				</Tooltip>
			</div>
			<div className="flex-1 overflow-hidden bg-surface/40 dark:bg-black/20">
				{category === "image" && (
					<div className="h-full overflow-auto flex items-center justify-center p-4">
						<img
							src={src}
							alt={fileName}
							className="max-w-full max-h-full object-contain select-none"
							draggable={false}
						/>
					</div>
				)}
				{category === "video" && (
					<div className="h-full flex items-center justify-center p-4">
						{/* biome-ignore lint/a11y/useMediaCaption: 本地 Vault 视频无字幕轨 */}
						<video src={src} controls className="max-w-full max-h-full" />
					</div>
				)}
				{category === "audio" && (
					<div className="h-full flex flex-col items-center justify-center gap-4 p-8">
						<p className="text-sm text-foreground/80 truncate max-w-full">
							{fileName}
						</p>
						{/* biome-ignore lint/a11y/useMediaCaption: 本地 Vault 音频无字幕轨 */}
						<audio src={src} controls className="w-full max-w-md" />
					</div>
				)}
				{category === "pdf" && (
					<iframe
						src={src}
						title={fileName}
						className="w-full h-full border-0"
					/>
				)}
			</div>
			<DeleteEntryDialog
				target={deleteOpen ? { name: fileName, kind: "file" } : null}
				onClose={() => setDeleteOpen(false)}
				onConfirm={performDelete}
			/>
		</div>
	);
}
