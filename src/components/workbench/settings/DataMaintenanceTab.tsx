import { Button, Input, Label, TextField, toast } from "@heroui/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import {
	AlertTriangle,
	Database,
	FolderOpen,
	History,
	Loader2,
	Plus,
	RotateCcw,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
	BackupFileInfo,
	StorageInfo,
} from "../../../services/api/maintenanceClient";
import { WorkbenchStorageService } from "../../../services/workbenchStorage";
import { ConfirmDialog } from "../ConfirmDialog";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

interface DataMaintenanceTabProps {
	onDataRestored?: () => void;
	filesRootDir: string;
	onFilesRootDirChange: (value: string) => void;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseBackupLabel(filename: string): string {
	// Parse timestamp from workbench-YYYY-MM-DD_HH-mm-ss.db
	const match = filename.match(
		/workbench-(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})\.db/,
	);
	if (match) {
		const [, date, hour, minute, second] = match;
		return `${date} ${hour}:${minute}:${second}`;
	}
	return filename;
}

export function DataMaintenanceTab({
	onDataRestored,
	filesRootDir,
	onFilesRootDirChange,
}: DataMaintenanceTabProps) {
	const [backups, setBackups] = useState<BackupFileInfo[]>([]);
	const [isLoadingBackups, setIsLoadingBackups] = useState(false);
	const [isCreatingBackup, setIsCreatingBackup] = useState(false);
	const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
	const [isOpeningFolder, setIsOpeningFolder] = useState(false);
	const [restoringFilename, setRestoringFilename] = useState<string | null>(
		null,
	);
	const [confirmRestoreItem, setConfirmRestoreItem] =
		useState<BackupFileInfo | null>(null);
	const [confirmDeleteItem, setConfirmDeleteItem] =
		useState<BackupFileInfo | null>(null);
	const [deletingFilename, setDeletingFilename] = useState<string | null>(null);

	const loadBackups = useCallback(async () => {
		setIsLoadingBackups(true);
		try {
			const list = await WorkbenchStorageService.fetchBackupsList();
			setBackups(list);
		} catch (err) {
			console.error("[DataMaintenance] Failed to load backups:", err);
		} finally {
			setIsLoadingBackups(false);
		}
	}, []);

	useEffect(() => {
		loadBackups();
	}, [loadBackups]);

	useEffect(() => {
		WorkbenchStorageService.fetchStorageInfo()
			.then(setStorageInfo)
			.catch((err) =>
				console.error("[DataMaintenance] Failed to load storage info:", err),
			);
	}, []);

	const handleOpenDbFolder = async () => {
		if (!storageInfo?.dbDir) return;
		setIsOpeningFolder(true);
		try {
			const res = await fetch("/api/open-file", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: storageInfo.dbDir }),
			});
			const data = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok || !data.success) {
				throw new Error(data.error || `HTTP ${res.status}`);
			}
			toast.success("已打开数据库所在文件夹");
		} catch (err) {
			toast.danger(
				`打开文件夹失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setIsOpeningFolder(false);
		}
	};

	const handleCreateBackup = async () => {
		setIsCreatingBackup(true);
		try {
			const res = await WorkbenchStorageService.createBackup();
			setBackups(res.backups);
			toast.success("快照备份已成功创建");
		} catch (err) {
			toast.danger(
				`创建备份失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setIsCreatingBackup(false);
		}
	};

	const handleRestore = async (item: BackupFileInfo) => {
		setRestoringFilename(item.filename);
		try {
			await WorkbenchStorageService.restoreBackup(item.filename);
			toast.success("恢复成功！当前版本已自动备份为最新快照，您可以随时切回。");
			setConfirmRestoreItem(null);
			await loadBackups();
			onDataRestored?.();
		} catch (err) {
			toast.danger(
				`恢复失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setRestoringFilename(null);
		}
	};

	const handleDeleteBackup = async (filename: string) => {
		setDeletingFilename(filename);
		try {
			await WorkbenchStorageService.deleteBackup(filename);
			toast.success("备份已删除");
			setBackups((prev) => prev.filter((b) => b.filename !== filename));
			if (confirmRestoreItem?.filename === filename) {
				setConfirmRestoreItem(null);
			}
		} catch (err) {
			toast.danger(
				`删除失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setDeletingFilename(null);
		}
	};

	return (
		<div className="flex flex-col gap-6 pt-3">
			{/* Section 1: Storage Location */}
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2 pb-1 border-b border-border">
					<Database className="w-4 h-4 text-accent shrink-0" />
					<span className="font-semibold text-foreground text-xs">
						存储位置 (Storage)
					</span>
				</div>

				{/* SQLite database directory */}
				<div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-surface/60 border border-border">
					<div className="flex flex-col min-w-0">
						<span className="text-[11px] font-medium text-foreground">
							SQLite 数据库目录
						</span>
						<code className="text-[10px] text-muted truncate">
							{storageInfo?.dbPath ?? "正在读取..."}
						</code>
					</div>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="rounded-full flex items-center gap-1.5 cursor-pointer shrink-0 h-7 text-[11px]"
						isDisabled={!storageInfo?.dbDir || isOpeningFolder}
						onPress={handleOpenDbFolder}
					>
						{isOpeningFolder ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<FolderOpen className="w-3 h-3 text-accent" />
						)}
						<span>打开文件夹</span>
					</Button>
				</div>

				{/* Files root directory (stored in SQLite workbench_settings) */}
				<TextField
					value={filesRootDir}
					onChange={onFilesRootDirChange}
					className="w-full"
				>
					<Label>文件管理根目录 (filesRootDir)</Label>
					<Input
						placeholder="留空则使用系统默认下载目录，自定义请填写完整绝对路径"
						variant="secondary"
					/>
				</TextField>
				<p className="text-[11px] text-muted leading-relaxed -mt-1.5">
					自定义请填写完整的本机绝对路径（例如 macOS/Linux:{" "}
					<code className="text-foreground/80 font-mono">
						/Users/用户名/Downloads
					</code>
					，Windows:{" "}
					<code className="text-foreground/80 font-mono">
						C:\Users\用户名\Downloads
					</code>
					）。留空则使用系统默认下载目录。视频将保存到
					downloads/，自媒体素材保存到 creator/materials/，富文本媒体保存到
					editor/documents/。
				</p>
			</div>

			{/* Section 2: Backup & Restore */}
			<div className="flex flex-col gap-3">
				<div className="flex items-center justify-between pb-1 border-b border-border">
					<div className="flex items-center gap-2">
						<Database className="w-4 h-4 text-accent shrink-0" />
						<span className="font-semibold text-foreground text-xs">
							数据库备份与恢复 (Backups & Restore)
						</span>
					</div>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="rounded-full flex items-center gap-1.5 cursor-pointer"
						isDisabled={isCreatingBackup}
						onPress={handleCreateBackup}
					>
						{isCreatingBackup ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Plus className="w-3.5 h-3.5" />
						)}
						<span>立即创建备份</span>
					</Button>
				</div>

				<p className="text-[11px] text-muted leading-relaxed">
					随时创建当前数据的快照备份。在执行任何「恢复」操作前，系统都会
					<strong className="text-foreground">先自动为当前数据创建备份</strong>
					，确保所有历史快照都在列表中，您可以随时在不同版本之间来回切换。
				</p>

				{/* Restore Confirmation Alert Box */}
				{confirmRestoreItem && (
					<div className="p-3.5 rounded-2xl bg-warning/10 border border-warning/20 flex flex-col gap-2.5">
						<div className="flex items-start gap-2 text-xs text-warning-foreground dark:text-warning">
							<AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
							<div className="flex-1 leading-relaxed">
								确定恢复到快照{" "}
								<strong className="font-medium underline">
									{parseBackupLabel(confirmRestoreItem.filename)}
								</strong>{" "}
								吗？
								<div className="text-[11px] opacity-90 mt-0.5">
									系统在恢复前会
									<strong>自动对当前实时数据库进行完整备份</strong>
									，恢复后您可以随时再次切回当前状态。
								</div>
							</div>
						</div>
						<div className="flex items-center justify-end gap-2 pt-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full cursor-pointer h-7 text-xs"
								isDisabled={restoringFilename !== null}
								onPress={() => setConfirmRestoreItem(null)}
							>
								取消
							</Button>
							<Button
								type="button"
								variant="primary"
								size="sm"
								className="rounded-full flex items-center gap-1 cursor-pointer h-7 text-xs"
								isDisabled={restoringFilename !== null}
								onPress={() => handleRestore(confirmRestoreItem)}
							>
								{restoringFilename ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : (
									<RotateCcw className="w-3 h-3" />
								)}
								<span>{restoringFilename ? "恢复中..." : "确认恢复"}</span>
							</Button>
						</div>
					</div>
				)}

				{/* Backups List */}
				<div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
					{isLoadingBackups && backups.length === 0 ? (
						<div className="py-6 flex items-center justify-center text-xs text-muted gap-2">
							<Loader2 className="w-4 h-4 animate-spin" />
							<span>正在读取备份列表...</span>
						</div>
					) : backups.length === 0 ? (
						<div className="py-6 text-center text-xs text-muted bg-surface/50 border border-dashed border-border rounded-xl">
							暂无备份快照，可点击上方「立即创建备份」生成首个快照
						</div>
					) : (
						backups.map((item) => {
							const formattedDate = parseBackupLabel(item.filename);
							const relativeDate = dayjs(item.createdAt).fromNow();
							const isRestoring = restoringFilename === item.filename;
							const isDeleting = deletingFilename === item.filename;

							return (
								<div
									key={item.filename}
									className="flex items-center justify-between p-2.5 rounded-xl bg-surface/60 border border-border hover:border-accent/30 transition-colors text-xs gap-3"
								>
									<div className="flex items-center gap-2.5 min-w-0">
										<div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
											<History className="w-3.5 h-3.5" />
										</div>
										<div className="flex flex-col min-w-0">
											<div className="font-medium text-foreground truncate">
												{formattedDate}
											</div>
											<div className="text-[10px] text-muted flex items-center gap-2">
												<span>{relativeDate}</span>
												<span>•</span>
												<span>{formatBytes(item.size)}</span>
											</div>
										</div>
									</div>

									<div className="flex items-center gap-1.5 shrink-0">
										<Button
											type="button"
											variant="secondary"
											size="sm"
											className="rounded-full flex items-center gap-1 h-7 text-[11px] cursor-pointer"
											isDisabled={
												isRestoring ||
												isDeleting ||
												confirmRestoreItem?.filename === item.filename
											}
											onPress={() => setConfirmRestoreItem(item)}
										>
											{isRestoring ? (
												<Loader2 className="w-3 h-3 animate-spin" />
											) : (
												<RotateCcw className="w-3 h-3 text-accent" />
											)}
											<span>恢复</span>
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="rounded-full w-7 h-7 p-0 flex items-center justify-center text-muted hover:text-danger cursor-pointer"
											isDisabled={isRestoring || isDeleting}
											onPress={() => setConfirmDeleteItem(item)}
										>
											{isDeleting ? (
												<Loader2 className="w-3 h-3 animate-spin" />
											) : (
												<Trash2 className="w-3 h-3" />
											)}
										</Button>
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>

			{/* Backup deletion confirmation */}
			<ConfirmDialog
				isOpen={!!confirmDeleteItem}
				onOpenChange={(open) => {
					if (!open) setConfirmDeleteItem(null);
				}}
				title="删除备份快照"
				description={
					confirmDeleteItem ? (
						<span>
							确定要删除快照备份{" "}
							<strong className="font-semibold text-foreground">
								{parseBackupLabel(confirmDeleteItem.filename)}
							</strong>{" "}
							吗？此操作将永久移除该备份文件，无法撤销。
						</span>
					) : undefined
				}
				confirmLabel="确认删除"
				onConfirm={async () => {
					if (confirmDeleteItem) {
						await handleDeleteBackup(confirmDeleteItem.filename);
					}
				}}
			/>
		</div>
	);
}
