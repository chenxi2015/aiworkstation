import {
	Input,
	Label,
	ListBox,
	ListBoxItem,
	Select,
	SelectPopover,
	SelectTrigger,
	SelectValue,
	TextField,
	toast,
} from "@heroui/react";
import { Brain, Loader2, PenLine, RefreshCw, Sparkles } from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
	DEFAULT_SETTINGS,
	WorkbenchStorageService,
} from "../../../services/workbenchStorage";
import {
	EMBEDDING_PROVIDERS,
	FALLBACK_EMBEDDING_MODELS,
	FALLBACK_LLM_MODELS,
	LLM_PROVIDERS,
} from "./constants";

export interface ModelSettingsFormData {
	llmProvider: string;
	apiKey: string;
	baseUrl: string;
	model: string;
	batchSize: string;
	embeddingProvider: string;
	embeddingApiKey: string;
	embeddingBaseUrl: string;
	embeddingModel: string;
}

interface ModelSettingsTabProps {
	data: ModelSettingsFormData;
	onChange: <K extends keyof ModelSettingsFormData>(
		key: K,
		value: ModelSettingsFormData[K],
	) => void;
	llmModelList: string[];
	setLlmModelList: React.Dispatch<React.SetStateAction<string[]>>;
	embeddingModelList: string[];
	setEmbeddingModelList: React.Dispatch<React.SetStateAction<string[]>>;
}

