import { Button, Tooltip, toast } from "@heroui/react";
import {
	ChevronDown,
	ChevronUp,
	Dices,
	ExternalLink,
	Folder,
	FolderSearch,
	Loader2,
	Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ItemFavicon } from "./ItemFavicon";
import type { Category, WorkbenchItem } from "./types";
import { WorkbenchStorageService } from "../../services/workbenchStorage";

interface DailyCapsuleBannerProps {
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
}

export function DailyCapsuleBanner({
	onNavigateToFolder,
}: DailyCapsuleBannerProps) {
	const [capsules, setCapsules] = useState<WorkbenchItem[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isCollapsed, setIsCollapsed] = useState(false);

	const loadCapsules = async (exclude: string[] = []) => {
		setIsLoading(true);
		try {
			const items = await WorkbenchStorageService.fetchDailyCapsules({
				count: 3,
				excludeIds: exclude,
			});
			setCapsules(items);
		} catch (err) {
			console.error("Failed to load daily capsules:", err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		loadCapsules();
	}, []);

	const handleRefresh = () => {
		const currentIds = capsules.map((c) => String(c.id || ""));
		loadCapsules(currentIds);
		toast.success("已为你换一批灵感胶囊 ✨");
	};

	if (capsules.length === 0 && !isLoading) {
		return null;
	}

	return (
		<div className="mb-6 rounded-2xl bg-gradient-to-r from-accent-soft/30 via-surface-secondary/40 to-surface border border-accent/20 p-4 shadow-2xs backdrop-blur-sm transition-all duration-200">
			{/* Top Header */}
			<div className="flex items-center justify-between gap-4 mb-3">
				<div className="flex items-center gap-2.5">
					<div className="w-7 h-7 rounded-xl bg-accent text-accent-foreground flex items-center justify-center text-xs shadow-xs font-bold">
						<Sparkles className="w-4 h-4" />
					</div>
					<div>
						<div className="flex items-center gap-2">
							<span className="font-semibold text-xs text-foreground tracking-tight">
								今日灵感胶囊
							</span>
							<span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-accent/15 text-accent border border-accent/20">
								唤醒沉睡资源
							</span>
						</div>
						<p className="text-[10px] text-muted leading-tight mt-0.5">
							从你的收藏资产库中智能唤醒的优质工具与干货，拒绝收藏即吃灰
						</p>
					</div>
				</div>

				{/* Right actions */}
				<div className="flex items-center gap-1.5">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2.5 text-xs text-muted hover:text-foreground rounded-full border border-border/60 bg-surface/50 hover:bg-surface shadow-2xs cursor-pointer flex items-center gap-1.5"
						onPress={handleRefresh}
						isDisabled={isLoading}
					>
						{isLoading ? (
							<>
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
								<span>抽取中...</span>
							</>
						) : (
							<>
								<Dices className="w-3.5 h-3.5" />
								<span>换一批</span>
							</>
						)}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 w-7 p-0 text-xs text-muted hover:text-foreground rounded-full cursor-pointer flex items-center justify-center"
						onPress={() => setIsCollapsed(!isCollapsed)}
						aria-label={isCollapsed ? "展开" : "收起"}
					>
						{isCollapsed ? (
							<ChevronDown className="w-3.5 h-3.5" />
						) : (
							<ChevronUp className="w-3.5 h-3.5" />
						)}
					</Button>
				</div>
			</div>

			{/* Capsules Grid */}
			{!isCollapsed && (
				<div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
					{capsules.map((item, idx) => (
						<div
							key={item.id || idx}
							className="group relative bg-surface/90 hover:bg-surface rounded-xl border border-border/80 hover:border-accent/40 p-3.5 flex flex-col justify-between gap-2.5 shadow-2xs hover:shadow-xs transition-all duration-150"
						>
							{/* Top: Icon + Title */}
							<div className="flex items-start gap-2.5">
								<div className="w-8 h-8 rounded-lg bg-surface-secondary border border-border/60 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden shadow-2xs">
									<ItemFavicon
										url={item.url}
										favicon={item.favicon}
										type={item.type}
										size="sm"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<a
										href={item.url}
										target="_blank"
										rel="noreferrer"
										className="font-medium text-xs text-foreground hover:text-accent truncate block tracking-tight"
										title={item.name}
									>
										{item.name}
									</a>
									<div className="flex items-center gap-1.5 mt-0.5">
										{item.folderName && (
											<span className="text-[9px] font-medium px-1.5 py-0.1 rounded bg-surface-secondary text-muted border border-border/40 truncate max-w-[110px] inline-flex items-center gap-1">
												<Folder className="w-2.5 h-2.5 opacity-70 shrink-0" />
												<span className="truncate">{item.folderName}</span>
											</span>
										)}
										{item.tags && item.tags.length > 0 && (
											<span className="text-[9px] text-muted truncate max-w-[80px]">
												#{item.tags[0]}
											</span>
										)}
									</div>
								</div>
							</div>

							{/* Description / Summary */}
							<p className="text-[11px] text-muted line-clamp-2 leading-relaxed">
								{item.summary || item.description || "暂无详细描述"}
							</p>

							{/* Bottom Action Footer */}
							<div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px]">
								{item.url ? (
									<span className="text-muted/70 font-mono truncate max-w-[130px]">
										{item.url}
									</span>
								) : (
									<span className="text-muted/60">本地资源</span>
								)}

								<div className="flex items-center gap-1">
									{item.folderId !== undefined && (
										<Tooltip>
											<Tooltip.Trigger>
												<button
													type="button"
													onClick={() =>
														onNavigateToFolder?.(
															item.folderId || null,
															item.category as Category,
														)
													}
													className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer transition-colors"
													aria-label="在工作台中定位"
												>
													<FolderSearch className="w-3.5 h-3.5" />
												</button>
											</Tooltip.Trigger>
											<Tooltip.Content className="text-xs py-1 px-2">
												定位到文件夹
											</Tooltip.Content>
										</Tooltip>
									)}

									{item.url && (
										<a
											href={item.url}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-soft text-accent hover:bg-accent hover:text-accent-foreground font-medium transition-all text-[11px]"
										>
											<span>打开</span>
											<ExternalLink className="w-2.5 h-2.5" />
										</a>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

