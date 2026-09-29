import {
	Button,
	Description,
	InputGroup,
	Label,
	TextField,
	toast,
} from "@heroui/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import {
	AlertTriangle,
	Check,
	Copy,
	Database,
	FolderOpen,
	History,
	Loader2,
	Plus,
	RotateCcw,
	Server,
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

	// Local HTTP server status and connection info
	const [serverUrl, setServerUrl] = useState("http://127.0.0.1:3888");
	const [serverPort, setServerPort] = useState("3888");
	const [isCopied, setIsCopied] = useState(false);

	useEffect(() => {
		if (typeof window !== "undefined") {
			const origin = window.location.origin;
			const port =
				window.location.port ||
				(window.location.protocol === "https:" ? "443" : "80");
			setServerUrl(origin);
			setServerPort(port);
		}
	}, []);

	const handleCopyServerUrl = async () => {
		try {
			await navigator.clipboard.writeText(serverUrl);
			setIsCopied(true);
			toast.success("已复制本地服务地址到剪贴板");
			setTimeout(() => setIsCopied(false), 2000);
		} catch {
			toast.danger("复制失败，请手动复制");
		}
	};

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
		<div className="flex flex-col gap-6 pt-2">
			{/* Section 0: Local Server & Connection */}
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2">
					<Server className="w-4 h-4 shrink-0" />
					<span className="text-sm font-bold text-foreground">
						本地服务与外部连接 (Local Server)
					</span>
				</div>

				<div className="flex flex-col gap-3 pt-1">
					<div className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/70 bg-transparent">
						<div className="flex flex-col min-w-0">
							<div className="flex items-center gap-2">
								<span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground">
									<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
									服务运行中
								</span>
								{/* <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent font-medium">
									Port: {serverPort}
								</span> */}
							</div>
							<code className="text-sm truncate font-mono mt-0.5">
								{serverUrl}
							</code>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="rounded-lg"
							onPress={handleCopyServerUrl}
						>
							{isCopied ? (
								<Check className="w-3.5 h-3.5 text-emerald-500" />
							) : (
								<Copy className="w-3.5 h-3.5" />
							)}
							<span>{isCopied ? "已复制" : "复制地址"}</span>
						</Button>
					</div>

					{serverPort && serverPort !== "3888" && (
						<div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/20 text-warning text-[11px] leading-relaxed">
							<AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
							<span>
								默认端口 <strong>3888</strong> 被占用，当前服务运行在备用端口{" "}
								<strong>{serverPort}</strong>。若使用 AI Collector
								浏览器插件，请在插件「设置」中将服务地址同步更新为{" "}
								<code>{serverUrl}</code>。
							</span>
						</div>
					)}

					<p className="text-xs text-muted leading-relaxed">
						浏览器插件（AI
						Collector）及外部数据通道通过此端口与工作台通信。若需自定义或修改，可通过插件侧边栏的「设置」配置此地址。
					</p>
				</div>
			</div>

			{/* Section 1: Storage Location */}
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2">
					<Database className="w-4 h-4 shrink-0" />
					<span className="text-sm font-bold text-foreground">
						存储位置 (Storage)
					</span>
				</div>

				<div className="flex flex-col gap-3 pt-1">
					{/* SQLite database directory */}
					<TextField isReadOnly value={storageInfo?.dbPath ?? ""}>
						<Label className="text-xs font-medium text-foreground">
							SQLite 数据库路径
						</Label>
						<div className="flex items-center gap-2">
							<InputGroup className="flex-1 bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
								<InputGroup.Input
									type="text"
									readOnly
									placeholder="正在读取..."
									className="bg-transparent font-mono text-xs"
								/>
							</InputGroup>
							<Button
								type="button"
								variant="outline"
								className="rounded-lg"
								isDisabled={!storageInfo?.dbDir || isOpeningFolder}
								onPress={handleOpenDbFolder}
							>
								{isOpeningFolder ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<FolderOpen className="w-3.5 h-3.5" />
								)}
								<span>打开目录</span>
							</Button>
						</div>
					</TextField>

					{/* Files root directory */}
					<TextField
						value={filesRootDir}
						onChange={(val) => onFilesRootDirChange(val)}
					>
						<Label className="text-xs font-medium text-foreground">
							文件管理根目录 (filesRootDir)
						</Label>
						<div className="flex items-center gap-2">
							<InputGroup className="flex-1 bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
								<InputGroup.Input
									type="text"
									placeholder="留空则使用系统默认 ~/Downloads/ 目录，自定义请填写完整绝对路径"
									className="bg-transparent font-mono text-xs"
								/>
							</InputGroup>
							{filesRootDir.trim() ? (
								<Button
									type="button"
									variant="outline"
									className="rounded-lg"
									onPress={async () => {
										try {
											const res = await fetch("/api/open-file", {
												method: "POST",
												headers: { "Content-Type": "application/json" },
												body: JSON.stringify({ path: filesRootDir.trim() }),
											});
											const data = (await res.json()) as {
												success?: boolean;
												error?: string;
											};
											if (!res.ok || !data.success) {
												throw new Error(data.error || `HTTP ${res.status}`);
											}
											toast.success("已打开存储根目录");
										} catch (err) {
											toast.danger(
												`打开失败: ${err instanceof Error ? err.message : String(err)}`,
											);
										}
									}}
								>
									<FolderOpen className="w-3.5 h-3.5" />
									<span>打开目录</span>
								</Button>
							) : (
								<Button
									type="button"
									variant="ghost"
									className="rounded-lg"
									onPress={() => {
										onFilesRootDirChange("~/Downloads");
										toast.info("已填入常用 ~/Downloads 推荐路径");
									}}
								>
									<span>填入推荐</span>
								</Button>
							)}
						</div>
						<Description className="text-xs text-muted mt-2">
							视频将保存到{" "}
							<code className="text-foreground/80 font-mono">downloads/</code>
							，自媒体素材保存到{" "}
							<code className="text-foreground/80 font-mono">
								creator/materials/
							</code>
							，富文本媒体保存到{" "}
							<code className="text-foreground/80 font-mono">
								editor/documents/
							</code>
							。留空则自动默认存放于系统 Downloads 目录。
						</Description>
					</TextField>
				</div>
			</div>

			{/* Section 2: Backup & Restore */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Database className="w-4 h-4 shrink-0" />
							<span className="text-sm font-bold text-foreground">
								数据库备份与恢复 (Backups & Restore)
							</span>
						</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="rounded-lg"
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

				<div className="flex flex-col gap-3 pt-1">
					<p className="text-xs text-muted leading-relaxed">
						随时创建当前数据的快照备份。在执行任何「恢复」操作前，系统都会
						<strong className="text-foreground">
							先自动为当前数据创建备份
						</strong>
						，确保所有历史快照都在列表中，您可以随时在不同版本之间来回切换。
					</p>

					{/* Restore Confirmation Alert Box */}
					{confirmRestoreItem && (
						<div className="p-3.5 rounded-lg bg-warning/10 border border-warning/20 flex flex-col gap-2.5">
							<div className="flex items-start gap-2 text-xs text-warning-foreground dark:text-warning">
								<AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
								<div className="flex-1 leading-relaxed">
									确定恢复到快照{" "}
									<strong className="font-medium underline">
										{parseBackupLabel(confirmRestoreItem.filename)}
									</strong>{" "}
									吗？
									<div className="text-xs opacity-90 mt-0.5">
										系统在恢复前会
										<strong>自动对当前实时数据库进行完整备份</strong>
										，恢复后您可以随时再次切回当前状态	。
									</div>
								</div>
							</div>
							<div className="flex items-center justify-end gap-2 pt-1">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="rounded-lg"
									isDisabled={restoringFilename !== null}
									onPress={() => setConfirmRestoreItem(null)}
								>
									取消
								</Button>
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="rounded-lg"
									isDisabled={restoringFilename !== null}
									onPress={() => handleRestore(confirmRestoreItem)}
								>
									{restoringFilename ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : (
										<RotateCcw className="w-3.5 h-3.5" />
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
							<div className="py-6 text-center text-xs text-muted border border-dashed border-border rounded-lg">
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
										className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 hover:border-foreground/30 bg-transparent transition-colors text-xs gap-3"
									>
										<div className="flex items-center gap-2.5 min-w-0">
											<div className="w-7 h-7 rounded-lg border border-border/60 text-foreground flex items-center justify-center shrink-0">
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
												variant="outline"
												size="sm"
												className="rounded-lg"
												isDisabled={
													isRestoring ||
													isDeleting ||
													confirmRestoreItem?.filename === item.filename
												}
												onPress={() => setConfirmRestoreItem(item)}
											>
												{isRestoring ? (
													<Loader2 className="w-3.5 h-3.5 animate-spin" />
												) : (
													<RotateCcw className="w-3.5 h-3.5" />
												)}
												<span>恢复</span>
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												isIconOnly
												className="text-muted hover:text-danger rounded-lg"
												isDisabled={isRestoring || isDeleting}
												onPress={() => setConfirmDeleteItem(item)}
											>
												{isDeleting ? (
													<Loader2 className="w-3.5 h-3.5 animate-spin" />
												) : (
													<Trash2 className="w-3.5 h-3.5" />
												)}
											</Button>
										</div>
									</div>
								);
							})
						)}
					</div>
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
