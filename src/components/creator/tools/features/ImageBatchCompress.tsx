import { Button, Modal } from "@heroui/react";
import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Download,
	FolderOpen,
	Zap,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
	openLocalPath,
	pickBatchOutputDirectory,
	revealLocalPath,
} from "../../../../server/functions/batchOutputs";
import { BatchDropzone } from "../batch/BatchDropzone";
import { BatchQueueList } from "../batch/BatchQueueList";
import type { CollectResult } from "../batch/collectFiles";
import {
	compressImageItem,
	type ImageOutputFormat,
} from "../batch/imageEngine";
import { OutputModePicker } from "../batch/OutputModePicker";
import {
	canOverwriteInPlace,
	deliverBatchOutputs,
} from "../batch/outputWriter";
import { runBatch } from "../batch/runBatch";
import {
	type BatchItem,
	type OutputMode,
	summarizeBatch,
} from "../batch/types";
import { ToolHeader } from "../components/ToolHeader";
import { type ParamValue, ToolParamForm } from "../components/ToolParamForm";
import type { CustomToolWorkspaceProps } from "../types";

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 图片压缩与格式转换 — 批量版工作区。
 * 支持拖入整个文件夹/多文件，纯前端 Canvas 压缩，产物可保存到新目录、
 * 原路径替换（桌面端）或打包 zip 下载。
 */
