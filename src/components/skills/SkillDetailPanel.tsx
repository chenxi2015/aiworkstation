import { FileText, FolderTree, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchSkillDetail } from "../../services/api/skillsClient";
import { formatBytes, formatDate } from "./format";
import type { SkillDetail, SkillInfo } from "./types";

export interface SkillDetailPanelProps {
	skill: SkillInfo;
	onClose: () => void;
}

/** skill 详情侧栏：元信息、文件清单、SKILL.md 全文预览 */
export function SkillDetailPanel({ skill, onClose }: SkillDetailPanelProps) {
	const [detail, setDetail] = useState<SkillDetail | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setDetail(null);
		fetchSkillDetail(skill.dirPath).then((res) => {
			if (cancelled) return;
			setDetail(res);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [skill.dirPath]);

	return (
		<div className="fixed inset-0 z-50 flex justify-end">
			<button
				type="button"
				aria-label="关闭详情"
				className="absolute inset-0 bg-black/30 backdrop-blur-xs cursor-default"
				onClick={onClose}
			/>
			<aside className="relative w-full max-w-xl h-full bg-surface border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right">
				<header className="p-4 border-b border-border flex items-start gap-3 shrink-0">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h2 className="text-base font-bold text-foreground truncate">
								{skill.name}
							</h2>
							{skill.version && (
								<span className="text-[10px] font-mono text-muted shrink-0">
									v{skill.version}
								</span>
							)}
						</div>
						<p className="mt-1 text-[11px] font-mono text-muted break-all">
							{skill.dirPath}
						</p>
						<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
							<span className="px-1.5 py-0.5 rounded-md bg-surface-secondary border border-border font-medium">
								{skill.rootLabel}
							</span>
							{skill.author && <span>作者 {skill.author}</span>}
							{skill.license && <span>{skill.license}</span>}
							<span>
								{skill.fileCount} 文件 · {formatBytes(skill.sizeBytes)} ·{" "}
								{formatDate(skill.modifiedAt)}
							</span>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary transition-colors shrink-0"
					>
						<X className="w-4 h-4" />
					</button>
				</header>

				<div className="flex-1 overflow-y-auto p-4 space-y-4">
					{loading && (
						<div className="flex items-center justify-center gap-2 py-16 text-muted text-xs">
							<Loader2 className="w-4 h-4 animate-spin" />
							正在读取 skill 详情…
						</div>
					)}
					{!loading && !detail && (
						<p className="py-16 text-center text-xs text-muted">
							详情读取失败，目录可能已被移动或删除
						</p>
					)}
					{!loading && detail && (
						<>
							<section>
								<h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
									<FolderTree className="w-3.5 h-3.5 text-accent" />
									文件清单（{detail.files.length}）
								</h3>
								<ul className="rounded-xl border border-border bg-surface-secondary/40 divide-y divide-border/50 max-h-48 overflow-y-auto">
									{detail.files.map((file) => (
										<li
											key={file}
											className="px-3 py-1.5 text-[11px] font-mono text-foreground/80 truncate"
										>
											{file}
										</li>
									))}
								</ul>
							</section>
							<section>
								<h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
									<FileText className="w-3.5 h-3.5 text-accent" />
									SKILL.md
								</h3>
								{detail.markdown ? (
									<pre className="rounded-xl border border-border bg-surface-secondary/40 p-3 text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words font-mono">
										{detail.markdown}
									</pre>
								) : (
									<p className="rounded-xl border border-dashed border-border p-4 text-center text-[11px] text-muted">
										该目录没有 SKILL.md
									</p>
								)}
								{detail.truncated && (
									<p className="mt-2 text-[10px] text-muted">
										内容过长，已截断显示
									</p>
								)}
							</section>
						</>
					)}
				</div>
			</aside>
		</div>
	);
}
