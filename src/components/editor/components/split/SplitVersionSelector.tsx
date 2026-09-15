import { Check, ChevronDown, History } from "lucide-react";
import { useState } from "react";
import type { DocumentVersion } from "./types";

export interface SplitVersionSelectorProps {
	labelPrefix: string; // e.g. "左栏 · 基准" or "右栏 · 演练"
	selectedVersionId: string;
	versions: DocumentVersion[];
	onSelectVersion: (versionId: string) => void;
	disabled?: boolean;
	/** 当 selectedVersionId 不在 versions 列表中（如右栏草稿工作区）时显示的回退标签 */
	fallbackLabel?: string;
}

const MODE_TAGS: Record<string, { text: string; bg: string; textCol: string }> =
	{
		original: {
			text: "基准原文",
			bg: "bg-muted/15",
			textCol: "text-muted-foreground",
		},
		spin: {
			text: "二创",
			bg: "bg-purple-500/15",
			textCol: "text-purple-600 dark:text-purple-400",
		},
		polish: {
			text: "润色",
			bg: "bg-blue-500/15",
			textCol: "text-blue-600 dark:text-blue-400",
		},
		expand: {
			text: "扩写",
			bg: "bg-emerald-500/15",
			textCol: "text-emerald-600 dark:text-emerald-400",
		},
		condense: {
			text: "精简",
			bg: "bg-amber-500/15",
			textCol: "text-amber-600 dark:text-amber-400",
		},
		oral: {
			text: "口播",
			bg: "bg-rose-500/15",
			textCol: "text-rose-600 dark:text-rose-400",
		},
		manual: {
			text: "手动精修",
			bg: "bg-teal-500/15",
			textCol: "text-teal-600 dark:text-teal-400",
		},
		rewrite: {
			text: "改写",
			bg: "bg-indigo-500/15",
			textCol: "text-indigo-600 dark:text-indigo-400",
		},
	};

export function SplitVersionSelector({
	labelPrefix,
	selectedVersionId,
	versions,
	onSelectVersion,
	disabled = false,
	fallbackLabel,
}: SplitVersionSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);

	// 注意：不要回退到 versions[0]，否则右栏草稿会被误标为 "v0: 当前正文 (Base)"
	const activeVersion = versions.find((v) => v.id === selectedVersionId);
	const tag = activeVersion
		? MODE_TAGS[activeVersion.mode || "original"] || MODE_TAGS.original
		: null;

	return (
		<div className="relative inline-block text-left">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				disabled={disabled}
				className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium hover:bg-surface-secondary/80 text-foreground transition-colors cursor-pointer disabled:opacity-50"
				title="切换对比版本"
			>
				<span className="text-muted font-normal">{labelPrefix}:</span>
				<span className="font-semibold text-foreground max-w-[120px] truncate">
					{activeVersion?.label || fallbackLabel || selectedVersionId}
				</span>
				{tag && (
					<span
						className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${tag.bg} ${tag.textCol}`}
					>
						{tag.text}
					</span>
				)}
				<ChevronDown className="w-3 h-3 text-muted" />
			</button>

			{isOpen && (
				<>
					<button
						type="button"
						aria-label="关闭版本列表"
						className="fixed inset-0 z-40 bg-transparent cursor-default border-none p-0"
						onClick={() => setIsOpen(false)}
					/>
					<div className="absolute left-0 top-full mt-1.5 w-60 bg-surface dark:bg-zinc-900 border border-border rounded-xl shadow-xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
						<div className="px-3 py-1 text-[11px] font-medium text-muted border-b border-border/60 flex items-center justify-between">
							<span className="flex items-center gap-1">
								<History className="w-3 h-3" />
								<span>可用版本 ({versions.length})</span>
							</span>
							<span className="text-[10px] text-muted/70">可任意选定对比</span>
						</div>
						<div className="max-h-56 overflow-y-auto py-1">
							{versions.map((ver) => {
								const isSelected = ver.id === selectedVersionId;
								const verTag =
									MODE_TAGS[ver.mode || "original"] || MODE_TAGS.original;
								const wordLen = ver.content.length;

								return (
									<button
										key={ver.id}
										type="button"
										onClick={() => {
											onSelectVersion(ver.id);
											setIsOpen(false);
										}}
										className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-surface-secondary transition-colors cursor-pointer ${
											isSelected
												? "bg-accent/10 font-medium"
												: "text-foreground"
										}`}
									>
										<div className="flex items-center gap-2 min-w-0 flex-1">
											{isSelected ? (
												<Check className="w-3.5 h-3.5 text-accent shrink-0" />
											) : (
												<div className="w-3.5 h-3.5 shrink-0" />
											)}
											<span className="truncate text-xs">{ver.label}</span>
											<span
												className={`text-[9px] px-1 py-0.2 rounded shrink-0 ${verTag.bg} ${verTag.textCol}`}
											>
												{verTag.text}
											</span>
											{ver.isSavedToDb && (
												<span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">
													[已存库]
												</span>
											)}
										</div>
										<span className="text-[10px] text-muted shrink-0 ml-2">
											{wordLen}字
										</span>
									</button>
								);
							})}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
