import {
	Button,
	Description,
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
	Eye,
	EyeOff,
	Globe,
	KeyRound,
	Loader2,
	Play,
	RefreshCw,
	Save,
	Sparkles,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { requestVisualImageGeneration } from "../../../services/api/visualGenClient";
import { fetchSkillsOverview } from "../../../services/api/skillsClient";
import { WorkbenchStorageService } from "../../../services/workbenchStorage";
import type { ProviderModelConfig } from "../types";
import {
	FALLBACK_MEDIA_MODELS,
	MEDIA_PROVIDERS,
	type ProviderPreset,
} from "./constants";
import type { ModelSettingsFormData } from "./ModelSettingsTab";

interface MediaModelSettingsTabProps {
	data: ModelSettingsFormData;
	onChange: <K extends keyof ModelSettingsFormData>(
		key: K,
		value: ModelSettingsFormData[K],
	) => void;
	mediaModelList?: string[];
	setMediaModelList?: React.Dispatch<React.SetStateAction<string[]>>;
	onSave?: () => void;
	showSkillAssociation?: boolean;
}

// Provider feature description and highlight tips
const PROVIDER_FEATURE_TIPS: Record<
	string,
	{ badge: string; description: string }
> = {
	official: {
		badge: "官方全托管视觉通道",
		description:
			"SVIP 及以上会员专享，官方统一提供高质量封面生图与视觉生成能力，开箱即用，无需配置 API Key。",
	},
	doubao: {
		badge: "火山方舟 Seedream 旗舰",
		description:
			"全面支持 Seedream 5.0 Flash 及 4.0 系列，对中文意境及成语古诗理解深厚，支持 2K/4K 超清渲染。",
	},
	nanobanana: {
		badge: "Google Gemini 原生图像",
		description:
			"业界领先的 Nano Banana / Gemini 图像架构，具备精准文字渲染排版、角色一致性及自然语言多轮编辑，支持官方端点与主流中转。",
	},
	openai: {
		badge: "OpenAI GPT-Image / DALL-E",
		description:
			"新一代原生多模态视觉生成 gpt-image-2 与 dall-e-3，高质感摄影光影与精准图内文字排版。",
	},
	siliconflow: {
		badge: "FLUX.1 开源顶流",
		description:
			"支持 FLUX.1 schnell / dev / pro 与 SD 3.5 Large，毫秒级快速推理与极致画质。",
	},
	custom: {
		badge: "OpenAI 兼容接口",
		description:
			"适配所有兼容 /v1/images/generations 规范的生图或视频中转端点及自建服务。",
	},
};

// Module-level cache to preserve fetched media models across dialog open/close
const fetchedMediaModelsCache: Record<string, string[]> = {};

export function MediaModelSettingsTab({
	data,
	onChange,
	setMediaModelList,
	onSave,
	showSkillAssociation = false,
}: MediaModelSettingsTabProps) {
	const [loadingMediaModels, setLoadingMediaModels] = useState(false);
	const [showApiKey, setShowApiKey] = useState(false);
	const [testingConnection, setTestingConnection] = useState(false);
	const [fetchedModelsMap, setFetchedModelsMap] = useState<
		Record<string, string[]>
	>(() => ({ ...fetchedMediaModelsCache }));
	const [availableSkills, setAvailableSkills] = useState<
		Array<{ name: string; path: string }>
	>([]);

	// The provider currently being inspected/edited in UI (switching this does NOT change active provider)
	const [editingProviderId, setEditingProviderId] = useState<string>(
		data.imageProvider || "doubao",
	);

	// Currently active (in-use) media provider
	const activeProvider =
		MEDIA_PROVIDERS.find((p) => p.id === data.imageProvider) ??
		MEDIA_PROVIDERS[0];

	// Provider being inspected
	const currentEditingProvider =
		MEDIA_PROVIDERS.find((p) => p.id === editingProviderId) ??
		MEDIA_PROVIDERS[0];

	const imageProvidersConfig: Record<string, ProviderModelConfig> =
		data.imageProvidersConfig || {};

	// Config values for the currently inspected media provider
	const currentConfig: ProviderModelConfig = imageProvidersConfig[
		editingProviderId
	] || {
		apiKey:
			editingProviderId === data.imageProvider ? data.imageApiKey || "" : "",
		baseUrl:
			editingProviderId === data.imageProvider
				? data.imageBaseUrl || currentEditingProvider.baseUrl
				: currentEditingProvider.baseUrl,
		model:
			editingProviderId === data.imageProvider
				? data.imageModel || currentEditingProvider.models[0] || ""
				: currentEditingProvider.models[0] || "",
	};

	const isEditingActive =
		editingProviderId === (data.imageProvider || "doubao");

	// Models available for current provider
	const fetchedForCurrent = fetchedModelsMap[editingProviderId];
	const baseModels =
		fetchedForCurrent && fetchedForCurrent.length > 0
			? fetchedForCurrent
			: currentEditingProvider.models.length > 0
				? currentEditingProvider.models
				: FALLBACK_MEDIA_MODELS;
	const availableModels =
		currentConfig.model && !baseModels.includes(currentConfig.model)
			? [currentConfig.model, ...baseModels]
			: baseModels;

	// Load local skills overview for selection when skill association is enabled
	useEffect(() => {
		if (!showSkillAssociation) return;
		fetchSkillsOverview()
			.then((overview) => {
				const list = overview.skills.map((s) => ({
					name: s.name,
					path: s.dirPath,
				}));
				setAvailableSkills(list);
			})
			.catch((err) =>
				console.warn("[MediaModelSettingsTab] load skills failed:", err),
			);
	}, [showSkillAssociation]);

	// Update fields for currently inspected provider
	const updateCurrentProviderField = (
		field: keyof ProviderModelConfig,
		value: string,
	) => {
		const updatedConfig: ProviderModelConfig = {
			...currentConfig,
			[field]: value,
		};

		const nextConfig = {
			...imageProvidersConfig,
			[editingProviderId]: updatedConfig,
		};

		onChange("imageProvidersConfig", nextConfig);

		// If editing active provider, sync top-level fields
		if (isEditingActive) {
			if (field === "apiKey") onChange("imageApiKey", value);
			if (field === "baseUrl") onChange("imageBaseUrl", value);
			if (field === "model") onChange("imageModel", value);
		}
	};

	// Explicitly activate this provider as the in-use media model
	const handleSetActiveProvider = () => {
		const nextProvider = editingProviderId;
		const nextApiKey = currentConfig.apiKey;
		const nextBaseUrl = currentConfig.baseUrl || currentEditingProvider.baseUrl;
		const nextModel =
			currentConfig.model || currentEditingProvider.models[0] || "";

		onChange("imageProvider", nextProvider);
		onChange("imageApiKey", nextApiKey);
		onChange("imageBaseUrl", nextBaseUrl);
		onChange("imageModel", nextModel);

		if (setMediaModelList) {
			setMediaModelList(availableModels);
		}

		try {
			const currentSettings = WorkbenchStorageService.getSettings();
			WorkbenchStorageService.saveSettings({
				...currentSettings,
				imageProvider: nextProvider,
				imageApiKey: nextApiKey,
				imageBaseUrl: nextBaseUrl,
				imageModel: nextModel,
			});
		} catch (err) {
			console.warn(
				"[MediaModelSettingsTab] Auto-save active model error:",
				err,
			);
		}

		toast.success(`已将 ${currentEditingProvider.name} 设为当前生效生图模型`);
	};

	const handleResetBaseUrl = () => {
		if (currentEditingProvider.baseUrl) {
			updateCurrentProviderField("baseUrl", currentEditingProvider.baseUrl);
			toast.info(`已重置为 ${currentEditingProvider.name} 官方默认端点`);
		}
	};

	const handleCopyLlmApiKey = () => {
		if (data.apiKey) {
			updateCurrentProviderField("apiKey", data.apiKey);
			toast.success("已同步 LLM API Key");
		}
	};

	// Fetch available models from Base URL and API Key
	const handleFetchMediaModels = async () => {
		const targetUrl =
			currentConfig.baseUrl.trim() ||
			currentEditingProvider.baseUrl ||
			"https://api.openai.com/v1";
		if (!targetUrl) {
			toast.danger("请先填写 API Base URL");
			return;
		}
		setLoadingMediaModels(true);
		try {
			const fetched = await WorkbenchStorageService.fetchAvailableModels({
				baseUrl: targetUrl,
				apiKey: currentConfig.apiKey.trim(),
			});
			if (fetched.length > 0) {
				fetchedMediaModelsCache[editingProviderId] = fetched;
				setFetchedModelsMap((prev) => ({
					...prev,
					[editingProviderId]: fetched,
				}));
				if (setMediaModelList) {
					setMediaModelList(fetched);
				}
				if (!currentConfig.model || !fetched.includes(currentConfig.model)) {
					updateCurrentProviderField("model", fetched[0]);
				}
				toast.success(`成功从服务商获取 ${fetched.length} 个可用模型`);
			} else {
				toast.warning("接口未返回任何可用模型");
			}
		} catch (err: unknown) {
			const error = err as Error;
			toast.danger(
				error.message || "获取模型列表失败，请检查 Base URL 和 API Key",
			);
		} finally {
			setLoadingMediaModels(false);
		}
	};

	// Test connection
	const handleTestConnection = async () => {
		const apiKeyToTest = currentConfig.apiKey || data.imageApiKey;
		if (!apiKeyToTest?.trim()) {
			toast.warning("请先填写生图 API Key 后再进行连接测试");
			return;
		}

		setTestingConnection(true);
		try {
			const res = await requestVisualImageGeneration({
				prompt:
					"测试生图连通性：极简现代商业海报设计，发光的立方体，柔和环境光影，1k",
				mediaType: "image",
				configOverrides: {
					provider: editingProviderId,
					apiKey: apiKeyToTest,
					baseUrl: currentConfig.baseUrl || currentEditingProvider.baseUrl,
					model: currentConfig.model || currentEditingProvider.models[0],
				},
			});

			if (res.success && res.images && res.images.length > 0) {
				toast.success("生图 API 连接成功！已成功返回测试生成结果");
			} else {
				toast.danger(`连接测试未成功：${res.error || "未返回图片数据"}`);
			}
		} catch (err) {
			toast.danger(
				`生图接口调用报错：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setTestingConnection(false);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			{/* Media Active Status Banner - Identical to Image 1 */}
			<div className="flex items-center justify-between gap-3 min-w-0">
				<div className="flex items-center gap-3 min-w-0">
					<div className="w-8 h-8 rounded-lg border border-border/70 flex items-center justify-center shrink-0 text-foreground">
						<Sparkles className="w-4 h-4" />
					</div>
					<div className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
						<span className="text-sm font-semibold text-foreground whitespace-nowrap shrink-0">
							当前默认模型：
						</span>
						{activeProvider.id === "official" ? (
							<span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/40 bg-emerald-500/5">
								⚡ 官方极速通道
							</span>
						) : (
							<>
								<span
									title={data.imageModel || "doubao-seed-image"}
									className="text-xs font-mono font-medium text-foreground px-2 py-0.5 rounded-md border border-border/60 bg-transparent truncate max-w-[200px] sm:max-w-[240px]"
								>
									{data.imageModel || "doubao-seed-image"}
								</span>
								<span
									title={activeProvider.name}
									className="text-xs text-muted truncate max-w-[130px] shrink-0"
								>
									({activeProvider.name})
								</span>
							</>
						)}
					</div>
				</div>

				<div className="text-right shrink-0 hidden sm:block">
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
					<Tabs.ListContainer className="overflow-x-auto no-scrollbar pb-1">
						<Tabs.List className="flex flex-nowrap min-w-max gap-1">
							{MEDIA_PROVIDERS.map((provider: ProviderPreset) => {
								return (
									<Tabs.Tab
										key={provider.id}
										id={provider.id}
										className="w-auto whitespace-nowrap shrink-0"
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

			{/* Feature Note for Current Provider */}
			{PROVIDER_FEATURE_TIPS[editingProviderId] && (
				<div className="flex items-start gap-2.5 p-3 rounded-xl border border-border/60 bg-surface-secondary/40 text-xs">
					<Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
					<div className="flex flex-col gap-0.5">
						<div className="flex items-center gap-2">
							<span className="font-semibold text-foreground">
								{PROVIDER_FEATURE_TIPS[editingProviderId].badge}
							</span>
						</div>
						<span className="text-muted text-[11px] leading-relaxed">
							{PROVIDER_FEATURE_TIPS[editingProviderId].description}
						</span>
					</div>
				</div>
			)}

			{/* Section: Selected Provider Configuration - Identical to Image 1 */}
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<KeyRound className="w-4 h-4 shrink-0" />
						<span className="text-sm font-bold text-foreground">
							{currentEditingProvider.name} 生图参数设置
						</span>
					</div>

					<div className="flex items-center gap-2">
						{editingProviderId !== "official" && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="rounded-lg text-xs"
								isDisabled={testingConnection}
								onPress={handleTestConnection}
							>
								<Play className="w-3 h-3" />
								<span>{testingConnection ? "测试中..." : "测试连接"}</span>
							</Button>
						)}

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

						{onSave && (
							<Button
								type="button"
								variant="primary"
								size="sm"
								className="rounded-lg text-xs"
								onPress={onSave}
							>
								<Save className="w-3 h-3 mr-1" />
								<span>保存配置</span>
							</Button>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-4">
					{editingProviderId === "official" ? (
						<div className="flex flex-col gap-3 p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5">
							<div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium text-xs">
								<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
								<span>官方全托管极速通道已就绪</span>
							</div>
							<p className="text-xs text-muted leading-relaxed">
								SVIP 及以上会员可直接使用官方托管的封面生图与视觉生成能力，
								免去您自行购买与配置 API 密钥的繁琐流程，开箱即用。
							</p>
							<p className="text-[11px] text-muted">
								如需使用自备的生图 API Key（如豆包 Seedream、Nano Banana、OpenAI
								等），可直接切换上方标签页自行配置。
							</p>
						</div>
					) : (
						<>
							{/* API Key Input - Identical to Image 1 */}
							<TextField
								value={currentConfig.apiKey}
								onChange={(val) => updateCurrentProviderField("apiKey", val)}
							>
								<Label className="text-xs font-medium text-foreground flex items-center justify-between">
									<span>生图 API Key</span>
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
											aria-label={showApiKey ? "隐藏密钥" : "显示密钥"}
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

							{/* API Base URL - Identical to Image 1 */}
							<TextField
								value={currentConfig.baseUrl}
								onChange={(val) => updateCurrentProviderField("baseUrl", val)}
							>
								<Label className="text-xs font-medium text-foreground flex items-center justify-between">
									<span>API Base URL</span>
									{currentEditingProvider.baseUrl &&
										currentConfig.baseUrl !==
											currentEditingProvider.baseUrl && (
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
											"https://api.openai.com/v1"
										}
										className="bg-transparent font-mono text-xs"
									/>
								</InputGroup>
							</TextField>

							{/* Model Selector & Direct Input with Presets */}
							<div className="flex flex-col gap-2">
								<div className="flex items-center justify-between">
									<Label className="text-xs font-medium text-foreground">
										生图模型名称
									</Label>
									<span className="text-[10px] text-muted">
										可直接输入模型名称/接入点 ID，或点击下方快捷预设
									</span>
								</div>

								<div className="flex items-center gap-2">
									<div className="flex-1 min-w-0">
										<TextField
											value={currentConfig.model}
											onChange={(val) =>
												updateCurrentProviderField("model", val)
											}
											className="w-full"
										>
											<InputGroup className="bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
												<InputGroup.Prefix className="pl-3">
													<Sparkles className="w-3.5 h-3.5 text-muted" />
												</InputGroup.Prefix>
												<InputGroup.Input
													type="text"
													placeholder={
														currentEditingProvider.models[0] ||
														"例如：doubao-seedream-5-0-flash-260915 或 gpt-image-2"
													}
													className="bg-transparent font-mono text-xs"
												/>
											</InputGroup>
										</TextField>
									</div>

									<Button
										type="button"
										variant="outline"
										className="rounded-lg text-xs"
										isDisabled={loadingMediaModels}
										onPress={handleFetchMediaModels}
									>
										{loadingMediaModels ? (
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
										) : (
											<RefreshCw className="w-3.5 h-3.5" />
										)}
										<span>{loadingMediaModels ? "获取中..." : "获取模型"}</span>
									</Button>
								</div>

								{/* Quick Preset Model Chips */}
								{availableModels.length > 0 && (
									<div className="flex flex-wrap items-center gap-1.5 pt-0.5">
										<span className="text-[10px] text-muted shrink-0">
											常用模型:
										</span>
										{availableModels.map((m) => {
											const isSelected = currentConfig.model === m;
											return (
												<button
													key={m}
													type="button"
													onClick={() => updateCurrentProviderField("model", m)}
													className={`text-[11px] font-mono px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
														isSelected
															? "bg-accent/15 border-accent text-accent font-semibold shadow-2xs"
															: "bg-surface-secondary/60 border-border/70 text-foreground/80 hover:bg-surface-secondary hover:border-border hover:text-foreground"
													}`}
													title={`点击快速填入 ${m}`}
												>
													{m}
												</button>
											);
										})}
									</div>
								)}

								<Description className="text-[11px] text-muted">
									用于一键发布文章时生成封面图及多媒体素材，点击「设为默认模型」可将当前服务商切换为默认生图引擎。
								</Description>
							</div>
						</>
					)}

					{/* Local Skill Association with HeroUI Select (Only displayed in Publish Center) */}
					{showSkillAssociation && (
						<div className="flex flex-col gap-1.5 pt-2 border-t border-border/40">
							<Label className="text-xs font-medium text-foreground">
								关联本地多媒体生成 Skills（可选）
							</Label>
							<Select
								aria-label="关联本地多媒体生成 Skills"
								selectedKey={data.imageSkillPath || "__none__"}
								onSelectionChange={(key) => {
									const str = String(key ?? "");
									onChange("imageSkillPath", str === "__none__" ? "" : str);
								}}
								className="w-full"
							>
								<SelectTrigger className="w-full shadow-none bg-transparent border border-border/80 hover:border-foreground/40 rounded-lg font-mono text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectPopover className="rounded-xl border border-border bg-surface p-1 shadow-lg max-h-60 overflow-y-auto min-w-[260px]">
									<ListBox>
										<ListBoxItem
											id="__none__"
											textValue="未关联（使用默认生图模型接口）"
										>
											未关联（使用默认生图模型接口）
										</ListBoxItem>
										{availableSkills.map((s) => (
											<ListBoxItem
												key={s.path}
												id={s.path}
												textValue={`${s.name} (${s.path})`}
											>
												<div className="flex flex-col text-left">
													<span className="font-medium text-xs text-foreground">
														{s.name}
													</span>
													<span className="text-[10px] text-muted truncate">
														{s.path}
													</span>
												</div>
											</ListBoxItem>
										))}
									</ListBox>
								</SelectPopover>
							</Select>
							<Description className="text-[11px] text-muted">
								支持直接调度本地配置的做图或短视频技能（如
								phone-video-style、baikou-style-video 等）。
							</Description>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
