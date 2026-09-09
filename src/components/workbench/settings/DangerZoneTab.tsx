import { Button, Input, TextField, toast } from "@heroui/react";
import {
	AlertTriangle,
	Link2Off,
	Loader2,
	ShieldAlert,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { WorkbenchStorageService } from "../../../services/workbenchStorage";

interface DangerZoneTabProps {
	onClose: () => void;
	onDataCleared?: () => void;
	onOpenDeadLinks?: () => void;
}

export function DangerZoneTab({
	onClose,
	onDataCleared,
	onOpenDeadLinks,
}: DangerZoneTabProps) {
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const [clearConfirmText, setClearConfirmText] = useState("");
	const [isClearing, setIsClearing] = useState(false);

	const handleClearAllData = async () => {
		if (clearConfirmText.trim() !== "清空") {
			toast.warning("请输入「清空」以确认操作");
			return;
		}
		setIsClearing(true);
		try {
			const { backupPath } = await WorkbenchStorageService.clearAllDataInDb();
			WorkbenchStorageService.clearAllChatData();
			onDataCleared?.();
			toast.success(
				backupPath
					? `所有数据已清空，备份已保存至 ${backupPath}`
					: "所有数据已清空",
			);
			setShowClearConfirm(false);
			setClearConfirmText("");
			onClose();
		} catch (err) {
			toast.danger(
				`清空失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setIsClearing(false);
		}
	};

	return (
		<div className="flex flex-col gap-6 pt-4">
			{/* Section 1: Dead Links Cleanup */}
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2 pb-1 border-b border-border">
					<Link2Off className="w-4 h-4 text-accent shrink-0" />
					<span className="font-semibold text-foreground text-xs">
						失效链接清理 (Dead Links)
					</span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<p className="text-[11px] text-muted leading-relaxed flex-1">
						检测所有收藏链接的可访问性，找出已经过期、404
						或域名失效的网址并批量清理。服务端异步并发检测，被反爬拦截的链接不会误删。
					</p>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="rounded-full flex items-center gap-1.5 cursor-pointer shrink-0"
						onPress={() => {
							onClose();
							onOpenDeadLinks?.();
						}}
					>
						<Link2Off className="w-3.5 h-3.5" />
						<span>清理失效链接</span>
					</Button>
				</div>
			</div>

			{/* Section 2: Clear All Data */}
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2 pb-1 border-b border-danger/20">
					<ShieldAlert className="w-4 h-4 text-danger shrink-0" />
					<span className="font-semibold text-danger text-xs">
						危险区域 (Danger Zone)
					</span>
				</div>

				{!showClearConfirm ? (
					<div className="flex items-center justify-between gap-4">
						<p className="text-[11px] text-muted leading-relaxed flex-1">
							清空所有文件夹、收藏链接与本地聊天记录（AI
							配置会保留）。操作前会自动备份数据库到 .aiworkstation/backups。
						</p>
						<Button
							type="button"
							variant="danger-soft"
							size="sm"
							className="rounded-full flex items-center gap-1.5 cursor-pointer shrink-0"
							onPress={() => setShowClearConfirm(true)}
						>
							<Trash2 className="w-3.5 h-3.5" />
							<span>清空所有数据</span>
						</Button>
					</div>
				) : (
					<div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 flex flex-col gap-3">
						<div className="flex items-start gap-2 text-xs text-danger">
							<AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
							<span className="leading-relaxed">
								此操作将永久删除所有文件夹、收藏链接和本地聊天记录，无法撤回（数据库会自动备份一份）。请输入「清空」确认：
							</span>
						</div>
						<div className="flex items-center gap-2">
							<TextField
								value={clearConfirmText}
								onChange={setClearConfirmText}
								className="flex-1"
							>
								<Input placeholder="清空" variant="secondary" />
							</TextField>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full cursor-pointer shrink-0"
								onPress={() => {
									setShowClearConfirm(false);
									setClearConfirmText("");
								}}
							>
								取消
							</Button>
							<Button
								type="button"
								variant="danger-soft"
								size="sm"
								className="rounded-full flex items-center gap-1 cursor-pointer shrink-0"
								isDisabled={isClearing || clearConfirmText.trim() !== "清空"}
								onPress={handleClearAllData}
							>
								{isClearing ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<Trash2 className="w-3.5 h-3.5" />
								)}
								<span>{isClearing ? "清空中..." : "确认清空"}</span>
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
