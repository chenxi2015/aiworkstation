import type {
	QrTicketResponse,
	UserProfile,
} from "@aiworkstation/shared-types";
import { Button, Card, Chip } from "@heroui/react";
import {
	CheckCircle2,
	Loader2,
	Lock,
	RefreshCw,
	ShieldCheck,
	Smartphone,
	Sparkles,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
			{/* Ambient FlutedGlass Shader Background */}
			<FlutedGlassBackground
				overlayClassName={
					mandatory
						? "bg-background/80 dark:bg-black/75 backdrop-blur-md"
						: "bg-black/60 backdrop-blur-xs"
				}
			/>

			{/* HeroUI Card Container */}
			<Card className="relative w-full max-w-sm rounded-3xl border border-border/80 bg-surface/90 shadow-2xl backdrop-blur-xl transition-all duration-200">
				{/* Optional Close Button */}
				{!mandatory && onClose && (
					<button
						type="button"
						onClick={onClose}
						className="absolute right-4 top-4 z-10 text-muted hover:text-foreground cursor-pointer rounded-full p-1 hover:bg-surface-secondary transition"
						aria-label="关闭"
					>
						<X className="w-5 h-5" />
					</button>
				)}

				{/* Card Header */}
				<Card.Header className="flex flex-col items-center text-center pb-2 pt-6 px-6">
					<div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 text-emerald-500 ring-1 ring-emerald-500/30 shadow-inner">
						<Smartphone className="w-7 h-7" />
						<span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-surface">
							<Sparkles className="w-2 h-2 text-white" />
						</span>
					</div>

					<Card.Title className="text-xl font-bold tracking-tight text-foreground">
						{mandatory ? "微信扫码登录工作台" : "微信扫码登录"}
					</Card.Title>

					<Card.Description className="text-xs text-muted mt-1 max-w-[260px]">
						{mandatory
							? "请使用手机微信扫码登录，即可解锁完整工作台与云端数据"
							: "使用手机微信扫描二维码，同步个人权益与云端知识库"}
					</Card.Description>

					<div className="mt-2.5">
						<Chip
							size="sm"
							variant="secondary"
							className="text-[10px] h-5 px-2 font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
						>
							<ShieldCheck className="w-3 h-3 mr-1 inline" />
							官方免密安全验证
						</Chip>
					</div>
				</Card.Header>

				{/* Card Content: QR Code Canvas */}
				<Card.Content className="flex flex-col items-center justify-center px-6 py-2">
					<div className="relative flex h-60 w-60 items-center justify-center rounded-2xl border border-border/80 bg-white p-3 shadow-inner">
						{loading && (
							<div className="flex flex-col items-center gap-2.5 text-muted">
								<Loader2 className="w-8 h-8 animate-spin text-accent" />
								<span className="text-xs font-medium">
									正在生成安全二维码...
								</span>
							</div>
						)}

						{!loading && error && (
							<div className="p-4 text-center">
								<p className="text-xs text-danger mb-3 leading-relaxed">
									{error}
								</p>
								<Button
									size="sm"
									variant="secondary"
									onPress={loadQrCode}
									className="flex items-center gap-1.5 mx-auto"
								>
									<RefreshCw className="w-3.5 h-3.5" />
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
									<div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/95 backdrop-blur-xs animate-in fade-in duration-200">
										<CheckCircle2 className="w-14 h-14 text-emerald-500 animate-bounce" />
										<span className="text-base font-bold text-emerald-600 mt-2">
											登录成功
										</span>
										<span className="text-xs text-muted mt-0.5">
											正在进入工作台...
										</span>
									</div>
								)}

								{/* Expired Overlay */}
								{countdown === 0 && !isSuccess && (
									<div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/90 backdrop-blur-xs animate-in fade-in">
										<span className="text-xs font-medium text-muted mb-2.5">
											二维码已过期
										</span>
										<Button
											size="sm"
											variant="secondary"
											onPress={loadQrCode}
											className="flex items-center gap-1.5 shadow-xs"
										>
											<RefreshCw className="w-3.5 h-3.5" />
											<span>刷新二维码</span>
										</Button>
									</div>
								)}
							</>
						)}
					</div>

					{/* Countdown Chip */}
					{!error && !isSuccess && countdown > 0 && (
						<div className="mt-3">
							<Chip
								size="sm"
								variant="secondary"
								className={`text-[11px] h-5.5 px-2.5 font-mono ${
									countdown <= 60
										? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
										: "bg-surface-secondary text-muted border border-border/60"
								}`}
							>
								二维码有效期：{countdown} 秒
							</Chip>
						</div>
					)}
				</Card.Content>

				{/* Card Footer: Security Note & Dev Mock Action */}
				<Card.Footer className="flex flex-col items-center gap-2 pt-2 pb-5 px-6 border-t border-border/40 mt-2">
					<div className="flex items-center gap-1 text-[11px] text-muted">
						<Lock className="w-3 h-3 text-muted/70" />
						<span>本地优先加密存储 · 云端私密同步</span>
					</div>

					{/* Dev Mode Mock Action */}
					{!isSuccess && (
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
							[开发模式] 点击一键模拟扫码成功
						</Button>
					)}
				</Card.Footer>
			</Card>
		</div>
	);
}
