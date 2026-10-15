import { Button, Drawer, toast } from "@heroui/react";
import { Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import {
	fetchDocumentPublishDraft,
	fetchPlatformAccounts,
	persistDocumentPublishDraft,
	publishToWechat,
} from "../../../services/api/publishClient";
import type { PlatformAccountInfo, PublishPlatform } from "../types";
import {
	copyRedbookText,
	copyTwitterText,
	copyZhihuMarkdown,
} from "./clipboardChannels";
import { CoverSection, type CoverItem } from "./CoverSection";
import { MetadataSection } from "./MetadataSection";
import {
	PublishPlatformSection,
	type PlatformPublishResult,
} from "./PublishPlatformSection";

interface PublishCenterProps {
	isOpen: boolean;
	onClose: () => void;
	documentId: number;
	title: string;
	contentHtml: string;
	contentText: string;
	markdown: string;
}

interface PublishDraft {
	docId: number;
	publishTitle: string;
	tags: string[];
	author: string;
	digest: string;
	covers: CoverItem[];
	selectedCoverIndex: number;
	selectedPlatforms: Record<PublishPlatform, boolean>;
	accountId: number | null;
	updatedAt: number;
}

const getDraftKey = (docId: number) => `publish_center_draft_${docId}`;

const saveDraftToStorage = (docId: number, data: PublishDraft) => {
	try {
		localStorage.setItem(getDraftKey(docId), JSON.stringify({ ...data, docId }));
	} catch (err) {
		console.warn("[PublishCenter] save draft cache error:", err);
	}
};

const loadDraftFromStorage = (docId: number): PublishDraft | null => {
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

export function PublishCenter({
	isOpen,
	onClose,
	documentId,
	title: initialTitle,
	contentHtml,
	contentText,
	markdown,
}: PublishCenterProps) {
	// Metadata states - initialized from the specific document props
	const [publishTitle, setPublishTitle] = useState(initialTitle || "未命名文章");
	const [tags, setTags] = useState<string[]>([]);
	const [author, setAuthor] = useState("AI Workstation");
	const [digest, setDigest] = useState(() => contentText.slice(0, 100).trim());

	// Cover images states (4 candidate images)
	const [covers, setCovers] = useState<CoverItem[]>([]);
	const [selectedCoverIndex, setSelectedCoverIndex] = useState(0);

	// Platform selection and accounts
	const [selectedPlatforms, setSelectedPlatforms] = useState<
		Record<PublishPlatform, boolean>
	>({
		wechat: true,
		redbook: true,
		zhihu: false,
		twitter: false,
	});

	const [accounts, setAccounts] = useState<PlatformAccountInfo[]>([]);
	const [accountId, setAccountId] = useState<number | null>(null);
	const [isPublishing, setIsPublishing] = useState(false);
	const [isSavingDraft, setIsSavingDraft] = useState(false);

	// Publishing results tracking
	const [results, setResults] = useState<
		Record<PublishPlatform, PlatformPublishResult>
	>({
		wechat: { platform: "wechat", status: "idle" },
		redbook: { platform: "redbook", status: "idle" },
		zhihu: { platform: "zhihu", status: "idle" },
		twitter: { platform: "twitter", status: "idle" },
	});

	// Helper to apply draft content to form state
	const applyDraft = (draft: PublishDraft) => {
		if (draft.publishTitle) setPublishTitle(draft.publishTitle);
		if (draft.tags) setTags(draft.tags);
		if (draft.author) setAuthor(draft.author);
		if (draft.digest !== undefined) setDigest(draft.digest);
		// Filter out invalid or legacy auto-generated blank template covers
		const validCovers = (draft.covers || []).filter(
			(c) => Boolean(c?.url?.trim()) && !c.id?.startsWith("template-cover-"),
		);
		if (validCovers.length > 0) {
			setCovers(validCovers);
			setSelectedCoverIndex(
				Math.min(draft.selectedCoverIndex ?? 0, validCovers.length - 1),
			);
		} else {
			setCovers([]);
			setSelectedCoverIndex(0);
		}
		if (draft.selectedPlatforms) {
			setSelectedPlatforms(draft.selectedPlatforms);
		}
		if (draft.accountId) {
			setAccountId(draft.accountId);
		}
	};

	// Reset to initial document state if no draft exists
	const resetToCleanDocState = () => {
		setPublishTitle(initialTitle || "未命名文章");
		setTags([]);
		setAuthor("AI Workstation");
		setDigest(contentText.slice(0, 100).trim());
		setCovers([]);
		setSelectedCoverIndex(0);
	};

	// Synchronize initial document title & digest, or restore saved draft from DB / cache
	useEffect(() => {
		if (isOpen) {
			// 1. Fast restore from localStorage cache for this specific document
			const localDraft = loadDraftFromStorage(documentId);
			if (localDraft) {
				applyDraft(localDraft);
			} else {
				// Clean reset for document without draft
				resetToCleanDocState();
			}

			// 2. Authoritative sync from backend SQLite database for this documentId
			fetchDocumentPublishDraft(documentId).then((dbDraftJson) => {
				if (dbDraftJson) {
					try {
						const dbDraft = JSON.parse(dbDraftJson) as PublishDraft;
						if (dbDraft && (!dbDraft.docId || dbDraft.docId === documentId)) {
							applyDraft(dbDraft);
							saveDraftToStorage(documentId, { ...dbDraft, docId: documentId });
						}
					} catch (e) {
						console.warn("[PublishCenter] parse database draft error:", e);
					}
				}
			});

			// Reset platform result states
			setResults({
				wechat: { platform: "wechat", status: "idle" },
				redbook: { platform: "redbook", status: "idle" },
				zhihu: { platform: "zhihu", status: "idle" },
				twitter: { platform: "twitter", status: "idle" },
			});

			// Load WeChat platform accounts
			fetchPlatformAccounts().then((all) => {
				const wechat = all.filter(
					(a) => a.platform === "wechat-mp" && a.status === "active",
				);
				setAccounts(wechat);
				if (wechat.length > 0 && !localDraft?.accountId) {
					setAccountId(wechat[0].id);
				}
			});
		}
	}, [isOpen, documentId, initialTitle, contentText]);

	// Toggle platform selection
	const handleTogglePlatform = (platform: PublishPlatform) => {
		setSelectedPlatforms((prev) => ({
			...prev,
			[platform]: !prev[platform],
		}));
	};

	// Execute multi-platform publishing
	const handleConfirmPublish = async () => {
		setIsPublishing(true);
		const selectedCover = covers[selectedCoverIndex]?.url || "";
		const nowTime = new Date().toLocaleTimeString("zh-CN", {
			hour: "2-digit",
			minute: "2-digit",
		});

		// 1. WeChat Official Account Publishing
		if (selectedPlatforms.wechat) {
			setResults((prev) => ({
				...prev,
				wechat: { platform: "wechat", status: "publishing", time: nowTime },
			}));

			if (!accountId) {
				setResults((prev) => ({
					...prev,
					wechat: {
						platform: "wechat",
						status: "error",
						message: "发布失败：未选择公众号账号，请在设置中心绑定公众号",
						time: nowTime,
					},
				}));
			} else if (!selectedCover) {
				setResults((prev) => ({
					...prev,
					wechat: {
						platform: "wechat",
						status: "error",
						message: "发布失败：请先生成或选择一张封面图",
						time: nowTime,
					},
				}));
			} else {
				try {
					const record = await publishToWechat({
						documentId,
						accountId,
						title: publishTitle,
						author: author.trim() || "AI Workstation",
						digest: digest.trim(),
						contentHtml,
						coverImageDataUrl: selectedCover,
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
		}

		// 2. RedBook Publishing Package (Copy title, body, topics to clipboard)
		if (selectedPlatforms.redbook) {
			setResults((prev) => ({
				...prev,
				redbook: { platform: "redbook", status: "publishing", time: nowTime },
			}));
			try {
				await copyRedbookText({
					title: publishTitle.slice(0, 20),
					body: contentText.slice(0, 1000),
					topics: tags.slice(0, 6),
				});
				setResults((prev) => ({
					...prev,
					redbook: {
						platform: "redbook",
						status: "success",
						message: "小红书图文文案与标签话题已复制到剪贴板，封面图已就绪",
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

		// 3. Zhihu Publishing Package
		if (selectedPlatforms.zhihu) {
			setResults((prev) => ({
				...prev,
				zhihu: { platform: "zhihu", status: "publishing", time: nowTime },
			}));
			try {
				await copyZhihuMarkdown(
					{
						title: publishTitle,
						intro: digest || contentText.slice(0, 100),
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

		// 4. X (Twitter) Publishing Package
		if (selectedPlatforms.twitter) {
			setResults((prev) => ({
				...prev,
				twitter: { platform: "twitter", status: "publishing", time: nowTime },
			}));
			try {
				const tweetText = `${publishTitle}\n\n${contentText.slice(0, 180)}...\n\n${tags.map((t) => `#${t}`).join(" ")}`;
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

		setIsPublishing(false);
		toast.success("发布流程已执行完毕，请查看下方结果");
	};

	// Retry single platform
	const handleRetryPlatform = async (platform: PublishPlatform) => {
		if (platform === "wechat") {
			await handleConfirmPublish();
		}
	};

	// Save current state as publish draft into SQLite database & local cache
	const handleSaveDraft = async (showToast = true) => {
		const draftData: PublishDraft = {
			docId: documentId,
			publishTitle,
			tags,
			author,
			digest,
			covers,
			selectedCoverIndex,
			selectedPlatforms,
			accountId,
			updatedAt: Date.now(),
		};
		// Cache locally first for instant resilience
		saveDraftToStorage(documentId, draftData);

		if (showToast) setIsSavingDraft(true);
		try {
			const ok = await persistDocumentPublishDraft(
				documentId,
				JSON.stringify(draftData),
			);
			if (showToast) {
				if (ok) {
					toast.success("草稿已成功保存到数据库");
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

	// Close with silent auto-save to database
	const handleCloseWithSave = () => {
		if (covers.length > 0 || tags.length > 0 || publishTitle !== initialTitle) {
			handleSaveDraft(false);
		}
		onClose();
	};

	const hasSelected = Object.values(selectedPlatforms).some(Boolean);

	return (
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
					<Drawer.Header className="flex flex-row items-center justify-between border-b border-border py-3.5 px-6 shrink-0">
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
										className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium max-w-[220px] truncate"
										title={initialTitle}
									>
										{initialTitle || "未命名文档"}
									</span>
								</div>
								<p className="text-xs text-muted">
									生成精选封面 · AI 提炼标题与标签 · 多平台直发
								</p>
							</div>
						</div>
						<Drawer.CloseTrigger />
					</Drawer.Header>

					{/* Drawer Body with Clean Flowing Sections */}
					<Drawer.Body className="p-6 flex-1 overflow-y-auto space-y-6">
						{/* 1. Cover Section (4 Candidates, AI / Skills / Template) */}
						<section className="space-y-2">
							<CoverSection
								title={publishTitle}
								contentText={contentText}
								authorName={author}
								covers={covers}
								selectedCoverIndex={selectedCoverIndex}
								onSelectCover={setSelectedCoverIndex}
								onCoversChange={setCovers}
							/>
						</section>

						{/* 2. Metadata Section (Title & Tags with individual AI buttons) */}
						<section className="space-y-2">
							<MetadataSection
								title={publishTitle}
								onTitleChange={setPublishTitle}
								tags={tags}
								onTagsChange={setTags}
								author={author}
								onAuthorChange={setAuthor}
								digest={digest}
								onDigestChange={setDigest}
								contentText={contentText}
							/>
						</section>

						{/* 3. Multi-platform Selection and Results */}
						<section className="space-y-2">
							<PublishPlatformSection
								selectedPlatforms={selectedPlatforms}
								onTogglePlatform={handleTogglePlatform}
								accounts={accounts}
								selectedAccountId={accountId}
								onSelectAccountId={setAccountId}
								results={results}
								onRetryPlatform={handleRetryPlatform}
							/>
						</section>
					</Drawer.Body>

					{/* Drawer Footer with Fixed Publish Action */}
					<Drawer.Footer className="border-t border-border py-3.5 flex items-center justify-between shrink-0 bg-surface">
						<span className="text-xs text-muted">
							已选{" "}
							<span className="font-medium text-foreground">
								{Object.values(selectedPlatforms).filter(Boolean).length}
							</span>{" "}
							个平台 · 选定封面自动同步发布
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
								isDisabled={!hasSelected || isPublishing}
								onPress={handleConfirmPublish}
								className="rounded-lg h-8 px-5 text-xs font-semibold shadow-xs"
							>
								<Send className="w-3.5 h-3.5 mr-1" />
								一键确认发布
							</Button>
						</div>
					</Drawer.Footer>
				</Drawer.Dialog>
			</Drawer.Content>
		</Drawer.Backdrop>
	);
}
