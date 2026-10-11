import { Link } from "@tanstack/react-router";
import { formatRelativeTime } from "../format";
import type { DashboardWidgetProps } from "./widgetProps";

/** 去掉 .md 扩展名的展示名 */
function displayName(name: string): string {
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

/** 笔记所在目录（relPath 去掉文件名；根目录返回空串） */
function parentDir(relPath: string): string {
	const idx = relPath.lastIndexOf("/");
	return idx > 0 ? relPath.slice(0, idx) : "";
}

/** 最近笔记：Obsidian Vault 按 mtime 的笔记速览，深链 ?note= 直达 */
export function ObsidianRecentWidget({ summary }: DashboardWidgetProps) {
	const { available, noteCount, recent } = summary.obsidian;
	if (!available) {
		return (
			<p className="text-[11px] text-muted h-full flex items-center">
				还没配置 Vault，去笔记模块指定本地 Obsidian 目录
			</p>
		);
	}
	if (recent.length === 0) {
		return (
			<p className="text-[11px] text-muted h-full flex items-center">
				Vault 里还没有笔记，去笔记模块写下第一篇
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-2 h-full">
			<Link
				to="/obsidian"
				className="text-[11px] text-muted hover:text-violet-600 dark:hover:text-violet-300 transition-colors w-fit"
			>
				共 <span className="font-mono text-foreground">{noteCount}</span> 篇笔记
			</Link>
			<ul className="space-y-1.5 min-h-0 overflow-hidden">
				{recent.map((note) => {
					const dir = parentDir(note.relPath);
					return (
						<li key={note.relPath}>
							<Link
								to="/obsidian"
								search={{ note: note.relPath }}
								title={`打开笔记：${note.relPath}`}
								className="flex items-center gap-2 text-[11px] rounded-lg px-1.5 -mx-1.5 py-0.5 hover:bg-violet-50 dark:hover:bg-violet-400/10 transition-colors group"
							>
								<span
									className="text-foreground truncate group-hover:text-violet-600 dark:group-hover:text-violet-300 transition-colors"
									title={note.relPath}
								>
									{displayName(note.name)}
								</span>
								{dir && (
									<span className="text-[10px] text-muted truncate shrink max-w-24">
										{dir}
									</span>
								)}
								<span className="ml-auto text-muted shrink-0 text-[10px]">
									{formatRelativeTime(new Date(note.mtime).toISOString())}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
