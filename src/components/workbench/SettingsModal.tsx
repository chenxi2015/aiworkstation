import { Button, Input, Label, Modal, TextField, toast } from "@heroui/react";
import { type FormEvent, useEffect, useState } from "react";
import type { WorkbenchSettings } from "./types";
import {
	DEFAULT_SETTINGS,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSettingsUpdated?: (settings: WorkbenchSettings) => void;
}

export function SettingsModal({
	isOpen,
	onClose,
	onSettingsUpdated,
}: SettingsModalProps) {
	const [apiKey, setApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [model, setModel] = useState("");
	const [batchSize, setBatchSize] = useState("15");

	// Embedding Settings
	const [embeddingApiKey, setEmbeddingApiKey] = useState("");
	const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState("");
	const [embeddingModel, setEmbeddingModel] = useState("");

	useEffect(() => {
		if (isOpen) {
			const settings = WorkbenchStorageService.getSettings();
			setApiKey(settings.deepseekApiKey || DEFAULT_SETTINGS.deepseekApiKey);
			setBaseUrl(settings.deepseekBaseUrl || DEFAULT_SETTINGS.deepseekBaseUrl);
			setModel(settings.deepseekModel || DEFAULT_SETTINGS.deepseekModel);
			setBatchSize(String(settings.batchSize || 15));

			setEmbeddingApiKey(settings.embeddingApiKey || "");
			setEmbeddingBaseUrl(
				settings.embeddingBaseUrl || DEFAULT_SETTINGS.embeddingBaseUrl || "",
			);
			setEmbeddingModel(
				settings.embeddingModel || DEFAULT_SETTINGS.embeddingModel || "",
			);
		}
	}, [isOpen]);

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

	const handleReset = () => {
		setApiKey(DEFAULT_SETTINGS.deepseekApiKey);
		setBaseUrl(DEFAULT_SETTINGS.deepseekBaseUrl);
		setModel(DEFAULT_SETTINGS.deepseekModel);
		setBatchSize("15");
		setEmbeddingApiKey("");
		setEmbeddingBaseUrl(DEFAULT_SETTINGS.embeddingBaseUrl || "");
		setEmbeddingModel(DEFAULT_SETTINGS.embeddingModel || "");
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="md">
				<Modal.Dialog>
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>AI 与模型配置</Modal.Heading>
					</Modal.Header>

					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<Modal.Body className="flex flex-col gap-5 text-xs max-h-[75vh] overflow-y-auto pr-1">
							{/* Section 1: LLM Classification */}
							<div className="flex flex-col gap-3">
								<div className="flex items-center gap-2 pb-1 border-b border-border">
									<span className="font-semibold text-foreground text-xs">
										⚡ AI 分类与摘要 (DeepSeek / LLM)
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

								<div className="grid grid-cols-2 gap-3">
									{/* DeepSeek Base URL */}
									<TextField value={baseUrl} onChange={setBaseUrl}>
										<Label>API Base URL</Label>
										<Input
											placeholder="https://api.deepseek.com"
											variant="secondary"
										/>
									</TextField>

									{/* DeepSeek Model */}
									<TextField value={model} onChange={setModel}>
										<Label>Model 模型名称</Label>
										<Input placeholder="deepseek-chat" variant="secondary" />
									</TextField>
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
									<span className="font-semibold text-foreground text-xs">
										🧠 向量索引与 AI 语义搜索 (Embedding / RAG)
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

								<div className="grid grid-cols-2 gap-3">
									{/* Embedding Base URL */}
									<TextField
										value={embeddingBaseUrl}
										onChange={setEmbeddingBaseUrl}
									>
										<Label>Embedding Base URL</Label>
										<Input
											placeholder="https://api.siliconflow.cn/v1"
											variant="secondary"
										/>
									</TextField>

									{/* Embedding Model */}
									<TextField
										value={embeddingModel}
										onChange={setEmbeddingModel}
									>
										<Label>Embedding Model</Label>
										<Input placeholder="BAAI/bge-m3" variant="secondary" />
									</TextField>
								</div>
							</div>
						</Modal.Body>

						<Modal.Footer className="flex items-center justify-between">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full text-muted"
								onPress={handleReset}
							>
								恢复默认
							</Button>

							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="rounded-full"
									onPress={onClose}
								>
									取消
								</Button>
								<Button
									type="submit"
									variant="primary"
									size="sm"
									className="rounded-full"
								>
									保存配置
								</Button>
							</div>
						</Modal.Footer>
					</form>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
