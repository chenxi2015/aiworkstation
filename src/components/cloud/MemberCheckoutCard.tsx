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
	QrCode,
	RotateCw,
	Sparkles,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cloudClient } from "../../lib/cloud/cloudClient";
import { useCloudAuth } from "../../lib/cloud/useCloudAuth";

/** 档位展示名（会员权益矩阵见 docs/ai-config-membership-v2-plan.md） */
const TIER_LABELS: Record<string, string> = {
	VIP: "VIP",
	SVIP: "SVIP",
	LIFETIME: "终身会员",
	PRO: "VIP",
};

/** 套餐未配置 benefits 时按档位的兜底权益清单 */
const TIER_FALLBACK_PERKS: Record<string, string[]> = {
	VIP: [
		"官方通道 · AI 智能对话",
		"官方通道 · 知识库语义检索（向量）",
		"官方通道 · 联网搜索",
		"多端云数据安全同步",
	],
	SVIP: [
		"VIP 全部权益",
		"官方通道 · 视觉模型理解",
		"官方通道 · 封面生图 / 视频生成",
		"优先体验新能力",
	],
	LIFETIME: [
		"SVIP 全部能力永久解锁",
		"未来新能力免费更新",
		"一次买断 · 永久有效",
		"专属创始身份标识",
	],
};

