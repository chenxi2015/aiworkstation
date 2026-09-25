import { Button } from "@heroui/react";
import {
	Archive,
	FolderOpen,
	Loader2,
	Sparkles,
	Star,
	Trash2,
} from "lucide-react";
import type { Material } from "../types";
import { KIND_BADGES, KIND_ICONS } from "./types";
import { getAssetMediaUrl, getMaterialKind } from "./utils";

interface MaterialsGridViewProps {
	materials: Material[];
	selectMode: boolean;
	selectedIds: Set<number>;
	importingId: number | null;
	openingDirId: number | null;
	onToggleSelect: (id: number) => void;
	onToggleStar: (material: Material) => void;
	onImportToStudio: (material: Material) => void;
	onOpenDir: (material: Material) => void;
	onArchive: (material: Material) => void;
	onDelete: (material: Material) => void;
}

/**
 * Grid layout view for materials
 */
export function MaterialsGridView({
	materials,
	selectMode,
	selectedIds,
	importingId,
	openingDirId,
	onToggleSelect,
	onToggleStar,
	onImportToStudio,
	onOpenDir,
	onArchive,
	onDelete,
}: MaterialsGridViewProps) {
	return (
		<ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-6 gap-3 p-5">
			{materials.map((material) => {
				const kind = getMaterialKind(material);
				const KindIcon = KIND_ICONS[kind];
				const cover = (material.assets ?? []).find((a) => a.kind === "image");
				return (
					<li
						key={material.id}
						className="group relative rounded-xl border border-border/60 bg-surface/50 overflow-hidden hover:border-accent/50 transition-colors"
					>
						{selectMode && (
							<input
								type="checkbox"
								checked={selectedIds.has(material.id)}
								onChange={() => onToggleSelect(material.id)}
								className="absolute top-2 left-2 z-10 w-3.5 h-3.5 accent-accent cursor-pointer"
								aria-label={`选择素材 ${material.title}`}
							/>
						)}
						<button
							type="button"
							title={material.starred ? "取消收藏" : "收藏"}
							onClick={() => onToggleStar(material)}
							className={`absolute top-1.5 right-1.5 z-10 p-1 rounded-full bg-surface/80 backdrop-blur transition-colors cursor-pointer ${
								material.starred
									? "text-amber-500"
									: "text-muted hover:text-amber-500 opacity-0 group-hover:opacity-100"
							}`}
						>
							<Star
								className={`w-3.5 h-3.5 ${material.starred ? "fill-amber-500" : ""}`}
							/>
						</button>
						<div className="aspect-[4/3] flex items-center justify-center bg-muted/5 border-b border-border/40">
							{cover ? (
								<img
									src={getAssetMediaUrl(cover)}
									alt={material.title}
									className="w-full h-full object-cover"
									loading="lazy"
								/>
							) : (
								<KindIcon className="w-8 h-8 text-muted/50" />
							)}
						</div>
						<div className="px-3 py-2">
							<p
								className="text-xs font-medium text-foreground truncate"
								title={material.title}
							>
								{material.title}
							</p>
							<p className="text-[10px] text-muted mt-0.5">
								{KIND_BADGES[kind]} ·{" "}
								{(material.updatedAt ?? material.createdAt ?? "").slice(0, 10)}
							</p>
							<div className="flex items-center gap-1 mt-2">
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="rounded-full h-6 text-[10px] px-2 flex items-center gap-1 cursor-pointer"
									isDisabled={importingId === material.id}
									onPress={() => onImportToStudio(material)}
								>
									{importingId === material.id ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<Sparkles className="w-3 h-3" />
									)}
									导入创作台
								</Button>
								<button
									type="button"
									title="打开所在目录"
									onClick={() => onOpenDir(material)}
									className="ml-auto p-1 rounded-full text-muted hover:text-accent transition-colors cursor-pointer"
								>
									{openingDirId === material.id ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : (
										<FolderOpen className="w-3.5 h-3.5" />
									)}
								</button>
								<button
									type="button"
									title="归档素材"
									onClick={() => onArchive(material)}
									className="p-1 rounded-full text-muted hover:text-danger transition-colors cursor-pointer"
								>
									<Archive className="w-3.5 h-3.5" />
								</button>
								<button
									type="button"
									title="删除素材"
									onClick={() => onDelete(material)}
									className="p-1 rounded-full text-muted hover:text-danger transition-colors cursor-pointer"
								>
									<Trash2 className="w-3.5 h-3.5" />
								</button>
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
