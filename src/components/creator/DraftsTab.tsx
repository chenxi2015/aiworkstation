import { Button, toast } from "@heroui/react";
import {
	CheckCircle2,
	Copy,
	Download,
	Loader2,
	Pencil,
	Play,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	exportDraftRpc,
	updateDraftStatusRpc,
} from "../../services/api/creatorClient";
import { AiMarkdownRenderer } from "../workbench/ai/shared/AiMarkdownRenderer";
import { ConfirmDialog } from "../workbench/ConfirmDialog";
import { DraftEditorDrawer } from "./DraftEditorDrawer";
import {
	type DraftStatus,
	type DraftWithMaterial,
	PLATFORM_LABELS,
} from "./types";

interface DraftsTabProps {
	drafts: DraftWithMaterial[];
	loading: boolean;
	onChanged: () => Promise<void>;
}

const LANES: Array<{ status: DraftStatus; label: string; hint: string }> = [
	{ status: "draft_ready", label: "待审", hint: "AI 已生成" },
	{ status: "reviewing", label: "修改中", hint: "人工编辑" },
	{ status: "approved", label: "已定稿", hint: "允许导出" },
	{ status: "exported", label: "已导出", hint: "工作流终点" },
];

/**
 * 草稿箱 Tab：状态泳道 + 内嵌轻量编辑 + 状态流转 + 复制/Markdown 导出。
 * 未 approved 的草稿不允许导出（UI 禁用 + 服务端状态机双重拦截）。
 */
