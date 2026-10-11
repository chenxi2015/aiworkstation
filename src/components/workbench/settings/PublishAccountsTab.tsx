import { Button, toast } from "@heroui/react";
import {
	CheckCircle2,
	Globe,
	Loader2,
	MessageSquare,
	Plus,
	RefreshCw,
	Trash2,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	createWechatMpAccount,
	fetchPlatformAccounts,
	removePlatformAccount,
	revalidatePlatformAccount,
} from "../../../services/api/publishClient";
import type { PlatformAccountInfo } from "../../editor/types";

const PLATFORM_META: Record<
	string,
	{ name: string; icon: typeof MessageSquare; hint: string }
> = {
	"wechat-mp": {
		name: "微信公众号",
		icon: MessageSquare,
		hint: "官方 API 直连：appid + appsecret → 草稿 → 确认发布",
	},
	douyin: {
		name: "抖音",
		icon: Globe,
		hint: "开放平台 OAuth（规划中）",
	},
	redbook: {
		name: "小红书",
		icon: Globe,
		hint: "插件填充通道（规划中）",
	},
	bilibili: {
		name: "哔哩哔哩",
		icon: Globe,
		hint: "插件填充通道（规划中）",
	},
};

/**
 * 设置中心「发布平台」Tab（docs/creator-publish-plan.md 第四节.1）
 * P0 范围：公众号 appid/appsecret 配置 + 验证 + 删除；其余平台显示规划占位。
 */
