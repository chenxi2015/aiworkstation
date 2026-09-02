import { Button, Modal, Skeleton, toast } from "@heroui/react";
import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import type { Folder } from "./types";
import { WorkbenchStorageService } from "../../services/workbenchStorage";

interface FolderDossierModalProps {
	isOpen: boolean;
	folder: Folder | null;
	onClose: () => void;
}

export function FolderDossierModal({
	isOpen,
	folder,
	onClose,
}: FolderDossierModalProps) {
	const [markdown, setMarkdown] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState<boolean>(false);

	const handleGenerate = async () => {
		if (!folder) return;
		setIsLoading(true);
		setError(null);

		try {
			const settings = WorkbenchStorageService.getSettings();
			const llmConfig = {
				apiKey: settings.deepseekApiKey,
				baseUrl: settings.deepseekBaseUrl,
				model: settings.deepseekModel,
			};

			const res = await WorkbenchStorageService.generateFolderDossier({
				folderId: folder.id,
				llmConfig,
			});

			setMarkdown(res.dossierMarkdown);
		} catch (err: any) {
			console.error("Dossier generation failed:", err);
			setError(err.message || "生成专题综述失败，请检查 AI 配置");
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (isOpen && folder) {
			setMarkdown("");
			setError(null);
			handleGenerate();
		}
	}, [isOpen, folder?.id]);

	const handleCopy = () => {
		if (!markdown) return;
		navigator.clipboard.writeText(markdown);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
		toast.success("已复制 Markdown 综述至剪贴板！");
	};

	const handleDownloadMd = () => {
		if (!markdown || !folder) return;
		const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${folder.name}_专题研究综述.md`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success("已导出 Markdown 文件");
	};

	if (!folder) return null;

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="max-w-4xl w-full mx-auto p-4">
				<Modal.Dialog className="p-0 overflow-hidden flex flex-col h-[88vh] max-h-[88vh] w-full max-w-4xl bg-surface border border-border shadow-2xl rounded-2xl">
					{/* Header */}
					<div className="p-4 px-6 border-b border-border bg-surface-secondary/40 flex items-center justify-between gap-4 shrink-0">
						<div className="flex items-center gap-3 min-w-0 flex-1">
							<div className="w-9 h-9 rounded-xl bg-accent/15 text-accent border border-accent/20 flex items-center justify-center text-lg shrink-0 shadow-xs">
								🧠
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2 flex-wrap min-w-0">
									<h2 className="font-bold text-sm sm:text-base text-foreground truncate">
										{folder.name} · 专题全景综述与指南
									</h2>
									<span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 shrink-0 whitespace-nowrap">
										📚 {folder.items.length} 个书签沉淀
									</span>
									<span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-secondary text-muted border border-border shrink-0 whitespace-nowrap">
										📁 {folder.category}
									</span>
								</div>
								<p className="text-[11px] text-muted leading-relaxed truncate mt-0.5">
									由 AI 深度解析提炼的结构化生态全景、工具链对比与实战 Cheatsheet
								</p>
							</div>
						</div>

						{/* Action buttons */}
						<div className="flex items-center gap-2 shrink-0">
							{markdown && (
								<>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 text-xs rounded-full border border-border/80 text-muted hover:text-foreground cursor-pointer"
										onPress={handleCopy}
									>
										{copied ? "✓ 已复制" : "📋 复制 Markdown"}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 text-xs rounded-full border border-border/80 text-muted hover:text-foreground cursor-pointer"
										onPress={handleDownloadMd}
									>
										💾 导出文件
									</Button>
								</>
							)}
							<Button
								variant="ghost"
								size="sm"
								className="h-7 text-xs rounded-full border border-border/60 hover:bg-surface-secondary cursor-pointer"
								onPress={handleGenerate}
								isDisabled={isLoading}
							>
								{isLoading ? "⏳ 分析中..." : "🔄 重新提炼"}
							</Button>
							<button
								type="button"
								onClick={onClose}
								className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer text-xs ml-1 transition-colors"
								title="关闭"
							>
								✕
							</button>
						</div>
					</div>

					{/* Content Body */}
					<div className="flex-1 overflow-y-auto p-6 sm:p-8 text-xs leading-relaxed max-h-[72vh] bg-surface/50">
						{isLoading ? (
							<div className="flex flex-col gap-5 py-8 px-4 max-w-2xl mx-auto">
								<div className="flex items-center gap-3 p-3.5 rounded-xl bg-accent/10 border border-accent/20 text-accent">
									<div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
									<div className="flex flex-col gap-0.5">
										<span className="text-xs font-semibold text-foreground">
											DeepSeek 正在全面解析「{folder.name}」中的 {folder.items.length} 个书签素材...
										</span>
										<span className="text-[11px] text-muted">
											正在提炼多维对比矩阵、选型决策指南与核心 Cheatsheet
										</span>
									</div>
								</div>
								<div className="space-y-3 pt-2">
									<Skeleton className="w-2/5 h-6 rounded-lg" />
									<Skeleton className="w-full h-4 rounded" />
									<Skeleton className="w-5/6 h-4 rounded" />
									<Skeleton className="w-4/6 h-4 rounded" />
								</div>
								<div className="space-y-3 pt-3">
									<Skeleton className="w-1/2 h-6 rounded-lg" />
									<Skeleton className="w-full h-16 rounded-xl" />
								</div>
								<div className="space-y-3 pt-3">
									<Skeleton className="w-1/3 h-6 rounded-lg" />
									<Skeleton className="w-full h-4 rounded" />
									<Skeleton className="w-3/4 h-4 rounded" />
								</div>
							</div>
						) : error ? (
							<div className="py-12 text-center flex flex-col items-center justify-center gap-3">
								<div className="text-3xl">⚠️</div>
								<div className="text-sm font-semibold text-danger">{error}</div>
								<Button
									variant="primary"
									size="sm"
									className="rounded-full mt-2"
									onPress={handleGenerate}
								>
									重试生成
								</Button>
							</div>
						) : markdown ? (
							<div className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-xl sm:prose-h1:text-2xl prose-h1:border-b prose-h1:border-border/60 prose-h1:pb-3 prose-h1:mb-4 prose-h2:text-base sm:prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-h3:text-sm sm:prose-h3:text-base prose-p:text-muted-foreground prose-p:leading-relaxed prose-table:my-4 prose-th:bg-surface-secondary/80 prose-th:text-foreground prose-th:p-2.5 prose-th:text-xs prose-td:p-2.5 prose-td:text-xs prose-td:border-border/60 prose-strong:text-foreground prose-code:text-accent prose-code:bg-accent/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none prose-blockquote:border-l-accent prose-blockquote:bg-surface-secondary/40 prose-blockquote:py-1.5 prose-blockquote:px-4 prose-blockquote:rounded-r-lg">
								<Streamdown
									controls={{
										table: {
											copy: true,
											download: true,
											fullscreen: true,
										},
										code: {
											copy: true,
											download: true,
										},
									}}
								>
									{markdown}
								</Streamdown>
							</div>
						) : null}
					</div>

					{/* Footer */}
					<div className="p-3.5 px-6 border-t border-border bg-surface-secondary/40 flex items-center justify-between text-[11px] text-muted shrink-0">
						<span>
							分类归属:{" "}
							<strong className="text-foreground font-medium">{folder.category}</strong> · 共 {folder.items.length} 条已整理素材
						</span>
						<span className="flex items-center gap-1 text-accent font-medium">
							✨ AI Workstation 专题知识库提炼引擎
						</span>
					</div>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
