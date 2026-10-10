import { Button, Modal, toast } from "@heroui/react";
import {
	ArrowDownToLine,
	ArrowUpCircle,
	CheckCircle2,
	ExternalLink,
	FileText,
	FolderOpen,
	Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ElectronUpdateState } from "../../vite-env";

type ModalStep = "available" | "downloading" | "downloaded" | "error";

/** Update info carried by the web (non-Electron) check path */
interface WebUpdateInfo {
	version?: string;
	releaseNotes?: string;
	downloadUrl?: string;
}

interface OpenUpdateModalEventDetail {
	updateInfo?: WebUpdateInfo;
}

/**
 * Application update modal, fully driven by the main-process updater state
 * machine (`updater:state`). No timers, no guessing — every button maps to a
 * single IPC command and every render maps to a state.
 */
export function UpdateDownloadedModal() {
	const [isOpen, setIsOpen] = useState(false);
	const [updateState, setUpdateState] = useState<ElectronUpdateState | null>(
		null,
	);
	const [webInfo, setWebInfo] = useState<WebUpdateInfo | null>(null);
	const [isInstalling, setIsInstalling] = useState(false);
	const hasAutoOpened = useRef(false);

	const hasElectronUpdater =
		typeof window !== "undefined" &&
		Boolean(window.electronAPI?.getUpdateState);

	// ── Electron state machine subscription ─────────────────────────────────
	useEffect(() => {
		if (!window.electronAPI?.getUpdateState) return;
		let disposed = false;

		const maybeAutoOpen = (next: ElectronUpdateState) => {
			if (next.status === "downloaded" && !hasAutoOpened.current) {
				hasAutoOpened.current = true;
				setIsOpen(true);
			}
		};

		window.electronAPI.getUpdateState().then((snapshot) => {
			if (disposed || !snapshot) return;
			setUpdateState(snapshot);
			maybeAutoOpen(snapshot);
		});

		const unsubscribe = window.electronAPI.onUpdateState?.((next) => {
			setUpdateState(next);
			if (next.status === "downloading" && next.progress === 0) {
				hasAutoOpened.current = false;
			}
			maybeAutoOpen(next);
		});

		return () => {
			disposed = true;
			unsubscribe?.();
		};
	}, []);

	// ── External triggers (settings manual check, web path, dev simulation) ──
	useEffect(() => {
		if (typeof window === "undefined") return;

		const handleOpenUpdateModal = (event: Event) => {
			const detail = (event as CustomEvent<OpenUpdateModalEventDetail>).detail;
			if (detail?.updateInfo) {
				setWebInfo(detail.updateInfo);
			}
			setIsOpen(true);
		};

		const handleSimulation = (event: Event) => {
			const detail = (event as CustomEvent<Partial<ElectronUpdateState>>)
				.detail;
			setWebInfo(null);
			setUpdateState({
				status: "downloaded",
				currentVersion: "0.0.0",
				canAutoInstall: false,
				latestVersion: "1.0.1",
				releaseNotes: "本次更新优化了工作台性能与使用体验。",
				...detail,
			});
			setIsOpen(true);
		};

		window.addEventListener("open-update-modal", handleOpenUpdateModal);
		window.addEventListener("simulate-update-downloaded", handleSimulation);
		return () => {
			window.removeEventListener("open-update-modal", handleOpenUpdateModal);
			window.removeEventListener(
				"simulate-update-downloaded",
				handleSimulation,
			);
		};
	}, []);

	const step: ModalStep = webInfo
		? "available"
		: !updateState
			? "available"
			: updateState.status === "downloading"
				? "downloading"
				: updateState.status === "downloaded" ||
						updateState.status === "installing"
					? "downloaded"
					: updateState.status === "error"
						? "error"
						: "available";

	const version = (
		webInfo?.version ||
		updateState?.latestVersion ||
		""
	).replace(/^v/, "");
	const rawNotes = webInfo?.releaseNotes ?? updateState?.releaseNotes;
	const notesText =
		typeof rawNotes === "string" && rawNotes.trim() ? rawNotes.trim() : null;
	const downloadPercent = Math.round(updateState?.progress ?? 0);
	const canAutoInstall = Boolean(updateState?.canAutoInstall);

	const handleClose = () => {
		if (isInstalling) return;
		setIsOpen(false);
		setWebInfo(null);
	};

	const handleStartDownload = async () => {
		if (hasElectronUpdater && window.electronAPI?.startDownload) {
			try {
				// If the failure happened at check time we have no target version
				// yet — re-run the check instead of the download.
				const result =
					updateState?.status === "error" && !updateState?.latestVersion
						? await window.electronAPI.checkForUpdates?.()
						: await window.electronAPI.startDownload();
				if (result?.status === "error") {
					toast.danger(`下载更新失败: ${result.error || "网络异常"}`);
				}
			} catch (err) {
				console.error("[updater] Failed to start download:", err);
			}
			return;
		}
		if (webInfo?.downloadUrl) {
			window.open(webInfo.downloadUrl, "_blank", "noopener,noreferrer");
			handleClose();
		}
	};

	const handleInstall = async () => {
		if (!window.electronAPI?.installUpdate) return;
		setIsInstalling(true);
		try {
			const result = await window.electronAPI.installUpdate();
			if (result?.status === "opened_file") {
				toast.success(
					"已打开本地安装包，应用即将退出。将 AI Workstation 拖入 Applications 替换即可完成更新。",
					{ timeout: 4000 },
				);
				handleClose();
			} else if (result?.status === "error" || result?.status === "not-ready") {
				toast.danger(result.message || "安装失败，请重试");
			}
			// "installing" → the app is about to quit and restart on its own.
		} catch (err) {
			console.error("[updater] Install failed:", err);
			toast.danger("安装失败，请重试");
		} finally {
			setIsInstalling(false);
		}
	};

	const handleShowInFolder = async () => {
		if (!window.electronAPI?.showDownloadedInFolder) return;
		const result = await window.electronAPI.showDownloadedInFolder();
		if (result?.status !== "success") {
			toast.warning(result?.message || "本地安装包不存在，请重新下载");
		}
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) handleClose();
			}}
			variant="blur"
		>
			<Modal.Container size="sm" placement="center">
				<Modal.Dialog
					aria-label={
						step === "downloaded"
							? "更新已就绪"
							: step === "downloading"
								? "正在下载更新"
								: step === "error"
									? "更新下载失败"
									: "发现新版本"
					}
					className="max-w-[420px] rounded-2xl border border-border/80 shadow-2xl overflow-hidden"
				>
					<Modal.CloseTrigger />

					<Modal.Header className="pt-6 pb-2 px-6 flex flex-col items-center text-center gap-3">
						<div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-accent-soft text-accent shadow-sm border border-accent/20">
							{step === "downloading" ? (
								<ArrowDownToLine className="w-6 h-6 stroke-[2.2] animate-bounce" />
							) : (
								<ArrowUpCircle className="w-6 h-6 stroke-[2.2]" />
							)}
							<span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent ring-2 ring-background">
								<Sparkles className="w-2 h-2 text-accent-foreground" />
							</span>
						</div>

						<div className="space-y-1">
							<div className="flex items-center justify-center gap-2">
								<Modal.Heading className="text-base font-semibold text-foreground tracking-tight">
									{step === "downloaded"
										? "更新已就绪"
										: step === "downloading"
											? "正在下载新版本"
											: step === "error"
												? "下载失败"
												: "发现新版本"}
								</Modal.Heading>
								{version && (
									<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium font-mono bg-accent/10 text-accent border border-accent/20">
										v{version}
									</span>
								)}
							</div>
							<p className="text-xs text-muted">
								{step === "downloaded"
									? "新版本已下载完成，随时可以更新"
									: step === "downloading"
										? "正在获取更新资源，可切到后台继续下载"
										: step === "error"
											? "下载过程中出现问题，请重试"
											: "检测到新版本可用，是否立即更新？"}
							</p>
						</div>
					</Modal.Header>

					<Modal.Body className="px-6 py-3 flex flex-col gap-3.5">
						{step === "downloaded" && canAutoInstall && (
							<div className="rounded-xl border border-border/70 bg-surface-secondary/40 p-3.5 flex items-start gap-3">
								<CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
								<div className="flex-1 text-xs leading-relaxed text-muted">
									<p className="font-medium text-foreground text-xs mb-0.5">
										重启应用即可完成更新
									</p>
									<p className="text-[11px] text-muted">
										更新安装大约需要数秒钟，重启后自动恢复当前工作状态。
									</p>
								</div>
							</div>
						)}

						{step === "downloaded" && !canAutoInstall && hasElectronUpdater && (
							<div className="rounded-xl border border-border/70 bg-surface-secondary/40 p-3.5 flex items-start gap-3">
								<FolderOpen className="w-4 h-4 text-accent shrink-0 mt-0.5" />
								<div className="flex-1 text-xs leading-relaxed text-muted">
									<p className="font-medium text-foreground text-xs mb-0.5">
										安装包已下载到本地
									</p>
									<p className="text-[11px] text-muted">
										当前版本未经过 Apple
										签名，无法自动替换。点击下方按钮将打开本地 DMG
										并退出应用，把 AI Workstation 拖入 Applications
										替换即可完成更新。
									</p>
								</div>
							</div>
						)}

						{step === "downloaded" && updateState?.downloadedFile && (
							<div className="rounded-lg border border-border/60 bg-surface-secondary/30 px-3 py-2 flex items-center gap-2">
								<FolderOpen className="w-3.5 h-3.5 text-muted shrink-0" />
								<span
									className="flex-1 min-w-0 truncate text-[10px] font-mono text-muted select-text"
									title={updateState.downloadedFile}
								>
									{updateState.downloadedFile}
								</span>
								<button
									type="button"
									onClick={handleShowInFolder}
									className="shrink-0 text-[11px] font-medium text-accent hover:underline cursor-pointer"
								>
									打开所在目录
								</button>
							</div>
						)}

						{step === "downloading" && (
							<div className="rounded-xl border border-border/70 bg-surface-secondary/40 p-4 flex flex-col gap-2.5">
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted font-medium">下载进度</span>
									<span className="text-foreground font-mono font-medium">
										{downloadPercent}%
									</span>
								</div>
								<div className="w-full h-2 rounded-full bg-border/60 overflow-hidden">
									<div
										className="h-full bg-accent transition-all duration-300 rounded-full"
										style={{ width: `${Math.max(5, downloadPercent)}%` }}
									/>
								</div>
								<p className="text-[11px] text-muted">
									关闭弹窗不会中断下载，完成后会自动提醒安装。
								</p>
							</div>
						)}

						{step === "error" && (
							<div className="rounded-xl border border-danger/30 bg-danger/5 p-3.5 text-xs text-danger leading-relaxed select-text">
								{updateState?.error || "网络异常，请稍后重试"}
							</div>
						)}

						{notesText && (
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
									<FileText className="w-3.5 h-3.5" />
									<span>更新日志</span>
								</div>
								<div
									className="max-h-36 overflow-y-auto rounded-lg border border-border/60 bg-surface-secondary/30 p-2.5 text-xs text-foreground/90 leading-relaxed select-text [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&>li]:my-0.5 [&_a]:text-accent [&_a]:underline"
									dangerouslySetInnerHTML={{
										__html: !/<[a-z][\s\S]*>/i.test(notesText)
											? notesText.replace(/\n/g, "<br />")
											: notesText,
									}}
								/>
							</div>
						)}
					</Modal.Body>

					<Modal.Footer className="px-6 pb-6 pt-2 flex items-center justify-center gap-3">
						{step === "downloaded" && (
							<>
								<Button
									type="button"
									variant="tertiary"
									size="sm"
									className="rounded-full px-5 text-xs font-medium cursor-pointer"
									isDisabled={isInstalling}
									onPress={handleClose}
								>
									稍后
								</Button>
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="rounded-full px-5 text-xs font-medium cursor-pointer shadow-sm"
									isPending={isInstalling}
									onPress={handleInstall}
								>
									{isInstalling
										? "正在处理..."
										: canAutoInstall
											? "立即重启"
											: "打开安装包并退出"}
								</Button>
							</>
						)}

						{step === "downloading" && (
							<Button
								type="button"
								variant="tertiary"
								size="sm"
								className="rounded-full px-6 text-xs font-medium cursor-pointer"
								onPress={handleClose}
							>
								后台下载
							</Button>
						)}

						{step === "error" && (
							<>
								<Button
									type="button"
									variant="tertiary"
									size="sm"
									className="rounded-full px-5 text-xs font-medium cursor-pointer"
									onPress={handleClose}
								>
									关闭
								</Button>
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="rounded-full px-5 text-xs font-medium cursor-pointer shadow-sm"
									onPress={handleStartDownload}
								>
									重试下载
								</Button>
							</>
						)}

						{step === "available" && (
							<>
								<Button
									type="button"
									variant="tertiary"
									size="sm"
									className="rounded-full px-5 text-xs font-medium cursor-pointer"
									onPress={handleClose}
								>
									稍后
								</Button>
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="rounded-full px-5 text-xs font-medium cursor-pointer shadow-sm flex items-center gap-1.5"
									onPress={handleStartDownload}
								>
									{webInfo?.downloadUrl ? (
										<>
											<span>前往下载</span>
											<ExternalLink className="w-3.5 h-3.5" />
										</>
									) : (
										"立即下载更新"
									)}
								</Button>
							</>
						)}
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
