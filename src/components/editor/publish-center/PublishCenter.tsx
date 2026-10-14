import { Button, Drawer, toast } from "@heroui/react";
import { Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import {
	fetchPlatformAccounts,
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
		localStorage.setItem(getDraftKey(docId), JSON.stringify(data));
	} catch (err) {
		console.warn("[PublishCenter] save draft error:", err);
	}
};

const loadDraftFromStorage = (docId: number): PublishDraft | null => {
	try {
		const raw = localStorage.getItem(getDraftKey(docId));
		if (!raw) return null;
		return JSON.parse(raw);
	} catch (err) {
		console.warn("[PublishCenter] load draft error:", err);
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
	// Metadata states
	const [publishTitle, setPublishTitle] = useState(initialTitle);
	const [tags, setTags] = useState<string[]>([]);
	const [author, setAuthor] = useState("AI Workstation");
	const [digest, setDigest] = useState("");

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

	// Publishing results tracking
	const [results, setResults] = useState<
		Record<PublishPlatform, PlatformPublishResult>
	>({
		wechat: { platform: "wechat", status: "idle" },
		redbook: { platform: "redbook", status: "idle" },
		zhihu: { platform: "zhihu", status: "idle" },
		twitter: { platform: "twitter", status: "idle" },
	});

	// Synchronize initial document title & digest, or restore saved draft
	useEffect(() => {
		if (isOpen) {
			const savedDraft = loadDraftFromStorage(documentId);
			if (savedDraft) {
				setPublishTitle(savedDraft.publishTitle || initialTitle || "未命名文章");
				setTags(savedDraft.tags || []);
				setAuthor(savedDraft.author || "AI Workstation");
				setDigest(savedDraft.digest ?? contentText.slice(0, 100).trim());
				if (savedDraft.covers && savedDraft.covers.length > 0) {
					setCovers(savedDraft.covers);
					setSelectedCoverIndex(savedDraft.selectedCoverIndex ?? 0);
				}
				if (savedDraft.selectedPlatforms) {
					setSelectedPlatforms(savedDraft.selectedPlatforms);
				}
				if (savedDraft.accountId) {
					setAccountId(savedDraft.accountId);
				}
			} else {
				setPublishTitle(initialTitle || "未命名文章");
				setDigest(contentText.slice(0, 100).trim());
			}

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
				if (wechat.length > 0 && !savedDraft?.accountId) {
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

	// Save current state as publish draft
	const handleSaveDraft = (showToast = true) => {
		saveDraftToStorage(documentId, {
			publishTitle,
			tags,
			author,
			digest,
			covers,
			selectedCoverIndex,
			selectedPlatforms,
			accountId,
			updatedAt: Date.now(),
		});
		if (showToast) {
			toast.success("草稿已保存，下次打开将自动恢复");
		}
	};

	// Close with silent auto-save
	const handleCloseWithSave = () => {
		handleSaveDraft(false);
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
								<Drawer.Heading className="font-semibold text-base text-foreground tracking-tight">
									一键发布
								</Drawer.Heading>
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
					<Drawer.Footer className="border-t border-border py-3.5 px-6 flex items-center justify-between shrink-0 bg-surface">
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
								variant="outline"
								onPress={() => handleSaveDraft(true)}
								className="rounded-lg h-8 px-3 text-xs text-foreground/80 hover:text-foreground border-border/80"
							>
								<Save className="w-3.5 h-3.5 mr-1 text-muted" />
								保存草稿
							</Button>
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
