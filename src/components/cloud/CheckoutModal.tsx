import type {
	CreateOrderResponse,
	SubscriptionPlan,
} from "@aiworkstation/shared-types";
import { Button, Card, Chip } from "@heroui/react";
import {
	Check,
	CheckCircle2,
	Cloud,
	Crown,
	Database,
	Loader2,
	LogOut,
	QrCode,
	ShieldCheck,
	Sparkles,
	User,
	X,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cloudClient } from "../../lib/cloud/cloudClient";
import { useCloudAuth } from "../../lib/cloud/useCloudAuth";
import { FlutedGlassBackground } from "./FlutedGlassBackground";

const DEFAULT_FALLBACK_PLANS: SubscriptionPlan[] = [
	{
		id: "plan_pro_yearly",
		name: "工作台 Pro 年度尊享会员",
		description:
			"解锁本地优先 AI 创作、无限知识库问答与云端同步（365天无限畅享）",
		priceCents: 3600, // ¥36.00 / 年
		originalPriceCents: 19900,
		durationDays: 365,
		tier: "PRO",
		recommended: true,
	},
];

const MEMBER_PERKS = [
	{
		icon: Database,
		title: "无限知识库语义检索",
		desc: "支持本地全库向量切片与智能交叉语义召回",
	},
	{
		icon: Sparkles,
		title: "本地优先 AI 智能创作",
		desc: "多模型聚合、智能伴写、划词润色与文章工作流",
	},
	{
		icon: Cloud,
		title: "多端云数据安全同步",
		desc: "书签、收藏夹、笔记跨设备加密云端备份与还原",
	},
	{
		icon: Zap,
		title: "尊享极速推理通道",
		desc: "高优先级服务节点保障，低延迟响应与专属支持",
	},
];

export interface CheckoutModalProps {
	isOpen: boolean;
	onClose?: () => void;
	onSuccess?: () => void;
	mandatory?: boolean;
	expiredNotice?: boolean;
}

