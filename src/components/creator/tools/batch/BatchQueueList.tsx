import {
	AlertCircle,
	CheckCircle2,
	ExternalLink,
	FileImage,
	FolderSearch,
	Loader2,
	MinusCircle,
	RotateCcw,
	X,
} from "lucide-react";
import type { BatchItem } from "./types";

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface BatchQueueListProps {
	items: BatchItem[];
	isRunning: boolean;
	onRemoveItem: (id: string) => void;
	onClear: () => void;
	/** Open the item output (blob preview or disk file) */
	onOpenItem?: (item: BatchItem) => void;
	/** Reveal the item location in the OS file manager */
	onRevealItem?: (item: BatchItem) => void;
	/** Resolve the revealable absolute path for an item (undefined = no button) */
	getRevealTarget?: (item: BatchItem) => string | undefined;
}

function SavingsBadge({ item }: { item: BatchItem }) {
	if (item.status !== "done" || !item.output || item.size <= 0) return null;
	const diff = item.size - item.output.size;
	if (diff <= 0) {
		return (
			<span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/10 text-muted">
				已最小
			</span>
		);
	}
	const pct = Math.round((diff / item.size) * 100);
	return (
		<span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
			-{pct}%
		</span>
	);
}

function StatusIcon({ item }: { item: BatchItem }) {
	switch (item.status) {
		case "processing":
			return (
				<Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />
			);
		case "done":
			return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
		case "error":
			return <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
		case "skipped":
			return <MinusCircle className="w-3.5 h-3.5 text-muted shrink-0" />;
		default:
			return (
				<span className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
			);
	}
}

/** Scrollable batch queue with per-item status, size delta, and row actions. */
export function BatchQueueList({
	items,
	isRunning,
	onRemoveItem,
	onClear,
	onOpenItem,
	onRevealItem,
	getRevealTarget,
}: BatchQueueListProps) {
	if (items.length === 0) {
		return (
			<div className="p-5 rounded-xl border border-border bg-surface flex-1 flex flex-col items-center justify-center text-center min-h-64">
				<FileImage className="w-8 h-8 text-muted/40 mb-2" />
				<p className="text-xs text-muted">批量队列是空的</p>
				<p className="text-[11px] text-muted/70 mt-1">
					拖入文件或文件夹后，这里会显示每个文件的处理状态
				</p>
			</div>
		);
	}

	return (
		<div className="p-4 rounded-xl border border-border bg-surface flex-1 flex flex-col min-h-64 overflow-hidden">
			<div className="flex items-center justify-between pb-2.5 border-b border-border/50 mb-2 shrink-0">
				<span className="text-xs font-bold text-foreground">
					批量队列 · {items.length} 个文件
				</span>
				<button
					type="button"
					onClick={onClear}
					disabled={isRunning}
					className="text-[11px] text-muted hover:text-foreground flex items-center gap-1 cursor-pointer disabled:opacity-50"
				>
					<RotateCcw className="w-3 h-3" />
					清空队列
				</button>
			</div>

			<div className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-1">
				{items.map((item) => (
					<div
						key={item.id}
						className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/5 group"
					>
						<StatusIcon item={item} />
						<div className="flex-1 min-w-0">
							<p
								className="text-xs text-foreground truncate"
								title={item.relativePath}
							>
								{item.relativePath}
							</p>
							<div className="flex items-center gap-1.5 mt-0.5">
								<span className="text-[10px] text-muted font-mono">
									{formatBytes(item.size)}
								</span>
								{item.output && (
									<>
										<span className="text-[10px] text-muted">→</span>
										<span className="text-[10px] text-foreground font-mono">
											{formatBytes(item.output.size)}
										</span>
										{item.output.filename !== item.name && (
											<span className="text-[10px] text-accent font-mono">
												{item.output.filename}
											</span>
										)}
									</>
								)}
								<SavingsBadge item={item} />
							</div>
							{item.status === "error" && item.error && (
								<p
									className="text-[10px] text-red-500 mt-0.5 truncate"
									title={item.error}
								>
									{item.error}
								</p>
							)}
						</div>
						<div className="flex items-center gap-0.5 shrink-0">
							{onOpenItem && (
								<button
									type="button"
									onClick={() => onOpenItem(item)}
									className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent p-1 cursor-pointer transition-opacity"
									title={item.status === "done" ? "打开产物" : "打开原图"}
								>
									<ExternalLink className="w-3.5 h-3.5" />
								</button>
							)}
							{onRevealItem && getRevealTarget?.(item) && (
								<button
									type="button"
									onClick={() => onRevealItem(item)}
									className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent p-1 cursor-pointer transition-opacity"
									title="打开所在目录"
								>
									<FolderSearch className="w-3.5 h-3.5" />
								</button>
							)}
							{!isRunning && (
								<button
									type="button"
									onClick={() => onRemoveItem(item.id)}
									className="opacity-0 group-hover:opacity-100 text-muted hover:text-foreground p-1 cursor-pointer transition-opacity"
									title="从队列移除"
								>
									<X className="w-3.5 h-3.5" />
								</button>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
