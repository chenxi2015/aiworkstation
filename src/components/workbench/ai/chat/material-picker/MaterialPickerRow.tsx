import { Check, Eye, Paperclip, Play, Star } from "lucide-react";
import { KIND_CONFIG, type MaterialKind } from "../../../../creator/materials/types";
import {
	getAssetMediaUrl,
	getAudioAssets,
	getImageAssets,
	getMaterialKind,
	getVideoAssets,
} from "../../../../creator/materials/utils";
import type { Material } from "../../../../creator/types";
import { getMaterialBrief, getMaterialMetaText } from "./utils";

export interface MaterialPickerRowProps {
	material: Material;
	isChecked: boolean;
	folderName?: string;
	onToggleSelect: (id: number) => void;
	onPickSingle: (m: Material) => void;
	onPreview: (m: Material) => void;
}

export function MaterialPickerRow({
	material,
	isChecked,
	folderName,
	onToggleSelect,
	onPickSingle,
	onPreview,
}: MaterialPickerRowProps) {
	const kind: MaterialKind = getMaterialKind(material);
	const kindConfig = KIND_CONFIG[kind];
	const KindIcon = kindConfig.icon;
	const assetCount = material.assets?.length ?? 0;
	const hasMedia =
		getVideoAssets(material).length > 0 ||
		getImageAssets(material).length > 0 ||
		getAudioAssets(material).length > 0;
	const previewLabel =
		kind === "video" ? "播放" : kind === "audio" ? "试听" : "预览";
	const imageAssets = getImageAssets(material);
	const coverUrl =
		kind === "image" && imageAssets.length > 0
			? getAssetMediaUrl(imageAssets[0])
			: null;
	const briefInfo = getMaterialBrief(material, kind);
	const metaText = getMaterialMetaText(material, kind, folderName);

	return (
		<div
			className={`relative flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl border transition-colors group overflow-hidden ${
				isChecked
					? "bg-accent/10 border-accent/40"
					: "border-transparent hover:bg-surface-secondary/80 hover:border-border/60"
			}`}
		>
			{/* Checkbox button */}
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onToggleSelect(material.id);
				}}
				className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
					isChecked
						? "bg-accent border-accent text-accent-foreground"
						: "border-border/80 hover:border-accent/60 bg-surface/50"
				}`}
				title={isChecked ? "取消勾选" : "勾选此素材"}
			>
				{isChecked && <Check className="w-3 h-3 stroke-[3]" />}
			</button>

			{/* Thumbnail or kind badge */}
			{kind === "image" && coverUrl ? (
				<div className="shrink-0 w-10 h-10 rounded-lg border border-border/70 overflow-hidden bg-surface-secondary/50 flex items-center justify-center relative">
					<img
						src={coverUrl}
						alt={material.title}
						loading="lazy"
						decoding="async"
						className="w-full h-full object-cover select-none"
						onError={(e) => {
							(e.currentTarget as HTMLElement).style.display = "none";
						}}
					/>
					<div className="absolute inset-0 -z-10 flex items-center justify-center">
						<KindIcon className={`w-4 h-4 ${kindConfig.iconClass}`} />
					</div>
				</div>
			) : (
				<div
					className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center ${kindConfig.badgeClass}`}
				>
					<KindIcon className={`w-4.5 h-4.5 ${kindConfig.iconClass}`} />
				</div>
			)}

			{/* Text contents: click to toggle, double click to pick */}
			<button
				type="button"
				onClick={() => onToggleSelect(material.id)}
				onDoubleClick={() => onPickSingle(material)}
				className="flex-1 min-w-0 text-left cursor-pointer"
			>
				<div className="flex items-center gap-1.5">
					<span
						className={`text-xs font-medium truncate transition-colors ${
							isChecked
								? "text-accent"
								: "text-foreground group-hover:text-accent"
						}`}
					>
						{material.title}
					</span>
					{material.starred && (
						<Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
					)}
					{assetCount > 0 && kind !== "image" && (
						<span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] text-muted/70">
							<Paperclip className="w-2.5 h-2.5" />
							{assetCount}
						</span>
					)}
				</div>
				<div
					className={`text-[10px] truncate mt-0.5 ${
						briefInfo.isNote
							? "text-amber-600 dark:text-amber-400 font-medium"
							: "text-muted/80"
					}`}
				>
					{briefInfo.text}
				</div>
				<div className="text-[9px] text-muted/60 mt-0.5 truncate">
					{metaText}
				</div>
			</button>

			{/* Hover quick action toolbar */}
			<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity pl-8 py-1 rounded-r-xl z-10 bg-gradient-to-l from-surface-secondary/95 via-surface-secondary/90 to-transparent">
				{(hasMedia || kind === "doc" || kind === "bookmark") && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onPreview(material);
						}}
						className="h-6 px-2 rounded-md text-[10px] flex items-center gap-1 text-muted hover:text-accent hover:bg-accent/15 cursor-pointer transition-colors bg-surface-secondary/80 border border-border/60 shadow-2xs backdrop-blur-xs"
						title={`${previewLabel}素材`}
					>
						{kind === "video" ? (
							<Play className="w-3 h-3 text-accent fill-accent/20" />
						) : (
							<Eye className="w-3 h-3 text-accent" />
						)}
						{previewLabel}
					</button>
				)}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onPickSingle(material);
					}}
					className="h-6 px-2.5 rounded-md text-[10px] font-medium bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer transition-colors shadow-2xs"
					title="快捷仅导入此项"
				>
					选择
				</button>
			</div>
		</div>
	);
}

