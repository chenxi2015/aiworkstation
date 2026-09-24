import type {
	CreateOrderResponse,
	SubscriptionPlan,
} from "@aiworkstation/shared-types";
import { Button, Card, Chip } from "@heroui/react";
import {
	Check,
	CheckCircle2,
	Crown,
	Loader2,
	LogOut,
	QrCode,
	RotateCw,
	Sparkles,
	User,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cloudClient } from "../../lib/cloud/cloudClient";
import { useCloudAuth } from "../../lib/cloud/useCloudAuth";

const MEMBER_PERKS = [
	"本地优先 AI 智能创作",
	"无限知识库语义检索",
	"多端云数据安全同步",
	"尊享极速推理通道",
];

export interface MemberCheckoutCardProps {
	onClose?: () => void;
	onSuccess?: () => void;
	mandatory?: boolean;
	expiredNotice?: boolean;
	className?: string;
	title?: string;
	description?: string;
	showUserInfo?: boolean;
}

/**
 * Reusable Member Subscription & Checkout Card component.
 * Uses clean line-based divider layout instead of heavy nested card blocks.
 * Fetches all subscription plans dynamically from database API without mock fallback.
 */
export function MemberCheckoutCard({
	onClose,
	onSuccess,
	mandatory = false,
	expiredNotice = false,
	className = "",
	title,
	description,
	showUserInfo = false,
}: MemberCheckoutCardProps) {
	const { user, logout, mockUpgradeToPro } = useCloudAuth();
	const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
	const [selectedPlanId, setSelectedPlanId] = useState<string>("");
	const [loadingPlans, setLoadingPlans] = useState(false);
	const [plansError, setPlansError] = useState<string | null>(null);

	const [orderData, setOrderData] = useState<CreateOrderResponse | null>(null);
	const [creatingOrder, setCreatingOrder] = useState(false);
	const [orderError, setOrderError] = useState<string | null>(null);
	const [isPaid, setIsPaid] = useState(false);

	const pollTimerRef = useRef<number | null>(null);

	const stopPolling = useCallback(() => {
		if (pollTimerRef.current) {
			window.clearInterval(pollTimerRef.current);
			pollTimerRef.current = null;
		}
	}, []);

	// Fetch plans strictly from backend database API
	const loadPlans = useCallback(async () => {
		setLoadingPlans(true);
		setPlansError(null);
		try {
			const data = await cloudClient.getPlans();
			setPlans(data);
			if (data.length > 0) {
				const rec = data.find((p) => p.recommended) || data[0];
				setSelectedPlanId((prev) =>
					prev && data.some((p) => p.id === prev) ? prev : rec.id,
				);
			}
		} catch (err) {
			setPlans([]);
			setPlansError(
				err instanceof Error ? err.message : "获取会员套餐失败，请检查服务状态",
			);
		} finally {
			setLoadingPlans(false);
		}
	}, []);

	useEffect(() => {
		loadPlans();
		return () => {
			stopPolling();
		};
	}, [loadPlans, stopPolling]);

	// Create payment order when selected plan changes
	const handleCreateOrder = useCallback(
		async (planId: string) => {
			stopPolling();
			setCreatingOrder(true);
			setOrderError(null);
			setIsPaid(false);

			try {
				const order = await cloudClient.createOrder(planId);
				setOrderData(order);

				// Start polling payment status
				pollTimerRef.current = window.setInterval(async () => {
					try {
						const statusRes = await cloudClient.checkOrderStatus(order.orderNo);
						if (statusRes.status === "PAID") {
							stopPolling();
							setIsPaid(true);
							await cloudClient.getMe();
							setTimeout(() => {
								onSuccess?.();
								onClose?.();
							}, 1500);
						}
					} catch {
						// Poll retry
					}
				}, 1500);
			} catch (err) {
				setOrderError(err instanceof Error ? err.message : "创建支付订单失败");
			} finally {
				setCreatingOrder(false);
			}
		},
		[onClose, onSuccess, stopPolling],
	);

	useEffect(() => {
		if (selectedPlanId) {
			handleCreateOrder(selectedPlanId);
		}
	}, [selectedPlanId, handleCreateOrder]);

	const currentPlan = plans.find((p) => p.id === selectedPlanId);

	return (
		<Card
			className={`relative w-full max-w-[920px] max-h-[92vh] overflow-y-auto rounded-3xl border border-border/80 bg-surface/98 p-6 sm:p-8 shadow-xl backdrop-blur-xl transition-all ${className}`}
		>
			{/* Optional Close Button (only when not mandatory) */}
			{!mandatory && onClose && (
				<button
					type="button"
					onClick={onClose}
					className="absolute right-5 top-5 z-10 text-muted hover:text-foreground cursor-pointer rounded-full p-2 hover:bg-surface-secondary/80 transition"
					aria-label="关闭"
				>
					<X className="w-5 h-5" />
				</button>
			)}

			{/* Account Info Header Bar in Mandatory Paywall Mode or Explicit showUserInfo */}
			{(mandatory || showUserInfo) && user && (
				<div className="flex items-center justify-between pb-3.5 mb-5 border-b border-border/60 text-xs">
					<div className="flex items-center gap-2.5">
						{user.avatarUrl ? (
							<img
								src={user.avatarUrl}
								alt="avatar"
								className="w-7 h-7 rounded-full object-cover ring-1 ring-border"
							/>
						) : (
							<div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-accent">
								<User className="w-4 h-4" />
							</div>
						)}
						<div className="flex items-center gap-2">
							<span className="font-semibold text-foreground text-sm">
								{user.nickname}
							</span>
							<Chip
								size="sm"
								variant="secondary"
								className="text-[10px] h-4.5 px-1.5 bg-surface-secondary text-muted"
							>
								已登录
							</Chip>
						</div>
					</div>
					<button
						type="button"
						onClick={logout}
						className="text-xs text-muted hover:text-danger flex items-center gap-1.5 cursor-pointer transition py-1 px-2.5 rounded-lg hover:bg-danger/10"
					>
						<LogOut className="w-3.5 h-3.5" />
						<span>切换微信账号</span>
					</button>
				</div>
			)}

			{/* Header Section */}
			<div className="flex items-start gap-3 mb-4">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
					<Crown className="w-5 h-5" />
				</div>
				<div>
					<div className="flex items-center gap-2.5">
						<h3 className="text-xl font-bold tracking-tight text-foreground">
							{title ??
								(expiredNotice
									? "会员已到期，请续费"
									: mandatory
										? "开通工作台尊享会员"
										: "升级会员权益")}
						</h3>
						<Chip
							size="sm"
							variant="secondary"
							className="text-[10px] h-5 px-2 font-semibold bg-amber-500/15 text-amber-600 border border-amber-500/30"
						>
							PRO VIP
						</Chip>
					</div>
					<p className="text-xs text-muted mt-1 leading-normal">
						{description ??
							"开启尊享会员，解锁本地优先 AI 深度创作、无限知识库问答与多端安全同步"}
					</p>
				</div>
			</div>

			{/* Main Layout: Line-divided Left & Right columns */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pt-6 border-t border-border/60">
				{/* Left Column: Plan Selector & Privilege Highlights */}
				<div className="lg:col-span-7 flex flex-col justify-between gap-6 lg:border-r lg:border-border/60 lg:pr-8">
					{/* Plans Area */}
					<div>
						{loadingPlans && (
							<div className="py-12 text-center text-xs text-muted border border-dashed border-border/70 rounded-xl">
								<Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-accent" />
								正在从数据库同步会员方案...
							</div>
						)}

						{!loadingPlans && plansError && (
							<div className="py-8 text-center text-xs text-muted border border-dashed border-border/70 rounded-xl flex flex-col items-center justify-center gap-3">
								<p className="text-danger">{plansError}</p>
								<Button
									size="sm"
									variant="secondary"
									onPress={loadPlans}
									className="text-xs h-7 px-3 gap-1.5"
								>
									<RotateCw className="w-3.5 h-3.5" />
									重新获取
								</Button>
							</div>
						)}

						{!loadingPlans && !plansError && plans.length === 0 && (
							<div className="py-8 text-center text-xs text-muted border border-dashed border-border/70 rounded-xl">
								暂无可购买的会员方案
							</div>
						)}

						{!loadingPlans && plans.length > 0 && (
							<div className="flex flex-col gap-3">
								{plans.map((plan) => {
									const isSelected = plan.id === selectedPlanId;
									const days = plan.durationDays;
									const isLifetime =
										plan.tier === "LIFETIME" ||
										plan.name.includes("终身") ||
										plan.id.includes("lifetime") ||
										days >= 3650 ||
										days <= 0;
									const perDay = (
										plan.priceCents /
										100 /
										(days || 365)
									).toFixed(2);

									return (
										<button
											type="button"
											key={plan.id}
											onClick={() => setSelectedPlanId(plan.id)}
											className={`w-full text-left relative p-4 rounded-xl border transition-all cursor-pointer select-none ${
												isSelected
													? "border-amber-500/90 ring-1 ring-amber-500/30 bg-amber-500/[0.04]"
													: "border-border/70 hover:border-foreground/25 hover:bg-surface-secondary/20 bg-transparent"
											}`}
										>
											{/* Recommended badge */}
											{plan.recommended && (
												<div className="absolute -top-2.5 right-4">
													<Chip
														size="sm"
														variant="primary"
														className="text-[10px] h-5 px-2.5 font-bold bg-amber-500 text-white border-0 shadow-xs"
													>
														🔥 限时特惠
													</Chip>
												</div>
											)}

											<div className="flex items-center justify-between gap-4">
												<div className="flex-1 min-w-0 pr-2">
													<div className="flex items-center gap-2">
														<Crown
															className={`w-4 h-4 shrink-0 ${
																isSelected ? "text-amber-500" : "text-muted"
															}`}
														/>
														<span className="text-base font-bold text-foreground shrink-0 whitespace-nowrap">
															{plan.name}
														</span>
													</div>
													{plan.description && (
														<p className="text-xs text-muted leading-relaxed mt-1 line-clamp-2">
															{plan.description}
														</p>
													)}
												</div>

												{/* Price tag */}
												<div className="text-right shrink-0 whitespace-nowrap pl-2">
													<div className="flex items-baseline justify-end gap-0.5">
														<span className="text-sm font-semibold text-amber-600">
															¥
														</span>
														<span className="text-2xl font-black text-foreground tracking-tight">
															{(plan.priceCents / 100).toFixed(0)}
														</span>
														{!isLifetime && (
															<span className="text-xs text-muted ml-0.5">
																/ {days >= 365 ? "年" : `${days}天`}
															</span>
														)}
														{isLifetime && (
															<span className="text-xs text-amber-600 font-semibold ml-1">
																终身买断
															</span>
														)}
													</div>
													{plan.originalPriceCents > plan.priceCents && (
														<div className="text-xs text-muted line-through mt-0.5">
															¥{(plan.originalPriceCents / 100).toFixed(0)}
														</div>
													)}
												</div>
											</div>

											{/* Price per day highlight: Line divided */}
											{!isLifetime && (
												<div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-xs text-muted whitespace-nowrap gap-2">
													<span className="shrink-0">每日轻松享全量权益</span>
													<div className="font-mono text-foreground font-medium shrink-0">
														折合约{" "}
														<span className="text-amber-600 font-bold">
															¥{perDay}
														</span>{" "}
														/ 天
													</div>
												</div>
											)}
										</button>
									);
								})}
							</div>
						)}
					</div>

					{/* VIP Privileges: Line divided without nested card */}
					<div className="pt-5 border-t border-border/60">
						<div className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
							<Sparkles className="w-3.5 h-3.5 text-amber-500" />
							<span>会员专享核心特权</span>
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-muted">
							{MEMBER_PERKS.map((perk) => (
								<div key={perk} className="flex items-center gap-2">
									<div className="w-3.5 h-3.5 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
										<Check className="w-2.5 h-2.5 stroke-[2.5]" />
									</div>
									<span className="text-foreground/90 font-normal">{perk}</span>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Right Column: Line-divided Payment Section (De-cardified) */}
				<div className="lg:col-span-5 flex flex-col justify-between items-center pt-2 lg:pt-0">
					{/* Payment Header */}
					<div className="w-full text-center pb-4">
						<div className="text-xs font-semibold text-foreground flex items-center justify-center gap-1.5">
							<QrCode className="w-4 h-4 text-emerald-500" />
							<span>微信扫码安全支付</span>
						</div>
						<div className="mt-2 flex items-baseline justify-center gap-1">
							<span className="text-xs text-muted font-normal">应付金额</span>
							<span className="text-xs font-bold text-amber-600">¥</span>
							<span className="text-3xl font-black text-foreground tracking-tight">
								{currentPlan
									? (currentPlan.priceCents / 100).toFixed(2)
									: "0.00"}
							</span>
						</div>
					</div>

					{/* QR Code Container */}
					<div className="relative flex h-52 w-52 items-center justify-center rounded-xl border border-border/70 bg-white p-3 shadow-xs my-5">
						{creatingOrder && (
							<div className="flex flex-col items-center gap-2.5 text-muted">
								<Loader2 className="w-7 h-7 animate-spin text-accent" />
								<span className="text-xs">正在生成安全支付码...</span>
							</div>
						)}

						{!creatingOrder && orderError && (
							<div className="p-4 text-center flex flex-col items-center justify-center gap-2.5">
								<p className="text-xs text-danger leading-relaxed">
									{orderError.includes("token") || orderError.includes("login")
										? "登录状态已过期，请重新登录"
										: orderError}
								</p>
								{orderError.includes("token") ||
								orderError.includes("login") ? (
									<Button
										size="sm"
										variant="secondary"
										className="text-xs h-7.5 px-3 rounded-lg"
										onPress={logout}
									>
										重新登录
									</Button>
								) : (
									<Button
										size="sm"
										variant="secondary"
										className="text-xs h-7.5 px-3 rounded-lg"
										onPress={() =>
											selectedPlanId && handleCreateOrder(selectedPlanId)
										}
									>
										点击重试
									</Button>
								)}
							</div>
						)}

						{!creatingOrder && !orderError && orderData && (
							<>
								<img
									src={orderData.codeUrl}
									alt="微信支付二维码"
									className="h-full w-full object-contain rounded-lg"
								/>

								{/* Paid Success Overlay */}
								{isPaid && (
									<div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-white/95 animate-in fade-in duration-200">
										<CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
										<span className="text-base font-bold text-emerald-600 mt-2">
											支付成功
										</span>
										<span className="text-xs text-muted mt-0.5">
											尊享特权已即刻生效
										</span>
									</div>
								)}
							</>
						)}
					</div>

					{/* Payment Footer Notes & Dev Mode Button: Line divided */}
					<div className="w-full text-center pt-3">
						<p className="text-xs text-muted flex items-center justify-center gap-1.5">
							<span>微信客户端扫一扫完成支付</span>
						</p>
						<p className="text-[11px] text-muted/70 mt-0.5">
							支付成功后权益自动开通，无需刷新
						</p>

						{/* Dev Mock Action */}
						{!isPaid && (
							<div className="mt-3 pt-2.5 border-t border-border/40 w-full text-center">
								<Button
									size="sm"
									variant="ghost"
									className="text-[11px] h-6.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 cursor-pointer"
									onPress={() => {
										setIsPaid(true);
										stopPolling();
										const duration = currentPlan?.durationDays || 365;
										const tier =
											currentPlan?.tier ||
											(currentPlan?.id.includes("lifetime")
												? "LIFETIME"
												: "PRO");
										mockUpgradeToPro(duration, tier as "PRO" | "LIFETIME");
										if (orderData?.orderNo) {
											cloudClient
												.mockFulfillOrder(orderData.orderNo)
												.catch(() => {});
										}
										setTimeout(() => {
											onSuccess?.();
											onClose?.();
										}, 800);
									}}
								>
									[开发模式] 模拟支付成功
								</Button>
							</div>
						)}
					</div>
				</div>
			</div>
		</Card>
	);
}
