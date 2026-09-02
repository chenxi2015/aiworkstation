import {
	Button,
	Input,
	Label,
	Modal,
	TextField,
	toast,
} from "@heroui/react";
import { type FormEvent, useEffect, useState } from "react";
import type { WorkbenchSettings } from "./types";
import { DEFAULT_SETTINGS, WorkbenchStorageService } from "../../services/workbenchStorage";

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

	useEffect(() => {
		if (isOpen) {
			const settings = WorkbenchStorageService.getSettings();
			setApiKey(settings.deepseekApiKey || DEFAULT_SETTINGS.deepseekApiKey);
			setBaseUrl(settings.deepseekBaseUrl || DEFAULT_SETTINGS.deepseekBaseUrl);
			setModel(settings.deepseekModel || DEFAULT_SETTINGS.deepseekModel);
			setBatchSize(String(settings.batchSize || 15));
		}
	}, [isOpen]);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const updated: WorkbenchSettings = {
			deepseekApiKey: apiKey.trim() || DEFAULT_SETTINGS.deepseekApiKey,
			deepseekBaseUrl: baseUrl.trim() || DEFAULT_SETTINGS.deepseekBaseUrl,
			deepseekModel: model.trim() || DEFAULT_SETTINGS.deepseekModel,
			batchSize: Math.max(1, Math.min(50, Number.parseInt(batchSize, 10) || 15)),
		};

		WorkbenchStorageService.saveSettings(updated);
		onSettingsUpdated?.(updated);
		toast.success("AI 配置已保存");
		onClose();
	};

	const handleReset = () => {
		setApiKey(DEFAULT_SETTINGS.deepseekApiKey);
		setBaseUrl(DEFAULT_SETTINGS.deepseekBaseUrl);
		setModel(DEFAULT_SETTINGS.deepseekModel);
		setBatchSize("15");
	};

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="sm">
				<Modal.Dialog>
					<Modal.CloseTrigger />
					<Modal.Header>
						<Modal.Heading>AI 与模型设置</Modal.Heading>
					</Modal.Header>

					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<Modal.Body className="flex flex-col gap-4 text-xs">
							<p className="text-muted leading-relaxed">
								配置用于书签 TDK 批量分析与智能分类的 DeepSeek API 连接参数。
							</p>

							{/* DeepSeek API Key */}
							<TextField value={apiKey} onChange={setApiKey}>
								<Label>
									DeepSeek API Key <span className="text-danger">*</span>
								</Label>
								<Input
									type="password"
									placeholder="sk-..."
									variant="secondary"
								/>
							</TextField>

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
								<Input
									placeholder="deepseek-chat"
									variant="secondary"
								/>
							</TextField>

							{/* Batch Size */}
							<TextField value={batchSize} onChange={setBatchSize}>
								<Label>单批处理 TDK 数量 (Batch Size)</Label>
								<Input
									type="number"
									min={1}
									max={50}
									placeholder="15"
									variant="secondary"
								/>
							</TextField>
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
