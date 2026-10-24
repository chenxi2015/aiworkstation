import type {
	QrTicketResponse,
	UserProfile,
} from "@aiworkstation/shared-types";
import { Button, Card } from "@heroui/react";
import {
	KeyRound,
	Loader2,
	RefreshCw,
	Smartphone,
	User,
	X,
} from "lucide-react";
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
	const [mode, setMode] = useState<"qr" | "userId">("qr");
	const [ticketData, setTicketData] = useState<QrTicketResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [countdown, setCountdown] = useState(300);

	// User ID / Token manual login states
	const [userIdInput, setUserIdInput] = useState("");
	const [userIdLoading, setUserIdLoading] = useState(false);
	const [userIdError, setUserIdError] = useState<string | null>(null);

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

	/**
	 * Transition directly into workspace upon login confirmation without artificial delays
	 */
	const handleLoginConfirmed = useCallback(
		async (token: string, user: UserProfile) => {
			stopPolling();

			if (mandatory) {
				try {
					await window.electronAPI?.setWindowMode?.("main");
				} catch (err) {
					console.error("[LoginModal] Failed to expand window:", err);
				}
			}

			cloudClient.setSession(token, user);
			onSuccess?.();
			onClose?.();
		},
		[mandatory, onClose, onSuccess, stopPolling],
	);

	const loadQrCode = useCallback(async () => {
		stopPolling();
		setLoading(true);
		setError(null);

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
						void handleLoginConfirmed(res.token, res.user);
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
	}, [handleLoginConfirmed, stopPolling]);

	const switchMode = useCallback(
		(nextMode: "qr" | "userId") => {
			setMode(nextMode);
			setUserIdError(null);
			if (nextMode === "qr") {
				loadQrCode();
			} else {
				stopPolling();
			}
		},
		[loadQrCode, stopPolling],
	);

	const handleUserIdSubmit = useCallback(
		async (e?: React.FormEvent) => {
			e?.preventDefault();
			const trimmed = userIdInput.trim();
			if (!trimmed) {
				setUserIdError("请输入 User ID 或 Token");
				return;
			}

			setUserIdLoading(true);
			setUserIdError(null);
			try {
				const { token, user } = await cloudClient.loginWithIdentifier(trimmed);
				await handleLoginConfirmed(token, user);
			} catch (err) {
				setUserIdError(
					err instanceof Error ? err.message : "登录失败，请重试",
				);
			} finally {
				setUserIdLoading(false);
			}
		},
		[userIdInput, handleLoginConfirmed],
	);

	useEffect(() => {
		if (isOpen && mode === "qr") {
			loadQrCode();
		} else {
			stopPolling();
			setTicketData(null);
		}
		return stopPolling;
	}, [isOpen, mode, loadQrCode, stopPolling]);

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

			{/* HeroUI Card Container (clean, flat border) */}
			<Card className="relative w-full max-w-xs rounded-2xl border border-border/80 bg-surface/95 backdrop-blur-xl window-no-drag">
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

				{/* Card Header */}
				<Card.Header className="flex flex-col items-center text-center pb-2 pt-5 px-5">
					<div
						className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
							mode === "qr"
								? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
								: "bg-accent/10 text-accent border-accent/20"
						}`}
					>
						{mode === "qr" ? (
							<Smartphone className="w-5 h-5" />
						) : (
							<KeyRound className="w-5 h-5" />
						)}
					</div>

					<Card.Title className="text-base font-bold text-foreground">
						{mode === "qr"
							? mandatory
								? "微信扫码登录工作台"
								: "微信扫码登录"
							: "User ID 登录工作台"}
					</Card.Title>

					{/* Mode Switcher Tabs */}
					<div className="flex w-full rounded-xl bg-surface-secondary/70 p-1 border border-border/50 text-xs mt-3">
						<button
							type="button"
							onClick={() => switchMode("qr")}
							className={`flex-1 py-1 px-2 rounded-lg font-medium transition cursor-pointer text-center ${
								mode === "qr"
									? "bg-surface shadow-xs text-foreground font-semibold"
									: "text-muted hover:text-foreground"
							}`}
						>
							扫码登录
						</button>
						<button
							type="button"
							onClick={() => switchMode("userId")}
							className={`flex-1 py-1 px-2 rounded-lg font-medium transition cursor-pointer text-center ${
								mode === "userId"
									? "bg-surface shadow-xs text-foreground font-semibold"
									: "text-muted hover:text-foreground"
							}`}
						>
							User ID 登录
						</button>
					</div>
				</Card.Header>

				{/* Card Content: Mode-aware */}
				<Card.Content className="flex flex-col items-center justify-center px-5 py-2">
					{mode === "qr" ? (
						<>
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

										{/* Expired Overlay */}
										{countdown === 0 && (
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

							{/* Countdown & Helper */}
							{!error && countdown > 0 && (
								<p className="text-[11px] text-muted font-mono mt-2.5">
									有效时间：{countdown}s
								</p>
							)}

							<button
								type="button"
								onClick={() => switchMode("userId")}
								className="text-[11px] text-muted hover:text-accent transition mt-2 mb-1 underline cursor-pointer"
							>
								无法扫码？使用 User ID 登录
							</button>
						</>
					) : (
						<form
							onSubmit={handleUserIdSubmit}
							className="flex flex-col w-full h-52 justify-between py-1"
						>
							<div className="space-y-3 pt-2">
								<div className="relative">
									<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
										<User className="w-4 h-4" />
									</div>
									<input
										type="text"
										value={userIdInput}
										onChange={(e) => {
											setUserIdInput(e.target.value);
											if (userIdError) setUserIdError(null);
										}}
										placeholder="输入 User ID (如 usr_xxx) 或 Token"
										autoFocus
										disabled={userIdLoading}
										className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border/80 bg-background/50 text-foreground placeholder:text-muted focus:outline-hidden focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
									/>
								</div>

								{userIdError && (
									<p className="text-[11px] text-danger text-center leading-tight">
										{userIdError}
									</p>
								)}

								<Button
									type="submit"
									size="sm"
									variant="primary"
									isDisabled={userIdLoading}
									className="w-full h-8 text-xs font-medium rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
								>
									{userIdLoading && (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									)}
									<span>{userIdLoading ? "正在登录..." : "进入工作台"}</span>
								</Button>
							</div>

							<div className="border-t border-border/40 pt-2 text-center">
								<p className="text-[10px] text-muted">
									客户端免扫码通道：输入已有用户 ID 或 Token
								</p>
							</div>
						</form>
					)}
				</Card.Content>
			</Card>
		</div>,
		document.body,
	);
}