export function CheckoutModal({
	isOpen,
	onClose,
	onSuccess,
	mandatory = false,
	expiredNotice = false,
}: CheckoutModalProps) {
	const { user, logout, mockUpgradeToPro } = useCloudAuth();
	const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
	const [selectedPlanId, setSelectedPlanId] =
		useState<string>("plan_pro_yearly");
	const [loadingPlans, setLoadingPlans] = useState(false);

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

	// Fetch plans on open (from DB API, fallback to default 36 yuan yearly plan)
	useEffect(() => {
		if (!isOpen) {
			stopPolling();
			setOrderData(null);
			setIsPaid(false);
			return;
		}

		setLoadingPlans(true);
		cloudClient
			.getPlans()
			.then((data) => {
				const activePlans = data.length > 0 ? data : DEFAULT_FALLBACK_PLANS;
				setPlans(activePlans);
				const rec = activePlans.find((p) => p.recommended) || activePlans[0];
				if (rec) setSelectedPlanId(rec.id);
			})
			.catch(() => {
				setPlans(DEFAULT_FALLBACK_PLANS);
				setSelectedPlanId("plan_pro_yearly");
			})
			.finally(() => setLoadingPlans(false));
	}, [isOpen, stopPolling]);

	// Create payment order when selected plan changes or when confirmed
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
		if (selectedPlanId && isOpen) {
			handleCreateOrder(selectedPlanId);
		}
	}, [selectedPlanId, isOpen, handleCreateOrder]);

	if (!isOpen) return null;

	const currentPlan = plans.find((p) => p.id === selectedPlanId);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-300">
			{/* Ambient FlutedGlass Shader Background */}
			<FlutedGlassBackground
				overlayClassName={
					mandatory
						? "bg-background/80 dark:bg-black/75 backdrop-blur-md"
						: "bg-black/60 backdrop-blur-xs"
				}
			/>

			{/* Main Checkout Modal Card */}
			<Card className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-border/80 bg-surface/92 p-5 sm:p-6 shadow-2xl backdrop-blur-2xl transition-all">
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

				{/* Account Info Header Bar in Mandatory Paywall Mode */}
				{mandatory && user && (
					<div className="flex items-center justify-between pb-3.5 mb-4 border-b border-border/60 text-xs">
						<div className="flex items-center gap-2.5">
							{user.avatarUrl ? (
								<img
									src={user.avatarUrl}
									alt="avatar"
									className="w-6 h-6 rounded-full object-cover ring-1 ring-border"
								/>
							) : (
								<div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-accent">
									<User className="w-3.5 h-3.5" />
								</div>
							)}
							<div className="flex items-center gap-1.5">
								<span className="font-semibold text-foreground">
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
							className="text-xs text-muted hover:text-danger flex items-center gap-1.5 cursor-pointer transition py-0.5 px-2 rounded-md hover:bg-danger/10"
						>
							<LogOut className="w-3.5 h-3.5" />
							<span>切换微信账号</span>
						</button>
					</div>
				)}

				{/* Header Section */}
				<div className="flex items-center gap-3.5 mb-5">
					<div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent text-amber-500 ring-1 ring-amber-500/30 shadow-inner">
						<Crown className="w-6 h-6" />
						<span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 ring-2 ring-surface">
							<Sparkles className="w-2 h-2 text-white" />
						</span>
					</div>
					<div>
						<div className="flex items-center gap-2">
							<h3 className="text-xl font-bold tracking-tight text-foreground">
								{expiredNotice
									? "会员已到期，请续费"
									: mandatory
										? "开通工作台尊享会员"
										: "升级会员权益"}
							</h3>
							<Chip
								size="sm"
								variant="secondary"
								className="text-[10px] h-5 px-2 font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20"
							>
								PRO VIP
							</Chip>
						</div>
						<p className="text-xs text-muted mt-0.5">
							{expiredNotice
								? "您的会员已到期，立即续费即可继续畅享本地+云端全部 AI 高级能力"
								: "尊享本地优先 AI 伴写、无限知识库向量检索与多端云端安全同步"}
						</p>
					</div>
				</div>

				{/* Main Layout: Left Plan & Perks + Right Payment QR */}
				<div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
					{/* Left Section: Plan Selector & Privilege Highlights */}
					<div className="md:col-span-7 flex flex-col gap-4">
						{/* Plan Cards */}
						<div className="flex flex-col gap-3">
							{loadingPlans && (
								<div className="py-8 text-center text-xs text-muted rounded-2xl border border-border/60 bg-surface-secondary/20">
									<Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-accent" />
									正在加载会员方案...
								</div>
							)}

							{!loadingPlans &&
								plans.map((plan) => {
									const isSelected = plan.id === selectedPlanId;
									const days = plan.durationDays;
									const perDay = (
										plan.priceCents /
										100 /
										(days || 365)
									).toFixed(2);

									return (
										<Card
											key={plan.id}
											onClick={() => setSelectedPlanId(plan.id)}
											className={`relative p-4 rounded-2xl cursor-pointer transition-all duration-200 select-none ${
												isSelected
													? "border-amber-500/90 ring-2 ring-amber-500/30 bg-gradient-to-br from-amber-500/10 via-surface/95 to-surface shadow-md"
													: "border-border/80 bg-surface/50 hover:bg-surface hover:border-amber-500/40"
											}`}
										>
											{/* Recommended badge */}
											{plan.recommended && (
												<div className="absolute -top-2.5 right-4">
													<Chip
														size="sm"
														variant="primary"
														className="text-[10px] h-5 px-2.5 font-bold shadow-xs bg-gradient-to-r from-amber-500 to-amber-600 text-white border-0"
													>
														🔥 限时超值立省 80%
													</Chip>
												</div>
											)}

											<div className="flex items-center justify-between gap-3">
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-1.5 mb-1">
														<Crown className="w-4 h-4 text-amber-500 shrink-0" />
														<span className="text-sm font-bold text-foreground truncate">
															{plan.name}
														</span>
													</div>
													<div className="text-[11px] text-muted line-clamp-1">
														{plan.description}
													</div>
												</div>

												{/* Price tag */}
												<div className="text-right shrink-0">
													<div className="flex items-baseline justify-end gap-1">
														<span className="text-xs font-semibold text-amber-600">
															¥
														</span>
														<span className="text-2xl font-black text-foreground tracking-tight">
															{(plan.priceCents / 100).toFixed(0)}
														</span>
														<span className="text-xs text-muted">
															/ {days >= 365 ? "年" : `${days}天`}
														</span>
													</div>
													{plan.originalPriceCents > plan.priceCents && (
														<div className="text-[10px] text-muted line-through">
															¥{(plan.originalPriceCents / 100).toFixed(0)}
														</div>
													)}
												</div>
											</div>

											{/* Price per day highlight */}
											<div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
												<span className="text-muted">
													折合仅需{" "}
													<strong className="text-amber-600 font-semibold font-mono">
														约 ¥{perDay} / 天
													</strong>
												</span>
												<span className="text-emerald-600 text-[10px] font-medium flex items-center gap-0.5">
													<ShieldCheck className="w-3 h-3" />
													官方微信保障
												</span>
											</div>
										</Card>
									);
								})}
						</div>

						{/* VIP Privileges Grid Card */}
						<Card className="p-3.5 rounded-2xl border border-border/60 bg-surface-secondary/30">
							<div className="text-xs font-bold text-foreground mb-2.5 flex items-center gap-1.5">
								<Sparkles className="w-3.5 h-3.5 text-amber-500" />
								<span>会员专享权益全览</span>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
								{MEMBER_PERKS.map((perk) => {
									const Icon = perk.icon;
									return (
										<div
											key={perk.title}
											className="flex items-start gap-2 text-left"
										>
											<div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
												<Icon className="w-3 h-3" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="text-xs font-semibold text-foreground flex items-center gap-1">
													<span>{perk.title}</span>
													<Check className="w-3 h-3 text-emerald-500" />
												</div>
												<div className="text-[10px] text-muted leading-tight mt-0.5">
													{perk.desc}
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</Card>
					</div>

					{/* Right Section: WeChat Pay Card */}
					<div className="md:col-span-5">
						<Card className="flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-surface/80 p-4 shadow-sm">
							{/* Header */}
							<div className="w-full text-center pb-2 mb-2 border-b border-border/40">
								<div className="text-xs font-semibold text-foreground flex items-center justify-center gap-1.5">
									<QrCode className="w-4 h-4 text-emerald-500" />
									<span>微信扫码立即开通</span>
								</div>
								<div className="text-lg font-black text-foreground mt-1">
									<span className="text-xs font-semibold text-amber-600 mr-0.5">
										¥
									</span>
									{currentPlan
										? (currentPlan.priceCents / 100).toFixed(2)
										: "36.00"}
								</div>
							</div>

							{/* QR Code Container */}
							<div className="relative flex h-48 w-48 items-center justify-center rounded-2xl border border-border/80 bg-white p-2.5 shadow-inner">
								{creatingOrder && (
									<div className="flex flex-col items-center gap-2 text-muted">
										<Loader2 className="w-7 h-7 animate-spin text-accent" />
										<span className="text-xs font-medium">
											生成支付二维码...
										</span>
									</div>
								)}

								{!creatingOrder && orderError && (
									<p className="p-3 text-center text-xs text-danger leading-relaxed">
										{orderError}
									</p>
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
											<div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/95 backdrop-blur-xs animate-in fade-in duration-200">
												<CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
												<span className="text-sm font-bold text-emerald-600 mt-2">
													支付成功！
												</span>
												<span className="text-xs text-muted mt-0.5">
													会员权益已立即生效
												</span>
											</div>
										)}
									</>
								)}
							</div>

							{/* Safe Payment Hint */}
							<p className="text-[10px] text-muted text-center mt-2.5">
								请使用微信扫码完成支付，支付成功后系统将自动秒级开通会员权益
							</p>

							{/* Dev Mock Action */}
							{!isPaid && (
								<div className="mt-3 pt-2 border-t border-border/40 w-full text-center">
									<Button
										size="sm"
										variant="ghost"
										className="text-[11px] h-6 text-emerald-600 hover:underline cursor-pointer"
										onPress={() => {
											setIsPaid(true);
											stopPolling();
											mockUpgradeToPro(365);
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
										[开发模式] 一键模拟支付 36 元成功（顺延 1 年）
									</Button>
								</div>
							)}
						</Card>
					</div>
				</div>
			</Card>
		</div>
	);
}
