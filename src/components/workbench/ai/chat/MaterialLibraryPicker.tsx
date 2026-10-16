import { Input, Modal } from "@heroui/react";
import {
	Eye,
	FolderOpen,
	LibraryBig,
	Loader2,
	Paperclip,
	Play,
	Search,
	Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	fetchMaterialFolders,
	fetchMaterials,
} from "../../../../services/api/creatorClient";
import type { ChatContextItem } from "../../../../types/chatContext";
import type { Material, MaterialFolder } from "../../../creator/types";
import { MaterialAudioModal } from "../../../creator/materials/MaterialAudioModal";
import { MaterialDocModal } from "../../../creator/materials/MaterialDocModal";
import { MaterialImageModal } from "../../../creator/materials/MaterialImageModal";
import { MaterialVideoModal } from "../../../creator/materials/MaterialVideoModal";
import {
	KIND_CONFIG,
	TYPE_TABS,
	type MaterialKind,
	type TypeTab,
} from "../../../creator/materials/types";
import {
	getAudioAssets,
	getImageAssets,
	getMaterialKind,
	getVideoAssets,
} from "../../../creator/materials/utils";

export interface MaterialLibraryPickerProps {
	isOpen: boolean;
	onClose: () => void;
	/** 选中素材后作为 material 类型 context item 附加 */
	onPick: (item: ChatContextItem) => void;
}

/** 素材正文摘要行数预览长度 */
const CONTENT_PREVIEW_LEN = 80;

type PreviewState =
	| { kind: "video"; material: Material }
	| { kind: "image"; material: Material }
	| { kind: "audio"; material: Material }
	| { kind: "doc"; material: Material }
	| null;

/**
 * 聊天附件的「素材库导入」对话框：从创作模块素材库中挑选已有素材附加为对话上下文。
 * 与本地文件上传的区别——素材由 SQLite 托管、带 materialId，服务端可按 id 取全文注入 prompt。
 * 支持按类型（全部/视频/图片/音频/文档/书签）筛选，选中后可按类型打开预览弹窗。
 */
