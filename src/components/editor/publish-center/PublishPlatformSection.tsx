import {
	Checkbox,
	Label,
	ListBox,
	ListBoxItem,
	Select,
	SelectPopover,
	SelectTrigger,
	SelectValue,
} from "@heroui/react";
import {
	CheckCircle2,
	ExternalLink,
	Loader2,
	RefreshCw,
	XCircle,
} from "lucide-react";
import type { PlatformAccountInfo, PublishPlatform } from "../types";

export interface PlatformPublishResult {
	platform: PublishPlatform;
	status: "idle" | "publishing" | "success" | "error";
	message?: string;
	url?: string;
	time?: string;
}

interface PublishPlatformSectionProps {
	selectedPlatforms: Record<PublishPlatform, boolean>;
	onTogglePlatform: (platform: PublishPlatform) => void;
	accounts: PlatformAccountInfo[];
	selectedAccountId: number | null;
	onSelectAccountId: (id: number) => void;
	results: Record<PublishPlatform, PlatformPublishResult>;
	onRetryPlatform?: (platform: PublishPlatform) => void;
}

interface PublishPlatformConfig {
	id: PublishPlatform;
	name: string;
	badge: string;
	iconPath: string;
}

const PLATFORM_CONFIGS: PublishPlatformConfig[] = [
	{
		id: "wechat",
		name: "微信公众号",
		badge: "官方 API 直连",
		iconPath: "/media/gongzhonghao.svg",
	},
	{
		id: "redbook",
		name: "小红书",
		badge: "图文发布包",
		iconPath: "/media/xiaohongshu.svg",
	},
	{
		id: "zhihu",
		name: "知乎",
		badge: "专栏发布包",
		iconPath: "/media/zhihu.svg",
	},
	{
		id: "twitter",
		name: "X / Twitter",
		badge: "社交推文包",
		iconPath: "/media/TwitterX.svg",
	},
];

