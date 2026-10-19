import { Button } from "@heroui/react";
import {
	CheckCircle2,
	ExternalLink,
	Loader2,
	RefreshCw,
	XCircle,
} from "lucide-react";
import type { PlatformPublishResult } from "../types";

export interface PublishResultCardProps {
	result?: PlatformPublishResult;
	onRetry?: () => void;
}

/**
 * Platform publishing result and status banner component
 */
export function PublishResultCard({ result, onRetry }: PublishResultCardProps) {
	if (!result || result.status === "idle") {
		return null;
	}

	return (
		<div
			className={`p-3 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
				result.status === "success"
					? "bg-emerald-500/5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
					: result.status === "error"
						? "bg-red-500/5 border-red-500/30 text-red-600 dark:text-red-400"
						: "bg-surface-secondary border-border text-foreground/80"
			}`}
		>
			<div className="flex items-center gap-2">
				{result.status === "publishing" && (
					<Loader2 className="w-4 h-4 animate-spin text-accent" />
				)}
				{result.status === "success" && (
					<CheckCircle2 className="w-4 h-4 text-emerald-500" />
				)}
				{result.status === "error" && (
					<XCircle className="w-4 h-4 text-red-500" />
				)}
				<span className="font-medium">
					{result.status === "publishing"
						? "正在同步发布到此平台..."
						: result.message ||
							(result.status === "success" ? "发布成功" : "发布失败")}
				</span>
			</div>

			<div className="flex items-center gap-2">
				{result.url && (
					<a
						href={result.url}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 text-[11px] underline hover:opacity-80"
					>
						<span>查看原文</span>
						<ExternalLink className="w-3 h-3" />
					</a>
				)}
				{result.status === "error" && onRetry && (
					<Button
						size="sm"
						variant="outline"
						onPress={onRetry}
						className="h-6 px-2 text-[10px] rounded-md"
					>
						<RefreshCw className="w-2.5 h-2.5 mr-1" />
						重试
					</Button>
				)}
			</div>
		</div>
	);
}
