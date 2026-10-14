import { Dropdown } from "@heroui/react";
import {
	CheckCircle2,
	FileText,
	FolderOpen,
	KeyRound,
	MoreHorizontal,
	Trash2,
} from "lucide-react";
import type React from "react";
import { formatBytes, formatDate } from "./format";
import { SkillIconBadge } from "./SkillIconBadge";
import type { SkillInfo } from "./types";

export interface SkillGridCardProps {
	skill: SkillInfo;
	onOpen: (skill: SkillInfo) => void;
	onRequestUninstall: (skill: SkillInfo, e?: React.MouseEvent) => void;
	onOpenDirectory?: (skill: SkillInfo, e?: React.MouseEvent) => void;
}

export function SkillGridCard({
	skill,
	onOpen,
	onRequestUninstall,
	onOpenDirectory,
}: SkillGridCardProps) {
	return (
		<div className="relative group rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4 shadow-2xs hover:shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
			<button
				type="button"
				onClick={() => onOpen(skill)}
				className="text-left w-full flex-1 flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-xl"
			>
				<div>
					{/* Top row: Icon + Title & Badges */}
					<div className="flex items-start gap-3 pr-8">
						<SkillIconBadge skill={skill} className="w-11 h-11" />
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5 flex-wrap">
								<h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[170px]">
									{skill.name}
								</h3>
								{skill.verified && (
									<span title="官方认证技能" className="inline-flex">
										<CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
									</span>
								)}
							</div>
							<div className="mt-1 flex items-center gap-1.5 flex-wrap">
								{skill.category && (
									<span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-medium">
										{skill.category}
									</span>
								)}
								{skill.needsApiKey && (
									<span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[10px] font-medium flex items-center gap-1 border border-amber-200/60 dark:border-amber-800/40">
										<KeyRound className="w-2.5 h-2.5" />
										需配置 API Key
									</span>
								)}
							</div>
						</div>
					</div>

					{/* Middle description */}
					<p className="mt-3 text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3 min-h-[3.8em]">
						{skill.description || "（暂无详细功能描述）"}
					</p>
				</div>

				{/* Bottom metrics */}
				<div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 w-full flex items-center justify-between text-[11px] text-zinc-400">
					<div className="flex items-center gap-3">
						<span className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
							<FileText className="w-3 h-3 text-zinc-400" />
							{skill.fileCount} 文件
						</span>
						<span className="text-zinc-400 font-mono text-[10px]">
							{formatBytes(skill.sizeBytes)}
						</span>
						<span className="text-zinc-400 font-mono text-[10px]">
							{formatDate(skill.modifiedAt)}
						</span>
					</div>
					<span className="text-zinc-400 font-mono text-[10px] truncate max-w-[100px]">
						{skill.source || skill.rootLabel}
					</span>
				</div>
			</button>

			{/* Top-right actions dropdown menu */}
			{skill.dirPath && (
				<div className="absolute top-3.5 right-3.5 z-20">
					<Dropdown>
						<Dropdown.Trigger
							onClick={(e) => e.stopPropagation()}
							className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
							aria-label="更多操作"
						>
							<MoreHorizontal className="w-4 h-4" />
						</Dropdown.Trigger>
						<Dropdown.Popover
							aria-label="技能操作"
							className="min-w-[150px] p-1 shadow-lg border border-zinc-200/80 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 z-50"
							placement="bottom end"
						>
							<Dropdown.Menu
								aria-label="技能操作选项"
								onAction={(key) => {
									if (key === "open-dir") {
										onOpenDirectory?.(skill);
									} else if (key === "uninstall") {
										onRequestUninstall(skill);
									}
								}}
							>
								{onOpenDirectory && (
									<Dropdown.Item id="open-dir" textValue="查看所在目录">
										<div className="flex items-center gap-2 py-1 px-1.5 text-xs text-zinc-700 dark:text-zinc-200">
											<FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
											<span>查看所在目录</span>
										</div>
									</Dropdown.Item>
								)}
								<Dropdown.Item
									id="uninstall"
									textValue="卸载技能"
									className="text-rose-600 dark:text-rose-400"
								>
									<div className="flex items-center gap-2 py-1 px-1.5 text-xs text-rose-600 dark:text-rose-400">
										<Trash2 className="w-3.5 h-3.5" />
										<span>卸载本技能</span>
									</div>
								</Dropdown.Item>
							</Dropdown.Menu>
						</Dropdown.Popover>
					</Dropdown>
				</div>
			)}
		</div>
	);
}