export function DraftsTab({ drafts, loading, onChanged }: DraftsTabProps) {
	const [editing, setEditing] = useState<DraftWithMaterial | null>(null);
	const [busyId, setBusyId] = useState<number | null>(null);
	const [discarding, setDiscarding] = useState<DraftWithMaterial | null>(null);

	const byStatus = useMemo(() => {
		const map = new Map<DraftStatus, DraftWithMaterial[]>();
		for (const lane of LANES) map.set(lane.status, []);
		for (const draft of drafts) {
			map.get(draft.status)?.push(draft);
		}
		return map;
	}, [drafts]);

	const runAction = async (draftId: number, fn: () => Promise<void>) => {
		setBusyId(draftId);
		try {
			await fn();
			await onChanged();
		} catch (err) {
			toast.danger(err instanceof Error ? err.message : String(err));
		} finally {
			setBusyId(null);
		}
	};

	const canExport = (d: DraftWithMaterial) =>
		d.status === "approved" || d.status === "exported";

	const handleCopy = (draft: DraftWithMaterial) =>
		runAction(draft.id, async () => {
			const { content } = await exportDraftRpc({ draftId: draft.id });
			await navigator.clipboard.writeText(content);
			toast.success("已复制到剪贴板，草稿标记为已导出");
		});

	const handleDownload = (draft: DraftWithMaterial) =>
		runAction(draft.id, async () => {
			const { content, platform } = await exportDraftRpc({
				draftId: draft.id,
			});
			const md = [
				"---",
				`platform: ${platform}`,
				`material: ${draft.materialTitle}`,
				`draft_version: v${draft.version}`,
				`exported_at: ${new Date().toISOString()}`,
				"---",
				"",
				content,
				"",
			].join("\n");
			const safeTitle =
				draft.materialTitle.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) ||
				"draft";
			const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `${safeTitle}.${platform}.md`;
			anchor.click();
			URL.revokeObjectURL(url);
			toast.success("Markdown 已下载，草稿标记为已导出");
		});

	if (loading) {
		return (
			<div className="flex-1 flex items-center justify-center gap-2 text-xs text-muted">
				<Loader2 className="w-4 h-4 animate-spin" />
				<span>正在加载草稿箱…</span>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-x-auto overflow-y-hidden min-h-0">
			<div className="h-full max-w-7xl mx-auto px-6 py-5 grid grid-cols-4 gap-3 min-w-[900px]">
				{LANES.map((lane) => {
					const laneDrafts = byStatus.get(lane.status) ?? [];
					return (
						<div
							key={lane.status}
							className="flex flex-col min-h-0 rounded-2xl bg-surface-secondary/30 border border-border"
						>
							<div className="px-3.5 py-2.5 border-b border-border shrink-0 flex items-center gap-2">
								<span className="text-xs font-semibold text-foreground">
									{lane.label}
								</span>
								<span className="text-[10px] text-muted">{lane.hint}</span>
								<span className="ml-auto px-1.5 py-0.5 rounded-full bg-muted/10 text-[10px] text-muted">
									{laneDrafts.length}
								</span>
							</div>
							<div className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2.5">
								{laneDrafts.length === 0 ? (
									<p className="py-6 text-center text-[10px] text-muted">
										暂无草稿
									</p>
								) : (
									laneDrafts.map((draft) => (
										<div
											key={draft.id}
											className="rounded-xl border border-border bg-surface p-3 flex flex-col gap-2"
										>
											<div className="flex items-center gap-1.5 flex-wrap">
												<span className="px-1.5 py-0.5 rounded-md bg-accent/10 text-accent text-[10px] font-semibold">
													{PLATFORM_LABELS[draft.platform]}
												</span>
												<span className="text-[10px] text-muted">
													v{draft.version} ·{" "}
													{draft.origin === "ai" ? "AI 生成" : "人工修改"}
												</span>
											</div>
											<p className="text-[10px] text-muted truncate">
												素材：{draft.materialTitle}
											</p>
											<button
												type="button"
												onClick={() => setEditing(draft)}
												className="relative max-h-36 overflow-hidden rounded-lg text-left cursor-pointer group/preview"
												title="点击打开编辑器"
											>
												<AiMarkdownRenderer content={draft.content} compact />
												<span className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent" />
												<span className="absolute top-1 right-1 opacity-0 group-hover/preview:opacity-100 transition-opacity px-1.5 py-0.5 rounded-md bg-surface/90 border border-border text-[9px] text-muted flex items-center gap-0.5">
													<Pencil className="w-2.5 h-2.5" />
													编辑
												</span>
											</button>
											<div className="flex items-center gap-1 flex-wrap pt-1.5 border-t border-border/60">
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="rounded-full h-6.5 text-[10px] px-2 flex items-center gap-1 cursor-pointer"
													isDisabled={busyId === draft.id}
													onPress={() => setEditing(draft)}
												>
													<Pencil className="w-3 h-3" />
													编辑
												</Button>
												{draft.status === "draft_ready" && (
													<Button
														type="button"
														variant="ghost"
														size="sm"
														className="rounded-full h-6.5 text-[10px] px-2 flex items-center gap-1 cursor-pointer"
														isDisabled={busyId === draft.id}
														onPress={() =>
															runAction(draft.id, () =>
																updateDraftStatusRpc({
																	draftId: draft.id,
																	status: "reviewing",
																}),
															)
														}
													>
														<Play className="w-3 h-3" />
														开始修改
													</Button>
												)}
												{(draft.status === "draft_ready" ||
													draft.status === "reviewing") && (
													<Button
														type="button"
														variant="ghost"
														size="sm"
														className="rounded-full h-6.5 text-[10px] px-2 flex items-center gap-1 text-accent cursor-pointer"
														isDisabled={busyId === draft.id}
														onPress={() =>
															runAction(draft.id, () =>
																updateDraftStatusRpc({
																	draftId: draft.id,
																	status: "approved",
																}),
															)
														}
													>
														<CheckCircle2 className="w-3 h-3" />
														定稿
													</Button>
												)}
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="rounded-full h-6.5 text-[10px] px-2 flex items-center gap-1 cursor-pointer disabled:opacity-40"
													isDisabled={busyId === draft.id || !canExport(draft)}
													onPress={() => handleCopy(draft)}
												>
													<Copy className="w-3 h-3" />
													复制
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="rounded-full h-6.5 text-[10px] px-2 flex items-center gap-1 cursor-pointer disabled:opacity-40"
													isDisabled={busyId === draft.id || !canExport(draft)}
													onPress={() => handleDownload(draft)}
												>
													<Download className="w-3 h-3" />
													.md
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="rounded-full h-6.5 text-[10px] px-2 flex items-center gap-1 text-muted hover:text-danger cursor-pointer ml-auto"
													isDisabled={busyId === draft.id}
													onPress={() => setDiscarding(draft)}
												>
													<Trash2 className="w-3 h-3" />
												</Button>
											</div>
										</div>
									))
								)}
							</div>
						</div>
					);
				})}
			</div>

			<ConfirmDialog
				isOpen={!!discarding}
				onOpenChange={(open) => {
					if (!open) setDiscarding(null);
				}}
				title="废弃草稿"
				description={
					discarding ? (
						<span>
							确定要废弃这条{" "}
							<strong className="font-semibold text-foreground">
								{PLATFORM_LABELS[discarding.platform]}
							</strong>{" "}
							草稿吗？整条版本链都会被软删除。
						</span>
					) : undefined
				}
				confirmLabel="确认废弃"
				onConfirm={async () => {
					if (!discarding) return;
					await runAction(discarding.id, () =>
						updateDraftStatusRpc({
							draftId: discarding.id,
							status: "discarded",
						}),
					);
					setDiscarding(null);
				}}
			/>

			<DraftEditorDrawer
				draft={editing}
				onClose={() => setEditing(null)}
				onSaved={onChanged}
			/>
		</div>
	);
}
