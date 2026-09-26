import { Button, Dropdown } from "@heroui/react";
import {
	Archive,
	Ellipsis,
	Eye,
	FolderOpen,
	Images,
	Loader2,
	Play,
	Sparkles,
	Star,
	Trash2,
} from "lucide-react";
import type { Material } from "../types";
import { KIND_CONFIG, KIND_ICONS } from "./types";
import {
	getAssetMediaUrl,
	getImageAssets,
	getMaterialKind,
	getVideoAssets,
} from "./utils";

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
	onPlayVideo?: (material: Material, assetId?: number) => void;
	onPreviewImage?: (material: Material, assetId?: number) => void;
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
	onPlayVideo,
	onPreviewImage,
}: MaterialsGridViewProps) {
	return (
		<ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 sm:gap-4 p-4 sm:p-5">
			{materials.map((material) => {
				const kind = getMaterialKind(material);
				const kindConfig = KIND_CONFIG[kind];
				const KindIcon = KIND_ICONS[kind];
				const images = getImageAssets(material);
				const hasImage = images.length > 0;
				const cover =
					(material.assets ?? []).find((a) => a.kind === "image") ?? images[0];
				const videos = getVideoAssets(material);
				const hasVideo = videos.length > 0;

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
						{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Quick media preview trigger */}
						<div
							className={`relative aspect-[4/3] flex items-center justify-center bg-muted/5 border-b border-border/40 overflow-hidden ${
								hasVideo || hasImage ? "cursor-pointer group/cover" : ""
							}`}
							onClick={() => {
								if (hasVideo) {
									onPlayVideo?.(material, videos[0]?.id);
								} else if (hasImage) {
									onPreviewImage?.(material, images[0]?.id);
								}
							}}
						>
							{cover ? (
								<img
									src={getAssetMediaUrl(cover)}
									alt={material.title}
									className="w-full h-full object-cover transition-transform duration-300 group-hover/cover:scale-105"
									loading="lazy"
								/>
							) : hasVideo ? (
								<video
									src={`${getAssetMediaUrl(videos[0])}#t=0.001`}
									preload="metadata"
									className="w-full h-full object-cover pointer-events-none"
								>
									<track kind="captions" />
								</video>
							) : (
								<KindIcon
									className={`w-8 h-8 ${kindConfig.iconClass} opacity-60`}
								/>
							)}

							{/* Multi-image count badge */}
							{hasImage && images.length > 1 && (
								<div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-white text-[10px] font-medium flex items-center gap-1 shadow-sm">
									<Images className="w-3 h-3" />
									<span>{images.length}</span>
								</div>
							)}

							{/* Video play overlay button */}
							{hasVideo && (
								<button
									type="button"
									title="播放视频"
									onClick={(e) => {
										e.stopPropagation();
										onPlayVideo?.(material, videos[0]?.id);
									}}
									className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm shadow-md transition-all group-hover/cover:scale-110 active:scale-95 cursor-pointer z-10"
									aria-label={`播放视频 ${material.title}`}
								>
									<Play className="w-4 h-4 fill-white translate-x-0.5" />
								</button>
							)}

							{/* Image preview overlay hover icon */}
							{hasImage && !hasVideo && (
								<div className="absolute inset-0 bg-black/25 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none z-10">
									<div className="w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm shadow-md">
										<Eye className="w-4 h-4" />
									</div>
								</div>
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
								title={`#${material.id} · ${kindConfig.label} · ${(material.updatedAt ?? material.createdAt ?? "").slice(0, 10)}`}
							>
								<span className="font-mono text-muted/80 mr-1">
									#{material.id}
								</span>
								·{" "}
								<span className={`font-medium ${kindConfig.colorClass}`}>
									{kindConfig.label}
								</span>{" "}
								·{" "}
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
											{hasVideo && (
												<Dropdown.Item
													id="play-video"
													textValue="播放视频"
													onAction={() =>
														onPlayVideo?.(material, videos[0]?.id)
													}
												>
													<div className="flex items-center gap-2 w-full py-0.5">
														<Play className="w-3.5 h-3.5 text-accent fill-accent" />
														<span className="text-xs font-medium flex-1">
															播放视频
														</span>
													</div>
												</Dropdown.Item>
											)}

											{hasImage && (
												<Dropdown.Item
													id="preview-image"
													textValue="预览图片"
													onAction={() =>
														onPreviewImage?.(material, images[0]?.id)
													}
												>
													<div className="flex items-center gap-2 w-full py-0.5">
														<Eye className="w-3.5 h-3.5 text-accent" />
														<span className="text-xs font-medium flex-1">
															预览图片
															{images.length > 1 ? ` (${images.length})` : ""}
														</span>
													</div>
												</Dropdown.Item>
											)}

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
