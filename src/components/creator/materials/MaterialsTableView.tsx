import { Button, Chip, Dropdown, Table } from "@heroui/react";
import {
	Archive,
	Ellipsis,
	FolderOpen,
	Loader2,
	Paperclip,
	Sparkles,
	Star,
	Trash2,
} from "lucide-react";
import type { Material } from "../types";
import { KIND_BADGES, SOURCE_BADGES } from "./types";
import { getMaterialKind } from "./utils";

interface MaterialsTableViewProps {
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
 * Table layout view for materials using HeroUI Table
 */
export function MaterialsTableView({
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
}: MaterialsTableViewProps) {
	return (
		<Table className="w-full text-xs rounded-none">
			<Table.ScrollContainer className="overflow-x-auto">
				<Table.Content
					aria-label="自媒体素材列表"
					className="min-w-full text-xs"
				>
					<Table.Header>
						{selectMode && (
							<Table.Column id="select" className="pl-4 py-2 w-8" />
						)}
						<Table.Column
							id="id"
							className="px-3 py-2 font-medium w-16 text-muted"
						>
							ID
						</Table.Column>
						<Table.Column
							id="title"
							isRowHeader
							className="px-4 py-2 font-medium text-muted"
						>
							标题
						</Table.Column>
						<Table.Column
							id="kind"
							className="px-3 py-2 font-medium w-16 text-muted"
						>
							类型
						</Table.Column>
						<Table.Column
							id="source"
							className="px-3 py-2 font-medium w-20 text-muted"
						>
							来源
						</Table.Column>
						<Table.Column
							id="attachments"
							className="px-3 py-2 font-medium w-16 text-muted"
						>
							附件
						</Table.Column>
						<Table.Column
							id="updatedAt"
							className="px-3 py-2 font-medium w-24 text-muted"
						>
							更新时间
						</Table.Column>
						<Table.Column
							id="actions"
							className="px-4 py-2 font-medium w-36 text-right text-muted"
						>
							操作
						</Table.Column>
					</Table.Header>
					<Table.Body>
						{materials.map((material) => {
							const kind = getMaterialKind(material);
							return (
								<Table.Row
									key={material.id}
									id={material.id}
									className="border-b border-border/50 hover:bg-accent/4 transition-colors"
								>
									{selectMode && (
										<Table.Cell className="pl-4 py-2.5">
											<input
												type="checkbox"
												checked={selectedIds.has(material.id)}
												onChange={() => onToggleSelect(material.id)}
												className="w-3.5 h-3.5 accent-accent cursor-pointer"
												aria-label={`选择素材 ${material.title}`}
											/>
										</Table.Cell>
									)}
									<Table.Cell className="px-3 py-2.5 whitespace-nowrap">
										<span className="font-mono text-[11px] text-muted font-medium bg-muted/10 px-1.5 py-0.5 rounded">
											#{material.id}
										</span>
									</Table.Cell>
									<Table.Cell className="px-4 py-2.5 max-w-0">
										<p className="text-xs font-medium text-foreground truncate">
											{material.title}
										</p>
										{material.note && (
											<p className="text-[10px] text-muted truncate mt-0.5">
												批注：{material.note}
											</p>
										)}
									</Table.Cell>
									<Table.Cell className="px-3 py-2.5">
										<Chip
											size="sm"
											variant="soft"
											color="accent"
											className="h-5 px-1.5 text-[10px] font-medium"
										>
											{KIND_BADGES[kind]}
										</Chip>
									</Table.Cell>
									<Table.Cell className="px-3 py-2.5 text-muted whitespace-nowrap">
										{material.assets?.[0]?.storageMode === "external"
											? "本地原位"
											: material.assets && material.assets.length > 0
												? "文件托管"
												: SOURCE_BADGES[material.sourceType]}
									</Table.Cell>
									<Table.Cell className="px-3 py-2.5">
										{material.assets && material.assets.length > 0 ? (
											<span className="flex items-center gap-1 text-[10px] text-muted">
												<Paperclip className="w-3 h-3" />
												{material.assets.length}
											</span>
										) : (
											<span className="text-[10px] text-muted">—</span>
										)}
									</Table.Cell>
									<Table.Cell className="px-3 py-2.5 text-[10px] text-muted whitespace-nowrap">
										{(material.updatedAt ?? material.createdAt ?? "").slice(
											0,
											10,
										)}
									</Table.Cell>
									<Table.Cell className="px-4 py-2.5">
										<div className="flex items-center justify-end gap-1.5">
											{/* 核心操作：导入创作台 */}
											<Button
												type="button"
												variant="secondary"
												size="sm"
												className="h-7 px-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0"
												isDisabled={importingId === material.id}
												onPress={() => onImportToStudio(material)}
											>
												{importingId === material.id ? (
													<Loader2 className="w-3 h-3 animate-spin" />
												) : (
													<Sparkles className="w-3 h-3 text-accent" />
												)}
												导入创作台
											</Button>

											{/* 其余操作收拢为下拉菜单 */}
											<Dropdown>
												<Dropdown.Trigger
													aria-label={`素材「${material.title}」更多操作`}
													className="h-7 w-7 rounded-lg text-muted hover:text-foreground hover:bg-foreground/[0.06] dark:hover:bg-white/[0.08] flex items-center justify-center cursor-pointer transition-colors shrink-0"
												>
													<Ellipsis className="w-4 h-4" />
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
									</Table.Cell>
								</Table.Row>
							);
						})}
					</Table.Body>
				</Table.Content>
			</Table.ScrollContainer>
		</Table>
	);
}
