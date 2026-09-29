import { Button, Modal, Tabs, Tooltip, toast } from "@heroui/react";
import {
	Bot,
	Brain,
	Database,
	RotateCcw,
	Save,
	ShieldAlert,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
	DEFAULT_SETTINGS,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";
import {
	EMBEDDING_PROVIDERS,
	FALLBACK_EMBEDDING_MODELS,
	FALLBACK_LLM_MODELS,
	inferProviderId,
	LLM_PROVIDERS,
} from "./settings/constants";
import { DangerZoneTab } from "./settings/DangerZoneTab";
import { DataMaintenanceTab } from "./settings/DataMaintenanceTab";
import { EmbeddingSettingsTab } from "./settings/EmbeddingSettingsTab";
import { LlmSettingsTab } from "./settings/LlmSettingsTab";
import type { ModelSettingsFormData } from "./settings/ModelSettingsTab";
import type { WorkbenchSettings } from "./types";

export type SettingTabId = "llm" | "embedding" | "data" | "danger";

interface SettingTabItem {
	id: SettingTabId;
	label: string;
	description: string;
	icon: typeof Bot;
}

const SETTING_TABS: SettingTabItem[] = [
	{
		id: "llm",
		label: "AI 对话模型",
		description:
			"配置智能对话助手与书签分析使用的语言模型 (LLM)，支持多模型快速切换",
		icon: Bot,
	},
	{
		id: "embedding",
		label: "向量检索模型",
		description: "配置全局语义检索与知识库 (RAG) 向量嵌入模型 (Embedding)",
		icon: Brain,
	},
	{
		id: "data",
		label: "数据维护",
		description: "管理本地数据备份、文件存储目录及数据恢复",
		icon: Database,
	},
	{
		id: "danger",
		label: "危险操作",
		description: "清理无效死链与全量数据重置恢复",
		icon: ShieldAlert,
	},
];

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSettingsUpdated?: (settings: WorkbenchSettings) => void;
	onOpenDeadLinks?: () => void;
	onDataCleared?: () => void;
}

const INITIAL_FORM_DATA: ModelSettingsFormData = {
	llmProvider: "deepseek",
	apiKey: "",
	baseUrl: "",
	model: "",
	batchSize: "15",
	concurrency: "2",
	llmProvidersConfig: {},
	embeddingProvider: "siliconflow",
	embeddingApiKey: "",
	embeddingBaseUrl: "",
	embeddingModel: "",
	embeddingProvidersConfig: {},
};

