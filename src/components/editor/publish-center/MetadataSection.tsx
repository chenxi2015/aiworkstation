import { Button, InputGroup, Label, toast } from "@heroui/react";
import {
	FileText,
	Hash,
	Loader2,
	Sparkles,
	User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { requestPublishMetadata } from "../../../services/api/publishClient";

interface MetadataSectionProps {
	title: string;
	onTitleChange: (val: string) => void;
	tags: string[];
	onTagsChange: (tags: string[]) => void;
	author: string;
	onAuthorChange: (val: string) => void;
	digest: string;
	onDigestChange: (val: string) => void;
	contentText: string;
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

export function MetadataSection({
	title,
	onTitleChange,
	tags,
	onTagsChange,
	author,
	onAuthorChange,
	digest,
	onDigestChange,
	contentText,
}: MetadataSectionProps) {
	const [tagsText, setTagsText] = useState(() => formatTagsToText(tags));
	const [loadingTitle, setLoadingTitle] = useState(false);
	const [loadingTags, setLoadingTags] = useState(false);
	const [loadingDigest, setLoadingDigest] = useState(false);
	const [candidateTitles, setCandidateTitles] = useState<string[]>([]);

	// Sync local tagsText when external tags change
	useEffect(() => {
		const currentParsed = parseTextToTags(tagsText);
		const isDiff =
			tags.length !== currentParsed.length ||
			tags.some((t, i) => t !== currentParsed[i]);
		if (isDiff) {
			setTagsText(formatTagsToText(tags));
		}
	}, [tags]);

	const handleTagsTextChange = (val: string) => {
		setTagsText(val);
		onTagsChange(parseTextToTags(val));
	};

	// AI Generate Titles
	const handleGenerateTitle = async () => {
		setLoadingTitle(true);
		try {
			const res = await requestPublishMetadata({
				title,
				contentText,
				mode: "title",
			});
			if (res.titles && res.titles.length > 0) {
				onTitleChange(res.titles[0]);
				setCandidateTitles(res.titles);
				toast.success("已基于文章内容提炼新标题");
			} else {
				toast.warning("未提炼出新标题，请保持现有标题");
			}
		} catch (err) {
			toast.danger(`标题生成失败：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setLoadingTitle(false);
		}
	};

	// AI Extract Tags
	const handleGenerateTags = async () => {
		setLoadingTags(true);
		try {
			const res = await requestPublishMetadata({
				title,
				contentText,
				mode: "tags",
			});
			if (res.tags && res.tags.length > 0) {
				const existing = parseTextToTags(tagsText);
				const merged = Array.from(new Set([...existing, ...res.tags]));
				const newText = formatTagsToText(merged);
				setTagsText(newText);
				onTagsChange(merged);
				toast.success(`已提炼 ${res.tags.length} 个传播标签`);
			} else {
				toast.warning("未提取出有效标签");
			}
		} catch (err) {
			toast.danger(`标签提取失败：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setLoadingTags(false);
		}
	};

	// AI Extract Digest
	const handleGenerateDigest = async () => {
		setLoadingDigest(true);
		try {
			const res = await requestPublishMetadata({
				title,
				contentText,
				mode: "both",
			});
			if (res.summary) {
				onDigestChange(res.summary.slice(0, 120));
				toast.success("已提炼核心摘要");
			}
		} catch (err) {
			toast.danger(`摘要提炼失败：${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setLoadingDigest(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{/* 1. Title Input with Side Action Button */}
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center justify-between">
					<Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
						<span>发布标题</span>
						<span className="text-[11px] font-normal text-muted">
							({title.length} 字)
						</span>
					</Label>
					<span className="text-[11px] text-muted">
						支持手动修改或点击右侧 AI 提炼
					</span>
				</div>

				<div className="flex items-center gap-2">
					<InputGroup className="flex-1 min-w-0 bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
						<InputGroup.Prefix className="pl-3">
							<FileText className="w-3.5 h-3.5 text-muted" />
						</InputGroup.Prefix>
						<InputGroup.Input
							type="text"
							value={title}
							onChange={(e) => onTitleChange(e.target.value)}
							placeholder="输入发布标题..."
							className="bg-transparent text-xs"
						/>
					</InputGroup>

					<Button
						type="button"
						variant="outline"
						className="rounded-lg shrink-0"
						isDisabled={loadingTitle}
						onPress={handleGenerateTitle}
					>
						{loadingTitle ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Sparkles className="w-3.5 h-3.5" />
						)}
						<span>{loadingTitle ? "提炼中..." : "AI 提炼标题"}</span>
					</Button>
				</div>

				{/* Title Candidates */}
				{candidateTitles.length > 1 && (
					<div className="flex flex-wrap items-center gap-1.5 pt-0.5">
						<span className="text-[11px] text-muted">候选切换：</span>
						{candidateTitles.map((cand) => (
							<button
								key={cand}
								type="button"
								onClick={() => onTitleChange(cand)}
								className={`text-xs px-2.5 py-1 rounded-md border transition cursor-pointer ${
									title === cand
										? "bg-accent/10 border-accent/40 text-accent font-medium shadow-2xs"
										: "bg-surface border-border/80 text-muted hover:text-foreground hover:border-border"
								}`}
							>
								{cand}
							</button>
						))}
					</div>
				)}
			</div>

			{/* 2. Tags Input with Side Action Button */}
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center justify-between">
					<Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
						<span>发布标签 / 话题</span>
						<span className="text-[11px] font-normal text-muted">
							({parseTextToTags(tagsText).length} 个)
						</span>
					</Label>
					<span className="text-[11px] text-muted">
						支持直接复制/编辑，格式如 #标签1 #标签2
					</span>
				</div>

				<div className="flex items-center gap-2">
					<InputGroup className="flex-1 min-w-0 bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
						<InputGroup.Prefix className="pl-3">
							<Hash className="w-3.5 h-3.5 text-muted" />
						</InputGroup.Prefix>
						<InputGroup.Input
							type="text"
							value={tagsText}
							onChange={(e) => handleTagsTextChange(e.target.value)}
							placeholder="#标签1 #标签2 #标签3..."
							className="bg-transparent text-xs"
						/>
					</InputGroup>

					<Button
						type="button"
						variant="outline"
						className="rounded-lg shrink-0"
						isDisabled={loadingTags}
						onPress={handleGenerateTags}
					>
						{loadingTags ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Sparkles className="w-3.5 h-3.5" />
						)}
						<span>{loadingTags ? "提炼中..." : "AI 提炼标签"}</span>
					</Button>
				</div>
			</div>

			{/* 3. Author Input */}
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs font-medium text-foreground">
					作者署名
				</Label>
				<InputGroup className="bg-transparent border border-border/80 hover:border-foreground/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 rounded-lg shadow-none">
					<InputGroup.Prefix className="pl-3">
						<User className="w-3.5 h-3.5 text-muted" />
					</InputGroup.Prefix>
					<InputGroup.Input
						type="text"
						value={author}
						onChange={(e) => onAuthorChange(e.target.value)}
						placeholder="作者名称..."
						className="bg-transparent text-xs"
					/>
				</InputGroup>
			</div>

			{/* 4. Article Digest with Header Link Action */}
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center justify-between">
					<Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
						<span>文章摘要（公众号等平台需要）</span>
						<span className="text-[11px] font-normal text-muted">
							({digest.length}/120)
						</span>
					</Label>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-auto text-[10px] text-accent flex items-center gap-1 font-normal"
						isDisabled={loadingDigest}
						onPress={handleGenerateDigest}
					>
						{loadingDigest ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<Sparkles className="w-3 h-3" />
						)}
						<span>AI 提炼摘要</span>
					</Button>
				</div>

				<textarea
					value={digest}
					onChange={(e) => onDigestChange(e.target.value.slice(0, 120))}
					rows={3}
					placeholder="简要概括文章主旨与核心看点..."
					className="w-full bg-transparent border border-border/80 hover:border-foreground/40 focus:border-accent focus:ring-1 focus:ring-accent/20 rounded-lg p-2.5 text-xs text-foreground placeholder:text-muted/60 outline-none transition-colors resize-none leading-relaxed shadow-none"
				/>

				<p className="text-[11px] text-muted">
					用于一键发布文章时生成平台导读与摘要，在微信公众号、知乎专栏等平台群发或卡片分享时使用。
				</p>
			</div>
		</div>
	);
}
