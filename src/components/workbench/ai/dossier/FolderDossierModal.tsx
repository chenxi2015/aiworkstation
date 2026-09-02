import { Button, Modal, Skeleton, toast } from "@heroui/react";
import {
	AlertCircle,
	Bookmark,
	BrainCircuit,
	Check,
	Copy,
	Download,
	Folder as FolderIconLucide,
	Loader2,
	RefreshCw,
	Sparkles,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import type { Folder } from "../../types";
import { AiMarkdownRenderer } from "../shared/AiMarkdownRenderer";

export interface FolderDossierModalProps {
	isOpen: boolean;
	folder: Folder | null;
	onClose: () => void;
}

/**
 * AI Folder Dossier Modal generating deep synthesis reports from folder bookmarks
 */
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
				<Modal.Dialog
					className="p-0 overflow-hidden flex flex-col h-[88vh] max-h-[88vh] w-full max-w-4xl bg-surface border border-border shadow-2xl rounded-2xl"
					aria-label={`${folder.name} · 专题全景综述与指南`}
				>
					{/* Header */}
					<div className="p-4 px-6 border-b border-border bg-surface-secondary/40 flex items-center justify-between gap-4 shrink-0">
						<div className="flex items-center gap-3 min-w-0 flex-1">
							<div className="w-9 h-9 rounded-xl bg-accent/15 text-accent border border-accent/20 flex items-center justify-center shrink-0 shadow-xs">
								<BrainCircuit className="w-5 h-5" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2 flex-wrap min-w-0">
									<Modal.Heading className="font-bold text-sm sm:text-base text-foreground truncate">
										{folder.name} · 专题全景综述与指南
									</Modal.Heading>
									<span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 shrink-0 whitespace-nowrap">
										<Bookmark className="w-3 h-3" />
										<span>{folder.items.length} 个书签沉淀</span>
									</span>
									<span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-secondary text-muted border border-border shrink-0 whitespace-nowrap">
										<FolderIconLucide className="w-2.5 h-2.5 opacity-70" />
										<span>{folder.category}</span>
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
										className="h-7 text-xs rounded-full border border-border/80 text-muted hover:text-foreground cursor-pointer flex items-center gap-1"
										onPress={handleCopy}
									>
										{copied ? (
											<>
												<Check className="w-3 h-3 text-success" />
												<span>已复制</span>
											</>
										) : (
											<>
												<Copy className="w-3 h-3" />
												<span>复制 Markdown</span>
											</>
										)}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 text-xs rounded-full border border-border/80 text-muted hover:text-foreground cursor-pointer flex items-center gap-1"
										onPress={handleDownloadMd}
									>
										<Download className="w-3 h-3" />
										<span>导出文件</span>
									</Button>
								</>
							)}
							<Button
								variant="ghost"
								size="sm"
								className="h-7 text-xs rounded-full border border-border/60 hover:bg-surface-secondary cursor-pointer flex items-center gap-1"
								onPress={handleGenerate}
								isDisabled={isLoading}
							>
								{isLoading ? (
									<>
										<Loader2 className="w-3 h-3 animate-spin" />
										<span>分析中...</span>
									</>
								) : (
									<>
										<RefreshCw className="w-3 h-3" />
										<span>重新提炼</span>
									</>
								)}
							</Button>
							<button
								type="button"
								onClick={onClose}
								className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer text-xs ml-1 transition-colors"
								title="关闭"
							>
								<X className="w-4 h-4" />
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
								<AlertCircle className="w-9 h-9 text-danger opacity-80" />
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
							<AiMarkdownRenderer content={markdown} compact={false} />
						) : null}
					</div>

					{/* Footer */}
					<div className="p-3.5 px-6 border-t border-border bg-surface-secondary/40 flex items-center justify-between text-[11px] text-muted shrink-0">
						<span>
							分类归属:{" "}
							<strong className="text-foreground font-medium">{folder.category}</strong> · 共 {folder.items.length} 条已整理素材
						</span>
						<span className="flex items-center gap-1.5 text-accent font-medium">
							<Sparkles className="w-3.5 h-3.5" />
							<span>AI Workstation 专题知识库提炼引擎</span>
						</span>
					</div>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
