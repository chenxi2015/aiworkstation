import { Button, Modal } from "@heroui/react";
import { ExternalLink, FileAudio, Headphones } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Material } from "../types";
import { formatBytes, getAssetMediaUrl, getAudioAssets } from "./utils";

interface MaterialAudioModalProps {
	isOpen: boolean;
	material: Material | null;
	onClose: () => void;
}

/**
 * 素材库音频预览弹窗：多音频可切换，极简播放器 + 元信息。
 */
export function MaterialAudioModal({
	isOpen,
	material,
	onClose,
}: MaterialAudioModalProps) {
	const audioAssets = useMemo(() => {
		if (!material) return [];
		return getAudioAssets(material);
	}, [material]);

	const [activeAssetId, setActiveAssetId] = useState<number | null>(null);

	// Reset or select initial audio asset when modal opens or material changes
	useEffect(() => {
		if (!isOpen || audioAssets.length === 0) {
			setActiveAssetId(null);
			return;
		}
		setActiveAssetId(audioAssets[0].id);
	}, [isOpen, audioAssets]);

	if (!material) return null;

	const currentAsset =
		audioAssets.find((a) => a.id === activeAssetId) ?? audioAssets[0];
	const audioUrl = currentAsset ? getAssetMediaUrl(currentAsset) : null;

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && onClose()}
			variant="blur"
		>
			<Modal.Container size="lg" className="w-full !max-w-xl">
				<Modal.Dialog
					aria-label={`播放音频 - ${material.title}`}
					className="w-full flex flex-col bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden"
				>
					<Modal.CloseTrigger />

					<Modal.Header className="flex flex-col gap-1 pb-2">
						<div className="flex items-center gap-2 pr-6 min-w-0">
							<Headphones className="w-5 h-5 text-accent shrink-0" />
							<Modal.Heading className="text-base font-semibold text-foreground truncate">
								{material.title}
							</Modal.Heading>
						</div>

						{audioAssets.length > 1 && (
							<div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
								<span className="text-xs text-muted shrink-0 mr-1">
									切换音频:
								</span>
								{audioAssets.map((asset, index) => {
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
											{asset.filename || `音频 ${index + 1}`}
										</button>
									);
								})}
							</div>
						)}
					</Modal.Header>

					<Modal.Body className="flex flex-col gap-3 pt-1">
						{/* Audio player card */}
						<div className="w-full rounded-xl border border-border/60 bg-surface-secondary/40 px-4 py-5 flex items-center gap-3">
							<div className="shrink-0 w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
								<FileAudio className="w-4 h-4 text-accent" />
							</div>
							<div className="flex-1 min-w-0">
								{audioUrl ? (
									// biome-ignore lint/a11y/useMediaCaption: 素材库音频预览无字幕轨
									<audio
										key={audioUrl}
										src={audioUrl}
										controls
										autoPlay
										preload="metadata"
										className="w-full h-9"
									/>
								) : (
									<div className="text-xs text-muted flex items-center gap-2">
										<FileAudio className="w-4 h-4 opacity-50" />
										<span>暂无可播放的音频文件</span>
									</div>
								)}
							</div>
						</div>

						{currentAsset && (
							<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted px-1">
								<div className="flex items-center gap-2 min-w-0">
									<span
										className="font-medium text-foreground truncate max-w-xs"
										title={currentAsset.filename}
									>
										{currentAsset.filename}
									</span>
									{currentAsset.sizeBytes ? (
										<span className="font-mono text-[11px] text-muted/80">
											({formatBytes(currentAsset.sizeBytes)})
										</span>
									) : null}
								</div>
								{audioUrl && (
									<a
										href={audioUrl}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/10"
										title="新窗口打开音频"
									>
										<ExternalLink className="w-3 h-3" />
										原文件
									</a>
								)}
							</div>
						)}
					</Modal.Body>

					<Modal.Footer className="flex items-center justify-end border-t border-border pt-3">
						<Button
							type="button"
							variant="primary"
							size="sm"
							className="rounded-lg h-8 px-4 text-xs cursor-pointer"
							onPress={onClose}
						>
							关闭
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
