import { Button, Modal, Tabs, Tooltip, toast } from "@heroui/react";
import { Link2Off, RotateCcw, Save, ShieldAlert, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
	DEFAULT_SETTINGS,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";
import type { WorkbenchSettings } from "./types";
import { DangerZoneTab } from "./settings/DangerZoneTab";
import { DataMaintenanceTab } from "./settings/DataMaintenanceTab";
import {
	ModelSettingsTab,
	type ModelSettingsFormData,
} from "./settings/ModelSettingsTab";
import {
	EMBEDDING_PROVIDERS,
	FALLBACK_EMBEDDING_MODELS,
	FALLBACK_LLM_MODELS,
	LLM_PROVIDERS,
	inferProviderId,
} from "./settings/constants";

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
	embeddingProvider: "siliconflow",
	embeddingApiKey: "",
	embeddingBaseUrl: "",
	embeddingModel: "",
};

export function SettingsModal({
	isOpen,
	onClose,
	onSettingsUpdated,
	onOpenDeadLinks,
	onDataCleared,
}: SettingsModalProps) {
	const [activeTab, setActiveTab] = useState("model");
	const [formData, setFormData] =
		useState<ModelSettingsFormData>(INITIAL_FORM_DATA);
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

	const applySettingsToForm = (settings: WorkbenchSettings) => {
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

		setFormData({
			llmProvider: currentLlmProvider,
			apiKey: currentApiKey,
			baseUrl: currentBaseUrl,
			model: currentModel,
			batchSize: String(settings.batchSize || 15),
			concurrency: String(settings.concurrency || 2),
			embeddingProvider: currentEmbProvider,
			embeddingApiKey: settings.embeddingApiKey || "",
			embeddingBaseUrl: currentEmbBaseUrl,
			embeddingModel: currentEmbModel,
		});

		// Populate model lists
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
	};

	useEffect(() => {
		if (isOpen) {
			setActiveTab("model");

			// 1. Immediately hydrate from local storage
			const localSettings = WorkbenchStorageService.getSettings();
			applySettingsToForm(localSettings);

			// 2. Synchronize from SQLite DB in background
			WorkbenchStorageService.fetchSettingsFromDb().then((dbSettings) => {
				applySettingsToForm(dbSettings);
			});
		}
	}, [isOpen]);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const finalApiKey = formData.apiKey.trim() || DEFAULT_SETTINGS.apiKey || "";
		const finalBaseUrl =
			formData.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl || "";
		const finalModel =
			formData.model.trim() || DEFAULT_SETTINGS.model || "";

		const updated: WorkbenchSettings = {
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
			embeddingApiKey: formData.embeddingApiKey.trim(),
			embeddingBaseUrl:
				formData.embeddingBaseUrl.trim() || DEFAULT_SETTINGS.embeddingBaseUrl,
			embeddingModel:
				formData.embeddingModel.trim() || DEFAULT_SETTINGS.embeddingModel,
			embeddingProvider: formData.embeddingProvider,
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

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog
					aria-label="设置"
					className="!max-w-2xl w-full h-[640px] max-h-[88vh] flex flex-col"
				>
					<Modal.CloseTrigger />
					<Modal.Header className="shrink-0">
						<Modal.Heading>设置</Modal.Heading>
					</Modal.Header>

					<form
						onSubmit={handleSubmit}
						className="flex flex-col flex-1 min-h-0 mt-2"
					>
						<Tabs
							selectedKey={activeTab}
							onSelectionChange={(key) => setActiveTab(String(key))}
							className="flex flex-col flex-1 min-h-0 w-full"
						>
							<Tabs.ListContainer className="w-full shrink-0">
								<Tabs.List className="w-full flex">
									<Tabs.Tab
										id="model"
										className="flex-1 flex items-center justify-center gap-1.5"
									>
										<Sparkles className="w-3.5 h-3.5" />
										<span>模型配置</span>
										<Tabs.Indicator />
									</Tabs.Tab>
									<Tabs.Tab
										id="data"
										className="flex-1 flex items-center justify-center gap-1.5"
									>
										<Link2Off className="w-3.5 h-3.5" />
										<span>数据维护</span>
										<Tabs.Indicator />
									</Tabs.Tab>
									<Tabs.Tab
										id="danger"
										className="flex-1 flex items-center justify-center gap-1.5"
									>
										<ShieldAlert className="w-3.5 h-3.5" />
										<span>危险操作</span>
										<Tabs.Indicator />
									</Tabs.Tab>
								</Tabs.List>
							</Tabs.ListContainer>

							<Modal.Body className="text-xs flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1.5 mt-2">
								{/* Tab 1: Model Settings */}
								<Tabs.Panel id="model" className="outline-none">
									{activeTab === "model" && (
										<ModelSettingsTab
											data={formData}
											onChange={handleFormChange}
											llmModelList={llmModelList}
											setLlmModelList={setLlmModelList}
											embeddingModelList={embeddingModelList}
											setEmbeddingModelList={setEmbeddingModelList}
										/>
									)}
								</Tabs.Panel>

								{/* Tab 2: Data Maintenance */}
								<Tabs.Panel id="data" className="outline-none">
									{activeTab === "data" && (
										<DataMaintenanceTab
											onClose={onClose}
											onOpenDeadLinks={onOpenDeadLinks}
										/>
									)}
								</Tabs.Panel>

								{/* Tab 3: Danger Zone */}
								<Tabs.Panel id="danger" className="outline-none">
									{activeTab === "danger" && (
										<DangerZoneTab
											onClose={onClose}
											onDataCleared={onDataCleared}
										/>
									)}
								</Tabs.Panel>
							</Modal.Body>
						</Tabs>

						<Modal.Footer className="flex items-center justify-between shrink-0 mt-4">
							<div className="flex items-center gap-1.5">
								<Tooltip>
									<Tooltip.Trigger>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="rounded-full text-muted flex items-center gap-1 cursor-pointer hover:text-foreground"
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
							</div>

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
