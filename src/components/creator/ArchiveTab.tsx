import { Button, toast } from "@heroui/react";
import {
	Archive,
	FileText,
	Library,
	PenSquare,
	Trash2,
	Undo2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	deleteMaterialRpc,
	fetchArchivedMaterials,
	updateMaterialRpc,
} from "../../services/api/creatorClient";
import {
	duplicateDocumentRpc,
	fetchArchivedDocuments,
	updateDocumentRpc,
} from "../../services/api/editorClient";
import type { EditorDocument } from "../editor/types";
import { ConfirmDialog } from "../workbench/ConfirmDialog";
import { ArchiveTableSkeleton } from "../workbench/skeletons";
import type { Material } from "./types";

type ArchiveSection = "materials" | "documents";

/**
 * 归档 Tab（docs/selfmedia-merge-plan.md）：
 * 「素材」分区：素材库归档的素材（恢复回素材库 / 彻底删除）；
 * 「创作文档」分区：创作完成沉淀的文档，与创作台互斥（创作台列表只显示非归档），
 * 「恢复」回到创作中；「再次创作」复制副本回创作台，原归档保留。
 */
export function ArchiveTab() {
	const [section, setSection] = useState<ArchiveSection>("materials");
	const [documents, setDocuments] = useState<EditorDocument[]>([]);
	const [materials, setMaterials] = useState<Material[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<number | null>(null);
	const [deleting, setDeleting] = useState<Material | null>(null);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			const [docs, mats] = await Promise.all([
				fetchArchivedDocuments(),
				fetchArchivedMaterials(),
			]);
			setDocuments(docs);
			setMaterials(mats);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	const handleRestoreDocument = async (doc: EditorDocument) => {
		setBusyId(doc.id);
		try {
			await updateDocumentRpc({ id: doc.id, status: "editing" });
			toast.success(`「${doc.title}」已恢复到创作台`);
			await reload();
		} catch (err) {
			toast.danger(
				`恢复失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setBusyId(null);
		}
	};

	const handleRecreate = async (doc: EditorDocument) => {
		setBusyId(doc.id);
		try {
			const copy = await duplicateDocumentRpc(doc.id);
			toast.success(`已生成副本「${copy.title}」，去创作台继续加工`);
		} catch (err) {
			toast.danger(
				`再次创作失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setBusyId(null);
		}
	};

	const handleRestoreMaterial = async (material: Material) => {
		setBusyId(material.id);
		try {
			await updateMaterialRpc({ id: material.id, status: "active" });
			toast.success(`素材「${material.title}」已恢复到素材库`);
			await reload();
		} catch (err) {
			toast.danger(
				`恢复失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setBusyId(null);
		}
	};

	const handleDeleteMaterial = async () => {
		if (!deleting) return;
		try {
			await deleteMaterialRpc({ id: deleting.id });
			toast.success(`素材「${deleting.title}」已彻底删除`);
			setDeleting(null);
			await reload();
		} catch (err) {
			toast.danger(
				`删除失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	if (loading) {
		return <ArchiveTableSkeleton />;
	}

	if (documents.length === 0 && materials.length === 0) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
				<div className="w-12 h-12 rounded-2xl bg-muted/10 flex items-center justify-center">
					<Archive className="w-6 h-6 text-muted" />
				</div>
				<h2 className="text-sm font-semibold text-foreground">
					归档库还是空的
				</h2>
				<p className="text-xs text-muted max-w-md leading-relaxed">
					素材库里归档的素材、创作台归档的文档都会沉淀在这里；
					素材可恢复或彻底删除，文档可「再次创作」生成副本继续加工。
				</p>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto min-h-0">
			<div className="max-w-5xl mx-auto px-6 py-4">
				{/* 分区切换：素材 / 创作文档 */}
				<div className="flex items-center gap-1 mb-3">
					{(
						[
							{
								id: "materials" as const,
								label: "素材",
								icon: Library,
								count: materials.length,
							},
							{
								id: "documents" as const,
								label: "创作文档",
								icon: FileText,
								count: documents.length,
							},
						] as const
					).map((tab) => {
						const Icon = tab.icon;
						const active = section === tab.id;
						return (
							<button
								key={tab.id}
								type="button"
								onClick={() => setSection(tab.id)}
								className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
									active
										? "bg-accent/10 text-accent"
										: "text-muted hover:text-foreground"
								}`}
							>
								<Icon className="w-3.5 h-3.5" />
								{tab.label}
								{tab.count > 0 && (
									<span className="px-1.5 py-0.5 rounded-full bg-muted/10 text-[10px] text-muted">
										{tab.count}
									</span>
								)}
							</button>
						);
					})}
				</div>

				{section === "materials" ? (
					materials.length === 0 ? (
						<p className="py-10 text-center text-xs text-muted">
							没有已归档的素材 —— 在素材库素材的「归档」操作后会出现在这里
						</p>
					) : (
						<ul className="space-y-1.5">
							{materials.map((material) => (
								<li
									key={material.id}
									className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/50 px-4 py-3"
								>
									<Library className="w-4 h-4 text-muted shrink-0" />
									<div className="flex-1 min-w-0">
										<p className="text-xs font-medium text-foreground truncate">
											{material.title}
										</p>
										<p className="text-[10px] text-muted mt-0.5">
											{(material.updatedAt ?? material.createdAt ?? "").slice(
												0,
												10,
											)}
											{material.assets && material.assets.length > 0
												? ` · ${material.assets.length} 个附件`
												: ""}
										</p>
									</div>
									<div className="flex items-center gap-1.5 shrink-0">
										<Button
											type="button"
											variant="secondary"
											size="sm"
											className="rounded-full h-7 text-[11px] flex items-center gap-1 cursor-pointer"
											isDisabled={busyId === material.id}
											onPress={() => void handleRestoreMaterial(material)}
										>
											<Undo2 className="w-3 h-3" />
											恢复
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="rounded-full h-7 text-[11px] flex items-center gap-1 text-muted hover:text-danger cursor-pointer"
											isDisabled={busyId === material.id}
											onPress={() => setDeleting(material)}
										>
											<Trash2 className="w-3 h-3" />
											彻底删除
										</Button>
									</div>
								</li>
							))}
						</ul>
					)
				) : documents.length === 0 ? (
					<p className="py-10 text-center text-xs text-muted">
						没有已归档的文档 ——
						在创作台文档的「⋯」菜单里选择「归档」后会出现在这里
					</p>
				) : (
					<ul className="space-y-1.5">
						{documents.map((doc) => (
							<li
								key={doc.id}
								className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/50 px-4 py-3"
							>
								<FileText className="w-4 h-4 text-muted shrink-0" />
								<div className="flex-1 min-w-0">
									<p className="text-xs font-medium text-foreground truncate">
										{doc.title}
									</p>
									<p className="text-[10px] text-muted mt-0.5">
										{(doc.updatedAt ?? doc.createdAt ?? "").slice(0, 10)} ·{" "}
										{doc.contentText.length} 字
									</p>
								</div>
								<div className="flex items-center gap-1.5 shrink-0">
									<Button
										type="button"
										variant="secondary"
										size="sm"
										className="rounded-full h-7 text-[11px] flex items-center gap-1 cursor-pointer"
										isDisabled={busyId === doc.id}
										onPress={() => void handleRecreate(doc)}
									>
										<PenSquare className="w-3 h-3" />
										再次创作
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="rounded-full h-7 text-[11px] flex items-center gap-1 text-muted hover:text-foreground cursor-pointer"
										isDisabled={busyId === doc.id}
										onPress={() => void handleRestoreDocument(doc)}
									>
										<Undo2 className="w-3 h-3" />
										恢复
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>

			<ConfirmDialog
				isOpen={!!deleting}
				onOpenChange={(open) => {
					if (!open) setDeleting(null);
				}}
				title="彻底删除素材"
				description={
					deleting ? (
						<span>
							确定要彻底删除素材{" "}
							<strong className="font-semibold text-foreground">
								{deleting.title}
							</strong>{" "}
							吗？素材及其关联文件将被永久删除，且不可恢复。
						</span>
					) : undefined
				}
				confirmLabel="确认删除"
				onConfirm={handleDeleteMaterial}
			/>
		</div>
	);
}
