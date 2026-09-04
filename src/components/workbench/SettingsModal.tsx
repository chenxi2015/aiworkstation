import {
	Button,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	Modal,
	Select,
	SelectPopover,
	SelectTrigger,
	SelectValue,
	TextField,
	toast,
} from "@heroui/react";
import {
	AlertTriangle,
	Brain,
	Link2Off,
	Loader2,
	PenLine,
	RefreshCw,
	RotateCcw,
	Save,
	ShieldAlert,
	Sparkles,
	Trash2,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
	DEFAULT_SETTINGS,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";
import type { WorkbenchSettings } from "./types";

const PRESET_LLM_MODELS = [
	"deepseek-chat",
	"deepseek-reasoner",
	"gpt-4o",
	"gpt-4o-mini",
	"qwen-plus",
	"qwen-max",
	"claude-3-5-sonnet-20241022",
];

const PRESET_EMBEDDING_MODELS = [
	"BAAI/bge-m3",
	"BAAI/bge-large-zh-v1.5",
	"text-embedding-3-small",
	"text-embedding-3-large",
	"text-embedding-v3",
];

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSettingsUpdated?: (settings: WorkbenchSettings) => void;
	onOpenDeadLinks?: () => void;
	onDataCleared?: () => void;
}

export function SettingsModal({
	isOpen,
	onClose,
	onSettingsUpdated,
	onOpenDeadLinks,
	onDataCleared,
}: SettingsModalProps) {
	const [apiKey, setApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [model, setModel] = useState("");
	const [batchSize, setBatchSize] = useState("15");

	// LLM Models state
	const [llmModelList, setLlmModelList] = useState<string[]>(PRESET_LLM_MODELS);
	const [loadingLlmModels, setLoadingLlmModels] = useState(false);
	const [isCustomLlmModel, setIsCustomLlmModel] = useState(false);

	// Embedding Settings
	const [embeddingApiKey, setEmbeddingApiKey] = useState("");
	const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState("");
	const [embeddingModel, setEmbeddingModel] = useState("");

	// Embedding Models state
	const [embeddingModelList, setEmbeddingModelList] = useState<string[]>(
		PRESET_EMBEDDING_MODELS,
	);
	const [loadingEmbeddingModels, setLoadingEmbeddingModels] = useState(false);
	const [isCustomEmbeddingModel, setIsCustomEmbeddingModel] = useState(false);

	// Danger zone: clear all data
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const [clearConfirmText, setClearConfirmText] = useState("");
	const [isClearing, setIsClearing] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setShowClearConfirm(false);
			setClearConfirmText("");
			setIsClearing(false);
			const settings = WorkbenchStorageService.getSettings();
			const currentModel =
				settings.deepseekModel || DEFAULT_SETTINGS.deepseekModel;
			setApiKey(settings.deepseekApiKey || DEFAULT_SETTINGS.deepseekApiKey);
			setBaseUrl(settings.deepseekBaseUrl || DEFAULT_SETTINGS.deepseekBaseUrl);
			setModel(currentModel);
			setBatchSize(String(settings.batchSize || 15));

			setEmbeddingApiKey(settings.embeddingApiKey || "");
			setEmbeddingBaseUrl(
				settings.embeddingBaseUrl || DEFAULT_SETTINGS.embeddingBaseUrl || "",
			);
			const currentEmbModel =
				settings.embeddingModel || DEFAULT_SETTINGS.embeddingModel || "";
			setEmbeddingModel(currentEmbModel);

			// Populate model options with current saved values
			setLlmModelList((prev) =>
				Array.from(new Set([currentModel, ...prev].filter(Boolean))),
			);
			setEmbeddingModelList((prev) =>
				Array.from(new Set([currentEmbModel, ...prev].filter(Boolean))),
			);
		}
	}, [isOpen]);

	const handleFetchLlmModels = async () => {
		const targetUrl = baseUrl.trim() || DEFAULT_SETTINGS.deepseekBaseUrl;
		if (!targetUrl) {
			toast.danger("请先填写 API Base URL");
			return;
		}
		setLoadingLlmModels(true);
		try {
			const fetched = await WorkbenchStorageService.fetchAvailableModels({
				baseUrl: targetUrl,
				apiKey: apiKey.trim(),
			});
			if (fetched.length > 0) {
				const combined = Array.from(
					new Set([...(model ? [model] : []), ...fetched]),
				);
				setLlmModelList(combined);
				if (!model || !combined.includes(model)) {
					setModel(fetched[0]);
				}
				setIsCustomLlmModel(false);
				toast.success(`成功获取 ${fetched.length} 个可用模型`);
			} else {
				toast.warning("接口未返回任何可用模型");
			}
		} catch (err: unknown) {
			const error = err as Error;
			toast.danger(
				error.message || "获取模型列表失败，请检查 Base URL 和 API Key",
			);
		} finally {
			setLoadingLlmModels(false);
		}
	};

	const handleFetchEmbeddingModels = async () => {
		const targetUrl =
			embeddingBaseUrl.trim() || DEFAULT_SETTINGS.embeddingBaseUrl;
		if (!targetUrl) {
			toast.danger("请先填写 Embedding Base URL");
			return;
		}
		setLoadingEmbeddingModels(true);
		try {
			const fetched = await WorkbenchStorageService.fetchAvailableModels({
				baseUrl: targetUrl,
				apiKey: embeddingApiKey.trim(),
			});
			if (fetched.length > 0) {
				const combined = Array.from(
					new Set([...(embeddingModel ? [embeddingModel] : []), ...fetched]),
				);
				setEmbeddingModelList(combined);
				if (!embeddingModel || !combined.includes(embeddingModel)) {
					setEmbeddingModel(fetched[0]);
				}
				setIsCustomEmbeddingModel(false);
				toast.success(`成功获取 ${fetched.length} 个 Embedding 模型`);
			} else {
				toast.warning("接口未返回任何模型");
			}
		} catch (err: unknown) {
			const error = err as Error;
			toast.danger(error.message || "获取 Embedding 模型列表失败");
		} finally {
			setLoadingEmbeddingModels(false);
		}
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const updated: WorkbenchSettings = {
			deepseekApiKey: apiKey.trim() || DEFAULT_SETTINGS.deepseekApiKey,
			deepseekBaseUrl: baseUrl.trim() || DEFAULT_SETTINGS.deepseekBaseUrl,
			deepseekModel: model.trim() || DEFAULT_SETTINGS.deepseekModel,
			batchSize: Math.max(
				1,
				Math.min(50, Number.parseInt(batchSize, 10) || 15),
			),
			embeddingApiKey: embeddingApiKey.trim(),
			embeddingBaseUrl:
				embeddingBaseUrl.trim() || DEFAULT_SETTINGS.embeddingBaseUrl,
			embeddingModel: embeddingModel.trim() || DEFAULT_SETTINGS.embeddingModel,
		};

		WorkbenchStorageService.saveSettings(updated);
		onSettingsUpdated?.(updated);
		toast.success("AI 与 Embedding 配置已保存");
		onClose();
	};

	const handleClearAllData = async () => {
		if (clearConfirmText.trim() !== "清空") {
			toast.warning("请输入「清空」以确认操作");
			return;
		}
		setIsClearing(true);
		try {
			const { backupPath } = await WorkbenchStorageService.clearAllDataInDb();
			WorkbenchStorageService.clearAllChatData();
			onDataCleared?.();
			toast.success(
				backupPath
					? `所有数据已清空，备份已保存至 ${backupPath}`
					: "所有数据已清空",
			);
			setShowClearConfirm(false);
			setClearConfirmText("");
			onClose();
		} catch (err) {
			toast.danger(
				`清空失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setIsClearing(false);
		}
	};

	const handleReset = () => {
		setApiKey(DEFAULT_SETTINGS.deepseekApiKey);
		setBaseUrl(DEFAULT_SETTINGS.deepseekBaseUrl);
		setModel(DEFAULT_SETTINGS.deepseekModel);
		setBatchSize("15");
		setEmbeddingApiKey("");
		setEmbeddingBaseUrl(DEFAULT_SETTINGS.embeddingBaseUrl || "");
		setEmbeddingModel(DEFAULT_SETTINGS.embeddingModel || "");
		setIsCustomLlmModel(false);
		setIsCustomEmbeddingModel(false);
		setLlmModelList(
			Array.from(
				new Set([DEFAULT_SETTINGS.deepseekModel, ...PRESET_LLM_MODELS]),
			),
		);
		setEmbeddingModelList(
			Array.from(
				new Set(
					[
						DEFAULT_SETTINGS.embeddingModel || "",
						...PRESET_EMBEDDING_MODELS,
					].filter(Boolean),
				),
			),
		);
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="max-w-xl w-full">
				<Modal.Dialog aria-label="AI 与模型配置">
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>AI 与模型配置</Modal.Heading>
					</Modal.Header>

					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<Modal.Body className="flex flex-col gap-5 text-xs max-h-[75vh] overflow-y-auto pr-1">
							{/* Section 1: LLM Classification */}
							<div className="flex flex-col gap-3">
								<div className="flex items-center gap-2 pb-1 border-b border-border">
									<Sparkles className="w-4 h-4 text-accent shrink-0" />
									<span className="font-semibold text-foreground text-xs">
										AI 分类与摘要 (DeepSeek / LLM)
									</span>
								</div>
								<p className="text-[11px] text-muted leading-relaxed">
									用于未分类书签 TDK
									批量深度分析、智能打标与主题文件夹自动归类。
								</p>

								{/* DeepSeek API Key */}
								<TextField value={apiKey} onChange={setApiKey}>
									<Label>
										LLM API Key <span className="text-danger">*</span>
									</Label>
									<Input
										type="password"
										placeholder="sk-..."
										variant="secondary"
									/>
								</TextField>

								<div className="grid grid-cols-2 gap-4 items-end">
									{/* DeepSeek Base URL */}
									<TextField value={baseUrl} onChange={setBaseUrl}>
										<Label className="whitespace-nowrap">API Base URL</Label>
										<Input
											placeholder="https://api.deepseek.com"
											variant="secondary"
										/>
									</TextField>

									{/* DeepSeek Model */}
									<div className="flex flex-col gap-1.5">
										<div className="flex items-center justify-between gap-2">
											<Label className="whitespace-nowrap">
												Model 模型名称
											</Label>
											<div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
												<button
													type="button"
													onClick={handleFetchLlmModels}
													disabled={loadingLlmModels}
													className="text-[11px] text-accent hover:opacity-80 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-opacity"
													title="通过当前 Base URL 和 API Key 获取可用模型列表"
												>
													{loadingLlmModels ? (
														<Loader2 className="w-3 h-3 animate-spin" />
													) : (
														<RefreshCw className="w-3 h-3" />
													)}
													<span>
														{loadingLlmModels ? "获取中..." : "获取模型"}
													</span>
												</button>
												<span className="text-muted/40 text-[10px]">|</span>
												<button
													type="button"
													onClick={() => setIsCustomLlmModel(!isCustomLlmModel)}
													className="text-[11px] text-muted hover:text-foreground flex items-center gap-0.5 cursor-pointer transition-colors"
													title={
														isCustomLlmModel
															? "切换为下拉选择"
															: "切换为手动输入"
													}
												>
													<PenLine className="w-2.5 h-2.5" />
													<span>{isCustomLlmModel ? "选择" : "手动"}</span>
												</button>
											</div>
										</div>

										{isCustomLlmModel ? (
											<TextField
												value={model}
												onChange={setModel}
												className="w-full"
											>
												<Input
													placeholder="deepseek-chat"
													variant="secondary"
												/>
											</TextField>
										) : (
											<Select
												aria-label="Model 模型名称"
												selectedKey={model}
												onSelectionChange={(key) => {
													if (key) setModel(String(key));
												}}
												variant="secondary"
												className="w-full"
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectPopover className="max-h-60 overflow-y-auto min-w-[220px]">
													<ListBox>
														{llmModelList.map((m) => (
															<ListBoxItem key={m} id={m} textValue={m}>
																{m}
															</ListBoxItem>
														))}
													</ListBox>
												</SelectPopover>
											</Select>
										)}
									</div>
								</div>

								{/* Batch Size */}
								<TextField value={batchSize} onChange={setBatchSize}>
									<Label>单批处理数量 (Batch Size)</Label>
									<Input
										type="number"
										min={1}
										max={50}
										placeholder="15"
										variant="secondary"
									/>
								</TextField>
							</div>

							{/* Section 2: Embedding / RAG Settings */}
							<div className="flex flex-col gap-3 pt-2">
								<div className="flex items-center gap-2 pb-1 border-b border-border">
									<Brain className="w-4 h-4 text-accent shrink-0" />
									<span className="font-semibold text-foreground text-xs">
										向量索引与 AI 语义搜索 (Embedding / RAG)
									</span>
								</div>
								<p className="text-[11px] text-muted leading-relaxed">
									用于将书签文本向量化以支持全局自然语言语义检索与 RAG
									知识库问答。（支持 SiliconFlow / OpenAI / Ollama 等兼容接口）
								</p>

								{/* Embedding API Key */}
								<TextField
									value={embeddingApiKey}
									onChange={setEmbeddingApiKey}
								>
									<Label>Embedding API Key</Label>
									<Input
										type="password"
										placeholder="sk-..."
										variant="secondary"
									/>
								</TextField>

								<div className="grid grid-cols-2 gap-4 items-end">
									{/* Embedding Base URL */}
									<TextField
										value={embeddingBaseUrl}
										onChange={setEmbeddingBaseUrl}
									>
										<Label className="whitespace-nowrap">
											Embedding Base URL
										</Label>
										<Input
											placeholder="https://api.siliconflow.cn/v1"
											variant="secondary"
										/>
									</TextField>

									{/* Embedding Model */}
									<div className="flex flex-col gap-1.5">
										<div className="flex items-center justify-between gap-2">
											<Label className="whitespace-nowrap">
												Embedding Model
											</Label>
											<div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
												<button
													type="button"
													onClick={handleFetchEmbeddingModels}
													disabled={loadingEmbeddingModels}
													className="text-[11px] text-accent hover:opacity-80 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-opacity"
													title="通过当前 Embedding Base URL 和 Key 获取可用模型"
												>
													{loadingEmbeddingModels ? (
														<Loader2 className="w-3 h-3 animate-spin" />
													) : (
														<RefreshCw className="w-3 h-3" />
													)}
													<span>
														{loadingEmbeddingModels ? "获取中..." : "获取模型"}
													</span>
												</button>
												<span className="text-muted/40 text-[10px]">|</span>
												<button
													type="button"
													onClick={() =>
														setIsCustomEmbeddingModel(!isCustomEmbeddingModel)
													}
													className="text-[11px] text-muted hover:text-foreground flex items-center gap-0.5 cursor-pointer transition-colors"
													title={
														isCustomEmbeddingModel
															? "切换为下拉选择"
															: "切换为手动输入"
													}
												>
													<PenLine className="w-2.5 h-2.5" />
													<span>
														{isCustomEmbeddingModel ? "选择" : "手动"}
													</span>
												</button>
											</div>
										</div>

										{isCustomEmbeddingModel ? (
											<TextField
												value={embeddingModel}
												onChange={setEmbeddingModel}
												className="w-full"
											>
												<Input placeholder="BAAI/bge-m3" variant="secondary" />
											</TextField>
										) : (
											<Select
												aria-label="Embedding Model"
												selectedKey={embeddingModel}
												onSelectionChange={(key) => {
													if (key) setEmbeddingModel(String(key));
												}}
												variant="secondary"
												className="w-full"
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectPopover className="max-h-60 overflow-y-auto min-w-[220px]">
													<ListBox>
														{embeddingModelList.map((m) => (
															<ListBoxItem key={m} id={m} textValue={m}>
																{m}
															</ListBoxItem>
														))}
													</ListBox>
												</SelectPopover>
											</Select>
										)}
									</div>
								</div>
							</div>

							{/* Section 3: Data Maintenance */}
							<div className="flex flex-col gap-3 pt-2">
								<div className="flex items-center gap-2 pb-1 border-b border-border">
									<Link2Off className="w-4 h-4 text-accent shrink-0" />
									<span className="font-semibold text-foreground text-xs">
										数据维护 (Data Maintenance)
									</span>
								</div>
								<div className="flex items-center justify-between gap-4">
									<p className="text-[11px] text-muted leading-relaxed flex-1">
										检测所有收藏链接的可访问性，找出已经过期、404
										或域名失效的网址并批量清理。服务端异步并发检测，被反爬拦截的链接不会误删。
									</p>
									<Button
										type="button"
										variant="secondary"
										size="sm"
										className="rounded-full flex items-center gap-1.5 cursor-pointer shrink-0"
										onPress={() => {
											onClose();
											onOpenDeadLinks?.();
										}}
									>
										<Link2Off className="w-3.5 h-3.5" />
										<span>清理失效链接</span>
									</Button>
								</div>
							</div>

							{/* Section 4: Danger Zone */}
							<div className="flex flex-col gap-3 pt-2">
								<div className="flex items-center gap-2 pb-1 border-b border-danger/20">
									<ShieldAlert className="w-4 h-4 text-danger shrink-0" />
									<span className="font-semibold text-danger text-xs">
										危险区域 (Danger Zone)
									</span>
								</div>

								{!showClearConfirm ? (
									<div className="flex items-center justify-between gap-4">
										<p className="text-[11px] text-muted leading-relaxed flex-1">
											清空所有文件夹、收藏链接与本地聊天记录（AI
											配置会保留）。操作前会自动备份数据库到
											.aiworkstation/backups。
										</p>
										<Button
											type="button"
											variant="danger-soft"
											size="sm"
											className="rounded-full flex items-center gap-1.5 cursor-pointer shrink-0"
											onPress={() => setShowClearConfirm(true)}
										>
											<Trash2 className="w-3.5 h-3.5" />
											<span>清空所有数据</span>
										</Button>
									</div>
								) : (
									<div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 flex flex-col gap-3">
										<div className="flex items-start gap-2 text-xs text-danger">
											<AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
											<span className="leading-relaxed">
												此操作将永久删除所有文件夹、收藏链接和本地聊天记录，无法撤回（数据库会自动备份一份）。请输入「清空」确认：
											</span>
										</div>
										<div className="flex items-center gap-2">
											<TextField
												value={clearConfirmText}
												onChange={setClearConfirmText}
												className="flex-1"
											>
												<Input placeholder="清空" variant="secondary" />
											</TextField>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="rounded-full cursor-pointer shrink-0"
												onPress={() => {
													setShowClearConfirm(false);
													setClearConfirmText("");
												}}
											>
												取消
											</Button>
											<Button
												type="button"
												variant="danger-soft"
												size="sm"
												className="rounded-full flex items-center gap-1 cursor-pointer shrink-0"
												isDisabled={
													isClearing || clearConfirmText.trim() !== "清空"
												}
												onPress={handleClearAllData}
											>
												{isClearing ? (
													<Loader2 className="w-3.5 h-3.5 animate-spin" />
												) : (
													<Trash2 className="w-3.5 h-3.5" />
												)}
												<span>{isClearing ? "清空中..." : "确认清空"}</span>
											</Button>
										</div>
									</div>
								)}
							</div>
						</Modal.Body>

						<Modal.Footer className="flex items-center justify-between">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full text-muted flex items-center gap-1 cursor-pointer"
								onPress={handleReset}
							>
								<RotateCcw className="w-3.5 h-3.5" />
								<span>恢复默认</span>
							</Button>

							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="rounded-full cursor-pointer"
									onPress={onClose}
								>
									取消
								</Button>
								<Button
									type="submit"
									variant="primary"
									size="sm"
									className="rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm"
								>
									<Save className="w-3.5 h-3.5" />
									<span>保存配置</span>
								</Button>
							</div>
						</Modal.Footer>
					</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
