import {
	DragDropProvider,
	type DragEndEvent,
	useDraggable,
	useDroppable,
} from "@dnd-kit/react";
import { Button, Tooltip, toast } from "@heroui/react";
import { Copy, Download, Loader2, Pencil, Trash2 } from "lucide-react";
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
	{ status: "reviewing", label: "创作中", hint: "人工编辑打磨" },
	{ status: "approved", label: "已定稿", hint: "允许导出" },
	{ status: "exported", label: "待发布", hint: "已导出待发布" },
];

const LANE_LABELS = new Map(LANES.map((lane) => [lane.status, lane.label]));

/**
 * 服务端状态机的客户端镜像（见 creator.repo.ts 的 DRAFT_TRANSITIONS）：
 * 状态只向前流转，拖拽落列前先本地校验，不合法时提示而不发请求。
 */
const ALLOWED_TRANSITIONS: Record<DraftStatus, DraftStatus[]> = {
	draft_ready: ["reviewing", "approved"],
	reviewing: ["approved"],
	approved: ["exported"],
	exported: [],
	discarded: [],
};

const LANE_ID_PREFIX = "draft-lane:";
const laneDropId = (status: DraftStatus) => `${LANE_ID_PREFIX}${status}`;
const draftDragId = (draftId: number) => `draft:${draftId}`;

interface DraftDragData {
	kind: "draft";
	draftId: number;
	status: DraftStatus;
}

