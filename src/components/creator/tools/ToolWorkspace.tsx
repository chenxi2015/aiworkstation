import {
	ArrowRight,
	CheckCircle2,
	Cpu,
	FileUp,
	FolderPlus,
	Info,
	Play,
	SlidersHorizontal,
	Zap,
} from "lucide-react";
import { useState } from "react";
import type { ToolDefinition } from "./types";

interface ToolWorkspaceProps {
	tool: ToolDefinition;
	onSaveToMaterials?: (resultInfo: string) => void;
	onSendToStudio?: () => void;
}

type ParamValue = string | number | boolean;

/**
 * Right interactive workspace for the currently selected creator tool.
 * Provides interactive file dropzone / link input, parameter configuration,
 * and direct links to the creator asset pipeline (materials & studio).
 */
export function ToolWorkspace({
	tool,
	onSaveToMaterials,
	onSendToStudio,
}: ToolWorkspaceProps) {
	const [linkInput, setLinkInput] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
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

	const Icon = tool.icon;
	const isOnlineParser = tool.id === "video-extract-online";
	const isWasm = tool.engine === "wasm";
	const isAi = tool.engine === "ai";

	const handleParamChange = (id: string, value: ParamValue) => {
		setParamValues((prev) => ({ ...prev, [id]: value }));
	};

	const handleSimulateRun = () => {
		setIsProcessing(true);
		setStatusMessage(null);
		setTimeout(() => {
			setIsProcessing(false);
			setStatusMessage("任务模拟处理完成！可直接下载或一键保存到素材库。");
		}, 1200);
	};

	// If the tool has a dedicated interactive component, render it directly
	if (tool.customComponent) {
		const CustomComponent = tool.customComponent;
		return <CustomComponent tool={tool} />;
	}

	return (
		<div className="flex-1 flex flex-col h-full bg-background overflow-y-auto">
			{/* Header area */}
			<div className="p-6 border-b border-border bg-surface/20 shrink-0">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-4">
						<div
							className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
								isWasm
									? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
									: isAi
										? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
										: "bg-accent/10 text-accent border-accent/20"
							}`}
						>
							<Icon className="w-6 h-6" />
						</div>

						<div>
							<div className="flex items-center gap-2 mb-1.5 flex-wrap">
								<h1 className="text-lg font-bold text-foreground">
									{tool.name}
								</h1>
								<span
									className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
										isWasm
											? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
											: isAi
												? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
												: "bg-muted/15 text-muted border-border"
									}`}
								>
									{tool.engineLabel}
								</span>
								{tool.badges?.map((badge) => (
									<span
										key={badge}
										className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted"
									>
										{badge}
									</span>
								))}
							</div>
							<p className="text-xs text-muted max-w-2xl leading-relaxed">
								{tool.description}
							</p>
						</div>
					</div>

					{/* Supported formats */}
					{tool.supportedFormats && tool.supportedFormats.length > 0 && (
						<div className="hidden lg:flex flex-col items-end gap-1 shrink-0">
							<span className="text-[10px] text-muted uppercase font-mono">
								支持格式
							</span>
							<div className="flex items-center gap-1 flex-wrap justify-end">
								{tool.supportedFormats.map((fmt) => (
									<span
										key={fmt}
										className="text-[10px] px-1.5 py-0.5 rounded bg-muted/10 font-mono text-muted border border-border/50"
									>
										{fmt}
									</span>
								))}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Main Workspace Canvas */}
			<div className="flex-1 p-6 space-y-6 max-w-5xl">
				{/* Input area: Link input or File Drag & Drop */}
				{isOnlineParser ? (
					<div className="p-5 rounded-xl border border-border bg-surface/40 space-y-3">
						<label
							htmlFor="video-link-input"
							className="block text-xs font-semibold text-foreground"
						>
							输入视频分享链接或口令
						</label>
						<div className="flex gap-2">
							<input
								id="video-link-input"
								type="text"
								value={linkInput}
								onChange={(e) => setLinkInput(e.target.value)}
								placeholder="粘贴抖音、快手、小红书、B站等平台的短视频链接..."
								className="flex-1 px-3.5 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
							/>
							<button
								type="button"
								onClick={handleSimulateRun}
								disabled={isProcessing || !linkInput.trim()}
								className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
							>
								{isProcessing ? (
									<>
										<Cpu className="w-3.5 h-3.5 animate-spin" />
										<span>正在解析...</span>
									</>
								) : (
									<>
										<Play className="w-3.5 h-3.5" />
										<span>解析视频</span>
									</>
								)}
							</button>
						</div>
					</div>
				) : (
					<div className="p-8 rounded-xl border-2 border-dashed border-border/80 hover:border-accent/60 bg-surface/20 hover:bg-surface/40 transition-colors flex flex-col items-center justify-center text-center group cursor-pointer relative">
						<input
							type="file"
							accept={tool.acceptTypes}
							onChange={(e) => {
								if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
							}}
							className="absolute inset-0 opacity-0 cursor-pointer"
						/>
						<div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
							<FileUp className="w-6 h-6" />
						</div>
						{selectedFile ? (
							<div className="space-y-1">
								<p className="text-sm font-semibold text-foreground">
									已选择: {selectedFile.name}
								</p>
								<p className="text-xs text-muted font-mono">
									{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
								</p>
							</div>
						) : (
							<div className="space-y-1">
								<p className="text-sm font-semibold text-foreground">
									拖拽文件到此处，或点击选择文件
								</p>
								<p className="text-xs text-muted">
									{tool.supportedFormats
										? `支持 ${tool.supportedFormats.join(", ")} 格式文件`
										: "支持媒体文件上传"}
								</p>
							</div>
						)}
					</div>
				)}

				{/* Parameters Section (if tool has configurable options) */}
				{tool.params && tool.params.length > 0 && (
					<div className="p-5 rounded-xl border border-border bg-surface/30 space-y-4">
						<div className="flex items-center gap-2 text-xs font-semibold text-foreground border-b border-border/50 pb-2.5">
							<SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
							<span>参数与导出设置</span>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{tool.params.map((param) => {
								const val = paramValues[param.id] ?? param.defaultValue;

								if (param.type === "radio" || param.type === "select") {
									return (
										<div key={param.id} className="space-y-1.5">
											<label
												htmlFor={`param-${param.id}`}
												className="text-xs font-medium text-foreground block"
											>
												{param.label}
											</label>
											<select
												id={`param-${param.id}`}
												value={String(val)}
												onChange={(e) =>
													handleParamChange(param.id, e.target.value)
												}
												className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
											>
												{param.options?.map((opt) => (
													<option key={opt.value} value={opt.value}>
														{opt.label}
													</option>
												))}
											</select>
										</div>
									);
								}

								if (param.type === "switch") {
									return (
										<div
											key={param.id}
											className="flex items-center justify-between p-2.5 rounded-lg bg-background/60 border border-border/60"
										>
											<label
												htmlFor={`param-${param.id}`}
												className="text-xs text-foreground font-medium cursor-pointer"
											>
												{param.label}
											</label>
											<input
												id={`param-${param.id}`}
												type="checkbox"
												checked={Boolean(val)}
												onChange={(e) =>
													handleParamChange(param.id, e.target.checked)
												}
												className="rounded border-border text-accent focus:ring-accent cursor-pointer"
											/>
										</div>
									);
								}

								return null;
							})}
						</div>
					</div>
				)}

				{/* Feature highlights & Engine Advantages */}
				<div className="p-5 rounded-xl border border-border bg-surface/20 space-y-3">
					<div className="flex items-center gap-2 text-xs font-semibold text-foreground">
						<Zap className="w-3.5 h-3.5 text-amber-500" />
						<span>技术亮点与核心优势</span>
					</div>

					<ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted">
						{tool.features.map((feature) => (
							<li key={feature} className="flex items-start gap-2">
								<CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
								<span>{feature}</span>
							</li>
						))}
					</ul>

					{isWasm && (
						<div className="mt-3 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2">
							<Cpu className="w-4 h-4 shrink-0" />
							<span>
								基于 WebAssembly
								纯本地运行：无需上传云端服务器，文件零泄露风险，毫秒级快速导出。
							</span>
						</div>
					)}
				</div>

				{/* Feedback status message */}
				{statusMessage && (
					<div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
						<div className="flex items-center gap-2">
							<CheckCircle2 className="w-4 h-4 shrink-0" />
							<span>{statusMessage}</span>
						</div>
					</div>
				)}
			</div>

			{/* Footer Action Bar */}
			<div className="p-4 border-t border-border bg-surface/40 shrink-0 flex items-center justify-between flex-wrap gap-3">
				<div className="flex items-center gap-2 text-xs text-muted">
					<Info className="w-3.5 h-3.5" />
					<span>处理产物可一键归档到素材库，无缝接入自媒体创作台</span>
				</div>

				<div className="flex items-center gap-2.5">
					<button
						type="button"
						onClick={handleSimulateRun}
						disabled={isProcessing}
						className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-xs"
					>
						{isProcessing ? (
							<>
								<Cpu className="w-3.5 h-3.5 animate-spin" />
								<span>处理中...</span>
							</>
						) : (
							<>
								<Play className="w-3.5 h-3.5" />
								<span>开始处理</span>
							</>
						)}
					</button>

					<button
						type="button"
						onClick={() => {
							onSaveToMaterials?.(tool.name);
							setStatusMessage(`已成功加入「素材库」，随时可在素材库中查看！`);
						}}
						className="px-3.5 py-2 rounded-lg border border-border bg-surface hover:bg-surface/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
					>
						<FolderPlus className="w-3.5 h-3.5 text-accent" />
						<span>保存至素材库</span>
					</button>

					<button
						type="button"
						onClick={() => {
							onSendToStudio?.();
						}}
						className="px-3.5 py-2 rounded-lg border border-border bg-surface hover:bg-surface/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
					>
						<ArrowRight className="w-3.5 h-3.5 text-muted" />
						<span>导入创作台</span>
					</button>
				</div>
			</div>
		</div>
	);
}
