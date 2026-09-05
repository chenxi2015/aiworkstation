import {
	Button,
	Chip,
	Modal,
	ProgressBar,
	ScrollShadow,
	toast,
} from "@heroui/react";
import { Check, Folder, Settings, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AIClassifierService } from "../../../../services/aiClassifier";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import { ItemFavicon } from "../../ItemFavicon";
import type {
	AIClassificationResult,
	BookmarkTDKItem,
	Folder as FolderType,
	WorkbenchItem,
	WorkbenchSettings,
} from "../../types";
import { ITEM_TYPES } from "../../types";

export interface AIClassifyModalProps {
	isOpen: boolean;
	itemsToClassify: WorkbenchItem[];
	folders: FolderType[];
	settings: WorkbenchSettings;
	onClose: () => void;
	onClassificationComplete: (
		updatedFolders: FolderType[],
		updatedUnclassified: WorkbenchItem[],
	) => void;
	onOpenSettings?: () => void;
}

/**
 * AI Classification Modal powered by DeepSeek for bulk sorting inbox bookmarks
 */
export function AIClassifyModal({
	isOpen,
	itemsToClassify,
	folders,
	settings,
	onClose,
	onClassificationComplete,
	onOpenSettings,
}: AIClassifyModalProps) {
	const [status, setStatus] = useState<
		"idle" | "running" | "completed" | "error"
	>("idle");
	const [selectedCountLimit, setSelectedCountLimit] = useState<number>(50);
	const [progressText, setProgressText] = useState("");
	const [progressPercent, setProgressPercent] = useState(0);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const [logs, setLogs] = useState<string[]>([]);
	const [results, setResults] = useState<AIClassificationResult[]>([]);
	const [errorMsg, setErrorMsg] = useState("");
	const abortControllerRef = useRef<AbortController | null>(null);
	const incrementalResultsRef = useRef<AIClassificationResult[]>([]);
	const logScrollRef = useRef<HTMLDivElement>(null);

	// Reset timer on running status change
	useEffect(() => {
		if (status !== "running") {
			setElapsedSeconds(0);
			return;
		}
		const timer = setInterval(() => {
			setElapsedSeconds((s) => s + 1);
		}, 1000);
		return () => clearInterval(timer);
	}, [status]);

	// Auto-scroll thinking log to bottom
	useEffect(() => {
		if (logScrollRef.current) {
			logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
		}
	}, [logs]);

	// Reset state when modal opens or closes
	const handleClose = () => {
		if (status === "running") {
			abortControllerRef.current?.abort();
		}
		setStatus("idle");
		setResults([]);
		setLogs([]);
		setErrorMsg("");
		setProgressPercent(0);
		onClose();
	};

	const categories = useMemo(() => {
		const cats = new Set(folders.map((f) => f.category));
		cats.add("工作台");
		cats.add("自媒体");
		cats.add("技能");
		cats.add("电商");
		cats.add("收藏");
		cats.add("chrome插件");
		cats.add("skills");
		return Array.from(cats);
	}, [folders]);

	const existingFoldersList = useMemo(() => {
		return folders.map((f) => ({
			name: f.name,
			category: f.category,
			desc: f.desc,
		}));
	}, [folders]);

	// Slice items according to user limit
	const targetItems = useMemo(() => {
		if (
			selectedCountLimit === -1 ||
			itemsToClassify.length <= selectedCountLimit
		) {
			return itemsToClassify;
		}
		return itemsToClassify.slice(0, selectedCountLimit);
	}, [itemsToClassify, selectedCountLimit]);

	const startClassification = async () => {
		if (targetItems.length === 0) {
			toast.info("当前没有待分类的书签");
			return;
		}

		setStatus("running");
		setErrorMsg("");
		setProgressPercent(0);
		setProgressText("正在启动 AI 并发分析池...");
		incrementalResultsRef.current = [];
		setLogs([
			`🚀 已就绪，正在准备 ${targetItems.length} 条书签的语义特征向量与提示词...`,
		]);

		const abortController = new AbortController();
		abortControllerRef.current = abortController;

		// Convert workbench items to BookmarkTDKItem format
		const tdkPayload: BookmarkTDKItem[] = targetItems.map((item) => ({
			id: item.id || item.url || Math.random().toString(),
			title: item.name,
			url: item.url || "",
			description: item.description || item.summary || "",
			keywords: item.keywords || "",
			folderPath: item.folderName || "",
			parentTitle: item.folderName || "",
		}));

		try {
			const classifiedResults = await AIClassifierService.classifyBookmarks(
				tdkPayload,
				{
					settings,
					existingCategories: categories,
					existingFolders: existingFoldersList,
					concurrency: 3,
					signal: abortController.signal,
					onBatchComplete: (batch) => {
						incrementalResultsRef.current.push(...batch);
					},
					onLog: (line) => {
						setLogs((prev) => {
							const next = [...prev, line];
							return next.length > 200 ? next.slice(next.length - 200) : next;
						});
					},
					onProgress: (current, total, msg) => {
						setProgressText(msg);
						setProgressPercent(Math.round((current / total) * 100));
					},
				},
			);

			if (abortController.signal.aborted) {
				if (incrementalResultsRef.current.length > 0) {
					setResults(incrementalResultsRef.current);
					setStatus("completed");
					toast.info(
						`已终止分析，已保留已完成的 ${incrementalResultsRef.current.length} 条书签分类`,
					);
				} else {
					setStatus("idle");
					toast.info("已取消 AI 分类");
				}
				return;
			}

			setResults(classifiedResults);
			setStatus("completed");
			setProgressPercent(100);
			toast.success(
				`AI 分析完成，共识别 ${classifiedResults.length} 个书签分类`,
			);
		} catch (err: unknown) {
			if (abortController.signal.aborted) {
				if (incrementalResultsRef.current.length > 0) {
					setResults(incrementalResultsRef.current);
					setStatus("completed");
					toast.info(
						`已终止分析，已保留已完成的 ${incrementalResultsRef.current.length} 条书签分类`,
					);
				} else {
					setStatus("idle");
					toast.info("已取消 AI 分类");
				}
			} else {
				setStatus("error");
				const message =
					err instanceof Error
						? err.message
						: "AI 分类服务请求失败，请检查网络或 API Key";
				setErrorMsg(message);
				toast.danger("AI 分类失败");
			}
		}
	};

	const handleApply = async () => {
		if (results.length === 0) return;

		try {
			const { folders: updatedFolders, unclassified: updatedUnclassified } =
				await WorkbenchStorageService.applyAIClassificationToDb(results);

			onClassificationComplete(updatedFolders, updatedUnclassified);
			toast.success("已成功将书签分门别类归入 SQLite 数据库！");
			handleClose();
		} catch (err: any) {
			toast.danger(`保存到 SQLite 失败: ${err?.message}`);
		}
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && handleClose()}
			variant="blur"
		>
			<Modal.Container size="lg">
				<Modal.Dialog
					className="max-w-3xl"
					aria-label="AI 智能分门别类"
				>
					<Modal.CloseTrigger />
					<Modal.Header className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<Sparkles className="w-5 h-5 text-accent" />
							<Modal.Heading className="text-base font-bold text-foreground">
								AI 智能分门别类
							</Modal.Heading>
							<Chip
								size="sm"
								variant="secondary"
								className="font-mono text-[10px]"
							>
								待处理 {itemsToClassify.length} 条
							</Chip>
						</div>
						<p className="text-xs text-muted">
							基于每个书签的 TDK
							数组（标题、描述、关键词与原始路径）进行语义识别，自动归入对应分类与主题文件夹。
						</p>
					</Modal.Header>

					<Modal.Body className="flex flex-col gap-4 py-2">
						{/* Count Limit Selector in Idle Mode */}
						{status === "idle" && itemsToClassify.length > 50 && (
							<div className="flex items-center justify-between p-3 rounded-xl bg-surface-secondary border border-border text-xs">
								<span className="text-muted">选择本次处理的书签数量：</span>
								<div className="flex items-center gap-1.5">
									{[
										{ label: "前 30 条", val: 30 },
										{ label: "前 50 条", val: 50 },
										{ label: "前 100 条", val: 100 },
										{ label: `全部 (${itemsToClassify.length}条)`, val: -1 },
									].map((opt) => (
										<button
											key={opt.val}
											type="button"
											onClick={() => setSelectedCountLimit(opt.val)}
											className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
												selectedCountLimit === opt.val
													? "bg-accent text-accent-foreground font-semibold"
													: "bg-surface text-muted hover:text-foreground border border-border"
											}`}
										>
											{opt.label}
										</button>
									))}
								</div>
							</div>
						)}

						{/* Progress / Status Area */}
						{status === "running" && (
							<div className="p-4 rounded-2xl bg-surface-secondary border border-border flex flex-col gap-2.5">
								<div className="flex justify-between items-center text-xs">
									<div className="flex items-center gap-2 truncate pr-2">
										<span className="font-medium text-accent animate-pulse truncate">
											{progressText}
										</span>
										<span className="text-[11px] text-muted font-mono shrink-0">
											(已耗时 {elapsedSeconds}s)
										</span>
									</div>
									<span className="font-mono font-semibold text-foreground shrink-0">
										{progressPercent}%
									</span>
								</div>
								<ProgressBar
									aria-label="分类处理进度"
									value={progressPercent}
									className="h-2 rounded-full"
								/>

								{/* DeepSeek Thinking / Live Terminal Log */}
								<div className="rounded-xl bg-surface/90 border border-border/80 overflow-hidden flex flex-col mt-1 shadow-2xs">
									<div className="px-3 py-1.5 bg-surface-secondary/70 border-b border-border/60 flex items-center justify-between text-[11px]">
										<div className="flex items-center gap-1.5 text-muted font-medium">
											<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
											<Sparkles className="w-3 h-3 text-accent" />
											<span>AI 思考与语义分拣流</span>
										</div>
										<span className="text-[10px] text-muted font-mono">
											{logs.length} 条动态
										</span>
									</div>
									<ScrollShadow
										ref={logScrollRef}
										className="h-[120px] max-h-[120px] overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed text-muted select-text flex flex-col gap-1 bg-surface/40"
									>
										{logs.map((log, index) => (
											<div
												key={index}
												className="flex items-start gap-1.5 transition-opacity"
											>
												<span className="text-accent/60 select-none shrink-0 font-bold">
													&gt;
												</span>
												<span
													className={
														log.includes("✦")
															? "text-foreground font-medium"
															: log.includes("⚠️")
																? "text-amber-500"
																: "text-muted"
													}
												>
													{log}
												</span>
											</div>
										))}
										<div className="flex items-center gap-1 text-accent mt-0.5">
											<span className="inline-block w-1.5 h-3 bg-accent animate-pulse" />
										</div>
									</ScrollShadow>
								</div>
							</div>
						)}

						{status === "error" && (
							<div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 text-xs text-danger flex flex-col gap-2">
								<div className="flex items-center justify-between">
									<span className="font-semibold">分类过程提示</span>
									{onOpenSettings &&
										(errorMsg.includes("设置") || errorMsg.includes("Key")) && (
											<Button
												type="button"
												size="sm"
												variant="primary"
												className="h-7 px-2.5 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5"
												onPress={onOpenSettings}
											>
												<Settings className="w-3.5 h-3.5" />
												<span>前往配置 Key</span>
											</Button>
										)}
								</div>
								<p className="opacity-90">{errorMsg}</p>
							</div>
						)}

						{/* Results Preview */}
						{status === "completed" && (
							<div className="flex flex-col gap-2">
								<div className="flex justify-between items-center">
									<span className="text-xs font-semibold text-foreground">
										AI 分类建议预览（已就绪 {results.length} 项）
									</span>
									<span className="text-[11px] text-muted">
										检查无误后点击下方确认即可一键归集到文件夹
									</span>
								</div>

								<ScrollShadow className="max-h-[380px] overflow-y-auto pr-1">
									<div className="grid grid-cols-1 gap-2">
										{results.map((res, idx) => {
											const typeInfo = ITEM_TYPES[res.itemType] || {
												label: "链接",
											};
											return (
												<div
													key={res.id || idx}
													className="p-3 rounded-xl bg-surface-secondary border border-border hover:border-accent/40 transition-colors flex items-start gap-3 text-xs"
												>
													<div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center shrink-0 shadow-2xs mt-0.5 border border-border/50">
														<ItemFavicon
															url={res.url}
															favicon={res.favicon}
															type={res.itemType}
															name={res.title}
															size="xs"
														/>
													</div>
													<div className="flex-1 min-w-0">
														<div className="flex items-center gap-2 flex-wrap mb-1">
															<span className="font-semibold text-foreground truncate max-w-[280px]">
																{res.title}
															</span>
															<Chip
																size="sm"
																variant="secondary"
																className="text-[10px]"
															>
																{typeInfo.label}
															</Chip>
															<Chip
																size="sm"
																variant="primary"
																className="text-[10px] bg-accent/10 text-accent font-medium inline-flex items-center gap-1"
															>
																<Folder className="w-2.5 h-2.5 opacity-70 shrink-0 inline" />
																<span>
																	{res.category} / {res.folderName}
																</span>
															</Chip>
														</div>
														<p className="text-muted text-[11px] line-clamp-1 mb-1">
															{res.summary || res.url}
														</p>
														{res.tags && res.tags.length > 0 && (
															<div className="flex items-center gap-1 flex-wrap">
																{res.tags.map((t) => (
																	<span
																		key={t}
																		className="text-[9px] px-1.5 py-0.5 rounded bg-surface text-muted border border-border"
																	>
																		#{t}
																	</span>
																))}
															</div>
														)}
													</div>
												</div>
											);
										})}
									</div>
								</ScrollShadow>
							</div>
						)}

						{/* Idle Preview List */}
						{status === "idle" && (
							<div className="flex flex-col gap-2">
								<span className="text-xs font-semibold text-foreground">
									待分析的书签列表（本次将处理 {targetItems.length} 项）
								</span>
								<ScrollShadow className="max-h-[300px] overflow-y-auto pr-1">
									<div className="space-y-1.5">
										{targetItems.slice(0, 40).map((item, idx) => (
											<div
												key={item.id || idx}
												className="p-2.5 rounded-xl bg-surface-secondary border border-border flex items-center justify-between text-xs gap-3"
											>
												<div className="flex items-center gap-2 truncate flex-1 min-w-0">
													<div className="w-5 h-5 rounded bg-surface flex items-center justify-center shrink-0">
														<ItemFavicon
															url={item.url}
															favicon={item.favicon}
															type={item.type}
															name={item.name}
															size="xs"
														/>
													</div>
													<div className="truncate flex-1">
														<div className="font-medium text-foreground truncate">
															{item.name}
														</div>
														<div className="text-[11px] text-muted truncate">
															{item.url}
														</div>
													</div>
												</div>
												{item.folderName && (
													<span className="shrink-0 text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
														原目录: {item.folderName}
													</span>
												)}
											</div>
										))}
									</div>
								</ScrollShadow>
							</div>
						)}
					</Modal.Body>

					<Modal.Footer className="flex items-center justify-between">
						<div>
							{status === "running" && (
								<Button
									type="button"
									variant="danger-soft"
									size="sm"
									className="rounded-full cursor-pointer"
									onPress={() => abortControllerRef.current?.abort()}
								>
									终止分析
								</Button>
							)}
						</div>

						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full cursor-pointer"
								onPress={handleClose}
							>
								{status === "completed" ? "取消" : "关闭"}
							</Button>

							{status === "idle" && (
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="rounded-full shadow-sm flex items-center gap-1.5 cursor-pointer"
									onPress={startClassification}
								>
									<Sparkles className="w-3.5 h-3.5" />
									<span>启动 AI 智能分析 ({targetItems.length}项)</span>
								</Button>
							)}

							{status === "completed" && (
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="rounded-full shadow-sm flex items-center gap-1.5 cursor-pointer"
									onPress={handleApply}
								>
									<Check className="w-3.5 h-3.5" />
									<span>确认归类并生成文件夹 ({results.length}项)</span>
								</Button>
							)}

							{status === "error" && (
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="rounded-full cursor-pointer"
									onPress={startClassification}
								>
									重新尝试
								</Button>
							)}
						</div>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
