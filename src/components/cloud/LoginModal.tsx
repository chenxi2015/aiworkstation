import type {
	QrTicketResponse,
	UserProfile,
} from "@aiworkstation/shared-types";
import { Button, Card } from "@heroui/react";
import { CheckCircle2, Loader2, RefreshCw, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cloudClient } from "../../lib/cloud/cloudClient";
import { FlutedGlassBackground } from "./FlutedGlassBackground";

export interface LoginModalProps {
	isOpen: boolean;
	onClose?: () => void;
	onSuccess?: () => void;
	mandatory?: boolean;
}

export function LoginModal({
	isOpen,
	onClose,
	onSuccess,
	mandatory = false,
}: LoginModalProps) {
	const [ticketData, setTicketData] = useState<QrTicketResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [countdown, setCountdown] = useState(300);
	const [isSuccess, setIsSuccess] = useState(false);

	const pollTimerRef = useRef<number | null>(null);
	const countdownTimerRef = useRef<number | null>(null);

	const stopPolling = useCallback(() => {
		if (pollTimerRef.current) {
			window.clearInterval(pollTimerRef.current);
			pollTimerRef.current = null;
		}
		if (countdownTimerRef.current) {
			window.clearInterval(countdownTimerRef.current);
			countdownTimerRef.current = null;
		}
	}, []);

	const loadQrCode = useCallback(async () => {
		stopPolling();
		setLoading(true);
		setError(null);
		setIsSuccess(false);

		try {
			const data = await cloudClient.getQrTicket();
			setTicketData(data);
			setCountdown(data.expiresInSeconds || 300);

			// Start countdown timer
			countdownTimerRef.current = window.setInterval(() => {
				setCountdown((prev) => {
					if (prev <= 1) {
						stopPolling();
						return 0;
					}
					return prev - 1;
				});
			}, 1000);

			// Start status polling
			pollTimerRef.current = window.setInterval(async () => {
				try {
					const res = await cloudClient.checkQrStatus(data.ticket);
					if (res.status === "CONFIRMED" && res.token && res.user) {
						stopPolling();
						setIsSuccess(true);
						cloudClient.setSession(res.token, res.user);
						setTimeout(() => {
							onSuccess?.();
							onClose?.();
						}, 1200);
					} else if (res.status === "EXPIRED") {
						stopPolling();
					}
				} catch {
					// Tolerate intermittent network jitter while polling
				}
			}, 1500);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "无法连接到远程云服务，请确保 server 正在运行",
			);
		} finally {
			setLoading(false);
		}
	}, [onClose, onSuccess, stopPolling]);

	useEffect(() => {
		if (isOpen) {
			loadQrCode();
		} else {
			stopPolling();
			setTicketData(null);
			setIsSuccess(false);
		}
		return stopPolling;
	}, [isOpen, loadQrCode, stopPolling]);

	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	if (!isOpen || !mounted) return null;

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
			{/* Ambient FlutedGlass Shader Background */}
			<FlutedGlassBackground
				overlayClassName={
					mandatory
						? "bg-background/60 dark:bg-black/75"
						: "bg-black/60 backdrop-blur-xs"
				}
			/>

			{/* HeroUI Card Container (clean, flat border, no heavy shadows) */}
			<Card className="relative w-full max-w-xs rounded-2xl border border-border/80 bg-surface/95 backdrop-blur-xl">
				{/* Optional Close Button */}
				{!mandatory && onClose && (
					<button
						type="button"
						onClick={onClose}
						className="absolute right-3.5 top-3.5 z-10 text-muted hover:text-foreground cursor-pointer rounded-full p-1 hover:bg-surface-secondary transition"
						aria-label="关闭"
					>
						<X className="w-4 h-4" />
					</button>
				)}

				{/* Card Header: Simplified */}
				<Card.Header className="flex flex-col items-center text-center pb-1 pt-5 px-5">
					<div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
						<Smartphone className="w-5 h-5" />
					</div>

					<Card.Title className="text-base font-bold text-foreground">
						{mandatory ? "微信扫码登录工作台" : "微信扫码登录"}
					</Card.Title>
				</Card.Header>

				{/* Card Content: QR Code Canvas */}
				<Card.Content className="flex flex-col items-center justify-center px-5 py-2">
					<div className="relative flex h-52 w-52 items-center justify-center rounded-xl border border-border/80 bg-white p-2">
						{loading && (
							<div className="flex flex-col items-center gap-2 text-muted">
								<Loader2 className="w-7 h-7 animate-spin text-accent" />
								<span className="text-xs">加载二维码...</span>
							</div>
						)}

						{!loading && error && (
							<div className="p-3 text-center">
								<p className="text-xs text-danger mb-2.5 leading-relaxed">
									{error}
								</p>
								<Button
									size="sm"
									variant="secondary"
									onPress={loadQrCode}
									className="flex items-center gap-1.5 mx-auto text-xs h-7 px-2.5"
								>
									<RefreshCw className="w-3 h-3" />
									<span>重新加载</span>
								</Button>
							</div>
						)}

						{!loading && !error && ticketData && (
							<>
								<img
									src={ticketData.qrCodeUrl}
									alt="微信扫码登录二维码"
									className={`h-full w-full object-contain rounded-lg transition-opacity duration-300 ${
										countdown === 0 ? "opacity-20" : "opacity-100"
									}`}
								/>

								{/* Success Overlay */}
								{isSuccess && (
									<div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-white/95 animate-in fade-in duration-200">
										<CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
										<span className="text-sm font-bold text-emerald-600 mt-1.5">
											登录成功
										</span>
									</div>
								)}

								{/* Expired Overlay */}
								{countdown === 0 && !isSuccess && (
									<div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-white/90 animate-in fade-in">
										<span className="text-xs text-muted mb-2">
											二维码已过期
										</span>
										<Button
											size="sm"
											variant="secondary"
											onPress={loadQrCode}
											className="flex items-center gap-1 text-xs h-7 px-2.5"
										>
											<RefreshCw className="w-3 h-3" />
											<span>刷新二维码</span>
										</Button>
									</div>
								)}
							</>
						)}
					</div>

					{/* Countdown */}
					{!error && !isSuccess && countdown > 0 && (
						<p className="text-[11px] text-muted font-mono mt-2.5">
							有效时间：{countdown}s
						</p>
					)}
				</Card.Content>

				{/* Card Footer: Dev Mode Mock Action */}
				{!isSuccess && (
					<Card.Footer className="flex flex-col items-center pt-1 pb-4 px-5 border-t border-border/40 mt-1">
						<Button
							size="sm"
							variant="ghost"
							className="text-[11px] h-6 text-accent hover:underline cursor-pointer"
							onPress={() => {
								stopPolling();
								setIsSuccess(true);
								const devUser: UserProfile = {
									id: "dev-local-user",
									nickname: "开发者 (Dev)",
									avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=dev",
									memberTier: "FREE",
									memberExpiresAt: null,
									createdAt: new Date().toISOString(),
								};
								cloudClient.setSession("dev_local_token_mock", devUser);

								if (ticketData?.ticket) {
									fetch(
										`${cloudClient.getApiBase()}/api/auth/wx/mock-scan?state=${ticketData.ticket}`,
									).catch(() => {});
								}

								setTimeout(() => {
									onSuccess?.();
									onClose?.();
								}, 800);
							}}
						>
							[开发模式] 模拟扫码登录
						</Button>
					</Card.Footer>
				)}
			</Card>
		</div>,
		document.body,
	);
}