export function ImageBatchCompress({ tool }: CustomToolWorkspaceProps) {
	const [items, setItems] = useState<BatchItem[]>([]);
	const [paramValues, setParamValues] = useState<Record<string, ParamValue>>(
		() => {
			const initial: Record<string, ParamValue> = {};
			tool.params?.forEach((p) => {
				if (p.defaultValue !== undefined) initial[p.id] = p.defaultValue;
			});
			return initial;
		},
	);
	const [outputMode, setOutputMode] = useState<OutputMode>("new-directory");
	const [isRunning, setIsRunning] = useState(false);
	const [isDelivering, setIsDelivering] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const [deliveredPaths, setDeliveredPaths] = useState<Record<string, string>>(
		{},
	);
	const [lastDeliveredDir, setLastDeliveredDir] = useState<string | null>(null);
	const [exportModalOpen, setExportModalOpen] = useState(false);

	const summary = useMemo(() => summarizeBatch(items), [items]);
	const isConverting = String(paramValues.format ?? "original") !== "original";
	const hasDone = summary.done > 0;
	const overwriteEnabled = items.length > 0 && canOverwriteInPlace(items);

	const patchItem = (updated: BatchItem) => {
		setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
	};

	const handleCollect = (result: CollectResult) => {
		setErrorMessage(null);
		setStatusMessage(null);
		setItems((prev) => {
			const seen = new Set(prev.map((i) => `${i.relativePath}:${i.size}`));
			const fresh = result.items.filter(
				(i) => !seen.has(`${i.relativePath}:${i.size}`),
			);
			return [...prev, ...fresh];
		});
		const notes: string[] = [];
		if (result.truncated) notes.push("文件过多，已仅截取前 500 个");
		if (result.rejectedCount > 0)
			notes.push(`${result.rejectedCount} 个文件因格式不符被跳过`);
		if (notes.length > 0) setStatusMessage(notes.join("；"));
	};

	const handleRun = async () => {
		if (items.length === 0) {
			setErrorMessage("请先拖入或选择需要处理的图片");
			return;
		}
		setIsRunning(true);
		setErrorMessage(null);
		setStatusMessage(null);
		abortRef.current = new AbortController();

		const quality = Number(paramValues.quality ?? 75) / 100;
		const format = String(
			paramValues.format ?? "original",
		) as ImageOutputFormat;
		const maxDimension = Number(paramValues.maxDimension ?? 0);

		// Reset the whole queue so re-running always re-processes from the
		// original source files with the latest parameter configuration
		const resetItems = items.map((i) => ({
			...i,
			status: "pending" as const,
			progress: 0,
			error: undefined,
			output: undefined,
		}));
		setItems(resetItems);
		setDeliveredPaths({});
		setLastDeliveredDir(null);

		try {
			await runBatch(
				resetItems,
				async (item) => {
					await compressImageItem(item, {
						quality,
						format,
						maxDimension,
						background: "#ffffff",
					});
				},
				{
					concurrency: Math.max(
						2,
						Math.floor((navigator.hardwareConcurrency || 4) / 2),
					),
					signal: abortRef.current.signal,
					onItemUpdate: patchItem,
				},
			);
		} finally {
			setIsRunning(false);
		}
	};

	const handleDeliver = () => {
		if (!hasDone) {
			setErrorMessage("还没有处理完成的产物，请先执行批量处理");
			return;
		}
		setExportModalOpen(true);
	};

	const doDeliver = async () => {
		setIsDelivering(true);
		setErrorMessage(null);
		setStatusMessage(null);
		try {
			// 新目录模式：确认导出时才唤起系统目录选择器（本地服务端原生弹窗）
			let targetDir: string | undefined;
			if (outputMode === "new-directory") {
				try {
					const picked = await pickBatchOutputDirectory();
					if (!picked.path) {
						setIsDelivering(false);
						return; // 用户取消
					}
					targetDir = picked.path;
				} catch {
					// 云端部署等无本地服务端场景：回退浏览器目录选择器
					targetDir = undefined;
				}
			}
			const result = await deliverBatchOutputs(items, outputMode, {
				outputDir: targetDir,
			});
			if (result.paths) {
				setDeliveredPaths((prev) => ({ ...prev, ...result.paths }));
			}
			setLastDeliveredDir(
				outputMode === "new-directory" && result.destination
					? result.destination
					: null,
			);
			if (result.success) {
				setStatusMessage(
					`已导出 ${summary.done} 个产物到${result.destination ?? "目标位置"}`,
				);
			} else {
				setStatusMessage(
					`导出完成：${summary.done - result.failed.length} 成功，${result.failed.length} 失败`,
				);
				setErrorMessage(
					result.failed
						.slice(0, 3)
						.map((f) => `${f.name}: ${f.error}`)
						.join("；") + (result.failed.length > 3 ? " …" : ""),
				);
			}
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") return;
			setErrorMessage(err instanceof Error ? err.message : "导出失败");
		} finally {
			setIsDelivering(false);
		}
	};

	const handleOpenItem = async (item: BatchItem) => {
		setErrorMessage(null);
		try {
			// 已导出：打开磁盘上的实际产物
			const delivered = deliveredPaths[item.id];
			if (delivered) {
				await openLocalPath({ data: { path: delivered } });
				return;
			}
			// 待处理且有本地路径：直接打开源文件
			if (item.absPath) {
				await openLocalPath({ data: { path: item.absPath } });
				return;
			}
			// 未导出：预览内存中的产物或原图
			const blob = item.output?.blob ?? item.file;
			if (blob) {
				const url = URL.createObjectURL(blob);
				window.open(url, "_blank");
				setTimeout(() => URL.revokeObjectURL(url), 60_000);
			}
		} catch (err) {
			setErrorMessage(
				`打开失败: ${err instanceof Error ? err.message : "未知错误"}`,
			);
		}
	};

	const handleRevealItem = async (item: BatchItem) => {
		setErrorMessage(null);
		const target =
			deliveredPaths[item.id] ?? item.output?.absPath ?? item.absPath;
		if (!target) return;
		try {
			await revealLocalPath({ data: { path: target } });
		} catch (err) {
			setErrorMessage(
				`定位失败: ${err instanceof Error ? err.message : "未知错误"}`,
			);
		}
	};

	const savingsPct =
		summary.inputBytes > 0
			? Math.max(
					0,
					Math.round(
						((summary.inputBytes - summary.outputBytes) / summary.inputBytes) *
							100,
					),
				)
			: 0;

	return (
		<div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
			<ToolHeader tool={tool} />

			<div className="flex-1 min-h-0 overflow-y-auto p-5 scrollbar-thin">
				<div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
					{/* Left column: input + params + output mode */}
					<div className="lg:col-span-5 space-y-4">
						<BatchDropzone
							acceptTypes={tool.acceptTypes}
							supportedFormats={tool.supportedFormats}
							itemCount={items.length}
							disabled={isRunning}
							onCollect={handleCollect}
						/>

						{tool.params && tool.params.length > 0 && (
							<ToolParamForm
								params={tool.params}
								values={paramValues}
								onChange={(id, value) =>
									setParamValues((prev) => ({ ...prev, [id]: value }))
								}
							/>
						)}

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

						{errorMessage && (
							<div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
								<AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
								<span>{errorMessage}</span>
							</div>
						)}
						{statusMessage && (
							<div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
								<CheckCircle2 className="w-4 h-4 shrink-0" />
								<span className="flex-1">{statusMessage}</span>
								{lastDeliveredDir && (
									<button
										type="button"
										onClick={() =>
											void revealLocalPath({
												data: { path: lastDeliveredDir },
											})
										}
										className="shrink-0 px-2 py-1 rounded-md border border-emerald-500/40 hover:bg-emerald-500/10 text-[11px] font-medium cursor-pointer flex items-center gap-1"
									>
										<FolderOpen className="w-3 h-3" />
										打开输出目录
									</button>
								)}
							</div>
						)}
					</div>

					{/* Right column: queue + summary */}
					<div className="lg:col-span-7 flex flex-col space-y-4">
						<BatchQueueList
							items={items}
							isRunning={isRunning}
							onRemoveItem={(id) =>
								setItems((prev) => prev.filter((i) => i.id !== id))
							}
							onClear={() => {
								setItems([]);
								setDeliveredPaths({});
							}}
							onOpenItem={handleOpenItem}
							onRevealItem={handleRevealItem}
							getRevealTarget={(item) =>
								deliveredPaths[item.id] ?? item.output?.absPath ?? item.absPath
							}
						/>

						{summary.done > 0 && (
							<div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between flex-wrap gap-2">
								<div className="text-xs text-foreground">
									<span className="font-semibold">
										{summary.done}/{summary.total} 完成
									</span>
									{summary.failed > 0 && (
										<span className="text-red-500 ml-2">
											{summary.failed} 失败
										</span>
									)}
								</div>
								<div className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
									{formatBytes(summary.inputBytes)} →{" "}
									{formatBytes(summary.outputBytes)}（节省 {savingsPct}%）
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Bottom dock */}
			<footer className="p-3.5 px-6 border-t border-border bg-surface backdrop-blur-md shrink-0 flex items-center justify-between flex-wrap gap-3 z-10">
				<div className="text-xs text-muted truncate max-w-xl">
					纯前端本地压缩，图片不离开本机；原路径替换仅桌面端可用，覆盖前原文件自动进回收站
				</div>
				<div className="flex items-center gap-2.5">
					{hasDone && (
						<button
							type="button"
							onClick={handleDeliver}
							disabled={isRunning || isDelivering}
							className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-xs"
						>
							<Download className="w-3.5 h-3.5" />
							<span>
								{isDelivering ? "导出中..." : `导出图片 (${summary.done})`}
							</span>
						</button>
					)}
					<button
						type="button"
						onClick={handleRun}
						disabled={isRunning || items.length === 0}
						className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-xs"
					>
						{isRunning ? "处理中..." : `开始批量处理 (${items.length})`}
					</button>
				</div>
			</footer>
			{/* 导出向导弹窗：处理完成后选择输出方式并确认导出 */}
			<Modal.Backdrop
				isOpen={exportModalOpen}
				onOpenChange={(open) => !open && setExportModalOpen(false)}
				variant="blur"
			>
				<Modal.Container size="sm" className="w-full">
					<Modal.Dialog aria-label="导出图片" className="w-full max-w-md">
						<Modal.CloseTrigger />
						<Modal.Header>
							<div className="flex items-center gap-2">
								<div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center">
									<Download className="w-4 h-4" />
								</div>
								<Modal.Heading>导出图片</Modal.Heading>
							</div>
							<p className="text-[11px] text-muted mt-1.5">
								{summary.done} 个产物就绪 · {formatBytes(summary.inputBytes)} →{" "}
								{formatBytes(summary.outputBytes)}（节省 {savingsPct}%）
							</p>
						</Modal.Header>
						<Modal.Body className="flex flex-col gap-3 mt-1">
							<OutputModePicker
								bare
								mode={outputMode}
								onChange={setOutputMode}
								overwriteEnabled={overwriteEnabled}
								disabled={isDelivering}
							/>
							{outputMode === "overwrite" && (
								<div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] flex items-start gap-2">
									<AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
									<span>
										{isConverting
											? "已开启格式转换：产物会以新扩展名写入原目录（如 .png → .webp），原文件移入系统回收站，可随时恢复"
											: "将直接覆盖原文件，原文件会先移入系统回收站，可随时恢复"}
									</span>
								</div>
							)}
						</Modal.Body>
						<Modal.Footer className="flex items-center justify-end gap-2 border-t border-border pt-3">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-lg h-8 text-xs cursor-pointer"
								isDisabled={isDelivering}
								onPress={() => setExportModalOpen(false)}
							>
								取消
							</Button>
							<Button
								type="button"
								variant="primary"
								size="sm"
								className="rounded-lg h-8 px-4 text-xs cursor-pointer"
								isDisabled={isDelivering}
								onPress={() => {
									setExportModalOpen(false);
									void doDeliver();
								}}
							>
								{isDelivering
									? "导出中..."
									: outputMode === "overwrite"
										? "确认替换并导出"
										: outputMode === "new-directory"
											? "导出到新目录"
											: "打包下载"}
							</Button>
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</div>
	);
}
