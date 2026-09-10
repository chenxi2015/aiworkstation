import { Button, Input, Label, Modal, TextField, toast } from "@heroui/react";
import {
	Archive,
	Bookmark,
	FileText,
	Film,
	Folder,
	FolderPlus,
	Image as ImageIcon,
	Inbox,
	Layers,
	Loader2,
	Paperclip,
	Pencil,
	PenSquare,
	Plus,
	Trash2,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
	createMaterialFolderRpc,
	deleteMaterialFolderRpc,
	fetchMaterialFolders,
	updateMaterialFolderRpc,
	updateMaterialRpc,
} from "../../services/api/creatorClient";
import { ConfirmDialog } from "../workbench/ConfirmDialog";
import { ImportMaterialModal } from "./ImportMaterialModal";
import type { Material, MaterialFolder } from "./types";

interface MaterialsTabProps {
	materials: Material[];
	loading: boolean;
	onChanged: () => Promise<void>;
	onGoCreate: (materialId: number) => void;
}

/** 左侧文件夹选中态：全部 / 未归档 / 某个文件夹 id */
type FolderSelection = "all" | "unfiled" | number;

/** 右侧内容类型筛选 tab */
type TypeTab = "all" | "video" | "image" | "doc" | "bookmark";

const TYPE_TABS: Array<{
	id: TypeTab;
	label: string;
	icon: typeof Layers;
}> = [
	{ id: "all", label: "全部", icon: Layers },
	{ id: "video", label: "视频", icon: Film },
	{ id: "image", label: "图片", icon: ImageIcon },
	{ id: "doc", label: "文档", icon: FileText },
	{ id: "bookmark", label: "书签", icon: Bookmark },
];

const KIND_BADGES: Record<Exclude<TypeTab, "all">, string> = {
	video: "视频",
	image: "图片",
	doc: "文档",
	bookmark: "书签",
};

const SOURCE_BADGES: Record<Material["sourceType"], string> = {
	manual: "手动",
	bookmark: "书签",
};

/**
 * 素材内容归类：有视频资产 → 视频；有图片资产 → 图片；
 * 书签快照 → 书签；其余（文本/Markdown/音频/其他文件）→ 文档。
 */
function getMaterialKind(material: Material): Exclude<TypeTab, "all"> {
	const kinds = (material.assets ?? []).map((a) => a.kind);
	if (kinds.includes("video")) return "video";
	if (kinds.includes("image")) return "image";
	if (material.sourceType === "bookmark") return "bookmark";
	return "doc";
}

/**
 * 素材库 Tab：左侧文件夹列表 + 右侧素材 table（按类型 tab 筛选）。
 * 导入统一入口见 ImportMaterialModal，文件落 filesRootDir 根目录。
 */
