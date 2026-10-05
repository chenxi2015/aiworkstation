import { Button, Modal } from "@heroui/react";
import {
	ArrowDownToLine,
	ArrowUpCircle,
	CheckCircle2,
	ExternalLink,
	FileText,
	FolderOpen,
	Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ElectronUpdateDownloadedInfo } from "../../vite-env";

export type UpdateModalStep = "available" | "downloading" | "downloaded";

export interface ExtendedUpdateInfo extends ElectronUpdateDownloadedInfo {
	downloadUrl?: string;
}

export interface UpdateDownloadedModalProps {
	/** Optional controlled open state for external trigger */
	isOpen?: boolean;
	/** Optional callback when modal is closed */
	onClose?: () => void;
	/** Optional mock/initial update info */
	initialInfo?: ExtendedUpdateInfo | null;
	/** Initial step */
	initialStep?: UpdateModalStep;
}

export interface OpenUpdateModalEventDetail {
	step?: UpdateModalStep;
	updateInfo?: ExtendedUpdateInfo;
}

/**
 * Modern application update modal dialog.
 * Supports 3 stages: available (new release found), downloading, and downloaded (ready to install).
 */
export function UpdateDownloadedModal({
	isOpen: controlledIsOpen,
	onClose: controlledOnClose,
	initialInfo,
	initialStep = "downloaded",
}: UpdateDownloadedModalProps = {}) {
	const [internalOpen, setInternalOpen] = useState(false);
	const [step, setStep] = useState<UpdateModalStep>(initialStep);
	const [updateInfo, setUpdateInfo] = useState<ExtendedUpdateInfo | null>(
		initialInfo ?? null,
	);
	const [downloadPercent, setDownloadPercent] = useState<number>(0);
	const [isInstalling, setIsInstalling] = useState(false);
	const [showManualFallback, setShowManualFallback] = useState(false);

	const isControlled = controlledIsOpen !== undefined;
	const isVisible = isControlled ? controlledIsOpen : internalOpen;

	useEffect(() => {
		if (typeof window === "undefined") return;

		// 1. Listen for background download completion from Electron
		const unsubDownloaded = window.electronAPI?.onUpdateDownloaded?.((info) => {
			setUpdateInfo(info);
			setStep("downloaded");
			if (!isControlled) {
				setInternalOpen(true);
			}
		});

		// 2. Listen for download progress from Electron
		const unsubProgress = window.electronAPI?.onDownloadProgress?.(
			(progress) => {
				setDownloadPercent(progress.percent || 0);
				setStep("downloading");
				if (!isControlled) {
					setInternalOpen(true);
				}
			},
		);

		// 3. Listen for general open-update-modal trigger (e.g. from settings check)
		const handleOpenUpdateModal = (event: Event) => {
			const customEvent = event as CustomEvent<OpenUpdateModalEventDetail>;
			if (customEvent.detail?.updateInfo) {
				setUpdateInfo(customEvent.detail.updateInfo);
			}
			setStep(customEvent.detail?.step || "available");
			if (!isControlled) {
				setInternalOpen(true);
			}
		};

		// 4. Developer simulation event backward compatibility
		const handleSimulation = (event: Event) => {
			const customEvent = event as CustomEvent<ElectronUpdateDownloadedInfo>;
			setUpdateInfo(
				customEvent.detail || {
					version: "1.0.1",
					releaseNotes: "本次更新优化了工作台性能与使用体验。",
				},
			);
			setStep("downloaded");
			if (!isControlled) {
				setInternalOpen(true);
			}
		};

		window.addEventListener("open-update-modal", handleOpenUpdateModal);
		window.addEventListener("simulate-update-downloaded", handleSimulation);

		return () => {
			unsubDownloaded?.();
			unsubProgress?.();
			window.removeEventListener("open-update-modal", handleOpenUpdateModal);
			window.removeEventListener(
				"simulate-update-downloaded",
				handleSimulation,
			);
		};
	}, [isControlled]);

	const handleClose = () => {
		if (isInstalling) return;
		if (isControlled) {
			controlledOnClose?.();
		} else {
			setInternalOpen(false);
		}
	};

	// Start downloading update package in Electron or redirect in Web
	const handleStartDownload = async () => {
		if (updateInfo?.downloadUrl) {
			window.open(updateInfo.downloadUrl, "_blank", "noopener,noreferrer");
			handleClose();
			return;
		}

		if (window.electronAPI?.startDownload) {
			setStep("downloading");
			setDownloadPercent(0);
			try {
				await window.electronAPI.startDownload();
			} catch (err) {
				console.error("[updater] Failed to start download:", err);
			}
		} else {
			// Fallback simulation in dev/web
			setStep("downloading");
			setDownloadPercent(25);
			setTimeout(() => setDownloadPercent(70), 800);
			setTimeout(() => {
				setDownloadPercent(100);
				setStep("downloaded");
			}, 1600);
		}
	};

	// Execute install and restart
	const handleInstall = async () => {
		setIsInstalling(true);
		try {
			if (window.electronAPI?.installUpdate) {
				const res = await window.electronAPI.installUpdate();
				if (res?.openedFile) {
					setIsInstalling(false);
					handleClose();
					return;
				}
			} else {
				// Fallback for browser preview
				setTimeout(() => {
					setIsInstalling(false);
					handleClose();
				}, 1200);
				return;
			}
		} catch (err) {
			console.error("Install update failed:", err);
		}

		// On macOS unsigned packages, ShipIt blocks automatic in-place restart.
		// If application hasn't terminated after 2.5 seconds, reset state and show manual install option.
		setTimeout(() => {
			setIsInstalling(false);
			setShowManualFallback(true);
		}, 2500);
	};

	// Manually open downloaded DMG / installer package
	const handleOpenDownloadedFile = async () => {
		if (window.electronAPI?.openDownloadedFile) {
			await window.electronAPI.openDownloadedFile();
			handleClose();
		}
	};

	// Parse release notes string
	const rawNotes = updateInfo?.releaseNotes;
	const notesText =
		typeof rawNotes === "string"
			? rawNotes.trim()
			: Array.isArray(rawNotes)
				? rawNotes.map((n) => JSON.stringify(n)).join("\n")
				: null;

	const cleanVersion = updateInfo?.version
		? updateInfo.version.replace(/^v/, "")
		: null;

	return (
		<Modal.Backdrop
			isOpen={isVisible}
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
								: "发现新版本"
					}
					className="max-w-[420px] rounded-2xl border border-border/80 shadow-2xl overflow-hidden"
				>
					<Modal.CloseTrigger />

					<Modal.Header className="pt-6 pb-2 px-6 flex flex-col items-center text-center gap-3">
						{/* Icon badge */}
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
											: "发现新版本"}
								</Modal.Heading>
								{cleanVersion && (
									<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium font-mono bg-accent/10 text-accent border border-accent/20">
										v{cleanVersion}
									</span>
								)}
							</div>
							<p className="text-xs text-muted">
								{step === "downloaded"
									? "新版本已下载完成，随时可以更新"
									: step === "downloading"
										? "正在获取更新资源，下载完成后将提醒安装"
										: "检测到新版本可用，是否立即更新？"}
							</p>
						</div>
					</Modal.Header>

					<Modal.Body className="px-6 py-3 flex flex-col gap-3.5">
						{/* Status Card */}
						{step === "downloaded" && (
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
							</div>
						)}

						{/* Release notes block */}
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
						{/* Fallback advice card when macOS ShipIt does not auto-restart */}
						{showManualFallback && step === "downloaded" && (
							<div className="rounded-xl border border-border/80 bg-surface-secondary/50 p-3 flex flex-col gap-1.5 text-xs animate-in fade-in">
								<div className="flex items-center gap-1.5 font-medium text-foreground">
									<FolderOpen className="w-3.5 h-3.5 text-accent" />
									<span>若未自动重启，请手动完成安装</span>
								</div>
								<p className="text-[11px] text-muted leading-relaxed">
									受 macOS 签名限制未自动替换。安装包已在本地就绪，点击下方按钮直接打开，拖入 Applications 目录替换即可完成更新。
								</p>
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
								{showManualFallback ? (
									<Button
										type="button"
										variant="primary"
										size="sm"
										className="rounded-full px-5 text-xs font-medium cursor-pointer shadow-sm flex items-center gap-1.5"
										onPress={handleOpenDownloadedFile}
									>
										<FolderOpen className="w-3.5 h-3.5" />
										<span>打开安装包 (DMG)</span>
									</Button>
								) : (
									<Button
										type="button"
										variant="primary"
										size="sm"
										className="rounded-full px-5 text-xs font-medium cursor-pointer shadow-sm"
										isPending={isInstalling}
										onPress={handleInstall}
									>
										{isInstalling ? "正在重启..." : "立即重启"}
									</Button>
								)}
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
									{updateInfo?.downloadUrl ? (
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
