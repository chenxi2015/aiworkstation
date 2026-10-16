import { Button, Modal } from "@heroui/react";
import { FileText } from "lucide-react";
import { AiMarkdownRenderer } from "../../workbench/ai/shared/AiMarkdownRenderer";
import type { Material } from "../types";
import { KIND_CONFIG, type MaterialKind } from "./types";

interface MaterialDocModalProps {
	isOpen: boolean;
	material: Material | null;
	onClose: () => void;
}

/**
 * 素材库文档/书签类素材预览弹窗：Markdown 渲染正文，附批注。
 */
export function MaterialDocModal({
	isOpen,
	material,
	onClose,
}: MaterialDocModalProps) {
	if (!material) return null;

	const kind: MaterialKind = material.sourceType === "bookmark" ? "bookmark" : "doc";
	const KindIcon = KIND_CONFIG[kind].icon;

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full !max-w-3xl">
				<Modal.Dialog
					aria-label={`预览文档 - ${material.title}`}
					className="w-full max-h-[80vh] flex flex-col bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden"
				>
					<Modal.CloseTrigger />

					<Modal.Header className="flex flex-col gap-1 pb-2">
						<div className="flex items-center gap-2 pr-6 min-w-0">
							<KindIcon className="w-5 h-5 text-accent shrink-0" />
							<Modal.Heading className="text-base font-semibold text-foreground truncate">
								{material.title}
							</Modal.Heading>
							<span
								className={`shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-medium border ${KIND_CONFIG[kind].badgeClass}`}
							>
								<KindIcon
									className={`w-2.5 h-2.5 shrink-0 ${KIND_CONFIG[kind].iconClass}`}
								/>
								{KIND_CONFIG[kind].label}
							</span>
						</div>
						{material.note && (
							<p className="text-xs text-muted truncate">
								批注：{material.note}
							</p>
						)}
					</Modal.Header>

					<Modal.Body className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
						{material.content?.trim() ? (
							<AiMarkdownRenderer content={material.content} />
						) : (
							<div className="flex flex-col items-center justify-center py-12 text-muted gap-2">
								<FileText className="w-8 h-8 opacity-50" />
								<span className="text-xs">（空素材）</span>
							</div>
						)}
					</Modal.Body>

					<Modal.Footer className="flex items-center justify-end border-t border-border pt-3">
						<Button
							type="button"
							variant="primary"
							size="sm"
							className="rounded-lg h-8 px-4 text-xs cursor-pointer"
							onPress={onClose}
						>
							关闭
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
