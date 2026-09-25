import { Button, Dropdown } from "@heroui/react";
import {
	Archive,
	Ellipsis,
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
		<ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 sm:gap-4 p-4 sm:p-5">
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
							<p
								className="text-[10px] text-muted mt-0.5 truncate whitespace-nowrap"
								title={`#${material.id} · ${KIND_BADGES[kind]} · ${(material.updatedAt ?? material.createdAt ?? "").slice(0, 10)}`}
							>
								<span className="font-mono text-muted/80 mr-1">
									#{material.id}
								</span>
								· {KIND_BADGES[kind]} ·{" "}
								{(material.updatedAt ?? material.createdAt ?? "").slice(0, 10)}
							</p>
							<div className="flex items-center justify-between gap-1.5 mt-2">
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="rounded-lg h-6 text-[10px] px-2 flex items-center gap-1 cursor-pointer shrink min-w-0"
									isDisabled={importingId === material.id}
									onPress={() => onImportToStudio(material)}
								>
									{importingId === material.id ? (
										<Loader2 className="w-3 h-3 animate-spin shrink-0" />
									) : (
										<Sparkles className="w-3 h-3 text-accent shrink-0" />
									)}
									<span className="truncate">导入创作台</span>
								</Button>

								<Dropdown>
									<Dropdown.Trigger
										aria-label={`素材「${material.title}」更多操作`}
										className="h-6 w-6 rounded-md text-muted hover:text-foreground hover:bg-foreground/[0.06] dark:hover:bg-white/[0.08] flex items-center justify-center cursor-pointer transition-colors shrink-0 ml-auto"
									>
										<Ellipsis className="w-3.5 h-3.5" />
									</Dropdown.Trigger>
									<Dropdown.Popover
										placement="bottom end"
										className="min-w-[140px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
									>
										<Dropdown.Menu aria-label="素材更多操作">
											<Dropdown.Item
												id="star"
												textValue={material.starred ? "取消收藏" : "收藏"}
												onAction={() => onToggleStar(material)}
											>
												<div className="flex items-center gap-2 w-full py-0.5">
													<Star
														className={`w-3.5 h-3.5 ${
															material.starred
																? "fill-amber-500 text-amber-500"
																: "text-muted"
														}`}
													/>
													<span className="text-xs font-medium flex-1">
														{material.starred ? "取消收藏" : "收藏"}
													</span>
												</div>
											</Dropdown.Item>

											<Dropdown.Item
												id="open-dir"
												textValue="打开所在目录"
												isDisabled={openingDirId === material.id}
												onAction={() => onOpenDir(material)}
											>
												<div className="flex items-center gap-2 w-full py-0.5">
													{openingDirId === material.id ? (
														<Loader2 className="w-3.5 h-3.5 animate-spin text-muted" />
													) : (
														<FolderOpen className="w-3.5 h-3.5 text-muted" />
													)}
													<span className="text-xs font-medium flex-1">
														打开所在目录
													</span>
												</div>
											</Dropdown.Item>

											<Dropdown.Item
												id="archive"
												textValue="归档"
												onAction={() => onArchive(material)}
											>
												<div className="flex items-center gap-2 w-full py-0.5">
													<Archive className="w-3.5 h-3.5 text-muted" />
													<span className="text-xs font-medium flex-1">
														归档
													</span>
												</div>
											</Dropdown.Item>

											<Dropdown.Item
												id="delete"
												textValue="删除"
												className="text-danger hover:bg-danger/10"
												onAction={() => onDelete(material)}
											>
												<div className="flex items-center gap-2 w-full py-0.5">
													<Trash2 className="w-3.5 h-3.5 text-danger" />
													<span className="text-xs font-medium flex-1 text-danger">
														删除
													</span>
												</div>
											</Dropdown.Item>
										</Dropdown.Menu>
									</Dropdown.Popover>
								</Dropdown>
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
