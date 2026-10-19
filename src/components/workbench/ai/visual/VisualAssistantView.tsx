import { toast } from "@heroui/react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { requestVisualImageGeneration } from "../../../../services/api/visualGenClient";
import { VisualHistoryStorageService } from "../../../../services/storage/visualHistoryStorage";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import type { PageBridge } from "../../../../types/pageBridge";
import type {
	VisualAspectRatio,
	VisualChatSession,
	VisualGenerationItem,
	VisualMediaType,
	VisualPendingRequest,
	VisualQuality,
	VisualResolution,
} from "../../../../types/visualGeneration";
import { VisualGenerationGallery } from "./VisualGenerationGallery";
import { VisualGenerationInputCard } from "./VisualGenerationInputCard";
import { VisualHistoryDrawer } from "./VisualHistoryDrawer";
import { VisualInputTopToolbar } from "./VisualInputTopToolbar";

export interface VisualAssistantViewRef {
	openHistory: () => void;
	newSession: () => void;
}

export interface VisualAssistantViewProps {
	pageBridge?: PageBridge | null;
	className?: string;
}

/**
 * Visual generation view sub-component.
 * Encapsulates image/video generation workflows, gallery display, and session history drawers.
 */
export const VisualAssistantView = forwardRef<
	VisualAssistantViewRef,
	VisualAssistantViewProps
