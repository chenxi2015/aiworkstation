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
	Bot,
	Check,
	Eye,
	EyeOff,
	Globe,
	KeyRound,
	Loader2,
	Play,
	RefreshCw,
	Sliders,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
	DEFAULT_SETTINGS,
	WorkbenchStorageService,
} from "../../../services/workbenchStorage";
import type { ProviderModelConfig } from "../types";
import {
	FALLBACK_LLM_MODELS,
	LLM_PROVIDERS,
	type ProviderPreset,
} from "./constants";
import type { ModelSettingsFormData } from "./ModelSettingsTab";

interface LlmSettingsTabProps {
	data: ModelSettingsFormData;
	onChange: <K extends keyof ModelSettingsFormData>(
		key: K,
		value: ModelSettingsFormData[K],
	) => void;
	llmModelList: string[];
	setLlmModelList: React.Dispatch<React.SetStateAction<string[]>>;
}

export function LlmSettingsTab({
	data,
	onChange,
	llmModelList,
	setLlmModelList,
}: LlmSettingsTabProps) {
	const [loadingLlmModels, setLoadingLlmModels] = useState(false);
	const [showApiKey, setShowApiKey] = useState(false);

	// The provider currently being viewed/edited in the UI.
	// Switching this does NOT modify the currently active model!
	const [editingProviderId, setEditingProviderId] = useState<string>(
		data.llmProvider || "deepseek",
	);

	// Currently active (in-use) provider for the AI assistant
	const activeProvider =
		LLM_PROVIDERS.find((p) => p.id === data.llmProvider) ?? LLM_PROVIDERS[0];

	// Currently selected provider for editing
	const currentEditingProvider =
		LLM_PROVIDERS.find((p) => p.id === editingProviderId) ?? LLM_PROVIDERS[0];

	const providersConfig: Record<string, ProviderModelConfig> =
		data.llmProvidersConfig || {};

	// Values for the currently inspected provider
	const currentConfig: ProviderModelConfig = providersConfig[
		editingProviderId
	] || {
		apiKey: editingProviderId === data.llmProvider ? data.apiKey : "",
		baseUrl:
			editingProviderId === data.llmProvider
				? data.baseUrl
				: currentEditingProvider.baseUrl,
		model:
			editingProviderId === data.llmProvider
				? data.model
				: currentEditingProvider.models[0] || "",
	};

	const isEditingActive = editingProviderId === data.llmProvider;

	// Update a field for the currently inspected provider without changing active provider unless it is active
	const updateCurrentProviderField = (
		field: keyof ProviderModelConfig,
		value: string,
	) => {
		const updatedConfig: ProviderModelConfig = {
			...currentConfig,
			[field]: value,
		};

		const nextProvidersConfig = {
			...providersConfig,
			[editingProviderId]: updatedConfig,
		};

		onChange("llmProvidersConfig", nextProvidersConfig);

		// If this is the active provider, keep top-level active fields in sync
		if (isEditingActive) {
			if (field === "apiKey") onChange("apiKey", value);
			if (field === "baseUrl") onChange("baseUrl", value);
			if (field === "model") onChange("model", value);
		}
	};

	// Explicitly activate this provider as the in-use AI Assistant model
	const handleSetActiveProvider = () => {
		onChange("llmProvider", editingProviderId);
		onChange("apiKey", currentConfig.apiKey);
		onChange(
			"baseUrl",
			currentConfig.baseUrl || currentEditingProvider.baseUrl,
		);
		onChange(
			"model",
			currentConfig.model || currentEditingProvider.models[0] || "",
		);

		const presetModels =
			currentEditingProvider.models.length > 0
				? currentEditingProvider.models
				: FALLBACK_LLM_MODELS;
		setLlmModelList(
			Array.from(
				new Set([currentConfig.model, ...presetModels].filter(Boolean)),
			),
		);

		toast.success(`已将 ${currentEditingProvider.name} 设为当前生效模型`);
	};

	const handleResetBaseUrl = () => {
		if (currentEditingProvider.baseUrl) {
			updateCurrentProviderField("baseUrl", currentEditingProvider.baseUrl);
			toast.info(`已重置为 ${currentEditingProvider.name} 官方默认端点`);
		}
	};

	const handleFetchLlmModels = async () => {
		const targetUrl =
			currentConfig.baseUrl.trim() ||
			currentEditingProvider.baseUrl ||
			DEFAULT_SETTINGS.baseUrl;
		if (!targetUrl) {
			toast.danger("请先填写 API Base URL");
			return;
		}
		setLoadingLlmModels(true);
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
				setLlmModelList(combined);
				if (!currentConfig.model || !combined.includes(currentConfig.model)) {
					updateCurrentProviderField("model", fetched[0]);
				}
				toast.success(`成功从服务商获取 ${fetched.length} 个可用模型`);
			} else {
				toast.warning("接口未返回任何可用模型");
			}
		} catch (err: unknown) {
			const error = err as Error;
			toast.danger(
				error.message ||
					"获取模型列表失败，请检查 Base URL 和 API Key 是否有效",
			);
		} finally {
			setLoadingLlmModels(false);
		}
	};

	return (
		<div className="flex flex-col gap-6 pt-1">
			{/* AI Assistant Active Model Banner */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg border border-border/70 flex items-center justify-center shrink-0 text-foreground">
						<Bot className="w-4 h-4" />
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-foreground">
							当前默认模型：
						</span>
						<span className="text-xs font-mono font-medium text-foreground px-2 py-0.5 rounded-md border border-border/60 bg-transparent">
							{data.model || "deepseek-chat"}
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
							{LLM_PROVIDERS.map((provider: ProviderPreset) => {
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
				<div className="flex items-center justify-between pb-1">
					<div className="flex items-center gap-2">
						<KeyRound className="w-4 h-4 shrink-0" />
						<span className="text-sm font-bold text-foreground">
							{currentEditingProvider.name} 参数设置
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
						isRequired
					>
						<Label className="text-xs font-medium text-foreground">
							<span>API密钥</span>
							<span className="text-[10px] text-muted font-normal pl-2">
								将保存至数据库该模型独立字段中
							</span>
						</Label>
						<InputGroup className="bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
							<InputGroup.Prefix className="pl-3">
								<KeyRound className="w-3.5 h-3.5 text-muted" />
							</InputGroup.Prefix>
							<InputGroup.Input
								type={showApiKey ? "text" : "password"}
								placeholder={`填写 ${currentEditingProvider.name} 的 API Key (sk-...)`}
								className="bg-transparent font-mono text-xs"
							/>
							<InputGroup.Suffix className="pr-1.5">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									isIconOnly
									className="rounded-md"
									onPress={() => setShowApiKey((v) => !v)}
									aria-title={showApiKey ? "隐藏密钥" : "显示密钥"}
								>
									{showApiKey ? (
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
							<span>API请求地址</span>
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
									currentEditingProvider.baseUrl || "https://api.openai.com/v1"
								}
								className="bg-transparent font-mono text-xs"
							/>
						</InputGroup>
					</TextField>

					{/* Model Selector with Action Buttons */}
					<div className="flex flex-col gap-1.5">
						<Label className="text-xs font-medium text-foreground">
							模型名称
						</Label>
						<div className="flex items-center gap-2">
							<div className="flex-1 min-w-0">
								<Select
									aria-label="Model 模型名称"
									selectedKey={currentConfig.model}
									onSelectionChange={(key) => {
										if (key) updateCurrentProviderField("model", String(key));
									}}
									className="w-full"
									placeholder="请选择一个模型"
								>
									<SelectTrigger className="w-full shadow-none bg-transparent border border-border/80 hover:border-foreground/40 rounded-lg font-mono text-xs">
										<SelectValue />
									</SelectTrigger>
									<SelectPopover className="rounded-xl border border-border bg-surface p-1 shadow-lg">
										<ListBox>
											{(currentEditingProvider.models.length > 0
												? currentEditingProvider.models
												: llmModelList
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
								isDisabled={loadingLlmModels}
								onPress={handleFetchLlmModels}
							>
								{loadingLlmModels ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<RefreshCw className="w-3.5 h-3.5" />
								)}
								<span>{loadingLlmModels ? "获取中..." : "获取模型"}</span>
							</Button>
						</div>

						<Description className="text-[11px] text-muted">
							点击「设为当前生效模型」可一键将该服务商配置切换为 AI
							助手的实时对话引擎。
						</Description>
					</div>
				</div>
			</div>

			{/* Section: Concurrency & Batching */}
			<div className="flex flex-col gap-3 mt-4">
				<div className="flex items-center gap-2 pb-1 border-b border-border/40">
					<Sliders className="w-4 h-4 shrink-0" />
					<span className="text-sm font-bold text-foreground">
						批处理与并发配置
					</span>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{/* Batch Size */}
					<TextField
						value={data.batchSize}
						onChange={(val) => onChange("batchSize", val)}
					>
						<Label className="text-xs font-medium text-foreground">
							单批书签分析量 (Batch Size)
						</Label>
						<Input
							type="number"
							min={1}
							max={50}
							placeholder="15"
							className="bg-transparent border border-border/80 hover:border-foreground/40 rounded-lg font-mono text-xs shadow-none"
						/>
						<Description className="text-[10px] text-muted">
							每次调用 LLM 进行主题识别和打标时的最大书签条数 (推荐 10-20)
						</Description>
					</TextField>

					{/* Concurrency */}
					<TextField
						value={data.concurrency}
						onChange={(val) => onChange("concurrency", val)}
					>
						<Label className="text-xs font-medium text-foreground">
							并发请求线程数 (Concurrency)
						</Label>
						<Input
							type="number"
							min={1}
							max={10}
							placeholder="2"
							className="bg-transparent border border-border/80 hover:border-foreground/40 rounded-lg font-mono text-xs shadow-none"
						/>
						<Description className="text-[10px] text-muted">
							同时进行的 API 请求数量 (推荐 2-4，避免触发服务商速率限制)
						</Description>
					</TextField>
				</div>
			</div>
		</div>
	);
}
