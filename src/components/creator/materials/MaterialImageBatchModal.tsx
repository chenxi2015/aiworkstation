import { Button, Modal } from "@heroui/react";
import {
	AlertCircle,
	AlertTriangle,
	Download,
	Image as ImageIcon,
	Loader2,
	Minimize2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	openLocalPath,
	pickBatchOutputDirectory,
	revealLocalPath,
} from "../../../server/functions/batchOutputs";
import {
	resolveImageAssetsForBatch,
	syncMaterialAssetsAfterOverwrite,
} from "../../../server/functions/creatorMaterials";
import { BatchQueueList } from "../tools/batch/BatchQueueList";
import {
	compressImageItem,
	type ImageOutputFormat,
} from "../tools/batch/imageEngine";
import { OutputModePicker } from "../tools/batch/OutputModePicker";
import {
	canOverwriteInPlace,
	deliverBatchOutputs,
} from "../tools/batch/outputWriter";
import { runBatch } from "../tools/batch/runBatch";
import {
	type BatchItem,
	type OutputMode,
	summarizeBatch,
} from "../tools/batch/types";
import {
	type ParamValue,
	ToolParamForm,
} from "../tools/components/ToolParamForm";
import { IMAGE_TOOLS } from "../tools/registry/imageTools";
import type { Material } from "../types";
import { formatBytes } from "./utils";

/** 与工具箱「图片压缩与格式转换」共用同一份参数定义（压缩比 / 输出格式 / 最长边） */
const IMAGE_COMPRESS_PARAMS =
	IMAGE_TOOLS.find((t) => t.id === "image-compress")?.params ?? [];

interface MaterialImageBatchModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** 当前筛选范围内的图片素材（图片 tab 下的可见列表） */
	materials: Material[];
	/** 原路径替换写盘后刷新素材库 */
	onChanged: () => Promise<void>;
}

function sanitizeDirName(name: string): string {
	const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim();
	return cleaned || "未命名素材";
}

/**
 * 素材库图片批量处理弹窗：复用工具箱「图片压缩与格式转换」的批量引擎，
 * 对当前筛选范围内的图片素材做压缩/格式转换，支持原路径替换（同步素材记录）、
 * 保存到新目录与打包下载。
 */
