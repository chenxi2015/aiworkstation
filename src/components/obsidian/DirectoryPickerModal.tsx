import { ArrowUp, BadgeCheck, Folder, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	type LocalDirListing,
	listLocalDirectoriesRpc,
} from "../../services/api/obsidianClient";

export interface DirectoryPickerModalProps {
	/** 打开时的起始目录；为空从主目录开始 */
	initialPath?: string;
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
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
			<div className="bg-surface dark:bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
				<div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
					<h3 className="text-sm font-semibold text-foreground">
						选择 Obsidian Vault 目录
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border flex-wrap">
					{SHORTCUTS.map((s) => (
						<button
							key={s.path}
							type="button"
							onClick={() => navigate(s.path)}
							className="px-2.5 py-1 rounded-full text-[10px] font-medium border border-border bg-surface-secondary/40 text-foreground/70 hover:bg-surface-secondary/70 transition-colors"
						>
							{s.label}
						</button>
					))}
				</div>

				<div className="flex items-center gap-2 px-4 py-2 border-b border-border">
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

				<div className="flex-1 overflow-y-auto py-1.5 min-h-48">
					{loading ? (
						<div className="h-48 flex items-center justify-center text-muted">
							<Loader2 className="w-5 h-5 animate-spin" />
						</div>
					) : error ? (
						<p className="px-5 py-8 text-center text-xs text-danger">{error}</p>
					) : listing && listing.dirs.length > 0 ? (
						listing.dirs.map((dir) => (
							<button
								key={dir.path}
								type="button"
								onClick={() => navigate(dir.path)}
								className="w-full flex items-center gap-2 px-5 py-2 text-left text-xs text-foreground/80 hover:bg-surface-secondary/60 transition-colors"
								title={dir.path}
							>
								<Folder className="w-3.5 h-3.5 shrink-0 text-accent/80" />
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

				<div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border">
					<button
						type="button"
						onClick={onClose}
						className="px-3.5 py-1.5 rounded-lg border border-border text-xs text-foreground/70 hover:bg-surface-secondary/60 transition-colors"
					>
						取消
					</button>
					<button
						type="button"
						onClick={() => listing && onSelect(listing.path)}
						disabled={!listing || loading}
						className="px-3.5 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
					>
						选择此目录
					</button>
				</div>
			</div>
		</div>
	);
}
