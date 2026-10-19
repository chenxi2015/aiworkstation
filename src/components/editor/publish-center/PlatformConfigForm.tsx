import { Button, InputGroup, Label, toast } from "@heroui/react";
import { FileText, Hash, Loader2, Sparkles, User } from "lucide-react";
import { useEffect, useState } from "react";
import { requestPublishMetadata } from "../../../services/api/publishClient";
import type { PlatformAccountInfo, PublishPlatform } from "../types";
import { PublishVisualSection } from "./PublishVisualSection";
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
	onChangeConfig: (updater: (prev: PlatformPublishConfig) => PlatformPublishConfig) => void;
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
 * Displays title, tags, author, digest, visual covers, and platform-specific settings.
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
	const [tagsText, setTagsText] = useState(() => formatTagsToText(config.tags));
	const [loadingTitle, setLoadingTitle] = useState(false);
	const [loadingTags, setLoadingTags] = useState(false);
	const [loadingDigest, setLoadingDigest] = useState(false);

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

	// AI Generate Platform Title
	const handleGenerateTitle = async () => {
		setLoadingTitle(true);
		try {
			const res = await requestPublishMetadata({
				title: config.title,
				contentText,
				mode: "title",
				platform: meta.id as "wechat" | "redbook" | "zhihu" | "twitter",
			});
			if (res.titles && res.titles.length > 0) {
				const candidate =
					meta.id === "redbook"
						? res.titles[0].slice(0, meta.titleMaxLength)
						: res.titles[0];
				onChangeConfig((prev) => ({ ...prev, title: candidate }));
				toast.success(`已为【${meta.name}】提炼专属标题`);
			} else {
				toast.warning("未提炼出新标题，请保持现有标题");
			}
		} catch (err) {
			toast.danger(`标题提炼失败：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setLoadingTitle(false);
		}
	};

	// AI Generate Platform Tags
	const handleGenerateTags = async () => {
		setLoadingTags(true);
		try {
			const res = await requestPublishMetadata({
				title: config.title,
				contentText,
				mode: "tags",
				platform: meta.id as "wechat" | "redbook" | "zhihu" | "twitter",
			});
			if (res.tags && res.tags.length > 0) {
				const existing = parseTextToTags(tagsText);
				const merged = Array.from(new Set([...existing, ...res.tags]));
				const limit = meta.id === "redbook" ? 6 : 10;
				const sliced = merged.slice(0, limit);
				setTagsText(formatTagsToText(sliced));
				onChangeConfig((prev) => ({ ...prev, tags: sliced }));
				toast.success(`已为【${meta.name}】提炼 ${sliced.length} 个热门标签`);
			} else {
				toast.warning("未提取出有效标签");
			}
		} catch (err) {
			toast.danger(`标签提取失败：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setLoadingTags(false);
		}
	};

	// AI Generate Platform Digest
	const handleGenerateDigest = async () => {
		setLoadingDigest(true);
		try {
			const res = await requestPublishMetadata({
				title: config.title,
				contentText,
				mode: "both",
				platform: meta.id as "wechat" | "redbook" | "zhihu" | "twitter",
			});
			if (res.summary) {
				const limit = meta.id === "wechat" ? 120 : meta.id === "redbook" ? 400 : 150;
				onChangeConfig((prev) => ({
					...prev,
					digest: res.summary.slice(0, limit),
				}));
				toast.success(`已为【${meta.name}】提炼${meta.digestLabel}`);
			}
		} catch (err) {
			toast.danger(`摘要提炼失败：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setLoadingDigest(false);
		}
	};

	return (
		<div className="flex flex-col gap-5">
			{/* 1. Title Input with AI refinement */}
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
					<span className="text-[10px] text-muted">{meta.badge}</span>
				</div>

				<div className="flex items-center gap-2">
					<InputGroup className="flex-1 rounded-xl border border-border/80 shadow-none focus-within:border-accent bg-surface">
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
					<Button
						size="sm"
						variant="outline"
						isPending={loadingTitle}
						onPress={handleGenerateTitle}
						className="shrink-0 h-9 px-3 rounded-xl text-xs font-medium border-border/80 text-foreground/90 hover:text-foreground hover:bg-surface-secondary/80"
					>
						{loadingTitle ? (
							<Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
						) : (
							<Sparkles className="w-3.5 h-3.5 mr-1 text-accent" />
						)}
						AI 提炼标题
					</Button>
				</div>
			</div>

			{/* 2. Tags Input with AI refinement */}
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

				<div className="flex items-center gap-2">
					<InputGroup className="flex-1 rounded-xl border border-border/80 shadow-none focus-within:border-accent bg-surface">
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
					<Button
						size="sm"
						variant="outline"
						isPending={loadingTags}
						onPress={handleGenerateTags}
						className="shrink-0 h-9 px-3 rounded-xl text-xs font-medium border-border/80 text-foreground/90 hover:text-foreground hover:bg-surface-secondary/80"
					>
						{loadingTags ? (
							<Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
						) : (
							<Sparkles className="w-3.5 h-3.5 mr-1 text-accent" />
						)}
						AI 提炼标签
					</Button>
				</div>
			</div>

			{/* 3. Author Name */}
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs font-medium text-foreground">作者署名</Label>
				<InputGroup className="rounded-xl border border-border/80 shadow-none focus-within:border-accent bg-surface">
					<InputGroup.Prefix className="pl-3 text-muted">
						<User className="w-3.5 h-3.5" />
					</InputGroup.Prefix>
					<InputGroup.Input
						value={config.author}
						onChange={(e) =>
							onChangeConfig((prev) => ({ ...prev, author: e.target.value }))
						}
						placeholder="署名，例如：AI Workstation"
						className="text-xs py-2 pr-3 bg-transparent text-foreground placeholder:text-muted/60"
					/>
				</InputGroup>
			</div>

			{/* 4. Article Digest */}
			{meta.isDigestSupported && (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between">
						<Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
							<span>{meta.digestLabel}</span>
							<span className="text-[11px] font-normal text-muted">
								({config.digest.length} 字)
							</span>
						</Label>
						<Button
							size="sm"
							variant="ghost"
							isPending={loadingDigest}
							onPress={handleGenerateDigest}
							className="h-6 px-1.5 text-[11px] text-accent hover:bg-accent/10"
						>
							<Sparkles className="w-3 h-3 mr-1" />
							AI 提炼摘要
						</Button>
					</div>

					<textarea
						value={config.digest}
						onChange={(e) =>
							onChangeConfig((prev) => ({ ...prev, digest: e.target.value }))
						}
						rows={3}
						placeholder={meta.digestPlaceholder}
						className="w-full rounded-xl border border-border/80 focus:border-accent focus:ring-1 focus:ring-accent/20 bg-surface text-xs p-3 text-foreground placeholder:text-muted/60 resize-none outline-none leading-relaxed"
					/>
				</div>
			)}

			{/* 5. Visual Covers Section */}
			<div className="pt-1">
				<PublishVisualSection
					title={config.title}
					contentText={contentText}
					digest={config.digest}
					covers={config.covers}
					selectedCoverIndex={config.selectedCoverIndex}
					defaultRatio={meta.defaultRatio}
					onSelectCover={(idx) =>
						onChangeConfig((prev) => ({ ...prev, selectedCoverIndex: idx }))
					}
					onCoversChange={(covers) =>
						onChangeConfig((prev) => ({ ...prev, covers }))
					}
				/>
			</div>

			{/* 6. Platform Specific Settings */}
			{meta.id === "wechat" && (
				<WechatConfigSection
					accounts={accounts}
					selectedAccountId={config.accountId}
					onSelectAccount={(accountId) =>
						onChangeConfig((prev) => ({ ...prev, accountId }))
					}
				/>
			)}

			{meta.id === "redbook" && (
				<RedbookConfigSection
					publishMode={config.publishMode}
					onChangePublishMode={(mode) =>
						onChangeConfig((prev) => ({ ...prev, publishMode: mode }))
					}
				/>
			)}

			{/* 7. Platform Publishing Result Status Card */}
			<PublishResultCard
				result={result}
				onRetry={onRetry ? () => onRetry(meta.id) : undefined}
			/>
		</div>
	);
}