export function PublishPlatformSection({
	selectedPlatforms,
	onTogglePlatform,
	accounts,
	selectedAccountId,
	onSelectAccountId,
	results,
	onRetryPlatform,
}: PublishPlatformSectionProps) {
	const hasAnyResult = Object.values(results).some(
		(r) => r.status === "success" || r.status === "error",
	);

	return (
		<div className="space-y-3.5">
			{/* Platform Selector Grid */}
			<div className="space-y-2">
				<div className="flex items-center justify-between text-xs">
					<Label className="text-xs font-medium text-foreground">
						选择发布目标平台
					</Label>
					<span className="text-[11px] text-muted">
						支持公众号 API 官方同步，其他平台一键获取发布包
					</span>
				</div>

				<div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
					{PLATFORM_CONFIGS.map((p) => {
						const isChecked = selectedPlatforms[p.id];

						return (
							<div
								key={p.id}
								onClick={() => onTogglePlatform(p.id)}
								className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
									isChecked
										? "border-accent bg-accent/5 ring-1 ring-accent/30 shadow-2xs"
										: "border-border bg-surface hover:border-foreground/30"
								}`}
							>
								<div className="flex items-start justify-between">
									<div className="flex items-center gap-2">
										<div className="w-5 h-5 rounded shrink-0 overflow-hidden flex items-center justify-center">
											<img
												src={p.iconPath}
												alt={p.name}
												className="w-full h-full object-contain"
											/>
										</div>
										<div>
											<div className="text-xs font-semibold text-foreground">
												{p.name}
											</div>
											<div className="text-[10px] text-muted">
												{p.badge}
											</div>
										</div>
									</div>

									{/* HeroUI Checkbox */}
									<div onClick={(e) => e.stopPropagation()}>
										<Checkbox
											isSelected={isChecked}
											onChange={() => onTogglePlatform(p.id)}
											aria-label={p.name}
											variant="secondary"
										>
											<Checkbox.Content>
												<Checkbox.Control>
													<Checkbox.Indicator />
												</Checkbox.Control>
											</Checkbox.Content>
										</Checkbox>
									</div>
								</div>

								{/* WeChat Account Selector inside WeChat platform card */}
								{p.id === "wechat" && isChecked && (
									<div
										className="mt-2.5 pt-2 border-t border-border/50 text-[11px]"
										onClick={(e) => e.stopPropagation()}
									>
										{accounts.length > 0 ? (
											<Select
												aria-label="选择微信公众号账号"
												selectedKey={String(selectedAccountId ?? accounts[0]?.id ?? "")}
												onSelectionChange={(key) => {
													if (key != null) onSelectAccountId(Number(key));
												}}
												className="w-full"
											>
												<SelectTrigger className="w-full h-7 min-h-7 px-2 py-0 text-[11px] rounded-lg border border-border/80 bg-surface text-foreground flex items-center justify-between">
													<SelectValue className="text-[11px] truncate leading-none" />
												</SelectTrigger>
												<SelectPopover className="rounded-xl border border-border bg-surface shadow-lg max-h-48 overflow-y-auto min-w-[180px] z-50">
													<ListBox>
														{accounts.map((acc) => (
															<ListBoxItem
																key={acc.id}
																id={String(acc.id)}
																textValue={acc.label}
																className="text-xs rounded-lg cursor-pointer"
															>
																{acc.label}
															</ListBoxItem>
														))}
													</ListBox>
												</SelectPopover>
											</Select>
										) : (
											<div className="text-warning text-[10px] leading-tight">
												未配置公众号账号（设置中心 → 发布平台）
											</div>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>

			{/* Final Results Display Section */}
			{hasAnyResult && (
				<div className="p-3.5 rounded-xl border border-border/80 bg-surface-secondary/40 space-y-2.5 animate-in fade-in duration-200">
					<div className="text-xs font-semibold text-foreground flex items-center justify-between pb-1 border-b border-border/50">
						<span>各平台发布结果追踪</span>
						<span className="text-[11px] font-normal text-muted">
							实时状态反馈
						</span>
					</div>

					<div className="space-y-2">
						{PLATFORM_CONFIGS.map((p) => {
							const res = results[p.id];
							if (!res || res.status === "idle") return null;

							const isSuccess = res.status === "success";
							const isError = res.status === "error";
							const isLoading = res.status === "publishing";

							return (
								<div
									key={p.id}
									className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition ${
										isSuccess
											? "bg-success/5 border-success/30 text-success-foreground"
											: isError
												? "bg-danger/5 border-danger/30 text-danger-foreground"
												: "bg-surface border-border text-foreground"
									}`}
								>
									<div className="flex items-center gap-2.5 min-w-0">
										{isSuccess && (
											<CheckCircle2 className="w-4 h-4 text-success shrink-0" />
										)}
										{isError && (
											<XCircle className="w-4 h-4 text-danger shrink-0" />
										)}
										{isLoading && (
											<Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
										)}

										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<img src={p.iconPath} alt={p.name} className="w-3.5 h-3.5 object-contain rounded-xs shrink-0" />
												<span className="font-semibold text-foreground">
													{p.name}
												</span>
												<span
													className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
														isSuccess
															? "bg-success/20 text-success"
															: isError
																? "bg-danger/20 text-danger"
																: "bg-accent/20 text-accent"
													}`}
												>
													{isSuccess ? "发布成功" : isError ? "发布失败" : "发布中..."}
												</span>
												{res.time && (
													<span className="text-[10px] text-muted">
														{res.time}
													</span>
												)}
											</div>
											<p className="text-[11px] text-muted truncate mt-0.5">
												{res.message}
											</p>
										</div>
									</div>

									{/* Action Links */}
									<div className="flex items-center gap-2 shrink-0">
										{res.url && (
											<a
												href={res.url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-xs text-accent hover:underline flex items-center gap-0.5"
											>
												<span>查看</span>
												<ExternalLink className="w-3 h-3" />
											</a>
										)}
										{isError && onRetryPlatform && (
											<button
												type="button"
												onClick={() => onRetryPlatform(p.id)}
												className="text-xs text-accent hover:underline flex items-center gap-1 cursor-pointer"
											>
												<RefreshCw className="w-3 h-3" />
												<span>重试</span>
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
