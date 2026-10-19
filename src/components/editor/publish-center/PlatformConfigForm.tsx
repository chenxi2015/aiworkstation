import { Button, InputGroup, Label, toast } from "@heroui/react";
import {
	FileText,
	Hash,
	ImageIcon,
	Loader2,
	SlidersHorizontal,
	Sparkles,
	User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { requestPublishMetadata } from "../../../services/api/publishClient";
import type { PlatformAccountInfo, PublishPlatform } from "../types";
import { SocialVisualGenerator } from "../../visual/generator/SocialVisualGenerator";
import type { VisualGeneratorPlatform } from "../../visual/generator/types";
import { PublishResultCard } from "./components/PublishResultCard";
import { RedbookConfigSection } from "./components/RedbookConfigSection";
import { WechatConfigSection } from "./components/WechatConfigSection";
import type {
	PlatformMeta,
	PlatformPublishConfig,
	PlatformPublishResult,
} from "./types";

interface PlatformConfigFormProps {
	meta: PlatformMeta;
	config: PlatformPublishConfig;
	onChangeConfig: (
		updater: (prev: PlatformPublishConfig) => PlatformPublishConfig,
	) => void;
	contentText: string;
	accounts: PlatformAccountInfo[];
	result?: PlatformPublishResult;
	onRetry?: (platform: PublishPlatform) => void;
}

const formatTagsToText = (tagList: string[]) =>
	tagList
		.map((t) => t.trim())
		.filter(Boolean)
		.map((t) => (t.startsWith("#") ? t : `#${t}`))
		.join(" ");

const parseTextToTags = (text: string) =>
	text
		.split(/[\s,，]+/)
		.map((t) => t.replace(/^#+/, "").trim())
		.filter(Boolean);

/**
 * Configuration form component for a single publishing platform.
 * Segregated into Basic Settings and Visual Image Generation tabs for focused experience.
 * Field order is tailor-made:
 * - WeChat: Title -> Digest -> Author -> Account
 * - Redbook: Title -> Tags -> 1000-char Content (with dedicated AI generation) -> Mode
 */
export function PlatformConfigForm({
	meta,
	config,
	onChangeConfig,
	contentText,
	accounts,
	result,
	onRetry,
}: PlatformConfigFormProps) {
	const [activeSubTab, setActiveSubTab] = useState<"basic" | "visual">("basic");
	const [tagsText, setTagsText] = useState(() => formatTagsToText(config.tags));
	const [isExtractingAll, setIsExtractingAll] = useState(false);
	const [isGeneratingContent, setIsGeneratingContent] = useState(false);

	const isWechat = meta.id === "wechat";
	const isRedbook = meta.id === "redbook";

	// Sync local tags text with external tags
	useEffect(() => {
		const parsed = parseTextToTags(tagsText);
		const isDiff =
			config.tags.length !== parsed.length ||
			config.tags.some((t, i) => t !== parsed[i]);
		if (isDiff) {
			setTagsText(formatTagsToText(config.tags));
		}
	}, [config.tags]);

	const handleTagsChange = (val: string) => {
		setTagsText(val);
		const parsed = parseTextToTags(val);
		onChangeConfig((prev) => ({ ...prev, tags: parsed }));
	};

	// Single-action AI refinement: Extract title, tags and digest all in one request
	const handleGenerateAllMetadata = async () => {
		if (isExtractingAll) return;
		setIsExtractingAll(true);
		try {
			const res = await requestPublishMetadata({
				title: config.title,
				contentText,
				mode: "both",
				platform: meta.id as "wechat" | "redbook" | "zhihu" | "twitter",
			});

			const newTitle =
				res.titles && res.titles.length > 0
					? res.titles[0].slice(0, meta.titleMaxLength)
					: config.title;

			const existingTags = parseTextToTags(tagsText);
			const mergedTags = Array.from(
				new Set([...existingTags, ...(res.tags || [])]),
			);
			const tagLimit = isRedbook ? 6 : 10;
			const finalTags = mergedTags.slice(0, tagLimit);

			const digestLimit =
				meta.digestMaxLength ?? (isWechat ? 120 : 1000);
			const newDigest = res.summary
				? res.summary.slice(0, digestLimit)
				: config.digest;

			setTagsText(formatTagsToText(finalTags));
			onChangeConfig((prev) => ({
				...prev,
				title: newTitle,
				tags: isWechat ? [] : finalTags,
				digest: newDigest,
			}));

			toast.success(
				isWechat
					? "已为【微信公众号】一键提炼标题与摘要"
					: `已为【${meta.name}】一键提炼标题、话题与正文`,
			);
		} catch (err) {
			toast.danger(
				`一键提炼失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setIsExtractingAll(false);
		}
	};

	// Dedicated AI generation for Xiaohongshu note content (up to 1000 chars)
	const handleGenerateRedbookContent = async () => {
		if (isGeneratingContent) return;
		setIsGeneratingContent(true);
		try {
			const res = await requestPublishMetadata({
				title: config.title,
				contentText,
				mode: "both",
				platform: "redbook",
			});
			if (res.summary) {
				const redbookContent = res.summary.slice(0, 1000);
				onChangeConfig((prev) => ({ ...prev, digest: redbookContent }));
				toast.success("已为小红书重新生成 1000 字专属正文文案");
			}
		} catch (err) {
			toast.danger(
				`正文生成失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setIsGeneratingContent(false);
		}
	};

	// Render: Title Input Section
	const renderTitleField = () => (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between">
				<Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
					<span>发布标题</span>
					<span
						className={`text-[11px] font-normal ${
							config.title.length > meta.titleMaxLength
								? "text-danger font-semibold"
								: "text-muted"
						}`}
					>
						({config.title.length} / {meta.titleMaxLength} 字)
					</span>
				</Label>
			</div>

			<InputGroup className="rounded-xl border border-border/80 shadow-none focus-within:border-accent bg-surface">
				<InputGroup.Prefix className="pl-3 text-muted">
					<FileText className="w-3.5 h-3.5" />
				</InputGroup.Prefix>
				<InputGroup.Input
					value={config.title}
					onChange={(e) =>
						onChangeConfig((prev) => ({ ...prev, title: e.target.value }))
					}
					placeholder={meta.titlePlaceholder}
					className="text-xs py-2 pr-3 bg-transparent text-foreground placeholder:text-muted/60"
				/>
			</InputGroup>
		</div>
	);

	// Render: Tags Input Section (Only for platforms supporting tags like Redbook)
	const renderTagsField = () => (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between">
				<Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
					<span>发布标签 / 话题</span>
					<span className="text-[11px] font-normal text-muted">
						({config.tags.length} 个)
					</span>
				</Label>
				<span className="text-[10px] text-muted">格式如 #标签1 #标签2</span>
			</div>

			<InputGroup className="rounded-xl border border-border/80 shadow-none focus-within:border-accent bg-surface">
				<InputGroup.Prefix className="pl-3 text-muted">
					<Hash className="w-3.5 h-3.5" />
				</InputGroup.Prefix>
				<InputGroup.Input
					value={tagsText}
					onChange={(e) => handleTagsChange(e.target.value)}
					placeholder="#热门话题 #干货分享"
					className="text-xs py-2 pr-3 bg-transparent text-foreground placeholder:text-muted/60"
				/>
			</InputGroup>
		</div>
	);

	// Render: Author Input Section
	const renderAuthorField = () => (
		<div className="flex flex-col gap-1.5">
			<Label className="text-xs font-medium text-foreground">作者署名</Label>
			<InputGroup className="rounded-xl border border-border/80 shadow-none focus-within:border-accent bg-surface">
				<InputGroup.Prefix className="pl-3 text-muted">
					<User className="w-3.5 h-3.5" />
				</InputGroup.Prefix>
				<InputGroup.Input
					value={config.author}
					onChange={(e) =>
						onChangeConfig((prev) => ({
							...prev,
							author: e.target.value,
						}))
					}
					placeholder="署名，例如：陈王百口说AI"
					className="text-xs py-2 pr-3 bg-transparent text-foreground placeholder:text-muted/60"
				/>
			</InputGroup>
		</div>
	);

	// Render: Digest / Content Input Section
	const renderDigestField = () => (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between">
				<Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
					<span>{meta.digestLabel}</span>
					<span
						className={`text-[11px] font-normal ${
							meta.digestMaxLength &&
							config.digest.length > meta.digestMaxLength
								? "text-danger font-semibold"
								: "text-muted"
						}`}
					>
						{meta.digestMaxLength
							? `(${config.digest.length} / ${meta.digestMaxLength} 字)`
							: `(${config.digest.length} 字)`}
					</span>
				</Label>

				{/* Dedicated AI Generation Button for Xiaohongshu note body */}
				{isRedbook && (
					<Button
						size="sm"
						variant="ghost"
						isPending={isGeneratingContent}
						onPress={handleGenerateRedbookContent}
						className="h-6 px-2 text-[11px] text-accent hover:bg-accent/10 cursor-pointer font-medium"
					>
						{isGeneratingContent ? (
							<Loader2 className="w-3 h-3 mr-1 animate-spin" />
						) : (
							<Sparkles className="w-3 h-3 mr-1" />
						)}
						AI 生成正文
					</Button>
				)}
			</div>

			<textarea
				value={config.digest}
				onChange={(e) => {
					const val = meta.digestMaxLength
						? e.target.value.slice(0, meta.digestMaxLength)
						: e.target.value;
					onChangeConfig((prev) => ({ ...prev, digest: val }));
				}}
				maxLength={meta.digestMaxLength}
				rows={isRedbook ? 6 : 4}
				placeholder={meta.digestPlaceholder}
				className="w-full rounded-xl border border-border/80 focus:border-accent focus:ring-1 focus:ring-accent/20 bg-surface text-xs p-3 text-foreground placeholder:text-muted/60 resize-none outline-none leading-relaxed"
			/>
		</div>
	);

	return (
		<div className="flex flex-col gap-4">
			{/* Sub Tabs: Basic Settings vs Visual Image Generation */}
			<div className="flex items-center justify-between border-b border-border/60 pb-2">
				<div className="flex items-center gap-1.5 p-1 bg-surface-secondary/70 border border-border/70 rounded-xl shadow-2xs">
					<button
						type="button"
						onClick={() => setActiveSubTab("basic")}
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
							activeSubTab === "basic"
								? "bg-surface text-foreground font-semibold shadow-xs border border-border/80"
								: "text-muted hover:text-foreground"
						}`}
					>
						<SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
						<span>基础配置</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveSubTab("visual")}
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
							activeSubTab === "visual"
								? "bg-surface text-foreground font-semibold shadow-xs border border-border/80"
								: "text-muted hover:text-foreground"
						}`}
					>
						<ImageIcon className="w-3.5 h-3.5 text-accent" />
						<span>配图与封面</span>
						{config.covers && config.covers.length > 0 && (
							<span className="px-1.5 py-0.2 rounded-full bg-accent/15 text-accent text-[10px] font-semibold">
								{config.covers.length}张
							</span>
						)}
					</button>
				</div>
			</div>

			{/* Tab 1: Basic Settings Content */}
			{activeSubTab === "basic" && (
				<div className="flex flex-col gap-4.5 animate-in fade-in-50 duration-150">
					{/* Unified AI Refinement Bar */}
					<div className="flex items-center justify-between p-2.5 rounded-xl bg-accent/5 border border-accent/20">
						<div className="flex items-center gap-2">
							<div className="w-6 h-6 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
								<Sparkles className="w-3.5 h-3.5" />
							</div>
							<div className="flex flex-col">
								<span className="text-xs font-semibold text-foreground">
									智能生成发布要素
								</span>
								<span className="text-[10px] text-muted">
									{isWechat
										? "一键基于文章自动提炼公众号标题与精选摘要"
										: "一键基于文章自动提炼标题、话题标签与正文导读"}
								</span>
							</div>
						</div>

						<Button
							size="sm"
							variant="primary"
							isPending={isExtractingAll}
							onPress={handleGenerateAllMetadata}
							className="h-7 px-3 rounded-lg text-xs font-medium bg-accent text-accent-foreground hover:opacity-90 shadow-2xs cursor-pointer"
						>
							{isExtractingAll ? (
								<Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
							) : (
								<Sparkles className="w-3.5 h-3.5 mr-1" />
							)}
							一键智能提炼
						</Button>
					</div>

					{/* Platform Specific Field Ordering:
					    WeChat: 1. Title -> 2. Digest -> 3. Author -> 4. Account
					    Redbook: 1. Title -> 2. Tags -> 3. Content (1000 chars + AI button) -> 4. Mode
					*/}
					{isWechat ? (
						<>
							{/* 1. Title */}
							{renderTitleField()}

							{/* 2. Digest */}
							{renderDigestField()}

							{/* 3. Author */}
							{renderAuthorField()}

							{/* 4. Wechat Account */}
							<WechatConfigSection
								accounts={accounts}
								selectedAccountId={config.accountId}
								onSelectAccount={(accountId) =>
									onChangeConfig((prev) => ({ ...prev, accountId }))
								}
							/>
						</>
					) : (
						<>
							{/* 1. Title */}
							{renderTitleField()}

							{/* 2. Tags */}
							{meta.isTagsSupported !== false && renderTagsField()}

							{/* 3. Digest / 1000-char Content */}
							{meta.isDigestSupported && renderDigestField()}

							{/* 4. Author (if applicable) */}
							{meta.isAuthorSupported && renderAuthorField()}

							{/* 5. Redbook Mode */}
							{isRedbook && (
								<RedbookConfigSection
									publishMode={config.publishMode}
									onChangePublishMode={(mode) =>
										onChangeConfig((prev) => ({
											...prev,
											publishMode: mode,
										}))
									}
								/>
							)}
						</>
					)}
				</div>
			)}

			{/* Tab 2: Visual Images Generation Content */}
			{activeSubTab === "visual" && (
				<div className="animate-in fade-in-50 duration-150">
					<SocialVisualGenerator
						title={config.title}
						contentText={contentText}
						digest={config.digest}
						platform={meta.id as VisualGeneratorPlatform}
						covers={config.covers}
						selectedCoverIndex={config.selectedCoverIndex}
						selectedCoverIndices={config.selectedCoverIndices}
						defaultRatio={meta.defaultRatio}
						onSelectCover={(idx) =>
							onChangeConfig((prev) => ({
								...prev,
								selectedCoverIndex: idx,
							}))
						}
						onSelectCovers={(indices) =>
							onChangeConfig((prev) => ({
								...prev,
								selectedCoverIndices: indices,
								selectedCoverIndex: indices.length > 0 ? indices[0] : -1,
							}))
						}
						onCoversChange={(covers) =>
							onChangeConfig((prev) => ({ ...prev, covers }))
						}
					/>
				</div>
			)}

			{/* Platform Publishing Result Status Card */}
			<PublishResultCard
				result={result}
				onRetry={onRetry ? () => onRetry(meta.id) : undefined}
			/>
		</div>
	);
}
