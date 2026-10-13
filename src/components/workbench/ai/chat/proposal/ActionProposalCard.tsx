import { Button } from "@heroui/react";
import { Columns2, FileText, NotebookPen } from "lucide-react";
import { memo } from "react";
import { getModuleByCode } from "../../../../../modules/registry";
import type { ActionTargetObject } from "./resolveActionTarget";

export type ActionProposalStatus = "pending" | "confirmed" | "dismissed";

export interface ActionProposalCardProps {
	target: ActionTargetObject;
	executionForm: string;
	/** 可选：改写意图的动作展示名（如「二创洗稿」「全文润色」） */
	actionLabel?: string;
	skillGuidance?: string;
	status: ActionProposalStatus;
	onConfirm: () => void;
	onDismiss: () => void;
}

const STATUS_LABELS: Record<ActionProposalStatus, string | null> = {
	pending: null,
	confirmed: "已确认",
	dismissed: "已忽略",
};

/**
 * Chat 消息流中的动作提议确认卡片（design D2/D4）：
 * 跨对象/跨模块/带 skill 的改写请求先渲染此卡片，由用户确认后才执行。
 * 确认或忽略后卡片进入惰性态，不会再次自动执行。
 */
export const ActionProposalCard = memo(function ActionProposalCard({
	target,
	executionForm,
	actionLabel,
	skillGuidance,
	status,
	onConfirm,
	onDismiss,
}: ActionProposalCardProps) {
	const moduleLabel = getModuleByCode(target.module)?.label ?? target.module;
	const TargetIcon = target.kind === "note" ? NotebookPen : FileText;
	const statusLabel = STATUS_LABELS[status];

	return (
		<div className="flex justify-start">
			<div className="max-w-[90%] rounded-2xl border border-accent/40 bg-accent-soft/20 dark:bg-accent/10 p-3.5 space-y-3">
				<div className="flex items-center gap-2">
					<div className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
						<Columns2 className="w-4 h-4" />
					</div>
					<div className="min-w-0">
						<p className="text-xs font-semibold text-foreground leading-tight">
							{actionLabel ?? "改写请求"} · {executionForm}
						</p>
						<p className="text-[11px] text-muted leading-tight mt-0.5">
							确认后将前往对应模块执行
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2 rounded-xl bg-surface/80 border border-border/60 px-3 py-2">
					<TargetIcon className="w-4 h-4 text-muted shrink-0" />
					<div className="min-w-0 flex-1">
						<p className="text-xs font-medium text-foreground truncate">
							{target.title}
						</p>
						<p className="text-[11px] text-muted">归属模块：{moduleLabel}</p>
					</div>
				</div>

				{skillGuidance && (
					<p className="text-[11px] text-muted leading-snug line-clamp-2">
						已附带 Skill 指南，将拼入改写要求
					</p>
				)}

				{status === "pending" ? (
					<div className="flex items-center gap-2 pt-0.5">
						<Button
							size="sm"
							className="h-8 px-4 text-xs font-semibold rounded-xl bg-accent text-white hover:opacity-90 cursor-pointer"
							onPress={onConfirm}
						>
							确认执行
						</Button>
						<Button
							size="sm"
							variant="ghost"
							className="h-8 px-4 text-xs rounded-xl text-muted hover:text-foreground cursor-pointer"
							onPress={onDismiss}
						>
							忽略
						</Button>
					</div>
				) : (
					<p className="text-[11px] text-muted pt-0.5">{statusLabel}</p>
				)}
			</div>
		</div>
	);
});
