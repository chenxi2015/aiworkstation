import { Button, Modal, toast } from "@heroui/react";
import type { Editor } from "@tiptap/react";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";

export interface SourceCodeModalProps {
	editor: Editor;
	isOpen: boolean;
	onClose: () => void;
}

/**
 * 查看文档 HTML 源代码弹窗（只读 + 一键复制）
 */
export function SourceCodeModal({
	editor,
	isOpen,
	onClose,
}: SourceCodeModalProps) {
	const [html, setHtml] = useState("");

	useEffect(() => {
		if (isOpen) setHtml(editor.getHTML());
	}, [isOpen, editor]);

	const handleCopy = async () => {
		try {
			// 同时写入 text/html 和 text/plain：
			// 粘贴到富文本编辑器时走 text/html 被解析为排版内容，
			// 粘贴到纯文本场景（代码编辑器等）时仍能拿到 HTML 源码。
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": new Blob([html], { type: "text/html" }),
					"text/plain": new Blob([html], { type: "text/plain" }),
				}),
			]);
			toast.success("源代码已复制到剪贴板");
		} catch {
			// 降级：部分环境不支持 ClipboardItem 多格式写入时退化为纯文本
			try {
				await navigator.clipboard.writeText(html);
				toast.success("源代码已复制到剪贴板（纯文本）");
			} catch {
				toast.danger("复制失败，请手动选择复制");
			}
		}
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog
					aria-label="查看源代码"
					className="!max-w-3xl w-full h-[70vh] flex flex-col"
				>
					<Modal.CloseTrigger />
					<Modal.Header className="shrink-0">
						<Modal.Heading>查看源代码</Modal.Heading>
					</Modal.Header>
					<Modal.Body className="flex-1 min-h-0 mt-2">
						<pre className="h-full overflow-auto p-3 rounded-lg bg-muted/5 border border-border/60 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all text-foreground/80 select-text">
							{html}
						</pre>
					</Modal.Body>
					<Modal.Footer className="flex items-center justify-end gap-2 shrink-0 mt-4">
						<Button variant="ghost" size="sm" onPress={onClose}>
							关闭
						</Button>
						<Button
							variant="primary"
							size="sm"
							onPress={handleCopy}
							className="flex items-center gap-1.5"
						>
							<Copy className="w-3.5 h-3.5" />
							复制源代码
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
