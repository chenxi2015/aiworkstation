import { Blocks, FileText } from "lucide-react";
import { formatBytes, formatDate } from "./format";
import type { SkillInfo } from "./types";

export interface SkillCardProps {
	skill: SkillInfo;
	onOpen: (skill: SkillInfo) => void;
}

/** skill 卡片：名称、来源徽标、描述、体积与更新时间 */
export function SkillCard({ skill, onOpen }: SkillCardProps) {
	return (
		<button
			type="button"
			onClick={() => onOpen(skill)}
			className="group text-left rounded-2xl border border-border bg-surface-secondary/40 p-4 shadow-xs transition-colors hover:border-accent/50 hover:bg-surface-secondary/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
		>
			<div className="flex items-start gap-3">
				<div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
					<Blocks className="w-4.5 h-4.5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="text-sm font-semibold text-foreground truncate">
							{skill.name}
						</h3>
						{skill.version && (
							<span className="text-[10px] font-mono text-muted shrink-0">
								v{skill.version}
							</span>
						)}
					</div>
					<div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
						<span className="px-1.5 py-0.5 rounded-md bg-surface border border-border font-medium">
							{skill.rootLabel}
						</span>
						<span className="truncate font-mono">{skill.dirName}</span>
						{!skill.hasSkillMd && (
							<span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium shrink-0">
								缺 SKILL.md
							</span>
						)}
					</div>
				</div>
			</div>
			<p className="mt-3 text-xs text-foreground/70 leading-relaxed line-clamp-3 min-h-[3.6em]">
				{skill.description || "（无描述）"}
			</p>
			<div className="mt-3 pt-2.5 border-t border-border/60 flex items-center gap-3 text-[10px] text-muted">
				<span className="flex items-center gap-1">
					<FileText className="w-3 h-3" />
					{skill.fileCount} 文件
				</span>
				<span>{formatBytes(skill.sizeBytes)}</span>
				<span className="ml-auto">{formatDate(skill.modifiedAt)}</span>
			</div>
		</button>
	);
}
