import { toast } from "@heroui/react";
import {
	Check,
	Code,
	Copy,
	Eye,
	FileText,
	FolderOpen,
	FolderTree,
	Loader2,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
	fetchSkillDetail,
	openSkillDirectory,
} from "../../services/api/skillsClient";
import { AiMarkdownRenderer } from "../workbench/ai/shared/AiMarkdownRenderer";
import { formatBytes, formatDate } from "./format";
import type { SkillDetail, SkillInfo } from "./types";

export interface SkillDetailPanelProps {
	skill: SkillInfo;
	onClose: () => void;
	onRequestUninstall?: (skill: SkillInfo) => void;
}

/** skill 详情侧栏：元信息、目录快捷打开、文件清单、SKILL.md 渲染预览与源码 */
export function SkillDetailPanel({
	skill,
	onClose,
	onRequestUninstall,
}: SkillDetailPanelProps) {
	const [detail, setDetail] = useState<SkillDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [openingDir, setOpeningDir] = useState(false);
	const [copiedPath, setCopiedPath] = useState(false);
	const [copiedMarkdown, setCopiedMarkdown] = useState(false);
	const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");

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

	const handleOpenDirectory = async () => {
		if (!skill.dirPath) return;
		setOpeningDir(true);
		try {
			const res = await openSkillDirectory(skill.dirPath);
			if (res.success) {
				toast.success(res.message || "已在系统文件管理器中打开");
			} else {
				toast.danger(res.message || "打开目录失败");
			}
		} finally {
			setOpeningDir(false);
		}
	};

	const handleCopyPath = async () => {
		if (!skill.dirPath) return;
		try {
			await navigator.clipboard.writeText(skill.dirPath);
			setCopiedPath(true);
			toast.success("已复制目录路径");
			setTimeout(() => setCopiedPath(false), 2000);
		} catch {
			toast.danger("复制路径失败");
		}
	};

	const handleCopyMarkdown = async () => {
		if (!detail?.markdown) return;
		try {
			await navigator.clipboard.writeText(detail.markdown);
			setCopiedMarkdown(true);
			toast.success("已复制 SKILL.md 全文");
			setTimeout(() => setCopiedMarkdown(false), 2000);
		} catch {
			toast.danger("复制失败");
		}
	};

	if (typeof document === "undefined") return null;

	return createPortal(
		<div className="fixed inset-0 z-[100] flex justify-start">
			<button
				type="button"
				aria-label="关闭详情"
				className="absolute inset-0 bg-black/40 backdrop-blur-xs cursor-default"
				onClick={onClose}
			/>
			<aside className="relative w-full max-w-2xl h-full bg-surface border-r border-border shadow-2xl flex flex-col animate-in slide-in-from-left z-10">
				<header className="p-4 border-b border-border flex items-start gap-3 shrink-0 bg-surface">
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

						{/* Directory path bar with quick actions */}
						<div className="mt-2 flex items-center gap-2 bg-surface-secondary/70 border border-border/80 rounded-lg px-2.5 py-1.5">
							<p className="flex-1 text-[11px] font-mono text-muted truncate select-all">
								{skill.dirPath}
							</p>
							<div className="flex items-center gap-1 shrink-0">
								<button
									type="button"
									onClick={handleOpenDirectory}
									disabled={openingDir}
									title="在系统文件管理器中打开"
									className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-foreground/80 hover:text-foreground hover:bg-surface border border-border/60 transition-colors disabled:opacity-50 cursor-pointer"
								>
									{openingDir ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<FolderOpen className="w-3 h-3 text-accent" />
									)}
									<span>打开目录</span>
								</button>
								<button
									type="button"
									onClick={handleCopyPath}
									title="复制目录路径"
									className="p-1 rounded text-muted hover:text-foreground hover:bg-surface border border-border/60 transition-colors cursor-pointer"
								>
									{copiedPath ? (
										<Check className="w-3 h-3 text-emerald-500" />
									) : (
										<Copy className="w-3 h-3" />
									)}
								</button>
							</div>
						</div>

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

					<div className="flex items-center gap-1 shrink-0">
						{onRequestUninstall && (
							<button
								type="button"
								onClick={() => onRequestUninstall(skill)}
								title="卸载本技能"
								className="p-1.5 rounded-lg text-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
							>
								<Trash2 className="w-4 h-4" />
							</button>
						)}
						<button
							type="button"
							onClick={onClose}
							title="关闭详情"
							className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary transition-colors"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
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
								<ul className="rounded-xl border border-border bg-surface-secondary/40 divide-y divide-border/50 max-h-40 overflow-y-auto">
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
								<div className="flex items-center justify-between mb-2">
									<h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
										<FileText className="w-3.5 h-3.5 text-accent" />
										SKILL.md
									</h3>
									{detail.markdown && (
										<div className="flex items-center gap-1">
											<div className="flex items-center bg-surface-secondary border border-border rounded-lg p-0.5 text-[11px]">
												<button
													type="button"
													onClick={() => setViewMode("rendered")}
													className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
														viewMode === "rendered"
															? "bg-surface text-accent shadow-2xs"
															: "text-muted hover:text-foreground"
													}`}
												>
													<Eye className="w-3 h-3" />
													<span>预览</span>
												</button>
												<button
													type="button"
													onClick={() => setViewMode("raw")}
													className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
														viewMode === "raw"
															? "bg-surface text-accent shadow-2xs"
															: "text-muted hover:text-foreground"
													}`}
												>
													<Code className="w-3 h-3" />
													<span>源码</span>
												</button>
											</div>

											<button
												type="button"
												onClick={handleCopyMarkdown}
												title="复制 SKILL.md"
												className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary border border-border transition-colors cursor-pointer"
											>
												{copiedMarkdown ? (
													<Check className="w-3.5 h-3.5 text-emerald-500" />
												) : (
													<Copy className="w-3.5 h-3.5" />
												)}
											</button>
										</div>
									)}
								</div>

								{detail.markdown ? (
									viewMode === "rendered" ? (
										<div className="rounded-xl border border-border bg-surface-secondary/20 p-4 text-xs leading-relaxed overflow-x-auto min-h-[160px]">
											<AiMarkdownRenderer
												content={detail.markdown}
												compact={false}
											/>
										</div>
									) : (
										<pre className="rounded-xl border border-border bg-surface-secondary/40 p-3 text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words font-mono">
											{detail.markdown}
										</pre>
									)
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
		</div>,
		document.body,
	);
}
