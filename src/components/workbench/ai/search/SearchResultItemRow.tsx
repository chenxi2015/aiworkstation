import { Dropdown } from "@heroui/react";
import {
	CheckSquare,
	ExternalLink,
	Folder as FolderIconLucide,
	FolderInput,
	FolderSearch,
	MoreHorizontal,
	Square,
} from "lucide-react";
import { memo } from "react";
import { ItemFavicon } from "../../ItemFavicon";
import type { Category, SearchResultItem } from "../../types";

export interface SearchResultItemRowProps {
	item: SearchResultItem;
	isSelected: boolean;
	isChecked: boolean;
	onToggleCheck: (e: React.MouseEvent) => void;
	onSelectRow: () => void;
	onOpenAssign: (e?: React.MouseEvent) => void;
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
	onCloseModal: () => void;
}

/**
 * Single search result item row in Global Search Modal
 */
export const SearchResultItemRow = memo(function SearchResultItemRow({
	item,
	isSelected,
	isChecked,
	onToggleCheck,
	onSelectRow,
	onOpenAssign,
	onNavigateToFolder,
	onCloseModal,
}: SearchResultItemRowProps) {
	const displayText = item.summary || item.description || "";
	const canLocate =
		item.folderId !== undefined &&
		item.folderId !== null &&
		!!onNavigateToFolder;
	const menuActions = [
		{
			id: "assign",
			label: "放入文件夹",
			icon: <FolderInput className="w-3.5 h-3.5 text-accent shrink-0" />,
		},
		...(canLocate
			? [
					{
						id: "locate",
						label: "在工作台中定位",
						icon: <FolderSearch className="w-3.5 h-3.5 text-accent shrink-0" />,
					},
				]
			: []),
		...(item.url
			? [
					{
						id: "open",
						label: "访问外部网站",
						icon: <ExternalLink className="w-3.5 h-3.5 text-accent shrink-0" />,
					},
				]
			: []),
	];

	return (
		<div
			onClick={onSelectRow}
			className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-all cursor-pointer ${
				isSelected
					? "bg-accent-soft/30 border-accent/60 shadow-xs"
					: "bg-surface border-border/70 hover:border-accent/40 hover:bg-surface-secondary/50"
			}`}
		>
			{/* Multi-select checkbox */}
			<button
				type="button"
				onClick={onToggleCheck}
				className="mt-1 text-muted hover:text-foreground shrink-0 cursor-pointer"
				aria-label={isChecked ? "取消选中" : "选中"}
			>
				{isChecked ? (
					<CheckSquare className="w-3.5 h-3.5 text-accent" />
				) : (
					<Square className="w-3.5 h-3.5 opacity-40 hover:opacity-80" />
				)}
			</button>

			{/* Favicon */}
			<div className="w-7 h-7 rounded-lg bg-surface-secondary border border-border/60 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
				<ItemFavicon
					url={item.url}
					favicon={item.favicon}
					type={item.type}
					size="sm"
				/>
			</div>

			{/* Item details */}
			<div className="flex-1 min-w-0">
				<a
					href={item.url}
					target="_blank"
					rel="noreferrer"
					onClick={(e) => e.stopPropagation()}
					className="font-semibold text-xs sm:text-sm text-foreground hover:text-accent truncate block [&_mark]:bg-accent/20 [&_mark]:text-accent [&_mark]:px-1 [&_mark]:py-0.2 [&_mark]:rounded [&_mark]:font-semibold"
				>
					{item.highlights?.name ? (
						<span dangerouslySetInnerHTML={{ __html: item.highlights.name }} />
					) : (
						item.name
					)}
				</a>

				{/* Snippet / Description */}
				{displayText && (
					<p className="text-[11px] text-muted mt-0.5 line-clamp-2 leading-relaxed [&_mark]:bg-accent/20 [&_mark]:text-accent [&_mark]:px-0.5 [&_mark]:rounded [&_mark]:font-medium">
						{item.highlights?.summary ? (
							<span
								dangerouslySetInnerHTML={{ __html: item.highlights.summary }}
							/>
						) : (
							displayText
						)}
					</p>
				)}

				{/* URL */}
				{item.url && (
					<div className="text-[10px] text-muted/60 truncate mt-1">
						{item.url}
					</div>
				)}

				{/* Folder & Category Meta tags (placed below URL) */}
				<div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted flex-wrap">
					{item.folderName ? (
						onNavigateToFolder ? (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onNavigateToFolder(
										item.folderId ?? null,
										item.category as Category,
									);
									onCloseModal();
								}}
								className="text-accent font-medium px-1.5 py-0.2 rounded bg-accent-soft/60 border border-accent/30 inline-flex items-center gap-1 max-w-[120px] cursor-pointer transition-colors hover:bg-accent-soft hover:border-accent/60"
								title="在工作台中定位此文件夹"
							>
								<FolderIconLucide className="w-2.5 h-2.5 shrink-0" />
								<span className="truncate">{item.folderName}</span>
							</button>
						) : (
							<span className="text-accent font-medium px-1.5 py-0.2 rounded bg-accent-soft/60 border border-accent/30 inline-flex items-center gap-1 max-w-[120px] truncate">
								<FolderIconLucide className="w-2.5 h-2.5 shrink-0" />
								<span className="truncate">{item.folderName}</span>
							</span>
						)
					) : (
						<span className="text-muted/80 px-1.5 py-0.2 rounded bg-surface-secondary border border-border/60">
							未分类
						</span>
					)}

					{item.category && (
						<span className="px-1 py-0.2 rounded bg-surface-secondary text-foreground/70 border border-border/40">
							{item.category}
						</span>
					)}
				</div>
			</div>

			{/* Right Column: Similarity Badge (top right) & Row Actions (bottom right) */}
			<div className="flex flex-col items-end justify-between shrink-0 self-stretch">
				{item.similarityPercent !== undefined &&
				item.similarityPercent !== null ? (
					<span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20 shrink-0">
						{item.similarityPercent}%
					</span>
				) : (
					<div />
				)}

				{/* Row Actions: single overflow dropdown */}
				<div
					className="mt-auto pt-1.5"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<Dropdown>
						<Dropdown.Trigger
							className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer transition-colors flex items-center justify-center"
							aria-label="更多操作"
						>
							<MoreHorizontal className="w-4 h-4" />
						</Dropdown.Trigger>
						<Dropdown.Popover
							aria-label="条目操作"
							className="min-w-[168px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
							placement="bottom end"
						>
							<Dropdown.Menu
								aria-label="条目操作"
								onAction={(key) => {
									if (key === "assign") {
										onOpenAssign();
									} else if (key === "locate") {
										onNavigateToFolder?.(
											item.folderId ?? null,
											item.category as Category,
										);
										onCloseModal();
									} else if (key === "open" && item.url) {
										window.open(item.url, "_blank", "noreferrer");
									}
								}}
							>
								{menuActions.map((action) => (
									<Dropdown.Item
										key={action.id}
										id={action.id}
										textValue={action.label}
									>
										<div className="flex items-center gap-2 py-0.5">
											{action.icon}
											<span className="text-xs font-medium">
												{action.label}
											</span>
										</div>
									</Dropdown.Item>
								))}
							</Dropdown.Menu>
						</Dropdown.Popover>
					</Dropdown>
				</div>
			</div>
		</div>
	);
});
