import { Button, Checkbox, Drawer, Tooltip, toast } from "@heroui/react";
import {
	Loader2,
	RefreshCw,
	Save,
	Send,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	fetchDocumentPublishDraft,
	fetchPlatformAccounts,
	persistDocumentPublishDraft,
	publishToWechat,
} from "../../../services/api/publishClient";
import type { PlatformAccountInfo, PublishPlatform } from "../types";
import { PlatformConfigForm } from "./PlatformConfigForm";
import {
	copyRedbookText,
	copyTwitterText,
	copyZhihuMarkdown,
} from "./clipboardChannels";
import { ImagePreviewProvider } from "../../workbench/ai/shared/ImagePreviewModal";
import {
	type CoverItem,
	PLATFORM_METAS,
	type PlatformPublishConfig,
	type PlatformPublishResult,
	type PublishCenterDraft,
} from "./types";
import { prepareWechatContent } from "./wechatFormatter";

interface PublishCenterProps {
	isOpen: boolean;
	onClose: () => void;
	documentId: number;
	title: string;
	contentHtml: string;
	contentText: string;
	markdown: string;
}

const getDraftKey = (docId: number) => `publish_center_draft_v2_${docId}`;

const saveDraftToStorage = (docId: number, data: PublishCenterDraft) => {
	try {
		localStorage.setItem(
			getDraftKey(docId),
			JSON.stringify({ ...data, docId }),
		);
	} catch (err) {
		console.warn("[PublishCenter] save draft cache error:", err);
	}
};

const loadDraftFromStorage = (docId: number): PublishCenterDraft | null => {
	try {
		const raw = localStorage.getItem(getDraftKey(docId));
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed && (!parsed.docId || parsed.docId === docId)) {
			return parsed;
		}
		return null;
	} catch (err) {
		console.warn("[PublishCenter] load draft cache error:", err);
		return null;
	}
};

/**
 * Creates default configuration dictionary for all supported platforms.
 */
function createDefaultConfigs(
	initialTitle: string,
	contentText: string,
	defaultAccountId: number | null,
): Record<PublishPlatform, PlatformPublishConfig> {
	const baseTitle = initialTitle || "未命名文章";
	const baseDigest = contentText.slice(0, 100).trim();

	return {
		wechat: {
			enabled: true,
			title: baseTitle,
			tags: [],
			author: "AI Workstation",
			digest: baseDigest,
			covers: [],
			selectedCoverIndex: 0,
			accountId: defaultAccountId,
		},
		redbook: {
			enabled: true,
			title: baseTitle.slice(0, 20),
			tags: [],
			author: "AI Workstation",
			digest: "",
			covers: [],
			selectedCoverIndex: 0,
		},
		zhihu: {
			enabled: false,
			title: baseTitle,
			tags: [],
			author: "AI Workstation",
			digest: baseDigest,
			covers: [],
			selectedCoverIndex: 0,
		},
		twitter: {
			enabled: false,
			title: baseTitle,
			tags: [],
			author: "AI Workstation",
			digest: "",
			covers: [],
			selectedCoverIndex: 0,
		},
	};
}

