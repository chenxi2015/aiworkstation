import { Button, Drawer, toast } from "@heroui/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { updateDraftContentRpc } from "../../services/api/creatorClient";
import { MarkdownEditor } from "./MarkdownEditor";
import { type DraftWithMaterial, PLATFORM_LABELS } from "./types";

interface DraftEditorDrawerProps {
	draft: DraftWithMaterial | null;
	onClose: () => void;
	onSaved: () => Promise<void>;
}

/**
 * 草稿编辑 Drawer：HeroUI Drawer（placement=right，从右缘滑入的全高面板），
 * 内置 MarkdownEditor（编辑/分屏/预览）。
 * 保存走 updateDraftContentRpc，服务端生成 version+1 的新草稿链节点。
 */
export function DraftEditorDrawer({
	draft,
	onClose,
	onSaved,
}: DraftEditorDrawerProps) {
	const [content, setContent] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (draft) setContent(draft.content);
	}, [draft]);

	const handleSave = async () => {
		if (!draft || saving) return;
		if (!content.trim()) {
			toast.warning("草稿内容不能为空");
			return;
		}
		if (content.trim() === draft.content.trim()) {
			toast.warning("内容未发生变化");
			return;
		}
		setSaving(true);
		try {
			await updateDraftContentRpc({
				draftId: draft.id,
				content: content.trim(),
			});
			toast.success(`已保存为新版本（v${draft.version + 1}）`);
			onClose();
			await onSaved();
		} catch (err) {
			toast.danger(
				`保存失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Drawer.Root
			isOpen={!!draft}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<Drawer.Backdrop variant="blur">
				<Drawer.Content placement="right">
					<Drawer.Dialog className="w-[min(94vw,64rem)]! max-w-none! h-full flex flex-col">
						<Drawer.Header className="shrink-0">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<Drawer.Heading>编辑草稿</Drawer.Heading>
									{draft && (
										<div className="flex items-center gap-2 mt-1.5 flex-wrap">
											<span className="px-1.5 py-0.5 rounded-md bg-accent/10 text-accent text-[10px] font-semibold">
												{PLATFORM_LABELS[draft.platform]}
											</span>
											<span className="text-[10px] text-muted">
												v{draft.version} ·{" "}
												{draft.origin === "ai" ? "AI 生成" : "人工修改"}
											</span>
											<span className="text-[10px] text-muted truncate">
												素材:{draft.materialTitle}
											</span>
										</div>
									)}
								</div>
								<Drawer.CloseTrigger />
							</div>
						</Drawer.Header>
						<Drawer.Body className="flex-1 min-h-0 flex flex-col overflow-hidden">
							<MarkdownEditor
								value={content}
								onChange={setContent}
								onSave={handleSave}
								autoFocus
								className="flex-1 min-h-0"
							/>
						</Drawer.Body>
						<Drawer.Footer className="shrink-0 flex items-center justify-between gap-2">
							<span className="text-[10px] text-muted">
								保存后生成 v{draft ? draft.version + 1 : 1}{" "}
								新版本，原版本保留可溯源
							</span>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="rounded-full cursor-pointer"
									onPress={onClose}
								>
									取消
								</Button>
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="rounded-full flex items-center gap-1.5 cursor-pointer"
									isDisabled={saving}
									onPress={handleSave}
								>
									{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
									存为新版本
								</Button>
							</div>
						</Drawer.Footer>
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer.Root>
	);
}
