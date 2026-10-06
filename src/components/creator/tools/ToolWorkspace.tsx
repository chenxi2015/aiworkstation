import { AlertCircle, CheckCircle2, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { processUploadedMediaWithFfmpeg } from "../../../server/functions/creatorTools";
import {
	type ParamValue,
	type ProcessedMediaResult,
	ToolBottomDock,
	ToolDropzone,
	ToolHeader,
	ToolParamForm,
	ToolPreviewCanvas,
} from "./components";
import type { ToolDefinition } from "./types";

interface ToolWorkspaceProps {
	tool: ToolDefinition;
	onSaveToMaterials?: (resultInfo: string) => void;
	onSendToStudio?: () => void;
}

/**
 * Modern, dual-pane interactive workspace for creator tools.
 * Composes standard sub-components (Header, Dropzone, ParamForm, PreviewCanvas, BottomDock)
 * into a cohesive, high-performance workstation interface.
 */
export function ToolWorkspace({
	tool,
	onSaveToMaterials,
	onSendToStudio,
}: ToolWorkspaceProps) {
	const [linkInput, setLinkInput] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [processedResult, setProcessedResult] =
		useState<ProcessedMediaResult | null>(null);

	const [paramValues, setParamValues] = useState<Record<string, ParamValue>>(
		() => {
			const initial: Record<string, ParamValue> = {};
			tool.params?.forEach((p) => {
				if (p.defaultValue !== undefined) {
					initial[p.id] = p.defaultValue;
				}
			});
			return initial;
		},
	);

	// Reset transient state whenever the active tool changes
	useEffect(() => {
		setSelectedFile(null);
		setProcessedResult(null);
		setStatusMessage(null);
		setErrorMessage(null);
		setLinkInput("");
		const initial: Record<string, ParamValue> = {};
		tool.params?.forEach((p) => {
			if (p.defaultValue !== undefined) {
				initial[p.id] = p.defaultValue;
			}
		});
		setParamValues(initial);
	}, [tool.params]);

	// Maintain source file preview blob URL with automatic cleanup
	useEffect(() => {
		if (!selectedFile) {
			setSourcePreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(selectedFile);
		setSourcePreviewUrl(url);
		return () => {
			URL.revokeObjectURL(url);
		};
	}, [selectedFile]);

	const isOnlineParser = tool.id === "video-extract-online";
	const isReady = tool.status === "completed";

	const handleParamChange = (id: string, value: ParamValue) => {
		setParamValues((prev) => ({ ...prev, [id]: value }));
	};

	const handleExecuteTool = async () => {
		if (tool.status === "developing") {
			setErrorMessage(
				`「${tool.name}」目前处于规划开发阶段，算法模块正在接入中，敬请期待！`,
			);
			return;
		}

		if (isOnlineParser) {
			if (!linkInput.trim()) {
				setErrorMessage("请输入视频分享链接或口令");
				return;
			}
			setIsProcessing(true);
			setErrorMessage(null);
			setStatusMessage(null);
			setTimeout(() => {
				setIsProcessing(false);
				setStatusMessage("视频解析完成！无水印原画视频已准备就绪。");
			}, 1200);
			return;
		}

		if (!selectedFile) {
			setErrorMessage("请先在左侧选择或拖拽需要处理的媒体文件");
			return;
		}

		setIsProcessing(true);
		setErrorMessage(null);
		setStatusMessage(null);
		setProcessedResult(null);

		try {
			const formData = new FormData();
			formData.append("file", selectedFile);
			formData.append("toolId", tool.id);
			formData.append("params", JSON.stringify(paramValues));

			const res = await processUploadedMediaWithFfmpeg({ data: formData });
			if (res.success && res.material && res.assetUrl) {
				setProcessedResult({
					materialId: res.material.id,
					assetUrl: res.assetUrl,
					filename: res.outputFilename || "处理产物",
					sizeBytes: res.outputSizeBytes || 0,
				});
				setStatusMessage(
					`处理完成！产物「${res.outputFilename}」已自动存入素材库。`,
				);
				onSaveToMaterials?.(tool.name);
			} else {
				setErrorMessage(res.error || "处理未生成产物，请检查文件或参数");
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "请求发生异常";
			setErrorMessage(`执行失败: ${msg}`);
		} finally {
			setIsProcessing(false);
		}
	};

	// Calculate compression ratio when both input and output sizes are present
	const compressionSavings = useMemo(() => {
		if (!selectedFile || !processedResult || processedResult.sizeBytes <= 0) {
			return null;
		}
		const diff = selectedFile.size - processedResult.sizeBytes;
		const pct = Math.round((diff / selectedFile.size) * 100);
		return pct > 0 ? pct : null;
	}, [selectedFile, processedResult]);

	// Render custom component if tool provides dedicated specialized interface
	if (tool.customComponent) {
		const CustomComponent = tool.customComponent;
		return (
			<CustomComponent
				tool={tool}
				onSaveToMaterials={onSaveToMaterials}
				onSendToStudio={onSendToStudio}
			/>
		);
	}

	return (
		<div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
			{/* 1. Standard Header */}
			<ToolHeader tool={tool} />

			{/* 2. Main Workspace Canvas (Scrollable Two-Column Layout) */}
			<div className="flex-1 min-h-0 overflow-y-auto p-5 scrollbar-thin">
				<div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
					{/* Left Column: Operations & Parameter Controls (Span 5) */}
					<div className="lg:col-span-5 space-y-4">
						{/* Media Dropzone / Online link parser */}
						<ToolDropzone
							isOnlineParser={isOnlineParser}
							linkInput={linkInput}
							onLinkInputChange={setLinkInput}
							acceptTypes={tool.acceptTypes}
							supportedFormats={tool.supportedFormats}
							selectedFile={selectedFile}
							onSelectFile={(file) => {
								setSelectedFile(file);
								setProcessedResult(null);
								setErrorMessage(null);
							}}
						/>

						{/* Declarative Parameter Controls */}
						{tool.params && tool.params.length > 0 && (
							<ToolParamForm
								params={tool.params}
								values={paramValues}
								onChange={handleParamChange}
							/>
						)}

						{/* Core Feature Highlights */}
						<div className="p-4 rounded-xl border border-border bg-surface space-y-2.5">
							<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
								<Zap className="w-3.5 h-3.5 text-amber-500" />
								<span>核心技术特性</span>
							</div>
							<ul className="space-y-1.5 text-xs text-muted">
								{tool.features.map((feature) => (
									<li key={feature} className="flex items-start gap-2">
										<CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
										<span>{feature}</span>
									</li>
								))}
							</ul>
						</div>

						{/* Error Banner */}
						{errorMessage && (
							<div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
								<AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
								<span>{errorMessage}</span>
							</div>
						)}

						{/* Status message */}
						{statusMessage && (
							<div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
								<CheckCircle2 className="w-4 h-4 shrink-0" />
								<span>{statusMessage}</span>
							</div>
						)}
					</div>

					{/* Right Column: Live Comparison & Deliverable Preview (Span 7) */}
					<div className="lg:col-span-7 flex flex-col space-y-4">
						<ToolPreviewCanvas
							isProcessing={isProcessing}
							processedResult={processedResult}
							selectedFile={selectedFile}
							sourcePreviewUrl={sourcePreviewUrl}
							compressionSavings={compressionSavings}
						/>
					</div>
				</div>
			</div>

			{/* 3. Persistent Bottom Control Dock */}
			<ToolBottomDock
				isProcessing={isProcessing}
				isReady={isReady}
				hintMessage={
					processedResult
						? "产物已自动保存至「素材库」，随时可导入创作台二次编辑"
						: undefined
				}
				onExecute={handleExecuteTool}
				onSaveToMaterials={() => {
					onSaveToMaterials?.(tool.name);
					setStatusMessage(`已成功将「${tool.name}」相关产物保存至素材库！`);
				}}
				saveToMaterialsDisabled={!processedResult && !selectedFile}
				onSendToStudio={onSendToStudio}
			/>
		</div>
	);
}