export interface MemberCheckoutCardProps {
	onClose?: () => void;
	onSuccess?: () => void;
	mandatory?: boolean;
	expiredNotice?: boolean;
	className?: string;
	title?: string;
	description?: string;
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
}: MemberCheckoutCardProps) {
	const { logout, mockUpgradeToPro } = useCloudAuth();
	const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
	const [selectedPlanId, setSelectedPlanId] = useState<string>("");
	const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
		"monthly",
	);
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

	// 计费周期：月付 / 年付切换（终身买断始终展示）。
	// 周期来自数据库 billing_cycle 列，缺省按 durationDays 推断。
	const cycleOf = (p: SubscriptionPlan): "monthly" | "yearly" | "lifetime" =>
		p.billingCycle ??
		(p.tier === "LIFETIME" || p.durationDays >= 3650
			? "lifetime"
			: p.durationDays >= 365
				? "yearly"
				: "monthly");
	const cyclePlans = plans.filter((p) => cycleOf(p) === billingCycle);
	const lifetimePlans = plans.filter((p) => cycleOf(p) === "lifetime");
	const visiblePlans = [...cyclePlans, ...lifetimePlans];

	// 切换周期 / 套餐列表刷新后，保持选中同档位套餐，否则回退推荐项
	useEffect(() => {
		if (plans.length === 0) return;
		const selected = plans.find((p) => p.id === selectedPlanId);
		if (selected && visiblePlans.some((p) => p.id === selected.id)) return;
		const sameTier = selected
			? cyclePlans.find((p) => p.tier === selected.tier)
			: undefined;
		const fallback =
			sameTier ??
			visiblePlans.find((p) => p.recommended) ??
			visiblePlans[0];
		if (fallback) setSelectedPlanId(fallback.id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [billingCycle, plans]);

	// 核心特权随选中套餐切换：优先取数据库套餐配置的 benefits，缺省按档位兜底
	const currentTier = currentPlan?.tier ?? "VIP";
	const currentPerks =
		currentPlan?.benefits && currentPlan.benefits.length > 0
			? currentPlan.benefits
			: (TIER_FALLBACK_PERKS[currentTier] ?? TIER_FALLBACK_PERKS.VIP);
	const currentTierLabel = TIER_LABELS[currentTier] ?? currentTier;

	return (
		<Card
			className={`relative w-full max-w-[920px] max-h-[85vh] overflow-y-auto rounded-3xl border border-border/80 bg-surface/98 p-4 sm:p-6 shadow-xl backdrop-blur-xl transition-all ${className}`}
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

			{/* Header Section（精简：只留一句标题与一句说明） */}
			<div className="mb-5 pr-8">
				<h3 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
					<Crown className="w-4.5 h-4.5 text-amber-500 shrink-0" />
					{title ??
						(expiredNotice
							? "会员已到期，请续费"
							: mandatory
								? "开通工作台尊享会员"
								: "升级会员权益")}
				</h3>
				<p className="text-xs text-muted mt-1 leading-normal">
					{description ??
						"开启尊享会员，解锁本地优先 AI 深度创作、无限知识库问答与多端安全同步"}
				</p>
			</div>

			{/* Main Layout: Line-divided Left & Right columns */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pt-5 border-t border-border/60">
				{/* Left Column: Plan Selector & Privilege Highlights */}
				<div className="lg:col-span-8 flex flex-col justify-between gap-6 lg:border-r lg:border-border/60 lg:pr-8">
					{/* Billing Cycle Toggle（月付 / 年付，年付折扣由 originalPriceCents 划线价驱动） */}
					{!loadingPlans && !plansError && cyclePlans.length > 0 && (
						<div className="flex items-center justify-center">
							<div className="inline-flex items-center p-1 rounded-full bg-surface-secondary/70 border border-border/60">
								{(["monthly", "yearly"] as const).map((c) => {
									const active = billingCycle === c;
									const yearlySavings =
										c === "yearly"
											? plans
													.filter((p) => cycleOf(p) === "yearly")
													.reduce(
														(max, p) =>
															p.originalPriceCents > p.priceCents
																? Math.max(
																		max,
																		p.originalPriceCents - p.priceCents,
																	)
																: max,
														0,
													)
											: 0;
									return (
										<button
											key={c}
											type="button"
											onClick={() => setBillingCycle(c)}
											className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
												active
													? "bg-surface text-foreground shadow-sm border border-border/70"
													: "text-muted hover:text-foreground border border-transparent"
											}`}
										>
											{c === "monthly" ? "按月付" : "按年付"}
											{c === "yearly" && yearlySavings > 0 && (
												<span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
													省 ¥{(yearlySavings / 100).toFixed(0)}
												</span>
											)}
										</button>
									);
								})}
							</div>
						</div>
					)}

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

						{!loadingPlans && !plansError && visiblePlans.length === 0 && (
							<div className="py-8 text-center text-xs text-muted border border-dashed border-border/70 rounded-xl">
								暂无可购买的会员方案
							</div>
						)}

						{!loadingPlans && visiblePlans.length > 0 && (
							<div className="flex flex-col gap-3">
								{visiblePlans.map((plan) => {
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
														<span
															className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
																plan.tier === "LIFETIME"
																	? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
																	: plan.tier === "SVIP"
																		? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
																		: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
															}`}
														>
															{TIER_LABELS[plan.tier] ?? plan.tier}
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
																/{" "}
																{days >= 365
																	? "年"
																	: days >= 28 && days <= 31
																		? "月"
																		: `${days}天`}
															</span>
														)}
														{isLifetime && (
															<span className="text-xs text-amber-600 font-semibold ml-1">
																终身买断
															</span>
														)}
													</div>
													{plan.originalPriceCents > plan.priceCents && (
													<div className="mt-0.5 flex items-center justify-end gap-1.5">
														<span className="text-xs text-muted line-through">
															¥{(plan.originalPriceCents / 100).toFixed(0)}
														</span>
														{cycleOf(plan) === "yearly" && (
															<span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
																省 ¥
																{(
																	(plan.originalPriceCents - plan.priceCents) /
																	100
																).toFixed(0)}
															</span>
														)}
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
							<span>{currentTierLabel} 专享核心特权</span>
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-muted">
							{currentPerks.map((perk) => (
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
				<div className="lg:col-span-4 flex flex-col justify-between items-center pt-2 lg:pt-0">
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
												: "VIP");
										mockUpgradeToPro(
											duration,
											tier as "VIP" | "SVIP" | "LIFETIME",
										);
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
