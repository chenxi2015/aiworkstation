import { Button, Label, toast } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../../workbench/ConfirmDialog";
import {
	useRedbookSession,
} from "../../../../services/publish/redbookService";

export interface RedbookConfigSectionProps {
	publishMode?: "auto" | "fill_only";
	onChangePublishMode: (mode: "auto" | "fill_only") => void;
}

/**
 * Dedicated configuration section for Xiaohongshu publishing,
 * including creator account login status, switch account, and publish mode options.
 */
export function RedbookConfigSection({
	publishMode = "fill_only",
	onChangePublishMode,
}: RedbookConfigSectionProps) {
	const { status, loading, login, switchAccount, openCreatorPage } = useRedbookSession();
	const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);

	const handleLogin = async () => {
		try {
			const res = await login();
			if (res.success) {
				toast.success(
					`小红书账号登录成功${res.user?.nickname ? `：${res.user.nickname}` : ""}`,
				);
			} else if (res.error) {
				toast.warning(`登录未完成：${res.error}`);
			}
		} catch (err) {
			toast.danger(
				`扫码登录异常：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const handleSwitchAccount = async () => {
		try {
			const res = await switchAccount();
			if (res.success) {
				toast.success(
					`小红书账号已切换${res.user?.nickname ? `：${res.user.nickname}` : ""}`,
				);
			} else if (res.error) {
				toast.warning(`切换账号未完成：${res.error}`);
			}
		} catch (err) {
			toast.danger(
				`切换账号异常：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const handleOpenCreatorPage = async () => {
		try {
			await openCreatorPage();
		} catch (err) {
			toast.danger(
				`打开创作者平台失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	return (
		<div className="p-3.5 rounded-xl border border-border/80 bg-surface-secondary/40 space-y-3">
			<div className="flex items-center justify-between">
				<Label className="text-xs font-semibold text-foreground">
					小红书创作者账号与直发设置
				</Label>
				<span className="text-[10px] text-muted">桌面客户端原生直连</span>
			</div>

			{/* Account connection status */}
			{status.isLoggedIn ? (
				<div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
						<span className="font-medium text-foreground">
							已连接账号：{status.nickname || "小红书创作者"}
						</span>
					</div>
					<div className="flex items-center gap-1.5">
						<Button
							size="sm"
							variant="ghost"
							onPress={handleOpenCreatorPage}
							className="h-6 px-2 text-[11px] text-muted hover:text-foreground"
							aria-title="打开已登录的小红书创作者服务平台，查看个人数据与已发布笔记"
						>
							<ExternalLink className="w-3 h-3 mr-1" />
							打开平台主页
						</Button>
						<Button
							size="sm"
							variant="ghost"
							isPending={loading}
							onPress={() => setShowSwitchConfirm(true)}
							className="h-6 px-2 text-[11px] text-muted hover:text-foreground"
						>
							切换账号
						</Button>
					</div>
				</div>
			) : (
				<div className="p-2.5 rounded-lg border border-warning/30 bg-warning/5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
					<span className="text-warning">未检测到已登录的小红书创作者账号</span>
					<div className="flex items-center gap-1.5 self-end sm:self-auto">
						<Button
							size="sm"
							variant="ghost"
							onPress={handleOpenCreatorPage}
							className="h-6 px-2 text-[11px] text-muted hover:text-foreground"
							aria-title="打开小红书创作者服务平台"
						>
							<ExternalLink className="w-3 h-3 mr-1" />
							打开创作者平台
						</Button>
						<Button
							size="sm"
							variant="primary"
							isPending={loading}
							onPress={handleLogin}
							className="h-6 px-2.5 text-[11px] font-medium"
						>
							扫码登录小红书
						</Button>
					</div>
				</div>
			)}

			{/* Publishing mode choice */}
			<div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
				<span className="text-foreground/80">直发模式选择</span>
				<div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-border">
					<button
						type="button"
						onClick={() => onChangePublishMode("fill_only")}
						className={`px-2 py-0.5 text-[11px] rounded-md transition cursor-pointer ${
							publishMode === "fill_only"
								? "bg-accent text-accent-foreground font-medium shadow-2xs"
								: "text-muted hover:text-foreground"
						}`}
					>
						自动填充并核对 (推荐)
					</button>
					<button
						type="button"
						onClick={() => onChangePublishMode("auto")}
						className={`px-2 py-0.5 text-[11px] rounded-md transition cursor-pointer ${
							publishMode === "auto"
								? "bg-accent text-accent-foreground font-medium shadow-2xs"
								: "text-muted hover:text-foreground"
						}`}
					>
						全自动直发
					</button>
				</div>
			</div>

			{/* Secondary Confirmation Dialog for Switching Account */}
			<ConfirmDialog
				isOpen={showSwitchConfirm}
				onOpenChange={setShowSwitchConfirm}
				title="切换小红书创作者账号"
				description={
					<div className="space-y-1.5 text-xs text-muted leading-relaxed">
						<p>
							确定要退出当前已连接的账号
							<strong className="text-foreground font-semibold">
								【{status.nickname || "已登录创作者"}】
							</strong>
							并切换到其他账号吗？
						</p>
						<p className="text-[11px] text-muted/80">
							确认后系统将清除当前会话凭证，并重新打开小红书创作者扫码登录窗口。
						</p>
					</div>
				}
				confirmLabel="确认退出并切换"
				cancelLabel="取消"
				onConfirm={handleSwitchAccount}
			/>
		</div>
	);
}