/**
 * 草稿箱 Tab：状态泳道 + 拖拽流转 + 内嵌轻量编辑 + 复制/Markdown 导出。
 * 卡片拖到目标列即完成状态流转（不再占用卡片按钮位）；
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

	const handleCopy = (draft: DraftWithMaterial) =>
		runAction(draft.id, async () => {
			const { content } = await exportDraftRpc({ draftId: draft.id });
			await navigator.clipboard.writeText(content);
			toast.success("已复制到剪贴板，草稿移入「待发布」");
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
			toast.success("Markdown 已下载，草稿移入「待发布」");
		});

	const handleDragEnd = (event: DragEndEvent) => {
		if (event.canceled) return;
		const data = event.operation.source?.data as DraftDragData | undefined;
		const target = event.operation.target;
		if (!data || !target) return;
		const rawId = String(target.id);
		if (!rawId.startsWith(LANE_ID_PREFIX)) return;
		const targetStatus = rawId.slice(LANE_ID_PREFIX.length) as DraftStatus;
		if (targetStatus === data.status) return;
		if (!ALLOWED_TRANSITIONS[data.status]?.includes(targetStatus)) {
			toast.info(
				`状态只支持向前流转，不能从「${LANE_LABELS.get(data.status)}」移到「${LANE_LABELS.get(targetStatus)}」`,
			);
			return;
		}
		runAction(data.draftId, () =>
			updateDraftStatusRpc({ draftId: data.draftId, status: targetStatus }),
		);
	};

	if (loading) {
		return (
			<div className="flex-1 flex items-center justify-center gap-2 text-xs text-muted">
				<Loader2 className="w-4 h-4 animate-spin" />
				<span>正在加载草稿箱…</span>
			</div>
		);
	}

	return (
		<DragDropProvider onDragEnd={handleDragEnd}>
			<div className="flex-1 overflow-x-auto overflow-y-hidden min-h-0">
				<div className="h-full max-w-7xl mx-auto px-6 py-5 flex flex-col gap-3 min-w-[900px]">
					<p className="shrink-0 text-[10px] text-muted">
						拖拽卡片到目标列即可流转状态；「已定稿」后可复制 / 下载 Markdown
						导出，导出后自动移入「待发布」
					</p>
					<div className="flex-1 min-h-0 grid grid-cols-4 gap-3">
						{LANES.map((lane) => (
							<LaneColumn
								key={lane.status}
								lane={lane}
								drafts={byStatus.get(lane.status) ?? []}
								busyId={busyId}
								onEdit={setEditing}
								onCopy={handleCopy}
								onDownload={handleDownload}
								onDiscard={setDiscarding}
							/>
						))}
					</div>
				</div>
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
		</DragDropProvider>
	);
}

// ================= 泳道列（放置目标） =================

interface LaneColumnProps {
	lane: (typeof LANES)[number];
	drafts: DraftWithMaterial[];
	busyId: number | null;
	onEdit: (draft: DraftWithMaterial) => void;
	onCopy: (draft: DraftWithMaterial) => void;
	onDownload: (draft: DraftWithMaterial) => void;
	onDiscard: (draft: DraftWithMaterial) => void;
}

function LaneColumn({
	lane,
	drafts,
	busyId,
	onEdit,
	onCopy,
	onDownload,
	onDiscard,
}: LaneColumnProps) {
	const { ref, isDropTarget } = useDroppable({ id: laneDropId(lane.status) });

	return (
		<div
			ref={ref}
			className={`flex flex-col min-h-0 rounded-2xl border transition-colors ${
				isDropTarget
					? "bg-accent/5 border-accent/50 ring-1 ring-accent/40"
					: "bg-surface-secondary/30 border-border"
			}`}
		>
			<div className="px-3.5 py-2.5 border-b border-border shrink-0 flex items-center gap-2">
				<span className="text-xs font-semibold text-foreground">
					{lane.label}
				</span>
				<span className="text-[10px] text-muted">{lane.hint}</span>
				<span className="ml-auto px-1.5 py-0.5 rounded-full bg-muted/10 text-[10px] text-muted">
					{drafts.length}
				</span>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2.5">
				{drafts.length === 0 ? (
					<p className="py-6 text-center text-[10px] text-muted">
						{isDropTarget ? "松开移入此列" : "暂无草稿"}
					</p>
				) : (
					drafts.map((draft) => (
						<DraftCard
							key={draft.id}
							draft={draft}
							busy={busyId === draft.id}
							onEdit={onEdit}
							onCopy={onCopy}
							onDownload={onDownload}
							onDiscard={onDiscard}
						/>
					))
				)}
			</div>
		</div>
	);
}

// ================= 草稿卡片（拖拽源） =================

interface DraftCardProps {
	draft: DraftWithMaterial;
	busy: boolean;
	onEdit: (draft: DraftWithMaterial) => void;
	onCopy: (draft: DraftWithMaterial) => void;
	onDownload: (draft: DraftWithMaterial) => void;
	onDiscard: (draft: DraftWithMaterial) => void;
}

function DraftCard({
	draft,
	busy,
	onEdit,
	onCopy,
	onDownload,
	onDiscard,
}: DraftCardProps) {
	const { ref, isDragging } = useDraggable({
		id: draftDragId(draft.id),
		data: {
			kind: "draft",
			draftId: draft.id,
			status: draft.status,
		} satisfies DraftDragData,
	});
	const exportable = draft.status === "approved" || draft.status === "exported";

	return (
		<div
			ref={ref}
			className={`rounded-xl border border-border bg-surface p-3 flex flex-col gap-2 cursor-grab active:cursor-grabbing ${
				isDragging ? "opacity-70 shadow-lg ring-1 ring-accent/40 z-10" : ""
			}`}
		>
			<div className="flex items-center gap-1.5 flex-wrap">
				<span className="px-1.5 py-0.5 rounded-md bg-accent/10 text-accent text-[10px] font-semibold">
					{PLATFORM_LABELS[draft.platform]}
				</span>
				<span className="text-[10px] text-muted">
					v{draft.version} · {draft.origin === "ai" ? "AI 生成" : "人工修改"}
				</span>
			</div>
			<p className="text-[10px] text-muted truncate">
				素材：{draft.materialTitle}
			</p>
			{/*
			 * 预览区不用 <button>：dnd-kit 的 preventActivation 会阻止从
			 * 交互元素（button/a/input…）上发起拖拽，用 role="button" 的 div
			 * 保住可访问性，同时让整张卡片（含预览区）都能拖拽。
			 */}
			<div
				role="button"
				tabIndex={0}
				onClick={() => onEdit(draft)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onEdit(draft);
					}
				}}
				className="relative max-h-36 overflow-hidden rounded-lg text-left cursor-pointer group/preview"
				title="点击打开编辑器"
			>
				<AiMarkdownRenderer content={draft.content} compact />
				<span className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent" />
				<span className="absolute top-1 right-1 opacity-0 group-hover/preview:opacity-100 transition-opacity px-1.5 py-0.5 rounded-md bg-surface/90 border border-border text-[9px] text-muted flex items-center gap-0.5">
					<Pencil className="w-2.5 h-2.5" />
					编辑
				</span>
			</div>
			<div className="flex items-center gap-1 pt-1.5 border-t border-border/60">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="rounded-full h-6.5 text-[10px] px-2 flex items-center gap-1 cursor-pointer"
					isDisabled={busy}
					onPress={() => onEdit(draft)}
				>
					<Pencil className="w-3 h-3" />
					编辑
				</Button>
				<Tooltip>
					<Tooltip.Trigger>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							isIconOnly
							className="rounded-full h-6.5 w-6.5 text-[10px] cursor-pointer disabled:opacity-40"
							aria-label="复制全文（导出）"
							isDisabled={busy || !exportable}
							onPress={() => onCopy(draft)}
						>
							<Copy className="w-3 h-3" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						{exportable ? "复制全文（导出）" : "定稿后才能导出"}
					</Tooltip.Content>
				</Tooltip>
				<Tooltip>
					<Tooltip.Trigger>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							isIconOnly
							className="rounded-full h-6.5 w-6.5 text-[10px] cursor-pointer disabled:opacity-40"
							aria-label="下载 Markdown（导出）"
							isDisabled={busy || !exportable}
							onPress={() => onDownload(draft)}
						>
							<Download className="w-3 h-3" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						{exportable ? "下载 Markdown（导出）" : "定稿后才能导出"}
					</Tooltip.Content>
				</Tooltip>
				<Tooltip>
					<Tooltip.Trigger>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							isIconOnly
							className="rounded-full h-6.5 w-6.5 text-[10px] text-muted hover:text-danger cursor-pointer ml-auto"
							aria-label="废弃草稿"
							isDisabled={busy}
							onPress={() => onDiscard(draft)}
						>
							<Trash2 className="w-3 h-3" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						废弃草稿
					</Tooltip.Content>
				</Tooltip>
			</div>
		</div>
	);
}