export function PublishCenter({
	isOpen,
	onClose,
	documentId,
	title: initialTitle,
	contentHtml,
	contentText,
	markdown,
}: PublishCenterProps) {
	// Active platform tab
	const [activePlatform, setActivePlatform] = useState<PublishPlatform>("wechat");

	// Multi-platform independent configurations
	const [configs, setConfigs] = useState<Record<PublishPlatform, PlatformPublishConfig>>(() =>
		createDefaultConfigs(initialTitle, contentText, null),
	);

	// Accounts and status states
	const [accounts, setAccounts] = useState<PlatformAccountInfo[]>([]);
	const [isPublishing, setIsPublishing] = useState(false);
	const [isSavingDraft, setIsSavingDraft] = useState(false);

	// Publishing results tracking
	const [results, setResults] = useState<Record<PublishPlatform, PlatformPublishResult>>({
		wechat: { platform: "wechat", status: "idle" },
		redbook: { platform: "redbook", status: "idle" },
		zhihu: { platform: "zhihu", status: "idle" },
		twitter: { platform: "twitter", status: "idle" },
	});

	// Apply draft data with smooth backward compatibility
	const applyDraft = (draft: PublishCenterDraft) => {
		if (draft.version === 2 && draft.platforms) {
			setConfigs(draft.platforms);
			if (draft.activePlatform) setActivePlatform(draft.activePlatform);
			return;
		}

		// Backward compatibility for legacy v1 drafts
		const legacyCovers: CoverItem[] = (draft.covers || []).filter(
			(c) => Boolean(c?.url?.trim()) && !c.id?.startsWith("template-cover-"),
		);
		const legacySelectedPlatforms = draft.selectedPlatforms || {
			wechat: true,
			redbook: true,
			zhihu: false,
			twitter: false,
		};

		const upgraded: Record<PublishPlatform, PlatformPublishConfig> = {
			wechat: {
				enabled: Boolean(legacySelectedPlatforms.wechat),
				title: draft.publishTitle || initialTitle || "未命名文章",
				tags: draft.tags || [],
				author: draft.author || "AI Workstation",
				digest: draft.digest || contentText.slice(0, 100).trim(),
				covers: legacyCovers,
				selectedCoverIndex: draft.selectedCoverIndex ?? 0,
				accountId: draft.accountId ?? null,
			},
			redbook: {
				enabled: Boolean(legacySelectedPlatforms.redbook),
				title: (draft.publishTitle || initialTitle || "未命名文章").slice(0, 20),
				tags: draft.tags || [],
				author: draft.author || "AI Workstation",
				digest: "",
				covers: legacyCovers,
				selectedCoverIndex: draft.selectedCoverIndex ?? 0,
			},
			zhihu: {
				enabled: Boolean(legacySelectedPlatforms.zhihu),
				title: draft.publishTitle || initialTitle || "未命名文章",
				tags: draft.tags || [],
				author: draft.author || "AI Workstation",
				digest: draft.digest || contentText.slice(0, 100).trim(),
				covers: legacyCovers,
				selectedCoverIndex: draft.selectedCoverIndex ?? 0,
			},
			twitter: {
				enabled: Boolean(legacySelectedPlatforms.twitter),
				title: draft.publishTitle || initialTitle || "未命名文章",
				tags: draft.tags || [],
				author: draft.author || "AI Workstation",
				digest: "",
				covers: legacyCovers,
				selectedCoverIndex: draft.selectedCoverIndex ?? 0,
			},
		};

		setConfigs(upgraded);
	};

	// Reset state when opening clean document
	const resetCleanState = (wechatAccountId: number | null) => {
		setConfigs(createDefaultConfigs(initialTitle, contentText, wechatAccountId));
		setActivePlatform("wechat");
	};

	// Synchronize on drawer open
	useEffect(() => {
		if (isOpen) {
			let defaultAccId: number | null = null;

			// Fetch accounts
			fetchPlatformAccounts().then((all) => {
				const wechat = all.filter(
					(a) => a.platform === "wechat-mp" && a.status === "active",
				);
				setAccounts(wechat);
				if (wechat.length > 0) {
					defaultAccId = wechat[0].id;
					setConfigs((prev) => ({
						...prev,
						wechat: {
							...prev.wechat,
							accountId: prev.wechat.accountId ?? defaultAccId,
						},
					}));
				}
			});

			// Restore from local cache first
			const localDraft = loadDraftFromStorage(documentId);
			if (localDraft) {
				applyDraft(localDraft);
			} else {
				resetCleanState(defaultAccId);
			}

			// Restore from SQLite backend database
			fetchDocumentPublishDraft(documentId).then((dbDraftJson) => {
				if (dbDraftJson) {
					try {
						const dbDraft = JSON.parse(dbDraftJson) as PublishCenterDraft;
						if (dbDraft && (!dbDraft.docId || dbDraft.docId === documentId)) {
							applyDraft(dbDraft);
							saveDraftToStorage(documentId, { ...dbDraft, docId: documentId, version: 2 });
						}
					} catch (e) {
						console.warn("[PublishCenter] parse database draft error:", e);
					}
				}
			});

			// Reset results
			setResults({
				wechat: { platform: "wechat", status: "idle" },
				redbook: { platform: "redbook", status: "idle" },
				zhihu: { platform: "zhihu", status: "idle" },
				twitter: { platform: "twitter", status: "idle" },
			});
		}
	}, [isOpen, documentId, initialTitle, contentText]);

	// Update specific platform config
	const handleUpdatePlatformConfig = (
		platform: PublishPlatform,
		updater: (prev: PlatformPublishConfig) => PlatformPublishConfig,
	) => {
		setConfigs((prev) => ({
			...prev,
			[platform]: updater(prev[platform]),
		}));
	};

	// Toggle platform enabled for publishing
	const handleTogglePlatformEnabled = (platform: PublishPlatform, e?: React.MouseEvent) => {
		e?.stopPropagation();
		setConfigs((prev) => ({
			...prev,
			[platform]: {
				...prev[platform],
				enabled: !prev[platform].enabled,
			},
		}));
	};

	// Sync content from WeChat platform to current target platform
	const handleSyncFromWechat = (target: PublishPlatform) => {
		const wechatConfig = configs.wechat;
		setConfigs((prev) => {
			const targetMeta = PLATFORM_METAS.find((m) => m.id === target);
			const titleLimit = targetMeta?.titleMaxLength ?? 100;
			return {
				...prev,
				[target]: {
					...prev[target],
					title: wechatConfig.title.slice(0, titleLimit),
					tags: [...wechatConfig.tags],
					author: wechatConfig.author,
					digest: wechatConfig.digest,
					covers: [...wechatConfig.covers],
					selectedCoverIndex: wechatConfig.selectedCoverIndex,
				},
			};
		});
		toast.success(`已从微信公众号同步标题、标签与封面至【${PLATFORM_METAS.find((m) => m.id === target)?.name}】`);
	};

	// Confirm multi-platform publishing
	const handleConfirmPublish = async () => {
		const activePlatforms = Object.entries(configs).filter(
			([_, cfg]) => cfg.enabled,
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

		for (const [platform, cfg] of activePlatforms) {
			setResults((prev) => ({
				...prev,
				[platform]: { platform, status: "publishing", time: nowTime },
			}));

			const selectedCover = cfg.covers[cfg.selectedCoverIndex]?.url || "";

			// 1. WeChat Official Account
			if (platform === "wechat") {
				if (!cfg.accountId) {
					setResults((prev) => ({
						...prev,
						wechat: {
							platform: "wechat",
							status: "error",
							message: "发布失败：未选择公众号账号，请在设置中心绑定",
							time: nowTime,
						},
					}));
					continue;
				}
				if (!selectedCover) {
					setResults((prev) => ({
						...prev,
						wechat: {
							platform: "wechat",
							status: "error",
							message: "发布失败：请先生成或选择一张封面图",
							time: nowTime,
						},
					}));
					continue;
				}

				try {
					const preparedContentHtml = await prepareWechatContent(contentHtml);
					const record = await publishToWechat({
						documentId,
						accountId: cfg.accountId,
						title: cfg.title,
						author: cfg.author.trim() || "AI Workstation",
						digest: cfg.digest.trim(),
						contentHtml: preparedContentHtml,
						coverImageDataUrl: selectedCover,
						tags: cfg.tags,
						publishMode: "draft",
						confirmed: true,
					});

					setResults((prev) => ({
						...prev,
						wechat: {
							platform: "wechat",
							status: "success",
							message: record.platformUrl
								? "已成功正式发布到微信公众号"
								: "已成功推送到微信公众号草稿箱",
							url: record.platformUrl || undefined,
							time: nowTime,
						},
					}));
				} catch (err) {
					setResults((prev) => ({
						...prev,
						wechat: {
							platform: "wechat",
							status: "error",
							message: `发布失败：${err instanceof Error ? err.message : String(err)}`,
							time: nowTime,
						},
					}));
				}
			}

			// 2. RedBook Publish Package
			if (platform === "redbook") {
				try {
					await copyRedbookText({
						title: cfg.title.slice(0, 20),
						body: contentText.slice(0, 1000),
						topics: cfg.tags.slice(0, 6),
					});
					setResults((prev) => ({
						...prev,
						redbook: {
							platform: "redbook",
							status: "success",
							message: "小红书图文文案与标签话题已复制到剪贴板，封面已就绪",
							time: nowTime,
						},
					}));
				} catch (err) {
					setResults((prev) => ({
						...prev,
						redbook: {
							platform: "redbook",
							status: "error",
							message: `处理失败：${err instanceof Error ? err.message : String(err)}`,
							time: nowTime,
						},
					}));
				}
			}

			// 3. Zhihu Publish Package
			if (platform === "zhihu") {
				try {
					await copyZhihuMarkdown(
						{
							title: cfg.title,
							intro: cfg.digest || contentText.slice(0, 100),
						},
						markdown,
					);
					setResults((prev) => ({
						...prev,
						zhihu: {
							platform: "zhihu",
							status: "success",
							message: "知乎专栏 Markdown 内容已复制到剪贴板",
							time: nowTime,
						},
					}));
				} catch (err) {
					setResults((prev) => ({
						...prev,
						zhihu: {
							platform: "zhihu",
							status: "error",
							message: `处理失败：${err instanceof Error ? err.message : String(err)}`,
							time: nowTime,
						},
					}));
				}
			}

			// 4. X (Twitter) Publish Package
			if (platform === "twitter") {
				try {
					const tweetText = `${cfg.title}\n\n${contentText.slice(0, 180)}...\n\n${cfg.tags.map((t) => `#${t}`).join(" ")}`;
					await copyTwitterText({
						text: tweetText.slice(0, 260),
					});
					setResults((prev) => ({
						...prev,
						twitter: {
							platform: "twitter",
							status: "success",
							message: "推文短文案已复制到剪贴板",
							time: nowTime,
						},
					}));
				} catch (err) {
					setResults((prev) => ({
						...prev,
						twitter: {
							platform: "twitter",
							status: "error",
							message: `处理失败：${err instanceof Error ? err.message : String(err)}`,
							time: nowTime,
						},
					}));
				}
			}
		}

		setIsPublishing(false);
		toast.success("已完成所选平台的发布流程，请查看结果反馈");
	};

	// Save draft to storage and database
	const handleSaveDraft = async (showToast = true) => {
		const draftData: PublishCenterDraft = {
			docId: documentId,
			version: 2,
			activePlatform,
			platforms: configs,
			updatedAt: Date.now(),
		};

		saveDraftToStorage(documentId, draftData);

		if (showToast) setIsSavingDraft(true);
		try {
			const ok = await persistDocumentPublishDraft(
				documentId,
				JSON.stringify(draftData),
			);
			if (showToast) {
				if (ok) {
					toast.success("各平台独立草稿已保存到数据库");
				} else {
					toast.success("草稿已保存到本地缓存");
				}
			}
		} catch (err) {
			console.warn("[PublishCenter] save draft error:", err);
			if (showToast) toast.success("草稿已保存到本地缓存");
		} finally {
			if (showToast) setIsSavingDraft(false);
		}
	};

	// Close with silent auto-save
	const handleCloseWithSave = () => {
		handleSaveDraft(false);
		onClose();
	};

	const enabledCount = Object.values(configs).filter((c) => c.enabled).length;
	const currentMeta = PLATFORM_METAS.find((m) => m.id === activePlatform)!;
	const currentConfig = configs[activePlatform];

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
					<div className="border-b border-border bg-surface-secondary/30 px-5 pt-3 pb-2.5 shrink-0">
						<div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
							<div className="flex items-center gap-1.5 min-w-0">
								{PLATFORM_METAS.map((meta) => {
									const isCurrent = activePlatform === meta.id;
									const isEnabled = configs[meta.id].enabled;

									return (
										<div
											key={meta.id}
											onClick={() => setActivePlatform(meta.id)}
											className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all select-none border ${
												isCurrent
													? "bg-surface text-foreground border-accent shadow-xs ring-1 ring-accent/20"
													: "bg-surface/50 text-muted hover:text-foreground hover:bg-surface border-border/80"
											}`}
										>
											{/* Platform Publish Checkbox */}
											<div onClick={(e) => handleTogglePlatformEnabled(meta.id, e)}>
												<Checkbox
													isSelected={isEnabled}
													onChange={() => handleTogglePlatformEnabled(meta.id)}
													aria-label={`发布到 ${meta.name}`}
													variant="secondary"
												>
													<Checkbox.Content>
														<Checkbox.Control>
															<Checkbox.Indicator />
														</Checkbox.Control>
													</Checkbox.Content>
												</Checkbox>
											</div>

											{/* Icon & Label */}
											<div className="w-4 h-4 rounded shrink-0 overflow-hidden flex items-center justify-center">
												<img
													src={meta.iconPath}
													alt={meta.name}
													className="w-full h-full object-contain"
												/>
											</div>
											<span className="truncate">{meta.name}</span>

											{/* Enabled dot indicator */}
											{isEnabled && (
												<span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
											)}
										</div>
									);
								})}
							</div>

							{/* Quick sync button for non-wechat platforms */}
							{activePlatform !== "wechat" && (
								<Tooltip>
									<Tooltip.Trigger>
										<Button
											size="sm"
											variant="ghost"
											onPress={() => handleSyncFromWechat(activePlatform)}
											className="h-7 px-2 text-[11px] font-medium text-accent hover:bg-accent/10 rounded-lg shrink-0"
										>
											<RefreshCw className="w-3 h-3 mr-1" />
											从公众号同步
										</Button>
									</Tooltip.Trigger>
									<Tooltip.Content className="text-xs py-1 px-2">
										复用微信公众号设置的标题、标签与封面
									</Tooltip.Content>
								</Tooltip>
							)}
						</div>
					</div>

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