export function SettingsModal({
	isOpen,
	onClose,
	onSettingsUpdated,
	onOpenDeadLinks,
	onDataCleared,
}: SettingsModalProps) {
	const [activeTab, setActiveTab] = useState<SettingTabId>("llm");
	const [formData, setFormData] =
		useState<ModelSettingsFormData>(INITIAL_FORM_DATA);
	const [filesRootDir, setFilesRootDir] = useState("");
	const [llmModelList, setLlmModelList] = useState<string[]>(
		LLM_PROVIDERS[0].models,
	);
	const [embeddingModelList, setEmbeddingModelList] = useState<string[]>(
		EMBEDDING_PROVIDERS[0].models,
	);

	const handleFormChange = <K extends keyof ModelSettingsFormData>(
		key: K,
		value: ModelSettingsFormData[K],
	) => {
		setFormData((prev) => ({ ...prev, [key]: value }));
	};

	const applySettingsToForm = useCallback((settings: WorkbenchSettings) => {
		const currentBaseUrl = settings.baseUrl || DEFAULT_SETTINGS.baseUrl;
		const currentModel = settings.model || DEFAULT_SETTINGS.model;
		const currentApiKey = settings.apiKey || DEFAULT_SETTINGS.apiKey;
		const currentLlmProvider =
			settings.llmProvider || inferProviderId(currentBaseUrl, LLM_PROVIDERS);

		const currentEmbBaseUrl =
			settings.embeddingBaseUrl || DEFAULT_SETTINGS.embeddingBaseUrl || "";
		const currentEmbModel =
			settings.embeddingModel || DEFAULT_SETTINGS.embeddingModel || "";
		const currentEmbProvider =
			settings.embeddingProvider ||
			inferProviderId(currentEmbBaseUrl, EMBEDDING_PROVIDERS);

		const rawProvidersConfig = settings.llmProvidersConfig || {};
		const initialProvidersConfig = { ...rawProvidersConfig };
		if (currentApiKey && !initialProvidersConfig[currentLlmProvider]) {
			initialProvidersConfig[currentLlmProvider] = {
				apiKey: currentApiKey,
				baseUrl: currentBaseUrl,
				model: currentModel,
			};
		}

		const rawEmbeddingProvidersConfig = settings.embeddingProvidersConfig || {};
		const initialEmbProvidersConfig = { ...rawEmbeddingProvidersConfig };
		if (
			(settings.embeddingApiKey || currentEmbModel) &&
			!initialEmbProvidersConfig[currentEmbProvider]
		) {
			initialEmbProvidersConfig[currentEmbProvider] = {
				apiKey: settings.embeddingApiKey || "",
				baseUrl: currentEmbBaseUrl,
				model: currentEmbModel,
			};
		}

		setFormData({
			llmProvider: currentLlmProvider,
			apiKey: currentApiKey,
			baseUrl: currentBaseUrl,
			model: currentModel,
			batchSize: String(settings.batchSize || 15),
			concurrency: String(settings.concurrency || 2),
			llmProvidersConfig: initialProvidersConfig,
			embeddingProvider: currentEmbProvider,
			embeddingApiKey: settings.embeddingApiKey || "",
			embeddingBaseUrl: currentEmbBaseUrl,
			embeddingModel: currentEmbModel,
			embeddingProvidersConfig: initialEmbProvidersConfig,
		});
		setFilesRootDir(settings.filesRootDir ?? settings.downloadsDir ?? "");

		const llmPreset =
			LLM_PROVIDERS.find((p) => p.id === currentLlmProvider)?.models ??
			FALLBACK_LLM_MODELS;
		setLlmModelList(
			Array.from(new Set([currentModel, ...llmPreset].filter(Boolean))),
		);

		const embPreset =
			EMBEDDING_PROVIDERS.find((p) => p.id === currentEmbProvider)?.models ??
			FALLBACK_EMBEDDING_MODELS;
		setEmbeddingModelList(
			Array.from(new Set([currentEmbModel, ...embPreset].filter(Boolean))),
		);
	}, []);

	useEffect(() => {
		if (isOpen) {
			setActiveTab("llm");
			const localSettings = WorkbenchStorageService.getSettings();
			applySettingsToForm(localSettings);

			WorkbenchStorageService.fetchSettingsFromDb().then((dbSettings) => {
				applySettingsToForm(dbSettings);
			});
		}
	}, [isOpen, applySettingsToForm]);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const existing = WorkbenchStorageService.getSettings();
		const finalApiKey = formData.apiKey.trim() || DEFAULT_SETTINGS.apiKey || "";
		const finalBaseUrl =
			formData.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl || "";
		const finalModel = formData.model.trim() || DEFAULT_SETTINGS.model || "";

		const updated: WorkbenchSettings = {
			...existing,
			apiKey: finalApiKey,
			baseUrl: finalBaseUrl,
			model: finalModel,
			batchSize: Math.max(
				1,
				Math.min(50, Number.parseInt(formData.batchSize, 10) || 15),
			),
			concurrency: Math.max(
				1,
				Math.min(10, Number.parseInt(formData.concurrency, 10) || 2),
			),
			llmProvider: formData.llmProvider,
			llmProvidersConfig: formData.llmProvidersConfig,
			embeddingApiKey: formData.embeddingApiKey.trim(),
			embeddingBaseUrl:
				formData.embeddingBaseUrl.trim() || DEFAULT_SETTINGS.embeddingBaseUrl,
			embeddingModel:
				formData.embeddingModel.trim() || DEFAULT_SETTINGS.embeddingModel,
			embeddingProvider: formData.embeddingProvider,
			embeddingProvidersConfig: formData.embeddingProvidersConfig,
			filesRootDir: filesRootDir.trim() || undefined,
			downloadsDir: undefined,
		};

		WorkbenchStorageService.saveSettings(updated);
		onSettingsUpdated?.(updated);
		toast.success("配置已保存");
		onClose();
	};

	const handleResetToSaved = () => {
		const saved = WorkbenchStorageService.getSettings();
		applySettingsToForm(saved);
		toast.info("已重置为上次保存的配置");
	};

	const currentTabInfo =
		SETTING_TABS.find((t) => t.id === activeTab) ?? SETTING_TABS[0];

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container>
				<Modal.Dialog
					aria-label="设置中心"
					className="w-full max-w-4xl h-[620px] max-h-[88vh] p-0 overflow-hidden flex flex-col"
				>
					<form
						onSubmit={handleSubmit}
						className="flex flex-1 min-h-0 w-full overflow-hidden"
					>
						<Tabs
							orientation="vertical"
							selectedKey={activeTab}
							onSelectionChange={(key) => setActiveTab(key as SettingTabId)}
							className="flex flex-1 min-h-0 w-full"
						>
							{/* Left Sidebar Navigation */}
							<aside className="w-48 shrink-0 bg-surface-secondary/20 border-r border-border/50 flex flex-col justify-between select-none">
								<div className="flex flex-col p-3">
									<div className="px-2 pt-2 pb-4">
										<h2 className="text-base font-bold text-foreground tracking-tight">
											设置中心
										</h2>
									</div>

									<Tabs.List className="flex flex-col gap-1 w-full bg-transparent p-0">
										{SETTING_TABS.map((tab) => {
											const Icon = tab.icon;
											return (
												<Tabs.Tab
													key={tab.id}
													id={tab.id}
													className="w-full flex items-center justify-start gap-2.5 px-3 py-2.5 rounded-lg text-xs transition-colors data-[selected=true]:font-medium data-[selected=true]:text-foreground text-muted"
												>
													<Icon className="w-4 h-4 shrink-0" />
													<span className="truncate">{tab.label}</span>
													<Tabs.Indicator className="!rounded-lg !bg-default/70 dark:!bg-surface-tertiary !shadow-xs border border-border/40" />
												</Tabs.Tab>
											);
										})}
									</Tabs.List>
								</div>
							</aside>

							{/* Right Content Area */}
							<main className="flex-1 flex flex-col min-w-0 min-h-0 bg-surface relative">
								<Modal.CloseTrigger />

								{/* Content Header */}
								<div className="px-6 py-4 border-b border-border shrink-0 pr-12">
									<h3 className="text-sm font-semibold text-foreground">
										{currentTabInfo.label}
									</h3>
									<p className="text-xs text-muted mt-0.5">
										{currentTabInfo.description}
									</p>
								</div>

								{/* Scrollable Tab Content Body */}
								<div className="flex-1 min-h-0 overflow-y-auto p-4 text-xs">
									<Tabs.Panel id="llm" className="outline-none">
										<LlmSettingsTab
											data={formData}
											onChange={handleFormChange}
											llmModelList={llmModelList}
											setLlmModelList={setLlmModelList}
										/>
									</Tabs.Panel>

									<Tabs.Panel id="embedding" className="outline-none">
										<EmbeddingSettingsTab
											data={formData}
											onChange={handleFormChange}
											embeddingModelList={embeddingModelList}
											setEmbeddingModelList={setEmbeddingModelList}
										/>
									</Tabs.Panel>

									<Tabs.Panel id="data" className="outline-none">
										<DataMaintenanceTab
											onDataRestored={onDataCleared}
											filesRootDir={filesRootDir}
											onFilesRootDirChange={setFilesRootDir}
										/>
									</Tabs.Panel>

									<Tabs.Panel id="danger" className="outline-none">
										<DangerZoneTab
											onClose={onClose}
											onDataCleared={onDataCleared}
											onOpenDeadLinks={onOpenDeadLinks}
										/>
									</Tabs.Panel>
								</div>

								{/* Content Footer Action Bar */}
								<div className="flex items-center justify-between px-6 py-3 border-t border-border bg-surface-secondary/20 shrink-0">
									<Tooltip>
										<Tooltip.Trigger>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onPress={handleResetToSaved}
											>
												<RotateCcw className="w-3.5 h-3.5" />
												<span>重置更改</span>
											</Button>
										</Tooltip.Trigger>
										<Tooltip.Content className="text-xs py-1 px-2">
											放弃当前未保存的修改，恢复为上次保存的配置
										</Tooltip.Content>
									</Tooltip>

									<div className="flex items-center gap-2">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onPress={onClose}
										>
											取消
										</Button>
										<Button type="submit" variant="primary" size="sm">
											<Save className="w-3.5 h-3.5" />
											<span>保存配置</span>
										</Button>
									</div>
								</div>
							</main>
						</Tabs>
					</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
