import {
	Button,
	Description,
	Input,
	InputGroup,
	Label,
	ListBox,
	ListBoxItem,
	Select,
	SelectPopover,
	SelectTrigger,
	SelectValue,
	Tabs,
	TextField,
	toast,
} from "@heroui/react";
import {
	Brain,
	Check,
	Eye,
	EyeOff,
	Globe,
	KeyRound,
	Loader2,
	PenLine,
	Play,
	RefreshCw,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useEmbeddingStats } from "../../../hooks/ai/useEmbeddingStats";
import {
	DEFAULT_SETTINGS,
	WorkbenchStorageService,
} from "../../../services/workbenchStorage";
import { EmbeddingStatusWidget } from "../ai/shared/EmbeddingStatusWidget";
import type { ProviderModelConfig } from "../types";
import {
	EMBEDDING_PROVIDERS,
	FALLBACK_EMBEDDING_MODELS,
	type ProviderPreset,
} from "./constants";
import type { ModelSettingsFormData } from "./ModelSettingsTab";

interface EmbeddingSettingsTabProps {
	data: ModelSettingsFormData;
	onChange: <K extends keyof ModelSettingsFormData>(
		key: K,
		value: ModelSettingsFormData[K],
	) => void;
	embeddingModelList: string[];
	setEmbeddingModelList: React.Dispatch<React.SetStateAction<string[]>>;
}

