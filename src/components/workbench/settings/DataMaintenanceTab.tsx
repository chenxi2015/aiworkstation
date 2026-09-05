import { Button } from "@heroui/react";
import { Link2Off } from "lucide-react";

interface DataMaintenanceTabProps {
	onClose: () => void;
	onOpenDeadLinks?: () => void;
}

export function DataMaintenanceTab({
	onClose,
	onOpenDeadLinks,
}: DataMaintenanceTabProps) {
	return (
		<div className="flex flex-col gap-3 pt-4">
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
	);
}
