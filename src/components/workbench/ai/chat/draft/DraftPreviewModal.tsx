import { Button, Modal, ScrollShadow, toast } from "@heroui/react";
import { Check, Copy, Loader2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { ChatDraftPayload } from "../../../../../hooks/ai/useChatMessages";
import { AiMarkdownRenderer } from "../../shared/AiMarkdownRenderer";
import { getDraftKindMeta } from "./draftMeta";

export interface DraftPreviewModalProps {
	isOpen: boolean;
	onClose: () => void;
	draft: ChatDraftPayload;
	loading: boolean;
	content: string;
}

/**
 * Modern AI agent style preview dialog for draft content (Markdown or JSON).
 */
export const DraftPreviewModal = memo(function DraftPreviewModal({
	isOpen,
	onClose,
	draft,
	loading,
	content,
}: DraftPreviewModalProps) {
	const meta = getDraftKindMeta(draft);
	const [hasCopied, setHasCopied] = useState(false);

	const formattedJson = useMemo(() => {
		if (!meta.isJsonKind) return "";
		try {
			return JSON.stringify(JSON.parse(content), null, 2);
		} catch {
			return content;
		}
	}, [content, meta.isJsonKind]);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(
				meta.isJsonKind ? formattedJson : content,
			);
			setHasCopied(true);
			toast.success("草稿内容已复制到剪贴板");
			setTimeout(() => setHasCopied(false), 2000);
		} catch {
			toast.danger("复制失败");
		}
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
			className="z-60"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog
					aria-label={`预览草稿：${draft.title}`}
					className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-surface border border-border/70 shadow-xl overflow-hidden"
				>
					<Modal.CloseTrigger />
					<Modal.Header className="shrink-0 px-5 pt-4 pb-3 border-b border-border/40">
						<div className="flex items-center justify-between gap-3 pr-6">
							<div className="flex items-center gap-2.5 min-w-0">
								<div
									className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBgClass} ${meta.iconColorClass}`}
								>
									<meta.icon className="w-4 h-4" />
								</div>
								<div className="min-w-0">
									<Modal.Heading className="text-sm font-semibold truncate text-foreground">
										{meta.displayTitle}
									</Modal.Heading>
									<p className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
										<span
											className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${meta.badgeClass}`}
										>
											{meta.badgeLabel}
										</span>
										<span>
											{meta.isJsonKind
												? `${draft.wordCount} 个结构元素`
												: `约 ${draft.wordCount} 字`}
										</span>
									</p>
								</div>
							</div>

							{!loading && content && (
								<Button
									size="sm"
									variant="ghost"
									className="h-7 px-2.5 text-xs text-muted hover:text-foreground rounded-lg cursor-pointer shrink-0"
									onPress={handleCopy}
								>
									{hasCopied ? (
										<Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
									) : (
										<Copy className="w-3.5 h-3.5 mr-1" />
									)}
									{hasCopied ? "已复制" : "复制全文"}
								</Button>
							)}
						</div>
					</Modal.Header>

					<Modal.Body className="flex-1 min-h-0 p-4 pt-3">
						{loading ? (
							<div className="flex flex-col items-center justify-center h-56 gap-2 text-muted">
								<Loader2 className="w-6 h-6 animate-spin text-accent" />
								<span className="text-xs">正在调取草稿内容…</span>
							</div>
						) : meta.isJsonKind ? (
							<ScrollShadow className="max-h-[60vh] rounded-xl border border-border/50 bg-surface-secondary/30 p-4">
								<pre className="text-xs text-muted font-mono whitespace-pre-wrap break-all select-text leading-relaxed">
									{formattedJson}
								</pre>
							</ScrollShadow>
						) : (
							<ScrollShadow className="max-h-[60vh] rounded-xl border border-border/50 bg-surface-secondary/20 p-4 sm:p-5">
								<AiMarkdownRenderer content={content} compact={false} />
							</ScrollShadow>
						)}
					</Modal.Body>

					<Modal.Footer className="shrink-0 px-5 py-2.5 border-t border-border/40 flex items-center justify-between gap-2 bg-surface-secondary/15">
						<span className="text-[11px] text-muted">
							当前为本地草稿暂存态，落点后将正式保存
						</span>
						<Button
							size="sm"
							variant="secondary"
							className="h-7.5 px-3.5 text-xs rounded-lg cursor-pointer font-medium"
							onPress={onClose}
						>
							关闭
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
});