export function ModelSettingsTab({
	data,
	onChange,
	llmModelList,
	setLlmModelList,
	embeddingModelList,
	setEmbeddingModelList,
}: ModelSettingsTabProps) {
	const [loadingLlmModels, setLoadingLlmModels] = useState(false);
	const [isCustomLlmModel, setIsCustomLlmModel] = useState(false);
	const [loadingEmbeddingModels, setLoadingEmbeddingModels] = useState(false);
	const [isCustomEmbeddingModel, setIsCustomEmbeddingModel] = useState(false);

	const handleLlmProviderChange = (id: string) => {
		onChange("llmProvider", id);
		const preset = LLM_PROVIDERS.find((p) => p.id === id);
		if (!preset) return;
		if (preset.id !== "custom") {
			onChange("baseUrl", preset.baseUrl);
			setLlmModelList(preset.models);
			onChange("model", preset.models[0] ?? "");
		} else {
			setLlmModelList(
				Array.from(
					new Set([data.model, ...FALLBACK_LLM_MODELS].filter(Boolean)),
				),
			);
		}
		setIsCustomLlmModel(false);
	};

	const handleEmbeddingProviderChange = (id: string) => {
		onChange("embeddingProvider", id);
		const preset = EMBEDDING_PROVIDERS.find((p) => p.id === id);
		if (!preset) return;
		if (preset.id !== "custom") {
			onChange("embeddingBaseUrl", preset.baseUrl);
			setEmbeddingModelList(preset.models);
			onChange("embeddingModel", preset.models[0] ?? "");
		} else {
			setEmbeddingModelList(
				Array.from(
					new Set(
						[data.embeddingModel, ...FALLBACK_EMBEDDING_MODELS].filter(Boolean),
					),
				),
			);
		}
		setIsCustomEmbeddingModel(false);
	};

	const handleFetchLlmModels = async () => {
		const targetUrl = data.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl;
		if (!targetUrl) {
			toast.danger("请先填写 API Base URL");
			return;
		}
		setLoadingLlmModels(true);
		try {
			const fetched = await WorkbenchStorageService.fetchAvailableModels({
				baseUrl: targetUrl,
				apiKey: data.apiKey.trim(),
			});
			if (fetched.length > 0) {
				const combined = Array.from(
					new Set([...(data.model ? [data.model] : []), ...fetched]),
				);
				setLlmModelList(combined);
				if (!data.model || !combined.includes(data.model)) {
					onChange("model", fetched[0]);
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
			data.embeddingBaseUrl.trim() || DEFAULT_SETTINGS.embeddingBaseUrl;
		if (!targetUrl) {
			toast.danger("请先填写 Embedding Base URL");
			return;
		}
		setLoadingEmbeddingModels(true);
		try {
			const fetched = await WorkbenchStorageService.fetchAvailableModels({
				baseUrl: targetUrl,
				apiKey: data.embeddingApiKey.trim(),
			});
			if (fetched.length > 0) {
				const combined = Array.from(
					new Set([
						...(data.embeddingModel ? [data.embeddingModel] : []),
						...fetched,
					]),
				);
				setEmbeddingModelList(combined);
				if (!data.embeddingModel || !combined.includes(data.embeddingModel)) {
					onChange("embeddingModel", fetched[0]);
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

	return (
		<div className="flex flex-col gap-5 pt-4">
			{/* Section 1: LLM */}
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2 pb-1 border-b border-border">
					<Sparkles className="w-4 h-4 text-accent shrink-0" />
					<span className="font-semibold text-foreground text-xs">
						对话与分类模型 (LLM)
					</span>
				</div>
				<p className="text-[11px] text-muted leading-relaxed">
					用于未分类书签 TDK
					批量深度分析、智能打标与主题文件夹自动归类。选择服务商后会自动填充
					API 地址与模型列表。
				</p>

				<div className="grid grid-cols-2 gap-4 items-end">
					{/* LLM Provider */}
					<div className="flex flex-col gap-1.5 min-w-0">
						<Label className="whitespace-nowrap">服务商</Label>
						<Select
							aria-label="LLM 服务商"
							selectedKey={data.llmProvider}
							onSelectionChange={(key) => {
								if (key) handleLlmProviderChange(String(key));
							}}
							variant="secondary"
							className="w-full min-w-0"
						>
							<SelectTrigger className="w-full min-w-0">
								<SelectValue />
							</SelectTrigger>
							<SelectPopover className="max-h-60 overflow-y-auto min-w-[220px]">
								<ListBox>
									{LLM_PROVIDERS.map((p) => (
										<ListBoxItem key={p.id} id={p.id} textValue={p.name}>
											{p.name}
										</ListBoxItem>
									))}
								</ListBox>
							</SelectPopover>
						</Select>
					</div>

					{/* LLM API Key */}
					<TextField
						value={data.apiKey}
						onChange={(val) => onChange("apiKey", val)}
						className="min-w-0"
					>
						<Label>
							API Key <span className="text-danger">*</span>
						</Label>
						<Input
							type="password"
							placeholder="sk-..."
							variant="secondary"
						/>
					</TextField>
				</div>

				{/* LLM Base URL - Full Width Long Input */}
				<TextField
					value={data.baseUrl}
					onChange={(val) => onChange("baseUrl", val)}
					className="w-full"
				>
					<Label className="whitespace-nowrap">API Base URL</Label>
					<Input
						placeholder="https://api.deepseek.com"
						variant="secondary"
					/>
				</TextField>

				{/* LLM Model - Full Width Long Input with Action Bar */}
				<div className="flex flex-col gap-1.5 w-full">
					<div className="flex items-center justify-between">
						<Label className="whitespace-nowrap">模型名称</Label>
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
								<span>{loadingLlmModels ? "获取中..." : "获取模型"}</span>
							</button>
							<span className="text-muted/40 text-[10px]">|</span>
							<button
								type="button"
								onClick={() => setIsCustomLlmModel(!isCustomLlmModel)}
								className="text-[11px] text-muted hover:text-foreground flex items-center gap-0.5 cursor-pointer transition-colors"
								title={
									isCustomLlmModel ? "切换为下拉选择" : "切换为手动输入"
								}
							>
								<PenLine className="w-2.5 h-2.5" />
								<span>{isCustomLlmModel ? "选择" : "手动"}</span>
							</button>
						</div>
					</div>

					{isCustomLlmModel ? (
						<TextField
							value={data.model}
							onChange={(val) => onChange("model", val)}
							className="w-full"
						>
							<Input placeholder="deepseek-chat" variant="secondary" />
						</TextField>
					) : (
						<Select
							aria-label="Model 模型名称"
							selectedKey={data.model}
							onSelectionChange={(key) => {
								if (key) onChange("model", String(key));
							}}
							variant="secondary"
							className="w-full"
						>
							<SelectTrigger className="w-full">
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

				{/* Batch Size */}
				<TextField
					value={data.batchSize}
					onChange={(val) => onChange("batchSize", val)}
					className="min-w-0"
				>
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
					用于将书签文本向量化以支持全局自然语言语义检索与 RAG 知识库问答。
				</p>

				<div className="grid grid-cols-2 gap-4 items-end">
					{/* Embedding Provider */}
					<div className="flex flex-col gap-1.5 min-w-0">
						<Label className="whitespace-nowrap">服务商</Label>
						<Select
							aria-label="Embedding 服务商"
							selectedKey={data.embeddingProvider}
							onSelectionChange={(key) => {
								if (key) handleEmbeddingProviderChange(String(key));
							}}
							variant="secondary"
							className="w-full min-w-0"
						>
							<SelectTrigger className="w-full min-w-0">
								<SelectValue />
							</SelectTrigger>
							<SelectPopover className="max-h-60 overflow-y-auto min-w-[220px]">
								<ListBox>
									{EMBEDDING_PROVIDERS.map((p) => (
										<ListBoxItem key={p.id} id={p.id} textValue={p.name}>
											{p.name}
										</ListBoxItem>
									))}
								</ListBox>
							</SelectPopover>
						</Select>
					</div>

					{/* Embedding API Key */}
					<TextField
						value={data.embeddingApiKey}
						onChange={(val) => onChange("embeddingApiKey", val)}
						className="min-w-0"
					>
						<Label>Embedding API Key</Label>
						<Input
							type="password"
							placeholder="sk-..."
							variant="secondary"
						/>
					</TextField>
				</div>

				{/* Embedding Base URL - Full Width Long Input */}
				<TextField
					value={data.embeddingBaseUrl}
					onChange={(val) => onChange("embeddingBaseUrl", val)}
					className="w-full"
				>
					<Label className="whitespace-nowrap">Embedding Base URL</Label>
					<Input
						placeholder="https://api.siliconflow.cn/v1"
						variant="secondary"
					/>
				</TextField>

				{/* Embedding Model - Full Width Long Input with Action Bar */}
				<div className="flex flex-col gap-1.5 w-full">
					<div className="flex items-center justify-between">
						<Label className="whitespace-nowrap">Embedding 模型名称</Label>
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
								<span>{isCustomEmbeddingModel ? "选择" : "手动"}</span>
							</button>
						</div>
					</div>

					{isCustomEmbeddingModel ? (
						<TextField
							value={data.embeddingModel}
							onChange={(val) => onChange("embeddingModel", val)}
							className="w-full"
						>
							<Input placeholder="BAAI/bge-m3" variant="secondary" />
						</TextField>
					) : (
						<Select
							aria-label="Embedding Model"
							selectedKey={data.embeddingModel}
							onSelectionChange={(key) => {
								if (key) onChange("embeddingModel", String(key));
							}}
							variant="secondary"
							className="w-full"
						>
							<SelectTrigger className="w-full">
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
	);
}