export function MaterialLibraryPicker({
	isOpen,
	onClose,
	onPick,
}: MaterialLibraryPickerProps) {
	const [materials, setMaterials] = useState<Material[]>([]);
	const [folders, setFolders] = useState<MaterialFolder[]>([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState("");
	const [folderFilter, setFolderFilter] = useState<number | "all">("all");
	const [typeTab, setTypeTab] = useState<TypeTab>("all");
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [preview, setPreview] = useState<PreviewState>(null);

	useEffect(() => {
		if (!isOpen) return;
		setQuery("");
		setFolderFilter("all");
		setTypeTab("all");
		setSelectedId(null);
		setPreview(null);
		setLoading(true);
		void Promise.all([fetchMaterials(), fetchMaterialFolders()])
			.then(([ms, fs]) => {
				setMaterials(ms);
				setFolders(fs);
			})
			.finally(() => setLoading(false));
	}, [isOpen]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return materials.filter((m) => {
			if (folderFilter !== "all" && m.folderId !== folderFilter) return false;
			if (typeTab !== "all" && getMaterialKind(m) !== typeTab) return false;
			if (!q) return true;
			return (
				m.title.toLowerCase().includes(q) ||
				(m.note ?? "").toLowerCase().includes(q) ||
				(m.content ?? "").toLowerCase().includes(q)
			);
		});
	}, [materials, query, folderFilter, typeTab]);

	const getTypeCount = (tabId: TypeTab) => {
		if (tabId === "all") return materials.length;
		return materials.filter((m) => getMaterialKind(m) === tabId).length;
	};

	const folderName = (id: number | null | undefined) =>
		folders.find((f) => f.id === id)?.name;

	const handlePick = (m: Material) => {
		onPick({
			id: `material_${m.id}`,
			type: "material",
			title: m.title,
			subtitle: folderName(m.folderId) ?? m.sourceType,
			materialId: m.id,
		});
		onClose();
	};

	const handlePreview = (m: Material) => {
		const kind = getMaterialKind(m);
		if (kind === "video" && getVideoAssets(m).length > 0) {
			setPreview({ kind: "video", material: m });
			return;
		}
		if (kind === "image" && getImageAssets(m).length > 0) {
			setPreview({ kind: "image", material: m });
			return;
		}
		if (kind === "audio" && getAudioAssets(m).length > 0) {
			setPreview({ kind: "audio", material: m });
			return;
		}
		// 文档 / 书签（或无媒体附件）→ 正文预览
		setPreview({ kind: "doc", material: m });
	};

	const renderTypeTab = (tab: (typeof TYPE_TABS)[number]) => {
		const count = getTypeCount(tab.id);
		// 与素材库一致：仅全部/视频/图片/音频/文档/书签，空类型也展示便于切换
		const Icon = tab.icon;
		const active = typeTab === tab.id;
		return (
			<button
				key={tab.id}
				type="button"
				onClick={() => setTypeTab(tab.id)}
				className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
					active
						? "bg-accent text-accent-foreground"
						: "bg-surface-secondary text-muted hover:text-foreground"
				}`}
			>
				<Icon className="w-3 h-3" />
				{tab.label}（{count}）
			</button>
		);
	};

	return (
		<>
			<Modal.Backdrop
				isOpen={isOpen}
				onOpenChange={(open) => !open && onClose()}
				variant="blur"
			>
				<Modal.Container size="lg" className="w-full">
					<Modal.Dialog
						aria-label="从素材库导入"
						className="!max-w-2xl w-full max-h-[70vh] flex flex-col"
					>
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading className="flex items-center gap-2">
								<LibraryBig className="w-4 h-4 text-violet-500" />
								从素材库导入
							</Modal.Heading>
						</Modal.Header>
						<Modal.Body className="flex-1 overflow-hidden flex flex-col gap-2 mt-2">
							{/* 搜索 */}
							<div className="flex items-center gap-2 shrink-0">
								<Input
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="搜索素材标题 / 批注 / 正文..."
									className="flex-1"
								/>
								<Search className="w-4 h-4 text-muted shrink-0 -ml-8 pointer-events-none" />
							</div>

							{/* 类型筛选（与素材库一致） */}
							<div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 pb-0.5">
								{TYPE_TABS.map(renderTypeTab)}
							</div>

							{/* 文件夹筛选 */}
							<div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 pb-0.5">
								<button
									type="button"
									onClick={() => setFolderFilter("all")}
									className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors ${
										folderFilter === "all"
											? "bg-accent text-accent-foreground"
											: "bg-surface-secondary text-muted hover:text-foreground"
									}`}
								>
									全部文件夹（{materials.length}）
								</button>
								{folders.map((f) => (
									<button
										key={f.id}
										type="button"
										onClick={() => setFolderFilter(f.id)}
										className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
											folderFilter === f.id
												? "bg-accent text-accent-foreground"
												: "bg-surface-secondary text-muted hover:text-foreground"
										}`}
									>
										<FolderOpen className="w-3 h-3" />
										{f.name}
										{typeof f.materialCount === "number" &&
											`（${f.materialCount}）`}
									</button>
								))}
							</div>

							{/* 素材列表 */}
							<div className="flex-1 overflow-y-auto -mx-1 px-1">
								{loading ? (
									<div className="flex items-center justify-center py-10 text-muted">
										<Loader2 className="w-4 h-4 animate-spin mr-2" />
										<span className="text-xs">加载素材库...</span>
									</div>
								) : filtered.length === 0 ? (
									<div className="flex flex-col items-center justify-center py-10 text-muted gap-1">
										<LibraryBig className="w-6 h-6 opacity-50" />
										<span className="text-xs">
											{materials.length === 0
												? "素材库为空，可先在创作模块添加素材"
												: "没有匹配的素材"}
										</span>
									</div>
								) : (
									<div className="flex flex-col gap-1 py-0.5">
										{filtered.map((m) => {
											const kind: MaterialKind = getMaterialKind(m);
											const kindConfig = KIND_CONFIG[kind];
											const KindIcon = kindConfig.icon;
											const assetCount = m.assets?.length ?? 0;
											const isSelected = selectedId === m.id;
											const hasMedia =
												getVideoAssets(m).length > 0 ||
												getImageAssets(m).length > 0 ||
												getAudioAssets(m).length > 0;
											const previewLabel =
												kind === "video"
													? "播放"
													: kind === "audio"
														? "试听"
														: "预览";

											return (
												<div
													key={m.id}
													className={`flex items-start gap-2.5 text-left px-2.5 py-2 rounded-xl border transition-colors group ${
														isSelected
															? "bg-accent/8 border-accent/40"
															: "border-transparent hover:bg-surface-secondary/80 hover:border-border/60"
													}`}
												>
													<button
														type="button"
														onClick={() => setSelectedId(m.id)}
														onDoubleClick={() => handlePick(m)}
														className="flex items-start gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
													>
														<div
															className={`shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center mt-0.5 ${kindConfig.badgeClass}`}
														>
															<KindIcon
																className={`w-3.5 h-3.5 ${kindConfig.iconClass}`}
															/>
														</div>
														<div className="flex-1 min-w-0">
															<div className="flex items-center gap-1.5">
																<span
																	className={`text-xs font-medium truncate transition-colors ${
																		isSelected
																			? "text-accent"
																			: "text-foreground group-hover:text-accent"
																	}`}
																>
																	{m.title}
																</span>
																{m.starred && (
																	<Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
																)}
																{assetCount > 0 && (
																	<span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] text-muted/70">
																		<Paperclip className="w-2.5 h-2.5" />
																		{assetCount}
																	</span>
																)}
															</div>
															<div className="text-[10px] text-muted/80 truncate mt-0.5">
																{(m.content || "(空素材)").slice(
																	0,
																	CONTENT_PREVIEW_LEN,
																)}
															</div>
															<div className="text-[9px] text-muted/60 mt-0.5">
																{folderName(m.folderId) ?? "未归档"} ·{" "}
																{(m.content ?? "").length} 字
															</div>
														</div>
													</button>

													{/* 悬浮操作：预览 / 选择 */}
													<div className="shrink-0 flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
														{(hasMedia || kind === "doc" || kind === "bookmark") && (
															<button
																type="button"
																onClick={() => handlePreview(m)}
																className="h-6 px-2 rounded-md text-[10px] flex items-center gap-1 text-muted hover:text-accent hover:bg-accent/10 cursor-pointer transition-colors"
																title={`${previewLabel}素材`}
															>
																{kind === "video" ? (
																	<Play className="w-3 h-3" />
																) : (
																	<Eye className="w-3 h-3" />
																)}
																{previewLabel}
															</button>
														)}
														<button
															type="button"
															onClick={() => handlePick(m)}
															className="h-6 px-2 rounded-md text-[10px] font-medium bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer transition-colors"
														>
															选择
														</button>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						</Modal.Body>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>

			{/* 预览弹窗：按素材类型分派 */}
			<MaterialVideoModal
				isOpen={preview?.kind === "video"}
				material={preview?.kind === "video" ? preview.material : null}
				onClose={() => setPreview(null)}
			/>
			<MaterialImageModal
				isOpen={preview?.kind === "image"}
				material={preview?.kind === "image" ? preview.material : null}
				materials={preview?.kind === "image" ? [preview.material] : []}
				onClose={() => setPreview(null)}
			/>
			<MaterialAudioModal
				isOpen={preview?.kind === "audio"}
				material={preview?.kind === "audio" ? preview.material : null}
				onClose={() => setPreview(null)}
			/>
			<MaterialDocModal
				isOpen={preview?.kind === "doc"}
				material={preview?.kind === "doc" ? preview.material : null}
				onClose={() => setPreview(null)}
			/>
		</>
	);
}