>(function VisualAssistantView({ pageBridge, className = "" }, ref) {
	const [isVisualHistoryOpen, setIsVisualHistoryOpen] = useState(false);
	const [visualSessions, setVisualSessions] = useState<VisualChatSession[]>(
		() => VisualHistoryStorageService.getSessions(),
	);
	const [currentVisualSession, setCurrentVisualSession] =
		useState<VisualChatSession>(() =>
			VisualHistoryStorageService.getCurrentSession(),
		);
	const [isVisualGenerating, setIsVisualGenerating] = useState(false);
	const [pendingVisualRequest, setPendingVisualRequest] =
		useState<VisualPendingRequest | null>(null);
	const [visualExternalPrompt, setVisualExternalPrompt] = useState<string>("");
	const [currentVisualModel, setCurrentVisualModel] = useState<string>(() => {
		const s = WorkbenchStorageService.getSettings();
		return s.imageModel || "doubao-seed-image";
	});

	// Load visual sessions from SQLite database on mount and subscribe to updates
	useEffect(() => {
		let unmounted = false;
		VisualHistoryStorageService.initFromDb().then((sessions) => {
			if (!unmounted && sessions.length > 0) {
				setVisualSessions(sessions);
				setCurrentVisualSession(
					VisualHistoryStorageService.getCurrentSession(),
				);
			}
		});

		const unsubscribe = VisualHistoryStorageService.subscribe((sessions) => {
			if (!unmounted) {
				setVisualSessions(sessions);
				setCurrentVisualSession(
					VisualHistoryStorageService.getCurrentSession(),
				);
			}
		});

		return () => {
			unmounted = true;
			unsubscribe();
		};
	}, []);

	// Handle visual generation request (image or video)
	const handleGenerateVisual = async (payload: {
		prompt: string;
		mediaType: VisualMediaType;
		aspectRatio: string;
		resolution: string;
		quality?: VisualQuality;
		duration?: number;
		referenceImage?: string;
	}) => {
		setIsVisualGenerating(true);
		setPendingVisualRequest({
			id: `pending-${Date.now()}`,
			prompt: payload.prompt,
			mediaType: payload.mediaType,
			aspectRatio: payload.aspectRatio,
			resolution: payload.resolution,
			referenceImage: payload.referenceImage,
		});

		// Extract previous turn within current session for context linkage
		const lastTurn =
			currentVisualSession.items.length > 0
				? currentVisualSession.items[currentVisualSession.items.length - 1]
				: null;

		try {
			const res = await requestVisualImageGeneration({
				prompt: payload.prompt,
				previousPrompt: lastTurn?.prompt,
				mediaType: payload.mediaType,
				aspectRatio: payload.aspectRatio as VisualAspectRatio,
				resolution: payload.resolution as VisualResolution,
				quality: payload.quality,
				duration: payload.duration,
				referenceImage:
					payload.referenceImage || (lastTurn?.url ? lastTurn.url : undefined),
			});

			if (res.success && res.images.length > 0) {
				for (const img of res.images) {
					const item: VisualGenerationItem = {
						id: img.id,
						url: img.url,
						mediaType: payload.mediaType,
						prompt: res.prompt,
						userPrompt: payload.prompt,
						aspectRatio: img.aspectRatio,
						resolution: img.resolution,
						quality: img.quality,
						duration: img.duration,
						model: res.model,
						provider: res.provider,
						createdAt: Date.now(),
					};
					VisualHistoryStorageService.addItemToCurrentSession(item);
				}
				const updatedSession = VisualHistoryStorageService.getCurrentSession();
				setCurrentVisualSession(updatedSession);
				setVisualSessions(VisualHistoryStorageService.getSessions());
				toast.success(
					payload.mediaType === "video" ? "视频生成成功！" : "图像生成成功！",
				);
			} else {
				toast.danger(res.error || "生成失败，请检查多媒体模型配置");
			}
		} catch (err) {
			console.error("[VisualAssistantView] visual gen error:", err);
			toast.danger("生成请求异常，请检查网络或配置");
		} finally {
			setIsVisualGenerating(false);
			setPendingVisualRequest(null);
		}
	};

	const handleDeleteVisualItem = (id: string) => {
		const updated =
			VisualHistoryStorageService.removeItemFromCurrentSession(id);
		setCurrentVisualSession(updated);
		setVisualSessions(VisualHistoryStorageService.getSessions());
	};

	const handleDeleteVisualItems = (ids: Set<string>) => {
		const updated =
			VisualHistoryStorageService.removeItemsFromCurrentSession(ids);
		setCurrentVisualSession(updated);
		setVisualSessions(VisualHistoryStorageService.getSessions());
		toast.success(`已删除 ${ids.size} 条记录`);
	};

	const handleEditAndResendVisualItem = async (
		targetItem: VisualGenerationItem,
		newPrompt: string,
	) => {
		const trimmed = newPrompt.trim();
		if (!trimmed) return;
		if (isVisualGenerating) {
			toast.warning("正在生成中，请稍候...");
			return;
		}

		// Truncate current session to items before targetItem (matching text chat onEditAndResend)
		const currentItems = currentVisualSession.items;
		const targetIndex = currentItems.findIndex((it) => it.id === targetItem.id);
		const baseItems =
			targetIndex >= 0 ? currentItems.slice(0, targetIndex) : currentItems;

		const updatedSession: VisualChatSession = {
			...currentVisualSession,
			items: baseItems,
			updatedAt: Date.now(),
		};
		VisualHistoryStorageService.saveSession(updatedSession);
		setCurrentVisualSession(updatedSession);
		setVisualSessions(VisualHistoryStorageService.getSessions());

		// Trigger generation with edited prompt and original turn's media settings
		await handleGenerateVisual({
			prompt: trimmed,
			mediaType: targetItem.mediaType || "image",
			aspectRatio: targetItem.aspectRatio,
			resolution: targetItem.resolution,
			quality: targetItem.quality as VisualQuality | undefined,
			duration: targetItem.duration,
		});
	};

	const handleClearAllVisual = () => {
		VisualHistoryStorageService.clear();
		const updated = VisualHistoryStorageService.getCurrentSession();
		setCurrentVisualSession(updated);
		setVisualSessions(VisualHistoryStorageService.getSessions());
		toast.info("已清空当前视觉对话的生图记录");
	};

	const handleSelectVisualSession = (session: VisualChatSession) => {
		const target = VisualHistoryStorageService.switchSession(session.id);
		if (target) {
			setCurrentVisualSession(target);
			setVisualSessions(VisualHistoryStorageService.getSessions());
		}
	};

	const handleNewVisualChat = () => {
		const newSession = VisualHistoryStorageService.createSession();
		setCurrentVisualSession(newSession);
		setVisualSessions(VisualHistoryStorageService.getSessions());
		setVisualExternalPrompt("");
		toast.success("已开启新视觉对话");
	};

	const handleDeleteVisualSession = (sessionId: string) => {
		const nextSession = VisualHistoryStorageService.deleteSession(sessionId);
		setCurrentVisualSession(nextSession);
		setVisualSessions(VisualHistoryStorageService.getSessions());
		toast.success("已删除该视觉对话");
	};

	const handleClearAllVisualSessions = () => {
		const newSession = VisualHistoryStorageService.clearAllSessions();
		setCurrentVisualSession(newSession);
		setVisualSessions(VisualHistoryStorageService.getSessions());
		toast.success("已清空所有视觉对话历史");
	};

	const handleExportAllVisualSessions = () => {
		try {
			VisualHistoryStorageService.exportAllSessionsToJson();
			toast.success("已成功导出所有视觉对话记录");
		} catch (err) {
			console.error(
				"[VisualAssistantView] Failed to export visual sessions:",
				err,
			);
			toast.danger("导出视觉对话记录失败");
		}
	};

	const handleExportVisualSession = (session: VisualChatSession) => {
		try {
			VisualHistoryStorageService.exportSessionToJson(session);
			toast.success(`已导出「${session.title || "视觉创作"}」`);
		} catch (err) {
			console.error(
				"[VisualAssistantView] Failed to export single visual session:",
				err,
			);
			toast.danger("导出单条视觉对话失败");
		}
	};

	// Expose controls to parent components
	useImperativeHandle(ref, () => ({
		openHistory: () => setIsVisualHistoryOpen(true),
		newSession: handleNewVisualChat,
	}));

	return (
		<div
			className={`flex-1 min-h-0 flex flex-col justify-between relative ${className}`}
		>
			{/* Visual Generation History Gallery */}
			<VisualGenerationGallery
				items={currentVisualSession.items}
				pendingRequest={pendingVisualRequest}
				pageBridge={pageBridge}
				onDeleteItem={handleDeleteVisualItem}
				onDeleteItems={handleDeleteVisualItems}
				onEditAndResend={handleEditAndResendVisualItem}
				onClearAll={handleClearAllVisual}
				onSelectPrompt={(p) => setVisualExternalPrompt(p)}
			/>

			{/* Bottom Visual Input Area with Top Toolbar and Footer Hints */}
			<div className="p-3 bg-surface/50 backdrop-blur-xs shrink-0 flex flex-col gap-2 relative z-10 border-t border-border/40">
				<VisualInputTopToolbar
					currentModel={currentVisualModel}
					onModelChange={(model) => setCurrentVisualModel(model)}
					onOpenHistory={() => setIsVisualHistoryOpen(true)}
					onNewChat={handleNewVisualChat}
				/>
				<VisualGenerationInputCard
					isGenerating={isVisualGenerating}
					externalPrompt={visualExternalPrompt}
					onGenerate={handleGenerateVisual}
				/>
				{/* Footer Hints */}
				<div className="flex items-center justify-between px-1 text-[10px] text-muted/70">
					<span>支持以图生图与图生视频 · Enter 发送</span>
					<span className="hidden sm:inline truncate max-w-[200px]">
						多模态视觉模型驱动
					</span>
				</div>
			</div>

			{/* Visual History Drawer */}
			<VisualHistoryDrawer
				isOpen={isVisualHistoryOpen}
				sessions={visualSessions}
				currentSessionId={currentVisualSession.id}
				onClose={() => setIsVisualHistoryOpen(false)}
				onSelectSession={handleSelectVisualSession}
				onNewSession={handleNewVisualChat}
				onDeleteSession={handleDeleteVisualSession}
				onClearAllSessions={handleClearAllVisualSessions}
				onExportAll={handleExportAllVisualSessions}
				onExportSession={handleExportVisualSession}
			/>
		</div>
	);
});