export function MaterialImageBatchModal({
	isOpen,
	onClose,
	materials,
	onChanged,
}: MaterialImageBatchModalProps) {
	const [items, setItems] = useState<BatchItem[]>([]);
	const [assetIdByItemId, setAssetIdByItemId] = useState<
		Record<string, number>
	>({});
	const [resolving, setResolving] = useState(false);
	const [resolveNote, setResolveNote] = useState<string | null>(null);
	const [paramValues, setParamValues] = useState<Record<string, ParamValue>>(
		() => {
			const initial: Record<string, ParamValue> = {};
			IMAGE_COMPRESS_PARAMS.forEach((p) => {
				if (p.defaultValue !== undefined) initial[p.id] = p.defaultValue;
			});
			return initial;
		},
	);
	const [outputMode, setOutputMode] = useState<OutputMode>("overwrite");
	const [isRunning, setIsRunning] = useState(false);
	const [isDelivering, setIsDelivering] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const summary = useMemo(() => summarizeBatch(items), [items]);
	const isConverting = String(paramValues.format ?? "original") !== "original";
	const hasDone = summary.done > 0;
	const overwriteEnabled = items.length > 0 && canOverwriteInPlace(items);
	const busy = isRunning || isDelivering;

	// 打开时把当前范围内的图片素材解析为批量队列（按绝对路径懒加载内容）
	useEffect(() => {
		if (!isOpen) return;
		let cancelled = false;
		setResolving(true);
		setErrorMessage(null);
		setStatusMessage(null);
		setResolveNote(null);
		setItems([]);
		setAssetIdByItemId({});

		const materialIds = materials.map((m) => m.id);
		resolveImageAssetsForBatch({ data: { materialIds } })
			.then(({ entries, skipped }) => {
				if (cancelled) return;
				const usedRelPaths = new Set<string>();
				const nextItems: BatchItem[] = [];
				const nextMap: Record<string, number> = {};
				for (const entry of entries) {
					const dir = sanitizeDirName(entry.materialTitle);
					let rel = `${dir}/${entry.filename}`;
					if (usedRelPaths.has(rel.toLowerCase())) {
						const dot = entry.filename.lastIndexOf(".");
						const stem =
							dot > 0 ? entry.filename.slice(0, dot) : entry.filename;
						const ext = dot > 0 ? entry.filename.slice(dot) : "";
						rel = `${dir}/${stem}-${entry.assetId}${ext}`;
					}
					usedRelPaths.add(rel.toLowerCase());
					const itemId = `asset_${entry.assetId}`;
					nextMap[itemId] = entry.assetId;
					nextItems.push({
						id: itemId,
						absPath: entry.absPath,
						relativePath: rel,
						name: entry.filename,
						size: entry.sizeBytes,
						status: "pending",
						progress: 0,
					});
				}
				setItems(nextItems);
				setAssetIdByItemId(nextMap);
				if (entries.length === 0) {
					setResolveNote(
						"当前范围内没有可批量处理的图片（支持 JPG/PNG/WebP/GIF/BMP）",
					);
				} else if (skipped > 0) {
					setResolveNote(`${skipped} 个图片因文件缺失或格式不支持被跳过`);
				}
			})
			.catch((err) => {
				if (cancelled) return;
				setErrorMessage(
					err instanceof Error ? err.message : "读取素材图片失败",
				);
			})
			.finally(() => {
				if (!cancelled) setResolving(false);
			});
		return () => {
			cancelled = true;
		};
	}, [isOpen, materials]);

	const patchItem = useCallback((updated: BatchItem) => {
		setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
	}, []);

	const handleRun = async () => {
		if (items.length === 0) return;
		setIsRunning(true);
		setErrorMessage(null);
		setStatusMessage(null);
		abortRef.current = new AbortController();

		const quality = Number(paramValues.quality ?? 75) / 100;
		const format = String(
			paramValues.format ?? "original",
		) as ImageOutputFormat;
		const maxDimension = Number(paramValues.maxDimension ?? 0);

		const resetItems = items.map((i) => ({
			...i,
			status: "pending" as const,
			progress: 0,
			error: undefined,
			output: undefined,
		}));
		setItems(resetItems);

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

	const handleDeliver = async () => {
		if (!hasDone) {
			setErrorMessage("还没有处理完成的产物，请先执行批量处理");
			return;
		}
		setIsDelivering(true);
		setErrorMessage(null);
		setStatusMessage(null);
		try {
			let targetDir: string | undefined;
			if (outputMode === "new-directory") {
				try {
					const picked = await pickBatchOutputDirectory();
					if (!picked.path) {
						setIsDelivering(false);
						return;
					}
					targetDir = picked.path;
				} catch {
					targetDir = undefined;
				}
			}
			const result = await deliverBatchOutputs(items, outputMode, {
				outputDir: targetDir,
			});

			// 原路径替换：把写盘结果同步回素材资产记录（扩展名/体积可能已变化）
			if (outputMode === "overwrite" && result.paths) {
				const syncItems = Object.entries(result.paths).flatMap(
					([itemId, writtenPath]) => {
						const assetId = assetIdByItemId[itemId];
						const item = items.find((i) => i.id === itemId);
						if (!assetId || !item?.output) return [];
						return [
							{
								assetId,
								writtenPath,
								sizeBytes: item.output.size,
								mime: item.output.blob?.type ?? null,
							},
						];
					},
				);
				if (syncItems.length > 0) {
					await syncMaterialAssetsAfterOverwrite({
						data: { items: syncItems },
					});
					await onChanged();
				}
			}

			if (result.success) {
				setStatusMessage(
					outputMode === "overwrite"
						? `已原路径替换 ${summary.done} 张图片，素材库已同步更新`
						: `已导出 ${summary.done} 个产物到${result.destination ?? "目标位置"}`,
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
			if (item.output?.blob) {
				const url = URL.createObjectURL(item.output.blob);
				window.open(url, "_blank");
				setTimeout(() => URL.revokeObjectURL(url), 60_000);
				return;
			}
			if (item.absPath) {
				await openLocalPath({ data: { path: item.absPath } });
			}
		} catch (err) {
			setErrorMessage(
				`打开失败: ${err instanceof Error ? err.message : "未知错误"}`,
			);
		}
	};

	const handleRevealItem = async (item: BatchItem) => {
		setErrorMessage(null);
		const target = item.output?.absPath ?? item.absPath;
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
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full">
				<Modal.Dialog
					aria-label="批量处理图片"
					className="!max-w-3xl w-full max-h-[88vh] flex flex-col"
				>
					<Modal.CloseTrigger />
					<Modal.Header className="shrink-0">
						<div className="flex items-center gap-2">
							<div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center">
								<Minimize2 className="w-4 h-4" />
							</div>
							<Modal.Heading>批量处理图片</Modal.Heading>
							<span className="text-[11px] text-muted truncate max-w-64">
								{materials.length === 1
									? `素材「${materials[0].title}」· ${items.length} 张图片`
									: `当前范围 ${items.length} 张图片`}
							</span>
						</div>
						<p className="text-[11px] text-muted mt-1.5">
							与工具箱「图片压缩与格式转换」同一引擎，纯前端本地压缩，图片不离开本机
						</p>
					</Modal.Header>

					<Modal.Body className="flex-1 min-h-0 overflow-y-auto mt-1">
						{resolving ? (
							<div className="py-16 flex flex-col items-center gap-2 text-xs text-muted">
								<Loader2 className="w-5 h-5 animate-spin" />
								正在读取素材图片…
							</div>
						) : items.length === 0 ? (
							<div className="py-16 text-center text-xs text-muted">
								{resolveNote ?? "当前范围内没有可处理的图片"}
							</div>
						) : (
							<div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
								{/* 左列：参数 + 输出方式 */}
								<div className="space-y-4 md:col-span-2">
									{IMAGE_COMPRESS_PARAMS.length > 0 && (
										<ToolParamForm
											params={IMAGE_COMPRESS_PARAMS}
											values={paramValues}
											onChange={(id, value) =>
												setParamValues((prev) => ({ ...prev, [id]: value }))
											}
										/>
									)}
									<OutputModePicker
										mode={outputMode}
										onChange={setOutputMode}
										overwriteEnabled={overwriteEnabled}
										disabled={busy}
									/>
									{outputMode === "overwrite" && (
										<div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] flex items-start gap-2">
											<AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
											<span>
												{isConverting
													? "已开启格式转换：产物会以新扩展名写入原目录（如 .png → .webp），原文件移入系统回收站，素材库记录自动同步"
													: "将直接覆盖素材原文件，原文件会先移入系统回收站，可随时恢复"}
											</span>
										</div>
									)}
									{resolveNote && (
										<p className="text-[11px] text-muted">{resolveNote}</p>
									)}
								</div>

								{/* 右列：处理队列 */}
								<div className="space-y-3 min-w-0 md:col-span-3">
									<BatchQueueList
										items={items}
										isRunning={isRunning}
										onRemoveItem={(id) =>
											setItems((prev) => prev.filter((i) => i.id !== id))
										}
										onClear={() => setItems([])}
										onOpenItem={handleOpenItem}
										onRevealItem={handleRevealItem}
										getRevealTarget={(item) =>
											item.output?.absPath ?? item.absPath
										}
									/>
									{summary.done > 0 && (
										<div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between flex-wrap gap-2">
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
						)}

						{errorMessage && (
							<div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-[11px] flex items-start gap-2">
								<AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
								<span>{errorMessage}</span>
							</div>
						)}
						{statusMessage && !errorMessage && (
							<div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px]">
								{statusMessage}
							</div>
						)}
					</Modal.Body>

					<Modal.Footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 shrink-0">
						<span className="text-[11px] text-muted flex items-center gap-1.5 min-w-0">
							<ImageIcon className="w-3.5 h-3.5 shrink-0" />
							<span className="truncate">原路径替换会同步更新素材库记录</span>
						</span>
						<div className="flex flex-wrap items-center gap-2 shrink-0">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-lg h-8 text-xs cursor-pointer"
								isDisabled={busy}
								onPress={onClose}
							>
								关闭
							</Button>
							{hasDone && (
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="rounded-lg h-8 px-4 text-xs cursor-pointer flex items-center gap-1.5"
									isDisabled={busy}
									onPress={() => void handleDeliver()}
								>
									<Download className="w-3.5 h-3.5" />
									{isDelivering
										? "导出中..."
										: outputMode === "overwrite"
											? "确认替换并导出"
											: outputMode === "new-directory"
												? "导出到新目录"
												: `打包下载 (${summary.done})`}
								</Button>
							)}
							<Button
								type="button"
								variant={hasDone ? "secondary" : "primary"}
								size="sm"
								className="rounded-lg h-8 px-4 text-xs cursor-pointer"
								isDisabled={busy || items.length === 0 || resolving}
								onPress={() => void handleRun()}
							>
								{isRunning
									? "处理中..."
									: hasDone
										? "重新压缩"
										: `开始批量处理 (${items.length})`}
							</Button>
						</div>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