export function PublishAccountsTab() {
	const [accounts, setAccounts] = useState<PlatformAccountInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [label, setLabel] = useState("");
	const [appid, setAppid] = useState("");
	const [appsecret, setAppsecret] = useState("");
	const [saving, setSaving] = useState(false);
	const [validatingId, setValidatingId] = useState<number | null>(null);

	const reload = useCallback(async () => {
		setLoading(true);
		setAccounts(await fetchPlatformAccounts());
		setLoading(false);
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	const handleSave = async () => {
		if (!appid.trim() || !appsecret.trim()) {
			toast.danger("请填写 appid 与 appsecret");
			return;
		}
		setSaving(true);
		try {
			await createWechatMpAccount({
				label: label.trim() || "默认公众号",
				appid: appid.trim(),
				appsecret: appsecret.trim(),
			});
			toast.success("公众号已连接并保存（凭据本地加密存储）");
			setShowForm(false);
			setLabel("");
			setAppid("");
			setAppsecret("");
			await reload();
		} catch (err) {
			toast.danger(
				`连接失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setSaving(false);
		}
	};

	const handleValidate = async (id: number) => {
		setValidatingId(id);
		try {
			const result = await revalidatePlatformAccount(id);
			if (result.ok) {
				toast.success("连接正常");
			} else {
				toast.danger(`验证失败：${result.reason ?? "未知原因"}`);
			}
			await reload();
		} finally {
			setValidatingId(null);
		}
	};

	const handleDelete = async (account: PlatformAccountInfo) => {
		if (!window.confirm(`确定删除「${account.label}」的配置吗？`)) return;
		await removePlatformAccount(account.id);
		toast.success("已删除");
		await reload();
	};

	const wechatAccounts = accounts.filter((a) => a.platform === "wechat-mp");

	return (
		<div className="space-y-5">
			{/* 微信公众号区块 */}
			<section className="rounded-xl border border-border p-4 space-y-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<MessageSquare className="w-4 h-4 text-accent" />
						<span className="font-semibold text-sm">微信公众号</span>
						<span className="text-[11px] text-muted">
							官方 API 直连 · 草稿 → 确认发布
						</span>
					</div>
					<Button
						size="sm"
						variant="secondary"
						className="text-xs"
						onPress={() => setShowForm((v) => !v)}
					>
						<Plus className="w-3.5 h-3.5" />
						添加公众号
					</Button>
				</div>

				{showForm && (
					<div className="rounded-lg bg-surface-secondary/40 border border-border/60 p-3 space-y-2.5">
						<div className="grid grid-cols-1 gap-2.5">
							<label className="block">
								<span className="text-muted block mb-1">账号备注名</span>
								<input
									type="text"
									value={label}
									onChange={(e) => setLabel(e.target.value)}
									placeholder="例如：我的科技号"
									className="w-full px-3 py-1.5 rounded-md bg-surface border border-border outline-none focus:border-accent text-xs"
								/>
							</label>
							<label className="block">
								<span className="text-muted block mb-1">AppID</span>
								<input
									type="text"
									value={appid}
									onChange={(e) => setAppid(e.target.value)}
									placeholder="wx 开头的公众号 AppID"
									className="w-full px-3 py-1.5 rounded-md bg-surface border border-border outline-none focus:border-accent text-xs font-mono"
								/>
							</label>
							<label className="block">
								<span className="text-muted block mb-1">AppSecret</span>
								<input
									type="password"
									value={appsecret}
									onChange={(e) => setAppsecret(e.target.value)}
									placeholder="公众号后台「设置与开发 → 基本配置」中获取"
									className="w-full px-3 py-1.5 rounded-md bg-surface border border-border outline-none focus:border-accent text-xs font-mono"
								/>
							</label>
						</div>
						<p className="text-[11px] text-muted leading-relaxed">
							⚠️ 需在公众号后台将本机公网 IP 加入「IP 白名单」方可取到
							access_token。凭据经 AES-256-GCM 加密后仅存本机数据库，不上云。
							保存时会先真实验证一次连接。
						</p>
						<div className="flex justify-end gap-2">
							<Button
								size="sm"
								variant="ghost"
								className="text-xs"
								onPress={() => setShowForm(false)}
							>
								取消
							</Button>
							<Button
								size="sm"
								variant="primary"
								className="text-xs"
								isPending={saving}
								onPress={handleSave}
							>
								验证并保存
							</Button>
						</div>
					</div>
				)}

				{loading ? (
					<div className="flex items-center gap-2 text-muted py-2">
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						加载中…
					</div>
				) : wechatAccounts.length === 0 ? (
					<p className="text-muted py-1">尚未配置公众号账号。</p>
				) : (
					<ul className="space-y-2">
						{wechatAccounts.map((account) => (
							<li
								key={account.id}
								className="flex items-center justify-between rounded-lg border border-border/70 bg-surface px-3 py-2.5"
							>
								<div className="flex items-center gap-2.5 min-w-0">
									{account.status === "active" ? (
										<CheckCircle2 className="w-4 h-4 text-success shrink-0" />
									) : (
										<XCircle className="w-4 h-4 text-danger shrink-0" />
									)}
									<div className="min-w-0">
										<div className="font-medium truncate">{account.label}</div>
										<div className="text-[11px] text-muted font-mono truncate">
											{account.credentialsHint}
										</div>
									</div>
								</div>
								<div className="flex items-center gap-1.5 shrink-0">
									<Button
										size="sm"
										variant="ghost"
										className="text-xs"
										isPending={validatingId === account.id}
										onPress={() => void handleValidate(account.id)}
									>
										<RefreshCw className="w-3.5 h-3.5" />
										验证
									</Button>
									<Button
										size="sm"
										variant="ghost"
										className="text-xs text-danger"
										onPress={() => void handleDelete(account)}
									>
										<Trash2 className="w-3.5 h-3.5" />
										删除
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* 其他平台占位 */}
			<section className="rounded-xl border border-dashed border-border p-4 space-y-2 opacity-75">
				<div className="text-sm font-semibold">其他平台（规划中）</div>
				<ul className="space-y-1.5 text-muted">
					{(["douyin", "redbook", "bilibili"] as const).map((code) => {
						const meta = PLATFORM_META[code];
						const PlatformIcon = meta.icon;
						return (
							<li key={code} className="flex items-center gap-2">
								<PlatformIcon className="w-3.5 h-3.5" />
								<span className="text-foreground/80">{meta.name}</span>
								<span>·</span>
								<span>{meta.hint}</span>
							</li>
						);
					})}
				</ul>
			</section>
		</div>
	);
}
