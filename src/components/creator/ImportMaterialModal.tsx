import { Button, Input, Modal, toast } from "@heroui/react";
import {
	CheckCircle2,
	FileUp,
	FolderUp,
	HardDrive,
	Loader2,
	Plus,
	X,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	importLocalPathsAsMaterialsRpc,
	pickLocalPathsRpc,
} from "../../services/api/creatorClient";

interface ImportMaterialModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** 导入目标文件夹（null = 未归档） */
	folderId: number | null;
	folderName?: string;
	onImported: () => Promise<void>;
}

/**
 * 素材导入弹窗（原位引用零拷贝版）：
 * 唤起系统访达多选文件或选择文件夹，直接将绝对路径写入数据库索引，
 * 绝不复制或移动本地原始大文件，支持超大视频秒级导入。
 */
export function ImportMaterialModal({
	isOpen,
	onClose,
	folderId,
	folderName,
	onImported,
}: ImportMaterialModalProps) {
	const [paths, setPaths] = useState<string[]>([]);
	const [manualPath, setManualPath] = useState("");
	const [importing, setImporting] = useState(false);
	const [pickingMode, setPickingMode] = useState<"files" | "directory" | null>(
		null,
	);

	useEffect(() => {
		if (isOpen) {
			setPaths([]);
			setManualPath("");
			setImporting(false);
			setPickingMode(null);
		}
	}, [isOpen]);

	/** 唤起系统原生文件管理器选择文件 */
	const handlePickFiles = async () => {
		setPickingMode("files");
		try {
			const picked = await pickLocalPathsRpc("files");
			if (picked.length > 0) {
				setPaths((prev) => Array.from(new Set([...prev, ...picked])));
			}
		} catch (err) {
			toast.danger(
				`唤起系统选择器失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setPickingMode(null);
		}
	};

	/** 唤起系统原生文件管理器选择文件夹 */
	const handlePickDirectory = async () => {
		setPickingMode("directory");
		try {
			const picked = await pickLocalPathsRpc("directory");
			if (picked.length > 0) {
				setPaths((prev) => Array.from(new Set([...prev, ...picked])));
			}
		} catch (err) {
			toast.danger(
				`唤起系统选择器失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setPickingMode(null);
		}
	};

	/** 手动追加路径输入 */
	const handleAddManualPath = () => {
		const raw = manualPath.trim();
		if (!raw) return;
		setPaths((prev) => Array.from(new Set([...prev, raw])));
		setManualPath("");
	};

	/** 移除单个选中路径 */
	const handleRemovePath = (index: number) => {
		setPaths((prev) => prev.filter((_, i) => i !== index));
	};

	/** 执行零拷贝导入 */
	const handleImport = async () => {
		const toImport = [...paths];
		if (manualPath.trim()) {
			toImport.push(manualPath.trim());
		}
		if (toImport.length === 0) return;

		setImporting(true);
		try {
			const { imported } = await importLocalPathsAsMaterialsRpc({
				paths: toImport,
				folderId,
			});
			toast.success(`已原位引用导入 ${imported} 个素材（零拷贝）`);
			onClose();
			await onImported();
		} catch (err) {
			toast.danger(
				`导入失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setImporting(false);
		}
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog
					aria-label="导入素材"
					className="!max-w-xl w-full max-h-[88vh] flex flex-col"
				>
					<Modal.CloseTrigger />
					<Modal.Header className="shrink-0">
						<div className="flex items-center gap-2">
							<Modal.Heading>导入素材</Modal.Heading>
							<span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
								<Zap className="w-3 h-3" />
								原位引用 · 零拷贝
							</span>
						</div>
						<p className="text-[11px] text-muted mt-1">
							{folderName
								? `导入后归入文件夹「${folderName}」`
								: "导入后放入「未归档」，仅记录文件原始路径，不消耗多余磁盘空间"}
						</p>
					</Modal.Header>

					<Modal.Body className="flex-1 min-h-0 flex flex-col gap-3 mt-2">
						{/* 操作面板 */}
						<div className="rounded-2xl border border-border/70 bg-surface/50 p-5 flex flex-col items-center gap-3.5 text-center">
							<div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center">
								<HardDrive className="w-5 h-5" />
							</div>
							<div>
								<p className="text-xs font-medium text-foreground">
									选择本地文件或目录
								</p>
								<p className="text-[11px] text-muted mt-0.5">
									音视频、图片、Markdown、文档均可，自动提取并索引，秒级完成
								</p>
							</div>

							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm"
									isDisabled={pickingMode !== null || importing}
									onPress={() => void handlePickFiles()}
								>
									{pickingMode === "files" ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : (
										<FileUp className="w-3.5 h-3.5 text-accent" />
									)}
									选择文件（多选）
								</Button>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm"
									isDisabled={pickingMode !== null || importing}
									onPress={() => void handlePickDirectory()}
								>
									{pickingMode === "directory" ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : (
										<FolderUp className="w-3.5 h-3.5 text-amber-500" />
									)}
									选择文件夹
								</Button>
							</div>
						</div>

						{/* 手动输入本地路径补充 */}
						<div className="flex items-center gap-2">
							<Input
								value={manualPath}
								onChange={(e) => setManualPath(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleAddManualPath();
									}
								}}
								placeholder="或直接粘贴本地文件/文件夹绝对路径…"
								className="text-xs flex-1"
							/>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								className="shrink-0"
								isDisabled={!manualPath.trim() || importing}
								onPress={handleAddManualPath}
							>
								<Plus className="w-3.5 h-3.5" />
								添加
							</Button>
						</div>

						{/* 待导入路径列表 */}
						{paths.length > 0 ? (
							<div className="flex-1 min-h-0 flex flex-col gap-1.5">
								<div className="flex items-center justify-between text-[11px] text-muted px-1">
									<span>已选路径（{paths.length}）</span>
									<button
										type="button"
										onClick={() => setPaths([])}
										className="text-muted hover:text-foreground text-[10px] cursor-pointer"
									>
										清空
									</button>
								</div>
								<ul className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 pr-1 border border-border/60 rounded-xl p-1.5 bg-surface/30">
									{paths.map((p, index) => (
										<li
											key={p}
											className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/40 bg-surface/70 group"
										>
											<HardDrive className="w-3.5 h-3.5 text-muted shrink-0" />
											<span
												className="flex-1 min-w-0 text-xs text-foreground font-mono truncate"
												title={p}
											>
												{p}
											</span>
											<button
												type="button"
												title="移除"
												onClick={() => handleRemovePath(index)}
												className="p-0.5 rounded text-muted hover:text-danger opacity-70 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
											>
												<X className="w-3 h-3" />
											</button>
										</li>
									))}
								</ul>
							</div>
						) : (
							<div className="flex-1 min-h-[80px] flex items-center justify-center border border-dashed border-border/60 rounded-xl bg-surface/20 text-muted text-xs">
								尚未选择文件或目录路径
							</div>
						)}

						{/* 底部按钮栏 */}
						<div className="shrink-0 flex items-center justify-between pt-2 border-t border-border/40">
							<span className="text-[10px] text-muted">
								{paths.length > 0 ? `已就绪 ${paths.length} 项路径` : ""}
							</span>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="tertiary"
									size="sm"
									onPress={onClose}
									isDisabled={importing}
								>
									取消
								</Button>
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm"
									isDisabled={paths.length === 0 && !manualPath.trim()}
									onPress={() => void handleImport()}
								>
									{importing ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : (
										<CheckCircle2 className="w-3.5 h-3.5" />
									)}
									{importing
										? "索引导入中…"
										: `确认导入${paths.length > 0 ? ` (${paths.length})` : ""}`}
								</Button>
							</div>
						</div>
					</Modal.Body>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
