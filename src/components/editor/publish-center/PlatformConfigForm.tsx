import {
	Button,
	InputGroup,
	Label,
	ListBox,
	ListBoxItem,
	Select,
	SelectPopover,
	SelectTrigger,
	SelectValue,
	toast,
} from "@heroui/react";
import {
	CheckCircle2,
	ExternalLink,
	FileText,
	Hash,
	Loader2,
	RefreshCw,
	Sparkles,
	User,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { requestPublishMetadata } from "../../../services/api/publishClient";
import type { PlatformAccountInfo, PublishPlatform } from "../types";
import { PublishVisualSection } from "./PublishVisualSection";
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
			});
			if (res.summary) {
				const limit = meta.id === "wechat" ? 120 : 150;
				onChangeConfig((prev) => ({
					...prev,
					digest: res.summary.slice(0, limit),
				}));
				toast.success(`已为【${meta.name}】生成核心摘要`);
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

			{/* 4. Article Digest (Placed before visual covers) */}
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

			{/* 5. Visual Section (Placed below digest as requested by user) */}
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

			{/* 6. WeChat Specific Account Selector */}
			{meta.id === "wechat" && (
				<div className="p-3.5 rounded-xl border border-border/80 bg-surface-secondary/40 space-y-2">
					<div className="flex items-center justify-between">
						<Label className="text-xs font-semibold text-foreground">
							关联微信公众号账号
						</Label>
						<span className="text-[10px] text-muted">官方草稿箱直接同步</span>
					</div>

					{accounts.length > 0 ? (
						<Select
							aria-label="选择微信公众号账号"
							selectedKey={String(config.accountId ?? accounts[0]?.id ?? "")}
							onSelectionChange={(key) => {
								if (key != null) {
									onChangeConfig((prev) => ({
										...prev,
										accountId: Number(key),
									}));
								}
							}}
							className="w-full"
						>
							<SelectTrigger className="w-full h-8 px-3 text-xs rounded-lg border border-border/80 bg-surface text-foreground flex items-center justify-between">
								<SelectValue className="text-xs truncate leading-none" />
							</SelectTrigger>
							<SelectPopover className="rounded-xl border border-border bg-surface shadow-lg max-h-48 overflow-y-auto min-w-[200px] z-50">
								<ListBox>
									{accounts.map((acc) => (
										<ListBoxItem
											key={acc.id}
											id={String(acc.id)}
											textValue={acc.label}
											className="text-xs rounded-lg cursor-pointer"
										>
											{acc.label}
										</ListBoxItem>
									))}
								</ListBox>
							</SelectPopover>
						</Select>
					) : (
						<div className="p-2.5 rounded-lg border border-warning/30 bg-warning/5 text-warning text-xs flex items-center justify-between">
							<span>未检测到绑定的公众号账号</span>
							<span className="text-[11px] underline cursor-pointer">
								前往设置中心绑定
							</span>
						</div>
					)}
				</div>
			)}

			{/* 7. Platform Publishing Result Status Card */}
			{result && result.status !== "idle" && (
				<div
					className={`p-3 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
						result.status === "success"
							? "bg-emerald-500/5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
							: result.status === "error"
								? "bg-red-500/5 border-red-500/30 text-red-600 dark:text-red-400"
								: "bg-surface-secondary border-border text-foreground/80"
					}`}
				>
					<div className="flex items-center gap-2">
						{result.status === "publishing" && (
							<Loader2 className="w-4 h-4 animate-spin text-accent" />
						)}
						{result.status === "success" && (
							<CheckCircle2 className="w-4 h-4 text-emerald-500" />
						)}
						{result.status === "error" && (
							<XCircle className="w-4 h-4 text-red-500" />
						)}
						<span className="font-medium">
							{result.status === "publishing"
								? "正在同步发布到此平台..."
								: result.message || (result.status === "success" ? "发布成功" : "发布失败")}
						</span>
					</div>

					<div className="flex items-center gap-2">
						{result.url && (
							<a
								href={result.url}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-[11px] underline hover:opacity-80"
							>
								<span>查看原文</span>
								<ExternalLink className="w-3 h-3" />
							</a>
						)}
						{result.status === "error" && onRetry && (
							<Button
								size="sm"
								variant="outline"
								onPress={() => onRetry(meta.id)}
								className="h-6 px-2 text-[10px] rounded-md"
							>
								<RefreshCw className="w-2.5 h-2.5 mr-1" />
								重试
							</Button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

