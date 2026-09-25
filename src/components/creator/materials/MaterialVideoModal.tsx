import { Button, Chip, Modal } from "@heroui/react";
import { FileVideo, FolderOpen, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Material } from "../types";
import { formatBytes, getAssetMediaUrl, getVideoAssets } from "./utils";

interface MaterialVideoModalProps {
	isOpen: boolean;
	material: Material | null;
	initialAssetId?: number | null;
	onClose: () => void;
	onOpenDir?: (material: Material) => void;
	onImportToStudio?: (material: Material) => void;
}

/**
 * Modal dialog for previewing and playing material videos
 */
export function MaterialVideoModal({
	isOpen,
	material,
	initialAssetId,
	onClose,
	onOpenDir,
	onImportToStudio,
}: MaterialVideoModalProps) {
	const videoAssets = useMemo(() => {
		if (!material) return [];
		return getVideoAssets(material);
	}, [material]);

	const [activeAssetId, setActiveAssetId] = useState<number | null>(null);

	// Reset or select initial video asset when modal opens or material changes
	useEffect(() => {
		if (!isOpen || videoAssets.length === 0) {
			setActiveAssetId(null);
			return;
		}
		if (initialAssetId && videoAssets.some((v) => v.id === initialAssetId)) {
			setActiveAssetId(initialAssetId);
		} else {
			setActiveAssetId(videoAssets[0].id);
		}
	}, [isOpen, initialAssetId, videoAssets]);

	if (!material) return null;

	const currentAsset =
		videoAssets.find((v) => v.id === activeAssetId) ?? videoAssets[0];
	const videoUrl = currentAsset ? getAssetMediaUrl(currentAsset) : null;

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full !max-w-3xl">
				<Modal.Dialog
					aria-label={`播放视频 - ${material.title}`}
					className="w-full flex flex-col bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden"
				>
					<Modal.CloseTrigger />

					<Modal.Header className="flex flex-col gap-1 pb-2">
						<div className="flex items-center gap-2 pr-6">
							<FileVideo className="w-5 h-5 text-accent shrink-0" />
							<Modal.Heading className="text-base font-semibold text-foreground truncate">
								{material.title}
							</Modal.Heading>
						</div>

						{/* Multi-video asset switcher tabs if more than one video */}
						{videoAssets.length > 1 && (
							<div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
								<span className="text-xs text-muted shrink-0 mr-1">
									切换视频:
								</span>
								{videoAssets.map((asset, index) => {
									const isSelected = (currentAsset?.id ?? -1) === asset.id;
									return (
										<button
											key={asset.id}
											type="button"
											onClick={() => setActiveAssetId(asset.id)}
											className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0 truncate max-w-[180px] ${
												isSelected
													? "bg-accent text-accent-foreground shadow-sm"
													: "bg-muted/10 text-muted hover:text-foreground hover:bg-muted/20"
											}`}
											title={asset.filename}
										>
											{asset.filename || `视频 ${index + 1}`}
										</button>
									);
								})}
							</div>
						)}
					</Modal.Header>

					<Modal.Body className="p-0 flex flex-col gap-2">
						{/* Video player area */}
						<div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
							{videoUrl ? (
								<video
									key={videoUrl}
									src={videoUrl}
									controls
									autoPlay
									playsInline
									preload="metadata"
									className="w-full h-full object-contain"
								>
									<track kind="captions" />
									您的浏览器不支持视频播放。
								</video>
							) : (
								<div className="text-xs text-muted flex flex-col items-center gap-2">
									<FileVideo className="w-8 h-8 opacity-50" />
									<span>暂无可播放的视频文件</span>
								</div>
							)}
						</div>

						{/* Video metadata information */}
						{currentAsset && (
							<div className="px-5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted border-t border-border/40 bg-muted/5">
								<div className="flex items-center gap-2 min-w-0">
									<span
										className="font-medium text-foreground truncate max-w-xs"
										title={currentAsset.filename}
									>
										{currentAsset.filename}
									</span>
									{currentAsset.sizeBytes && (
										<span className="font-mono text-[11px] text-muted/80">
											({formatBytes(currentAsset.sizeBytes)})
										</span>
									)}
								</div>

								<div className="flex items-center gap-2">
									<Chip
										size="sm"
										variant="soft"
										className="h-5 text-[10px] px-1.5"
									>
										{currentAsset.storageMode === "external"
											? "本地原位"
											: "应用托管"}
									</Chip>
									{currentAsset.sourcePath && (
										<span
											className="text-[11px] font-mono text-muted/70 truncate max-w-[200px]"
											title={currentAsset.sourcePath}
										>
											{currentAsset.sourcePath}
										</span>
									)}
								</div>
							</div>
						)}
					</Modal.Body>

					<Modal.Footer className="flex items-center justify-between border-t border-border pt-3">
						<div className="flex items-center gap-2">
							{onOpenDir && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="rounded-lg h-8 text-xs flex items-center gap-1.5 cursor-pointer text-muted hover:text-foreground"
									onPress={() => onOpenDir(material)}
								>
									<FolderOpen className="w-3.5 h-3.5" />
									打开所在目录
								</Button>
							)}
						</div>

						<div className="flex items-center gap-2">
							{onImportToStudio && (
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="rounded-lg h-8 text-xs flex items-center gap-1.5 cursor-pointer"
									onPress={() => {
										onClose();
										onImportToStudio(material);
									}}
								>
									<Sparkles className="w-3.5 h-3.5 text-accent" />
									导入创作台
								</Button>
							)}
							<Button
								type="button"
								variant="primary"
								size="sm"
								className="rounded-lg h-8 px-4 text-xs cursor-pointer"
								onPress={onClose}
							>
								关闭
							</Button>
						</div>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
