import { Tooltip, toast } from "@heroui/react";
import { Check, Copy, RotateCw, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import type { PageBridge } from "../../../../../types/pageBridge";

export interface AssistantActionBarProps {
	content: string;
	index: number;
	isLoading: boolean;
	pageBridge?: PageBridge | null;
	onResend: (index: number) => void;
	onDelete: (index: number) => void;
	onStartSelectDelete?: (index: number) => void;
}

/**
 * Bottom action bar for assistant message, displaying module actions and standard tools
 */
export const AssistantActionBar = memo(function AssistantActionBar({
	content,
	index,
	isLoading,
	pageBridge: _pageBridge,
	onResend,
	onDelete,
	onStartSelectDelete,
}: AssistantActionBarProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(content);
		setCopied(true);
		toast.success("已复制到剪贴板");
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 text-muted text-xs pt-1">
			{/* Copy full answer */}
			<Tooltip>
				<Tooltip.Trigger>
					<button
						type="button"
						onClick={handleCopy}
						className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors cursor-pointer"
						aria-label="复制回答"
					>
						{copied ? (
							<Check className="w-3.5 h-3.5 text-emerald-500" />
						) : (
							<Copy className="w-3.5 h-3.5" />
						)}
					</button>
				</Tooltip.Trigger>
				<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
					{copied ? "已复制" : "复制"}
				</Tooltip.Content>
			</Tooltip>

			{/* Regenerate */}
			<Tooltip>
				<Tooltip.Trigger>
					<button
						type="button"
						onClick={() => onResend(index)}
						disabled={isLoading}
						className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 disabled:opacity-40 transition-colors cursor-pointer"
						aria-label="重新生成"
					>
						<RotateCw className="w-3.5 h-3.5" />
					</button>
				</Tooltip.Trigger>
				<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
					重新生成
				</Tooltip.Content>
			</Tooltip>

			{/* Delete message */}
			<Tooltip>
				<Tooltip.Trigger>
					<button
						type="button"
						onClick={() =>
							onStartSelectDelete ? onStartSelectDelete(index) : onDelete(index)
						}
						className="p-1 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
						aria-label="删除"
					>
						<Trash2 className="w-3.5 h-3.5" />
					</button>
				</Tooltip.Trigger>
				<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
					删除
				</Tooltip.Content>
			</Tooltip>
		</div>
	);
});
