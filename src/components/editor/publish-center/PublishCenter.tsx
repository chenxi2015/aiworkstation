import { Button, Drawer, toast } from "@heroui/react";
import { Loader2, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { ImagePreviewProvider } from "../../workbench/ai/shared/ImagePreviewModal";
import type { PublishPlatform } from "../types";
import { PublishPlatformTabs } from "./components/PublishPlatformTabs";
import { PlatformConfigForm } from "./PlatformConfigForm";
import {
	executePlatformPublish,
	type PublishContext,
} from "./publishDispatcher";
import {
	PLATFORM_METAS,
	type PlatformPublishConfig,
	type PlatformPublishResult,
} from "./types";
import { usePublishDraft } from "./usePublishDraft";

interface PublishCenterProps {
	isOpen: boolean;
	onClose: () => void;
	documentId: number;
	title: string;
	contentHtml: string;
	contentText: string;
	markdown: string;
}

/**
 * Unified Multi-Platform Publishing Center Modal.
 * Orchestrates platform configurations, visual asset selection, and multi-channel publication.
 */
export function PublishCenter({
	isOpen,
	onClose,
	documentId,
	title: initialTitle,
	contentHtml,
	contentText,
	markdown,
}: PublishCenterProps) {
	const {
		activePlatform,
		setActivePlatform,
		configs,
		accounts,
		isSavingDraft,
		handleUpdatePlatformConfig,
		handleTogglePlatformEnabled,
		handleSyncFromWechat,
		handleSaveDraft,
	} = usePublishDraft({
		isOpen,
		documentId,
		initialTitle,
		contentText,
	});

	const [isPublishing, setIsPublishing] = useState(false);
	const [results, setResults] = useState<
		Record<PublishPlatform, PlatformPublishResult>
	>({
		wechat: { platform: "wechat", status: "idle" },
		redbook: { platform: "redbook", status: "idle" },
		zhihu: { platform: "zhihu", status: "idle" },
		twitter: { platform: "twitter", status: "idle" },
	});

	// Reset execution results when opening drawer
	useEffect(() => {
		if (isOpen) {
			setResults({
				wechat: { platform: "wechat", status: "idle" },
				redbook: { platform: "redbook", status: "idle" },
				zhihu: { platform: "zhihu", status: "idle" },
				twitter: { platform: "twitter", status: "idle" },
			});
		}
	}, [isOpen]);

	// Confirm multi-platform publishing using Strategy Pattern
	const handleConfirmPublish = async () => {
		const activePlatforms = Object.entries(configs).filter(
			([platform, cfg]) =>
				cfg.enabled && PLATFORM_METAS.some((m) => m.id === platform),
		) as [PublishPlatform, PlatformPublishConfig][];

		if (activePlatforms.length === 0) {
			toast.warning("请至少勾选一个发布目标平台");
			return;
		}

		setIsPublishing(true);
		const nowTime = new Date().toLocaleTimeString("zh-CN", {
			hour: "2-digit",
			minute: "2-digit",
		});

		const context: PublishContext = {
			documentId,
			initialTitle,
			contentHtml,
			contentText,
			markdown,
			nowTime,
		};

		for (const [platform, cfg] of activePlatforms) {
			setResults((prev) => ({
				...prev,
				[platform]: { platform, status: "publishing", time: nowTime },
			}));

			const result = await executePlatformPublish(platform, cfg, context);

			setResults((prev) => ({
				...prev,
				[platform]: result,
			}));
		}

		setIsPublishing(false);
		toast.success("已完成所选平台的发布流程，请查看结果反馈");
	};

	// Close with silent auto-save
	const handleCloseWithSave = () => {
		handleSaveDraft(false);
		onClose();
	};

	const enabledCount = PLATFORM_METAS.filter(
		(m) => configs[m.id]?.enabled,
	).length;
	const currentMeta =
		PLATFORM_METAS.find((m) => m.id === activePlatform) || PLATFORM_METAS[0];
	const currentConfig =
		configs[currentMeta?.id || activePlatform] || configs.wechat;

	return (
		<ImagePreviewProvider>
			<Drawer.Backdrop
				isOpen={isOpen}
				onOpenChange={(open) => {
					if (!open) handleCloseWithSave();
				}}
				variant="blur"
				isDismissable
			>
				<Drawer.Content placement="right">
					<Drawer.Dialog className="h-full w-[94vw]! sm:w-[680px]! md:w-[740px]! bg-surface flex flex-col shadow-2xl border-l border-border">
						{/* Drawer Header */}
						<Drawer.Header className="flex flex-row items-center justify-between border-b border-border pb-3 shrink-0">
							<div className="flex items-center gap-2.5">
								<div className="w-8 h-8 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
									<Send className="w-4 h-4" />
								</div>
								<div>
									<div className="flex items-center gap-2">
										<Drawer.Heading className="font-semibold text-base text-foreground tracking-tight">
											一键发布
										</Drawer.Heading>
										<span
											className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium max-w-[200px] truncate"
											title={initialTitle}
										>
											{initialTitle || "未命名文档"}
										</span>
									</div>
									<p className="text-xs text-muted">
										各平台独立配置 · 灵活复用 · 多平台一键直发
									</p>
								</div>
							</div>
							<Drawer.CloseTrigger />
						</Drawer.Header>

						{/* Top Platform Tabs Bar */}
						<PublishPlatformTabs
							activePlatform={activePlatform}
							onSelectPlatform={setActivePlatform}
							configs={configs}
							onToggleEnabled={handleTogglePlatformEnabled}
							onSyncFromWechat={handleSyncFromWechat}
						/>

						{/* Drawer Body - Active Platform Configuration Form */}
						<Drawer.Body className="p-6 flex-1 overflow-y-auto">
							<PlatformConfigForm
								key={activePlatform}
								meta={currentMeta}
								config={currentConfig}
								onChangeConfig={(updater) =>
									handleUpdatePlatformConfig(activePlatform, updater)
								}
								contentText={contentText}
								accounts={accounts}
								result={results[activePlatform]}
								onRetry={handleConfirmPublish}
							/>
						</Drawer.Body>

						{/* Drawer Footer with Fixed Publish Action */}
						<Drawer.Footer className="border-t border-border pt-3.5 flex items-center justify-between shrink-0 bg-surface">
							<span className="text-xs text-muted">
								已选{" "}
								<span className="font-semibold text-foreground">
									{enabledCount}
								</span>{" "}
								个平台 · 基于各平台专属配置一键同步
							</span>

							<div className="flex items-center gap-2">
								<Button
									size="sm"
									variant="ghost"
									onPress={handleCloseWithSave}
									className="rounded-lg h-8 px-3 text-xs"
								>
									关闭
								</Button>
								<Button
									size="sm"
									variant="outline"
									isPending={isSavingDraft}
									onPress={() => handleSaveDraft(true)}
									className="rounded-lg h-8 px-3 text-xs text-foreground/80 hover:text-foreground border-border/80"
								>
									<Save className="w-3.5 h-3.5 mr-1 text-muted" />
									保存草稿
								</Button>
								<Button
									size="sm"
									variant="primary"
									isPending={isPublishing}
									isDisabled={enabledCount === 0 || isPublishing}
									onPress={handleConfirmPublish}
									className="rounded-lg h-8 px-5 text-xs font-semibold shadow-xs"
								>
									{isPublishing ? (
										<Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
									) : (
										<Send className="w-3.5 h-3.5 mr-1.5" />
									)}
									{isPublishing ? "正在发布中..." : "一键确认发布"}
								</Button>
							</div>
						</Drawer.Footer>
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</ImagePreviewProvider>
	);
}
