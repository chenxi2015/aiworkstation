import { Button, Modal } from "@heroui/react";
import { ArrowUp, BadgeCheck, Folder, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	type LocalDirListing,
	listLocalDirectoriesRpc,
} from "../../services/api/obsidianClient";

export interface DirectoryPickerModalProps {
	/** 打开时的起始目录；为空从主目录开始 */
	initialPath?: string;
	/** 弹窗标题（默认「选择 Obsidian Vault 目录」） */
	title?: string;
	onSelect: (path: string) => void;
	onClose: () => void;
}

/** 常用快捷跳转目录 */
const SHORTCUTS: Array<{ label: string; path: string }> = [
	{ label: "主目录", path: "~" },
	{ label: "文稿", path: "~/Documents" },
	{ label: "桌面", path: "~/Desktop" },
	{ label: "下载", path: "~/Downloads" },
];

/** 本机目录选择弹窗：服务端列目录，点击下钻，含 Vault 自动识别标记 */
export function DirectoryPickerModal({
	initialPath,
	title,
	onSelect,
	onClose,
}: DirectoryPickerModalProps) {
	const [listing, setListing] = useState<LocalDirListing | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const navigate = useCallback(async (dirPath?: string) => {
		setLoading(true);
		setError(null);
		const res = await listLocalDirectoriesRpc(dirPath);
		if (res.success) {
			setListing(res);
		} else {
			setError(res.error ?? "读取目录失败");
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		navigate(initialPath?.trim() || undefined);
	}, [initialPath, navigate]);

	return (
		<Modal.Backdrop
			isOpen
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
			className="z-60"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog
					aria-label={title ?? "选择 Obsidian Vault 目录"}
					className="w-full max-w-lg max-h-[80vh] flex flex-col"
				>
					<Modal.CloseTrigger />
					<Modal.Header className="shrink-0">
						<Modal.Heading>{title ?? "选择 Obsidian Vault 目录"}</Modal.Heading>
					</Modal.Header>

					<Modal.Body className="flex flex-col flex-1 min-h-0 gap-2">
						<div className="flex items-center gap-1.5 flex-wrap shrink-0">
							{SHORTCUTS.map((s) => (
								<Button
									key={s.path}
									variant="secondary"
									size="sm"
									onPress={() => navigate(s.path)}
									className="rounded-full h-6 px-2.5 text-[10px] font-medium"
								>
									{s.label}
								</Button>
							))}
						</div>

						<div className="flex items-center gap-2 py-1.5 border-y border-border shrink-0">
							<button
								type="button"
								onClick={() => listing?.parent && navigate(listing.parent)}
								disabled={!listing?.parent || loading}
								className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 shrink-0"
								title="返回上级目录"
							>
								<ArrowUp className="w-3.5 h-3.5" />
							</button>
							<span
								className="text-[11px] font-mono text-muted truncate flex-1"
								title={listing?.path}
							>
								{listing?.path || "…"}
							</span>
							{listing?.currentIsVault && (
								<span className="flex items-center gap-1 text-[10px] text-success shrink-0">
									<BadgeCheck className="w-3.5 h-3.5" />
									当前目录是 Vault
								</span>
							)}
						</div>

						<div className="flex-1 overflow-y-auto min-h-48">
							{loading ? (
								<div className="h-48 flex items-center justify-center text-muted">
									<Loader2 className="w-5 h-5 animate-spin" />
								</div>
							) : error ? (
								<p className="px-5 py-8 text-center text-xs text-danger">
									{error}
								</p>
							) : listing && listing.dirs.length > 0 ? (
								listing.dirs.map((dir) => (
									<button
										key={dir.path}
										type="button"
										onClick={() => navigate(dir.path)}
										className="w-full flex items-center gap-2 px-5 py-2 text-left text-xs text-foreground/80 hover:bg-surface-secondary/60 transition-colors"
										title={dir.path}
									>
										<Folder className="w-3.5 h-3.5 shrink-0 text-muted group-hover:text-foreground/80" />
										<span className="truncate flex-1">{dir.name}</span>
										{dir.isVault && (
											<span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/30 shrink-0">
												<BadgeCheck className="w-2.5 h-2.5" />
												Vault
											</span>
										)}
									</button>
								))
							) : (
								<p className="px-5 py-8 text-center text-[11px] text-muted">
									此目录下没有子文件夹
								</p>
							)}
						</div>
					</Modal.Body>

					<Modal.Footer className="flex justify-end gap-2 shrink-0">
						<Button variant="secondary" size="sm" onPress={onClose}>
							取消
						</Button>
						<Button
							variant="primary"
							size="sm"
							isDisabled={!listing || loading}
							onPress={() => listing && onSelect(listing.path)}
						>
							选择此目录
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
