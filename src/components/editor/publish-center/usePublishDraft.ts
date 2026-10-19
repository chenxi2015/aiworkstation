import { toast } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import {
	fetchDocumentPublishDraft,
	fetchPlatformAccounts,
	persistDocumentPublishDraft,
} from "../../../services/api/publishClient";
import type { PlatformAccountInfo, PublishPlatform } from "../types";
import {
	type CoverItem,
	PLATFORM_METAS,
	type PlatformPublishConfig,
	type PublishCenterDraft,
} from "./types";

const getDraftKey = (docId: number) => `publish_center_draft_v2_${docId}`;

const saveDraftToStorage = (docId: number, data: PublishCenterDraft) => {
	try {
		localStorage.setItem(
			getDraftKey(docId),
			JSON.stringify({ ...data, docId }),
		);
	} catch (err) {
		console.warn("[usePublishDraft] save draft cache error:", err);
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
		console.warn("[usePublishDraft] load draft cache error:", err);
		return null;
	}
};

/**
 * Creates default configuration dictionary for all supported platforms.
 */
export function createDefaultConfigs(
	initialTitle: string,
	contentText: string,
	defaultAccountId: number | null,
): Record<PublishPlatform, PlatformPublishConfig> {
	const baseTitle = initialTitle || "未命名文章";
	const baseDigest = contentText.slice(0, 100).trim();
	const redbookDigest = contentText.slice(0, 1000).trim();

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
			author: "",
			digest: redbookDigest,
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

interface UsePublishDraftProps {
	isOpen: boolean;
	documentId: number;
	initialTitle: string;
	contentText: string;
}

/**
 * Custom Hook managing multi-platform publishing draft state and persistence.
 */
export function usePublishDraft({
	isOpen,
	documentId,
	initialTitle,
	contentText,
}: UsePublishDraftProps) {
	const [activePlatform, setActivePlatform] =
		useState<PublishPlatform>("wechat");
	const [configs, setConfigs] = useState<
		Record<PublishPlatform, PlatformPublishConfig>
	>(() => createDefaultConfigs(initialTitle, contentText, null));
	const [accounts, setAccounts] = useState<PlatformAccountInfo[]>([]);
	const [isSavingDraft, setIsSavingDraft] = useState(false);

	// Apply draft data with backward compatibility
	const applyDraft = useCallback(
		(draft: PublishCenterDraft) => {
			if (draft.version === 2 && draft.platforms) {
				setConfigs(draft.platforms);
				if (
					draft.activePlatform &&
					PLATFORM_METAS.some((m) => m.id === draft.activePlatform)
				) {
					setActivePlatform(draft.activePlatform);
				} else {
					setActivePlatform(PLATFORM_METAS[0]?.id || "wechat");
				}
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
					title: (draft.publishTitle || initialTitle || "未命名文章").slice(
						0,
						20,
					),
					tags: draft.tags || [],
					author: "",
					digest: draft.digest || contentText.slice(0, 1000).trim(),
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
		},
		[initialTitle, contentText],
	);

	// Reset state when opening clean document
	const resetCleanState = useCallback(
		(wechatAccountId: number | null) => {
			setConfigs(
				createDefaultConfigs(initialTitle, contentText, wechatAccountId),
			);
			setActivePlatform("wechat");
		},
		[initialTitle, contentText],
	);

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
							saveDraftToStorage(documentId, {
								...dbDraft,
								docId: documentId,
								version: 2,
							});
						}
					} catch (e) {
						console.warn("[usePublishDraft] parse database draft error:", e);
					}
				}
			});
		}
	}, [isOpen, documentId, applyDraft, resetCleanState]);

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
	const handleTogglePlatformEnabled = (
		platform: PublishPlatform,
		e?: React.MouseEvent,
	) => {
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
			const digestLimit = targetMeta?.digestMaxLength ?? 1000;
			return {
				...prev,
				[target]: {
					...prev[target],
					title: wechatConfig.title.slice(0, titleLimit),
					tags: [...wechatConfig.tags],
					author:
						targetMeta?.isAuthorSupported !== false ? wechatConfig.author : "",
					digest: wechatConfig.digest.slice(0, digestLimit),
					covers: [...wechatConfig.covers],
					selectedCoverIndex: wechatConfig.selectedCoverIndex,
				},
			};
		});
		toast.success(
			`已从微信公众号同步标题、标签与封面至【${PLATFORM_METAS.find((m) => m.id === target)?.name}】`,
		);
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
			console.warn("[usePublishDraft] save draft error:", err);
			if (showToast) toast.success("草稿已保存到本地缓存");
		} finally {
			if (showToast) setIsSavingDraft(false);
		}
	};

	return {
		activePlatform,
		setActivePlatform,
		configs,
		setConfigs,
		accounts,
		isSavingDraft,
		handleUpdatePlatformConfig,
		handleTogglePlatformEnabled,
		handleSyncFromWechat,
		handleSaveDraft,
	};
}
