import { Button, Modal, ProgressBar, toast } from "@heroui/react";
import {
	AlertTriangle,
	CheckCircle2,
	ExternalLink,
	Globe,
	Link2Off,
	Loader2,
	Radar,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeadLinkItem } from "../../server/maintenance";
import { WorkbenchStorageService } from "../../services/workbenchStorage";
import { ConfirmDialog } from "./ConfirmDialog";

interface DeadLinksModalProps {
	isOpen: boolean;
	onClose: () => void;
	onDataChanged?: () => void;
}

type ScanPhase = "idle" | "scanning" | "done" | "deleting";

/**
 * Dead link cleanup modal:
 * 1. Starts an async server-side scan job (concurrent URL probing)
 * 2. Polls progress and lists confirmed dead links
 * 3. Lets the user selectively batch-delete them
 */
export function DeadLinksModal({
	isOpen,
	onClose,
	onDataChanged,
}: DeadLinksModalProps) {
	const [phase, setPhase] = useState<ScanPhase>("idle");
	const [total, setTotal] = useState(0);
	const [checked, setChecked] = useState(0);
	const [items, setItems] = useState<DeadLinkItem[]>([]);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [lastScanAt, setLastScanAt] = useState<string | null>(null);
	const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const stopPolling = useCallback(() => {
		if (pollTimerRef.current) {
			clearInterval(pollTimerRef.current);
			pollTimerRef.current = null;
		}
	}, []);

	const reset = useCallback(() => {
		stopPolling();
		setPhase("idle");
		setTotal(0);
		setChecked(0);
		setItems([]);
		setSelectedIds(new Set());
		setLastScanAt(null);
	}, [stopPolling]);

	useEffect(() => {
		if (!isOpen) {
			reset();
			return stopPolling;
		}
		// Restore the last completed scan snapshot so reopening the modal
		// keeps the previous results instead of forcing a fresh scan.
		let cancelled = false;
		WorkbenchStorageService.getLastDeadLinkScan()
			.then((job) => {
				if (cancelled || !job || job.items.length === 0) return;
				setTotal(job.total);
				setChecked(job.checked);
				setItems(job.items);
				setLastScanAt(job.finishedAt ?? job.startedAt);
				setSelectedIds(
					new Set(
						job.items
							.filter((item) => item.status === "dead")
							.map((item) => item.id),
					),
				);
				setPhase("done");
			})
			.catch(() => {
				// snapshot unavailable; stay on the idle view
			});
		return () => {
			cancelled = true;
			stopPolling();
		};
	}, [isOpen, reset, stopPolling]);

	const handleStartScan = useCallback(async () => {
		setPhase("scanning");
		setItems([]);
		setChecked(0);
		setSelectedIds(new Set());
		try {
			const { jobId, total: jobTotal } =
				await WorkbenchStorageService.startDeadLinkScan();
			setTotal(jobTotal);
			if (jobTotal === 0) {
				setPhase("done");
				return;
			}
			stopPolling();
			pollTimerRef.current = setInterval(async () => {
				try {
					const job =
						await WorkbenchStorageService.getDeadLinkScanStatus(jobId);
					if (!job) {
						stopPolling();
						setPhase("done");
						return;
					}
					setChecked(job.checked);
					if (job.done) {
						stopPolling();
						setItems(job.items);
						setLastScanAt(job.finishedAt ?? job.startedAt);
						setSelectedIds(
							new Set(
								job.items
									.filter((item) => item.status === "dead")
									.map((item) => item.id),
							),
						);
						setPhase("done");
					}
				} catch {
					// transient polling error; keep polling
				}
			}, 1000);
		} catch (err) {
			setPhase("idle");
			toast.danger(
				`启动检测失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, [stopPolling]);

	const deadItems = items.filter((item) => item.status === "dead");
	const unknownItems = items.filter((item) => item.status === "unknown");
	const aliveCount = items.filter((item) => item.status === "alive").length;

	const toggleItem = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

	const handleDeleteSelected = useCallback(async () => {
		if (selectedIds.size === 0) return;
		setPhase("deleting");
		try {
			const { deleted } = await WorkbenchStorageService.deleteItemsBatchInDb(
				Array.from(selectedIds),
			);
			toast.success(`已清理 ${deleted} 条失效链接`);
			onDataChanged?.();
			onClose();
		} catch (err) {
			setPhase("done");
			toast.danger(
				`删除失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, [selectedIds, onDataChanged, onClose]);

	const progressValue = total > 0 ? Math.round((checked / total) * 100) : 0;

	return (
		<>
			<Modal.Backdrop
				isOpen={isOpen}
				onOpenChange={(open) => !open && phase !== "deleting" && onClose()}
				variant="blur"
			>
				<Modal.Container size="lg">
					<Modal.Dialog aria-label="清理失效链接">
						<Modal.CloseTrigger />

						<Modal.Header>
							<Modal.Heading className="flex items-center gap-2">
								<Link2Off className="w-4 h-4 text-accent" />
								清理失效链接
							</Modal.Heading>
						</Modal.Header>

						<Modal.Body className="flex flex-col gap-4">
							{phase === "idle" && (
								<div className="flex flex-col items-center gap-3 py-6 text-center">
									<Globe className="w-10 h-10 text-muted opacity-60" />
									<p className="text-xs text-muted leading-relaxed max-w-sm">
										将逐个检测所有收藏链接的可访问性（服务端异步并发执行，不阻塞页面）。
										仅 404 / 410 /
										域名失效的链接会被列入清理名单；被反爬拦截（403
										等）或超时的链接会标记为「未知」，不会被误删。
									</p>
									<Button
										type="button"
										variant="primary"
										size="sm"
										className="rounded-full flex items-center gap-1.5 cursor-pointer"
										onPress={handleStartScan}
									>
										<Radar className="w-3.5 h-3.5" />
										<span>开始检测</span>
									</Button>
								</div>
							)}

							{phase === "scanning" && (
								<div className="flex flex-col gap-3 py-4">
									<div className="flex items-center justify-between text-xs text-muted">
										<span className="flex items-center gap-1.5">
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
											正在检测链接可访问性...
										</span>
										<span>
											{checked} / {total}
										</span>
									</div>
									<ProgressBar value={progressValue} aria-label="检测进度">
										<ProgressBar.Track>
											<ProgressBar.Fill />
										</ProgressBar.Track>
									</ProgressBar>
									<p className="text-[11px] text-muted">
										后台并发检测中，可以等待完成，链接较多时需要几分钟。
									</p>
								</div>
							)}

							{(phase === "done" || phase === "deleting") && (
								<>
									{/* Snapshot meta + rescan entry */}
									<div className="flex items-center justify-between text-[11px] text-muted">
										<span>
											{lastScanAt
												? `上次检测：${new Date(lastScanAt).toLocaleString()}`
												: "检测结果"}
										</span>
										<button
											type="button"
											className="flex items-center gap-1 text-accent hover:opacity-80 cursor-pointer"
											onClick={handleStartScan}
											disabled={phase === "deleting"}
										>
											<Radar className="w-3 h-3" />
											重新检测
										</button>
									</div>

									{/* Result summary */}
									<div className="grid grid-cols-3 gap-2">
										<div className="rounded-xl bg-danger/10 border border-danger/20 p-3 flex flex-col items-center gap-0.5">
											<span className="text-lg font-bold text-danger">
												{deadItems.length}
											</span>
											<span className="text-[11px] text-muted">失效链接</span>
										</div>
										<div className="rounded-xl bg-surface-secondary border border-border p-3 flex flex-col items-center gap-0.5">
											<span className="text-lg font-bold text-foreground">
												{aliveCount}
											</span>
											<span className="text-[11px] text-muted">正常</span>
										</div>
										<div className="rounded-xl bg-warning/10 border border-warning/20 p-3 flex flex-col items-center gap-0.5">
											<span className="text-lg font-bold text-warning">
												{unknownItems.length}
											</span>
											<span className="text-[11px] text-muted">未知(跳过)</span>
										</div>
									</div>

									{deadItems.length === 0 ? (
										<div className="flex flex-col items-center gap-2 py-6 text-center">
											<CheckCircle2 className="w-8 h-8 text-success" />
											<p className="text-sm text-foreground">
												没有发现失效链接，收藏夹很健康
											</p>
										</div>
									) : (
										<>
											<div className="flex items-center justify-between text-xs text-muted">
												<span>勾选要删除的失效链接（默认全选）</span>
												<button
													type="button"
													className="text-accent hover:opacity-80 cursor-pointer"
													onClick={() =>
														setSelectedIds(
															selectedIds.size === deadItems.length
																? new Set()
																: new Set(deadItems.map((item) => item.id)),
														)
													}
												>
													{selectedIds.size === deadItems.length
														? "取消全选"
														: "全选"}
												</button>
											</div>
											<div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
												{deadItems.map((item) => (
													<label
														key={item.id}
														className="flex items-center gap-2.5 p-2 rounded-xl border border-border hover:bg-surface-secondary cursor-pointer transition-colors"
													>
														<input
															type="checkbox"
															checked={selectedIds.has(item.id)}
															onChange={() => toggleItem(item.id)}
															className="accent-accent w-3.5 h-3.5 shrink-0 cursor-pointer"
														/>
														<div className="flex-1 min-w-0 flex flex-col">
															<span className="text-xs text-foreground truncate">
																{item.title || item.url}
															</span>
															<span className="text-[10px] text-muted truncate">
																{item.url}
															</span>
														</div>
														<span className="text-[10px] text-danger shrink-0">
															{item.httpStatus
																? `HTTP ${item.httpStatus}`
																: item.reason || "无法访问"}
														</span>
														<a
															href={item.url}
															target="_blank"
															rel="noreferrer"
															className="text-muted hover:text-accent shrink-0"
															title="在新标签页打开验证"
															onClick={(e) => e.stopPropagation()}
														>
															<ExternalLink className="w-3 h-3" />
														</a>
													</label>
												))}
											</div>
										</>
									)}
								</>
							)}
						</Modal.Body>

						<Modal.Footer className="flex items-center justify-between">
							<div className="text-[11px] text-muted flex items-center gap-1">
								{(phase === "done" || phase === "deleting") &&
									unknownItems.length > 0 && (
										<>
											<AlertTriangle className="w-3 h-3 text-warning" />
											<span>{unknownItems.length} 条状态未知的链接已保留</span>
										</>
									)}
							</div>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="rounded-full cursor-pointer"
									onPress={onClose}
								>
									关闭
								</Button>
								{phase === "done" && deadItems.length > 0 && (
									<Button
										type="button"
										variant="danger-soft"
										size="sm"
										className="rounded-full flex items-center gap-1.5 cursor-pointer"
										onPress={() => setIsDeleteConfirmOpen(true)}
										isDisabled={selectedIds.size === 0}
									>
										<Trash2 className="w-3.5 h-3.5" />
										<span>删除选中 ({selectedIds.size})</span>
									</Button>
								)}
								{phase === "deleting" && (
									<Button
										type="button"
										variant="danger-soft"
										size="sm"
										isDisabled
										className="rounded-full flex items-center gap-1.5"
									>
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
										<span>删除中...</span>
									</Button>
								)}
							</div>
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>

			{/* Batch deletion confirmation (replaces native confirm) */}
			<ConfirmDialog
				isOpen={isDeleteConfirmOpen}
				onOpenChange={setIsDeleteConfirmOpen}
				title="删除失效链接"
				description={`确定要彻底删除选中的 ${selectedIds.size} 条失效链接吗？此操作无法撤回。`}
				confirmLabel={`删除 ${selectedIds.size} 条`}
				onConfirm={handleDeleteSelected}
			/>
		</>
	);
}