export function EmbeddingSettingsTab({
	data,
	onChange,
	embeddingModelList,
	setEmbeddingModelList,
}: EmbeddingSettingsTabProps) {
	const { stats, isIndexing, buildIndex } = useEmbeddingStats();
	const [loadingEmbeddingModels, setLoadingEmbeddingModels] = useState(false);
	const [showEmbeddingApiKey, setShowEmbeddingApiKey] = useState(false);

	// Provider currently being viewed/edited (switching this does NOT change in-use active model)
	const [editingProviderId, setEditingProviderId] = useState<string>(
		data.embeddingProvider || "siliconflow",
	);

	// Active in-use provider
	const activeProvider =
		EMBEDDING_PROVIDERS.find((p) => p.id === data.embeddingProvider) ??
		EMBEDDING_PROVIDERS[0];

	// Provider being inspected
	const currentEditingProvider =
		EMBEDDING_PROVIDERS.find((p) => p.id === editingProviderId) ??
		EMBEDDING_PROVIDERS[0];

	const embeddingProvidersConfig: Record<string, ProviderModelConfig> =
		data.embeddingProvidersConfig || {};

	// Values for the currently inspected embedding provider
	const currentConfig: ProviderModelConfig = embeddingProvidersConfig[
		editingProviderId
	] || {
		apiKey:
			editingProviderId === data.embeddingProvider ? data.embeddingApiKey : "",
		baseUrl:
			editingProviderId === data.embeddingProvider
				? data.embeddingBaseUrl
				: currentEditingProvider.baseUrl,
		model:
			editingProviderId === data.embeddingProvider
				? data.embeddingModel
				: currentEditingProvider.models[0] || "",
	};

	const isEditingActive = editingProviderId === data.embeddingProvider;

	const updateCurrentProviderField = (
		field: keyof ProviderModelConfig,
		value: string,
	) => {
		const updatedConfig: ProviderModelConfig = {
			...currentConfig,
			[field]: value,
		};

		const nextConfig = {
			...embeddingProvidersConfig,
			[editingProviderId]: updatedConfig,
		};

		onChange("embeddingProvidersConfig", nextConfig);

		// If editing active provider, sync top-level field
		if (isEditingActive) {
			if (field === "apiKey") onChange("embeddingApiKey", value);
			if (field === "baseUrl") onChange("embeddingBaseUrl", value);
			if (field === "model") onChange("embeddingModel", value);
		}
	};

	// Activate this provider as the in-use Embedding model
	const handleSetActiveProvider = () => {
		onChange("embeddingProvider", editingProviderId);
		onChange("embeddingApiKey", currentConfig.apiKey);
		onChange(
			"embeddingBaseUrl",
			currentConfig.baseUrl || currentEditingProvider.baseUrl,
		);
		onChange(
			"embeddingModel",
			currentConfig.model || currentEditingProvider.models[0] || "",
		);

		const presetModels =
			currentEditingProvider.models.length > 0
				? currentEditingProvider.models
				: FALLBACK_EMBEDDING_MODELS;
		setEmbeddingModelList(
			Array.from(
				new Set([currentConfig.model, ...presetModels].filter(Boolean)),
			),
		);

		toast.success(`已将 ${currentEditingProvider.name} 设为当前生效向量模型`);
	};

	const handleResetBaseUrl = () => {
		if (currentEditingProvider.baseUrl) {
			updateCurrentProviderField("baseUrl", currentEditingProvider.baseUrl);
			toast.info(`已重置为 ${currentEditingProvider.name} 默认官方地址`);
		}
	};

	const handleCopyLlmApiKey = () => {
		if (data.apiKey) {
			updateCurrentProviderField("apiKey", data.apiKey);
			toast.success("已复制 LLM 的 API Key 作为当前向量密钥");
		} else {
			toast.warning("当前 LLM API Key 为空，无法复制");
		}
	};

	const handleFetchEmbeddingModels = async () => {
		const targetUrl =
			currentConfig.baseUrl.trim() ||
			currentEditingProvider.baseUrl ||
			DEFAULT_SETTINGS.embeddingBaseUrl;
		if (!targetUrl) {
			toast.danger("请先填写 Embedding Base URL");
			return;
		}
		setLoadingEmbeddingModels(true);
		try {
			const fetched = await WorkbenchStorageService.fetchAvailableModels({
				baseUrl: targetUrl,
				apiKey: currentConfig.apiKey.trim(),
			});
			if (fetched.length > 0) {
				const combined = Array.from(
					new Set([
						...(currentConfig.model ? [currentConfig.model] : []),
						...fetched,
					]),
				);
				setEmbeddingModelList(combined);
				if (!currentConfig.model || !combined.includes(currentConfig.model)) {
					updateCurrentProviderField("model", fetched[0]);
				}
				toast.success(`成功从服务商获取 ${fetched.length} 个向量模型`);
			} else {
				toast.warning("接口未返回任何可用模型");
			}
		} catch (err: unknown) {
			const error = err as Error;
			toast.danger(error.message || "获取 Embedding 模型列表失败");
		} finally {
			setLoadingEmbeddingModels(false);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			{/* Embedding Active Status Banner */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg border border-border/70 flex items-center justify-center shrink-0 text-foreground">
						<Brain className="w-4 h-4" />
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-foreground">
							向量当前生效模型：
						</span>
						<span className="text-xs font-mono font-medium text-foreground px-2 py-0.5 rounded-md border border-border/60 bg-transparent">
							{data.embeddingModel || "BAAI/bge-m3"}
						</span>
						<span className="text-xs text-muted">({activeProvider.name})</span>
					</div>
				</div>

				<div className="text-right hidden sm:block">
					<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
						<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
						生效中
					</span>
				</div>
			</div>

			{/* Provider Selection Tabs */}
			<div className="flex flex-col gap-2.5">
				<Tabs
					selectedKey={editingProviderId}
					onSelectionChange={(k) => setEditingProviderId(String(k))}
					className="w-full"
				>
					<Tabs.ListContainer>
						<Tabs.List>
							{EMBEDDING_PROVIDERS.map((provider: ProviderPreset) => {
								return (
									<Tabs.Tab
										key={provider.id}
										id={provider.id}
										className="w-auto"
									>
										<span>{provider.name}</span>
										<Tabs.Indicator />
									</Tabs.Tab>
								);
							})}
						</Tabs.List>
					</Tabs.ListContainer>
				</Tabs>
			</div>

			{/* Section: Selected Provider Configuration */}
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<KeyRound className="w-4 h-4 shrink-0" />
						<span className="text-sm font-bold text-foreground">
							{currentEditingProvider.name} 向量参数设置
						</span>
					</div>

					{!isEditingActive && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="rounded-lg text-xs"
							onPress={handleSetActiveProvider}
						>
							<Play className="w-3 h-3 fill-current" />
							<span>设为默认模型</span>
						</Button>
					)}
				</div>

				<div className="flex flex-col gap-4">
					{/* API Key Input */}
					<TextField
						value={currentConfig.apiKey}
						onChange={(val) => updateCurrentProviderField("apiKey", val)}
					>
						<Label className="text-xs font-medium text-foreground flex items-center justify-between">
							<span>Embedding API Key</span>
							{data.apiKey && currentConfig.apiKey !== data.apiKey && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-auto p-0 text-[10px] text-accent hover:underline"
									onPress={handleCopyLlmApiKey}
								>
									同 LLM 密钥相同？一键同步
								</Button>
							)}
						</Label>
						<InputGroup className="bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
							<InputGroup.Prefix className="pl-3">
								<KeyRound className="w-3.5 h-3.5 text-muted" />
							</InputGroup.Prefix>
							<InputGroup.Input
								type={showEmbeddingApiKey ? "text" : "password"}
								placeholder="留空则复用 LLM 的 API Key，独立服务商请单独填写"
								className="bg-transparent font-mono text-xs"
							/>
							<InputGroup.Suffix className="pr-1.5">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									isIconOnly
									className="rounded-md"
									onPress={() => setShowEmbeddingApiKey((v) => !v)}
									aria-label={showEmbeddingApiKey ? "隐藏密钥" : "显示密钥"}
								>
									{showEmbeddingApiKey ? (
										<EyeOff className="w-3.5 h-3.5" />
									) : (
										<Eye className="w-3.5 h-3.5" />
									)}
								</Button>
							</InputGroup.Suffix>
						</InputGroup>
					</TextField>

					{/* API Base URL */}
					<TextField
						value={currentConfig.baseUrl}
						onChange={(val) => updateCurrentProviderField("baseUrl", val)}
					>
						<Label className="text-xs font-medium text-foreground flex items-center justify-between">
							<span>Embedding Base URL</span>
							{currentEditingProvider.baseUrl &&
								currentConfig.baseUrl !== currentEditingProvider.baseUrl && (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-auto p-0 text-[10px] text-accent hover:underline"
										onPress={handleResetBaseUrl}
									>
										恢复官方端点
									</Button>
								)}
						</Label>
						<InputGroup className="bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
							<InputGroup.Prefix className="pl-3">
								<Globe className="w-3.5 h-3.5 text-muted" />
							</InputGroup.Prefix>
							<InputGroup.Input
								type="text"
								placeholder={
									currentEditingProvider.baseUrl ||
									"https://api.siliconflow.cn/v1"
								}
								className="bg-transparent font-mono text-xs"
							/>
						</InputGroup>
					</TextField>

					{/* Model Selector with Action Buttons */}
					<div className="flex flex-col gap-1.5">
						<Label className="text-xs font-medium text-foreground">
							Embedding 模型名称
						</Label>
						<div className="flex items-center gap-2">
							<div className="flex-1 min-w-0">
								<Select
									aria-label="Embedding Model 模型名称"
									selectedKey={currentConfig.model}
									onSelectionChange={(key) => {
										if (key) updateCurrentProviderField("model", String(key));
									}}
									className="w-full"
								>
									<SelectTrigger className="w-full shadow-none bg-transparent border border-border/80 hover:border-foreground/40 rounded-lg font-mono text-xs">
										<SelectValue />
									</SelectTrigger>
									<SelectPopover className="rounded-xl border border-border bg-surface p-1 shadow-lg max-h-60 overflow-y-auto min-w-[240px]">
										<ListBox>
											{(currentEditingProvider.models.length > 0
												? currentEditingProvider.models
												: embeddingModelList
											).map((m) => (
												<ListBoxItem key={m} id={m} textValue={m}>
													<div className="flex items-center justify-between w-full font-mono text-xs">
														<span>{m}</span>
														{m === currentConfig.model && (
															<Check className="w-3.5 h-3.5 text-accent" />
														)}
													</div>
												</ListBoxItem>
											))}
										</ListBox>
									</SelectPopover>
								</Select>
							</div>

							<Button
								type="button"
								variant="outline"
								className="rounded-lg"
								isDisabled={loadingEmbeddingModels}
								onPress={handleFetchEmbeddingModels}
							>
								{loadingEmbeddingModels ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<RefreshCw className="w-3.5 h-3.5" />
								)}
								<span>{loadingEmbeddingModels ? "获取中..." : "获取模型"}</span>
							</Button>
						</div>

						<Description className="text-[11px] text-muted">
							向量模型决定向量维度，更换模型并点击「设为当前生效模型」后建议在下方重新构建全量索引。
						</Description>
					</div>
				</div>
			</div>

			{/* Section: Vector Index Maintenance & Stats */}
			<div className="flex flex-col gap-3 mt-4">
				<div className="flex items-center gap-2">
					<Brain className="w-4 h-4 shrink-0" />
					<span className="text-sm font-bold text-foreground">
						书签向量索引状态与全量构建
					</span>
				</div>
				<div className="rounded-lg border border-border/60 p-3.5 bg-transparent">
					<EmbeddingStatusWidget
						stats={stats}
						isIndexing={isIndexing}
						onBuildIndex={buildIndex}
						compact={false}
					/>
				</div>
			</div>
		</div>
	);
}