export function MaterialsTab({
	materials,
	loading,
	onChanged,
	onGoCreate,
}: MaterialsTabProps) {
	const [folders, setFolders] = useState<MaterialFolder[]>([]);
	const [selection, setSelection] = useState<FolderSelection>("all");
	const [typeTab, setTypeTab] = useState<TypeTab>("all");
	const [showImportModal, setShowImportModal] = useState(false);
	const [folderModal, setFolderModal] = useState<{
		folder: MaterialFolder | null;
	} | null>(null);
	const [deletingFolder, setDeletingFolder] = useState<MaterialFolder | null>(
		null,
	);
	const [deleteFolderBusy, setDeleteFolderBusy] = useState(false);
	const [archiving, setArchiving] = useState<Material | null>(null);
	const [archiveBusy, setArchiveBusy] = useState(false);

	const loadFolders = useCallback(async () => {
		setFolders(await fetchMaterialFolders());
	}, []);

	useEffect(() => {
		loadFolders();
	}, [loadFolders]);

	const handleChanged = useCallback(async () => {
		await Promise.all([onChanged(), loadFolders()]);
	}, [onChanged, loadFolders]);

	// 选中的文件夹被删除后回退到「全部」
	useEffect(() => {
		if (
			typeof selection === "number" &&
			!folders.some((f) => f.id === selection)
		) {
			setSelection("all");
		}
	}, [selection, folders]);

	const currentFolder =
		typeof selection === "number"
			? (folders.find((f) => f.id === selection) ?? null)
			: null;

	const folderFiltered = materials.filter((m) => {
		if (selection === "all") return true;
		if (selection === "unfiled") return !m.folderId;
		return m.folderId === selection;
	});

	const visibleMaterials = folderFiltered.filter((m) =>
		typeTab === "all" ? true : getMaterialKind(m) === typeTab,
	);

	const unfiledCount = materials.filter((m) => !m.folderId).length;

	const handleArchive = async () => {
		if (!archiving) return;
		setArchiveBusy(true);
		try {
			await updateMaterialRpc({ id: archiving.id, status: "archived" });
			toast.success(`素材「${archiving.title}」已归档`);
			setArchiving(null);
			await handleChanged();
		} catch (err) {
			toast.danger(
				`归档失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setArchiveBusy(false);
		}
	};

	const handleDeleteFolder = async () => {
		if (!deletingFolder) return;
		setDeleteFolderBusy(true);
		try {
			await deleteMaterialFolderRpc({ id: deletingFolder.id });
			toast.success(`文件夹「${deletingFolder.name}」已删除，素材已移回未归档`);
			setDeletingFolder(null);
			await handleChanged();
		} catch (err) {
			toast.danger(
				`删除失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setDeleteFolderBusy(false);
		}
	};

	return (
		<div className="flex-1 flex min-h-0">
			{/* 左侧：文件夹列表 */}
			<aside className="w-52 shrink-0 border-r border-border bg-surface/40 flex flex-col">
				<div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
					<span className="text-xs font-semibold text-foreground">
						素材文件夹
					</span>
					<button
						type="button"
						title="新建文件夹"
						onClick={() => setFolderModal({ folder: null })}
						className="p-1 rounded-md text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
					>
						<Plus className="w-3.5 h-3.5" />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
					<FolderRow
						icon={<Layers className="w-3.5 h-3.5" />}
						label="全部素材"
						count={materials.length}
						active={selection === "all"}
						onClick={() => setSelection("all")}
					/>
					<FolderRow
						icon={<Inbox className="w-3.5 h-3.5" />}
						label="未归档"
						count={unfiledCount}
						active={selection === "unfiled"}
						onClick={() => setSelection("unfiled")}
					/>
					{folders.length > 0 && (
						<div className="my-1.5 border-t border-border/60" />
					)}
					{folders.map((folder) => (
						<FolderRow
							key={folder.id}
							icon={<Folder className="w-3.5 h-3.5" />}
							label={folder.name}
							count={folder.materialCount ?? 0}
							active={selection === folder.id}
							onClick={() => setSelection(folder.id)}
							onRename={() => setFolderModal({ folder })}
							onDelete={() => setDeletingFolder(folder)}
						/>
					))}
					{folders.length === 0 && (
						<p className="px-2 pt-3 text-[10px] text-muted leading-relaxed">
							还没有文件夹，点右上角 + 或顶部「新建文件夹」创建一个
						</p>
					)}
				</div>
			</aside>

			{/* 右侧：文件夹内容 table */}
			<section className="flex-1 min-w-0 flex flex-col">
				<div className="shrink-0 px-5 pt-4 border-b border-border">
					<div className="flex flex-wrap items-center gap-2 mb-3">
						<h2 className="text-sm font-semibold text-foreground mr-1">
							{selection === "all"
								? "全部素材"
								: selection === "unfiled"
									? "未归档"
									: (currentFolder?.name ?? "全部素材")}
						</h2>
						<span className="text-[10px] text-muted">
							{folderFiltered.length} 条素材
						</span>
						<div className="ml-auto flex items-center gap-2">
							<Button
								type="button"
								variant="secondary"
								size="sm"
								className="rounded-full flex items-center gap-1.5 cursor-pointer"
								onPress={() => setFolderModal({ folder: null })}
							>
								<FolderPlus className="w-3.5 h-3.5" />
								新建文件夹
							</Button>
							<Button
								type="button"
								variant="primary"
								size="sm"
								className="rounded-full flex items-center gap-1.5 cursor-pointer"
								onPress={() => setShowImportModal(true)}
							>
								<Plus className="w-3.5 h-3.5" />
								导入素材
							</Button>
						</div>
					</div>
					<div className="flex items-center gap-1">
						{TYPE_TABS.map((tab) => {
							const Icon = tab.icon;
							const active = typeTab === tab.id;
							const count =
								tab.id === "all"
									? folderFiltered.length
									: folderFiltered.filter((m) => getMaterialKind(m) === tab.id)
											.length;
							return (
								<button
									key={tab.id}
									type="button"
									onClick={() => setTypeTab(tab.id)}
									className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
										active
											? "border-accent text-accent"
											: "border-transparent text-muted hover:text-foreground"
									}`}
								>
									<Icon className="w-3.5 h-3.5" />
									{tab.label}
									{count > 0 && (
										<span className="px-1.5 py-0.5 rounded-full bg-muted/10 text-[10px] text-muted">
											{count}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</div>

				<div className="flex-1 overflow-y-auto min-h-0">
					{loading ? (
						<div className="py-16 flex items-center justify-center gap-2 text-xs text-muted">
							<Loader2 className="w-4 h-4 animate-spin" />
							<span>正在加载素材库…</span>
						</div>
					) : visibleMaterials.length === 0 ? (
						<div className="m-5 py-16 text-center text-xs text-muted bg-surface/50 border border-dashed border-border rounded-2xl">
							{materials.length === 0
								? "素材库还是空的 —— 点「导入素材」从书签库挑一条收藏，或导入本地视频 / 文档 / 图片"
								: "当前筛选下没有素材"}
						</div>
					) : (
						<table className="w-full text-xs">
							<thead className="sticky top-0 bg-surface z-10">
								<tr className="border-b border-border text-left text-[10px] text-muted">
									<th className="px-5 py-2 font-medium">标题</th>
									<th className="px-3 py-2 font-medium w-16">类型</th>
									<th className="px-3 py-2 font-medium w-16">来源</th>
									<th className="px-3 py-2 font-medium w-16">附件</th>
									<th className="px-3 py-2 font-medium w-24">更新时间</th>
									<th className="px-3 py-2 font-medium w-32 text-right">
										操作
									</th>
								</tr>
							</thead>
							<tbody>
								{visibleMaterials.map((material) => {
									const kind = getMaterialKind(material);
									return (
										<tr
											key={material.id}
											className="border-b border-border/50 hover:bg-accent/4 transition-colors"
										>
											<td className="px-5 py-2.5 max-w-0">
												<p className="text-xs font-medium text-foreground truncate">
													{material.title}
												</p>
												{material.note && (
													<p className="text-[10px] text-muted truncate mt-0.5">
														批注：{material.note}
													</p>
												)}
											</td>
											<td className="px-3 py-2.5">
												<span className="px-1.5 py-0.5 rounded-md bg-accent/10 text-accent text-[10px] font-medium">
													{KIND_BADGES[kind]}
												</span>
											</td>
											<td className="px-3 py-2.5 text-muted">
												{material.assets && material.assets.length > 0
													? "文件"
													: SOURCE_BADGES[material.sourceType]}
											</td>
											<td className="px-3 py-2.5">
												{material.assets && material.assets.length > 0 ? (
													<span className="flex items-center gap-1 text-[10px] text-muted">
														<Paperclip className="w-3 h-3" />
														{material.assets.length}
													</span>
												) : (
													<span className="text-[10px] text-muted">—</span>
												)}
											</td>
											<td className="px-3 py-2.5 text-[10px] text-muted">
												{(material.updatedAt ?? material.createdAt ?? "").slice(
													0,
													10,
												)}
											</td>
											<td className="px-3 py-2.5">
												<div className="flex items-center justify-end gap-1.5">
													<Button
														type="button"
														variant="secondary"
														size="sm"
														className="rounded-full h-7 text-[11px] flex items-center gap-1 cursor-pointer"
														onPress={() => onGoCreate(material.id)}
													>
														<PenSquare className="w-3 h-3" />
														去二创
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="sm"
														className="rounded-full h-7 text-[11px] flex items-center gap-1 text-muted hover:text-danger cursor-pointer"
														onPress={() => setArchiving(material)}
													>
														<Archive className="w-3 h-3" />
														归档
													</Button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</div>
			</section>

			<ImportMaterialModal
				isOpen={showImportModal}
				onClose={() => setShowImportModal(false)}
				folderId={currentFolder?.id ?? null}
				folderName={currentFolder?.name}
				onImported={handleChanged}
			/>
			<FolderFormModal
				folder={folderModal?.folder ?? null}
				isOpen={folderModal !== null}
				onClose={() => setFolderModal(null)}
				onSaved={handleChanged}
			/>
			<ConfirmDialog
				isOpen={!!deletingFolder}
				onOpenChange={(open) => {
					if (!open) setDeletingFolder(null);
				}}
				title="删除文件夹"
				description={
					deletingFolder ? (
						<span>
							确定要删除文件夹{" "}
							<strong className="font-semibold text-foreground">
								{deletingFolder.name}
							</strong>{" "}
							吗？其中的素材不会被删除，会移回「未归档」。
						</span>
					) : undefined
				}
				confirmLabel={deleteFolderBusy ? "删除中..." : "确认删除"}
				onConfirm={handleDeleteFolder}
			/>
			<ConfirmDialog
				isOpen={!!archiving}
				onOpenChange={(open) => {
					if (!open) setArchiving(null);
				}}
				title="归档素材"
				description={
					archiving ? (
						<span>
							确定要归档素材{" "}
							<strong className="font-semibold text-foreground">
								{archiving.title}
							</strong>{" "}
							吗？归档后不再用于二创，但数据保留可随时溯源。
						</span>
					) : undefined
				}
				confirmLabel={archiveBusy ? "归档中..." : "确认归档"}
				onConfirm={handleArchive}
			/>
		</div>
	);
}

/** 左侧文件夹列表行 */
function FolderRow({
	icon,
	label,
	count,
	active,
	onClick,
	onRename,
	onDelete,
}: {
	icon: React.ReactNode;
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
	onRename?: () => void;
	onDelete?: () => void;
}) {
	return (
		<div
			className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
				active
					? "bg-accent/10 text-accent font-medium"
					: "text-foreground/80 hover:bg-muted/10"
			}`}
		>
			<button
				type="button"
				onClick={onClick}
				className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer text-left"
			>
				<span className="shrink-0">{icon}</span>
				<span className="flex-1 min-w-0 truncate">{label}</span>
			</button>
			{(onRename || onDelete) && (
				<span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
					{onRename && (
						<button
							type="button"
							title="重命名"
							onClick={(e) => {
								e.stopPropagation();
								onRename();
							}}
							className="p-0.5 rounded text-muted hover:text-foreground cursor-pointer"
						>
							<Pencil className="w-3 h-3" />
						</button>
					)}
					{onDelete && (
						<button
							type="button"
							title="删除文件夹"
							onClick={(e) => {
								e.stopPropagation();
								onDelete();
							}}
							className="p-0.5 rounded text-muted hover:text-danger cursor-pointer"
						>
							<Trash2 className="w-3 h-3" />
						</button>
					)}
				</span>
			)}
			<span className="shrink-0 text-[10px] text-muted tabular-nums group-hover:hidden">
				{count}
			</span>
		</div>
	);
}

/** 新建 / 重命名素材文件夹弹窗 */
function FolderFormModal({
	isOpen,
	folder,
	onClose,
	onSaved,
}: {
	isOpen: boolean;
	folder: MaterialFolder | null;
	onClose: () => void;
	onSaved: () => Promise<void>;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setName(folder?.name ?? "");
			setDescription(folder?.description ?? "");
		}
	}, [isOpen, folder]);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!name.trim()) {
			toast.warning("文件夹名称不能为空");
			return;
		}
		setSaving(true);
		try {
			if (folder) {
				await updateMaterialFolderRpc({
					id: folder.id,
					name: name.trim(),
					description: description.trim() || undefined,
				});
				toast.success(`文件夹已重命名为「${name.trim()}」`);
			} else {
				await createMaterialFolderRpc({
					name: name.trim(),
					description: description.trim() || undefined,
				});
				toast.success(`文件夹「${name.trim()}」已创建`);
			}
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
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="md" className="w-full">
				<Modal.Dialog
					aria-label={folder ? "重命名文件夹" : "新建文件夹"}
					className="!max-w-md w-full"
				>
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>
							{folder ? "重命名文件夹" : "新建文件夹"}
						</Modal.Heading>
					</Modal.Header>
					<form onSubmit={handleSubmit}>
						<Modal.Body className="flex flex-col gap-3 mt-2">
							<TextField value={name} onChange={setName}>
								<Label>文件夹名称</Label>
								<Input
									placeholder="例如：短视频选题 / 竞品调研"
									variant="secondary"
								/>
							</TextField>
							<TextField value={description} onChange={setDescription}>
								<Label>描述（可选）</Label>
								<Input
									placeholder="这个文件夹归集什么素材"
									variant="secondary"
								/>
							</TextField>
						</Modal.Body>
						<Modal.Footer className="flex justify-end gap-2 mt-3">
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
								type="submit"
								variant="primary"
								size="sm"
								className="rounded-full flex items-center gap-1.5 cursor-pointer"
								isDisabled={saving}
							>
								{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
								{folder ? "保存" : "创建"}
							</Button>
						</Modal.Footer>
					</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
