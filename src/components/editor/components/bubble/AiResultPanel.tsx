import { Button, ScrollShadow } from "@heroui/react";
import {
	AlertCircle,
	ArrowDownToLine,
	Check,
	CheckCircle2,
	Copy,
	GitCompare,
	Loader2,
	Sparkles,
	X,
} from "lucide-react";
import { useState } from "react";
import type { ActionState, AiBarAction } from "./types";

export interface AiResultPanelProps {
	state: ActionState;
	result: string;
	activeAction: AiBarAction | null;
	onReplace: () => void;
	onReviewDiff?: () => void;
	onInsertAfter: () => void;
	onCopy: () => void;
	onClose: () => void;
}

/**
 * Loading indicator and result feedback panel for AI actions
 */
export function AiResultPanel({
	state,
	result,
	activeAction,
	onReplace,
	onReviewDiff,
	onInsertAfter,
	onCopy,
	onClose,
}: AiResultPanelProps) {
	const [copied, setCopied] = useState(false);

	const handleCopyClick = () => {
		onCopy();
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	// ── Loading state ──────────────────────────────────────────
	if (state === "loading") {
		return (
			<div className="flex items-center justify-between px-3.5 py-2.5 w-[380px] select-none">
				<div className="flex items-center gap-2.5">
					<Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
					<span className="text-foreground font-medium text-xs">
						正在{activeAction?.label || "处理"}中…
					</span>
				</div>
				<Button
					size="sm"
					variant="ghost"
					onPress={onClose}
					className="h-7 px-2 text-xs text-muted-foreground gap-1"
					aria-label="取消操作"
				>
					<X className="w-3.5 h-3.5" />
					<span>取消</span>
				</Button>
			</div>
		);
	}

	// ── Result & Error state ───────────────────────────────────
	if (state === "result" || state === "error") {
		const actionTitle = activeAction?.label
			? `${activeAction.label}结果`
			: "AI 生成结果";

		return (
			<div className="flex flex-col w-[390px]">
				{/* Top Header: Title & Auxiliary Actions (Copy, Close) */}
				<div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
					<div className="flex items-center gap-1.5 text-foreground font-semibold text-xs">
						{state === "error" ? (
							<>
								<AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" />
								<span className="text-danger">生成失败</span>
							</>
						) : (
							<>
								<Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
								<span>{actionTitle}</span>
							</>
						)}
					</div>

					<div className="flex items-center gap-1">
						{state === "result" && (
							<Button
								size="sm"
								variant="ghost"
								onPress={handleCopyClick}
								className="h-6 px-2 text-xs text-muted-foreground gap-1"
								aria-label="复制文本到剪贴板"
							>
								{copied ? (
									<>
										<Check className="w-3 h-3 text-success" />
										<span className="text-success font-medium">已复制</span>
									</>
								) : (
									<>
										<Copy className="w-3 h-3" />
										<span>复制</span>
									</>
								)}
							</Button>
						)}
						<Button
							size="sm"
							variant="ghost"
							isIconOnly
							onPress={onClose}
							className="h-6 w-6 text-muted-foreground"
							aria-label="关闭"
						>
							<X className="w-3.5 h-3.5" />
						</Button>
					</div>
				</div>

				{/* Middle Body: Result Content Preview with HeroUI ScrollShadow */}
				<ScrollShadow
					className={`px-3.5 py-2.5 max-h-52 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text ${
						state === "error"
							? "text-danger text-xs font-medium bg-danger/5"
							: "text-foreground text-xs bg-muted/5 font-normal"
					}`}
				>
					{result}
				</ScrollShadow>

				{/* Bottom Footer: Primary Editor Actions with HeroUI Button */}
				{state === "result" && (
					<div className="flex items-center gap-1.5 px-3 py-2 border-t border-border/80">
						{onReviewDiff && (
							<Button
								size="sm"
								variant="secondary"
								onPress={onReviewDiff}
								className="flex-1 text-xs gap-1"
								aria-label="对比审阅"
							>
								<GitCompare className="w-3.5 h-3.5" />
								<span>对比审阅</span>
							</Button>
						)}
						<Button
							size="sm"
							variant="primary"
							onPress={onReplace}
							className="flex-1 text-xs gap-1"
							aria-label="直接替换"
						>
							<CheckCircle2 className="w-3.5 h-3.5" />
							<span>直接替换</span>
						</Button>
						<Button
							size="sm"
							variant="secondary"
							onPress={onInsertAfter}
							className="flex-1 text-xs gap-1"
							aria-label="插入下方"
						>
							<ArrowDownToLine className="w-3.5 h-3.5" />
							<span>插入下方</span>
						</Button>
					</div>
				)}
			</div>
		);
	}

	return null;
}
