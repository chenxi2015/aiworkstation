import { Button, Drawer, toast } from "@heroui/react";
import { zipSync } from "fflate";
import {
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	Download,
	Ellipsis,
	Globe,
	Loader2,
	MessageSquare,
	Newspaper,
	PencilLine,
	RefreshCw,
	Send,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	fetchPlatformAccounts,
	fetchPublishRecords,
	publishToWechat,
	requestPublishVariants,
} from "../../../services/api/publishClient";
import { CoverCard } from "../CoverCard";
import {
	CARD_THEMES,
	COVER_SPECS,
	captureElementToDataUrl,
} from "../cardExporter";
import { triggerFileDownload } from "../exporters";
import type {
	CardTheme,
	PlatformAccountInfo,
	PublishPlatform,
	PublishRecord,
	PublishVariants,
	RedbookCardPlan,
	VariantFocus,
} from "../types";
import {
	copyRedbookText,
	copyTwitterText,
	copyWechatFormatted,
	copyZhihuMarkdown,
} from "./clipboardChannels";
import { RedbookSlideCard } from "./RedbookSlideCard";
import {
	buildFallbackVariants,
	slidesFromAiPlan,
	slidesFromMechanical,
} from "./variantFallback";

/**
 * PublishCenter —— 「一次生成 · 全平台直发」（docs/creator-publish-plan.md P2，v2 交互定案）
 *
 * 流程：打开即 AI 一把梭生成 → 海报墙确认屏（换一版为主、字段编辑为可选下钻）
 * → 一次总确认 → 公众号 API 直发；小红书/知乎/X 素材在卡片上一键取走（剪贴板降级通道）。
 * 整体替换 Editor-δ 的 DistributionModal（贴图/分发双 Tab 已退役）。
 */

type VariantsState = Omit<PublishVariants, "cards"> & {
	cards?: RedbookCardPlan;
};

interface PublishCenterProps {
	isOpen: boolean;
	onClose: () => void;
	documentId: number;
	title: string;
	contentHtml: string;
	contentText: string;
	markdown: string;
}

const PLATFORM_ORDER: PublishPlatform[] = [
	"wechat",
	"redbook",
	"zhihu",
	"twitter",
];

const PLATFORM_META: Record<
	PublishPlatform,
	{ name: string; channel: string; icon: typeof MessageSquare }
> = {
	wechat: { name: "微信公众号", channel: "官方 API 直连", icon: MessageSquare },
	redbook: { name: "小红书", channel: "图文卡片 · 素材取走", icon: Newspaper },
	zhihu: { name: "知乎", channel: "剪贴板 · Markdown", icon: Globe },
	twitter: { name: "X / Twitter", channel: "剪贴板 · 短文", icon: Globe },
};

export function PublishCenter({
	isOpen,
	onClose,
	documentId,
	title,
	contentHtml,
	contentText,
	markdown,
}: PublishCenterProps) {
	const [phase, setPhase] = useState<"generating" | "ready">("generating");
	const [variants, setVariants] = useState<VariantsState | null>(null);
	const [aiGenerated, setAiGenerated] = useState(false);
	const [regenerating, setRegenerating] = useState<VariantFocus | null>(null);
	const [cardTheme, setCardTheme] = useState<CardTheme>("minimal-light");
	const [authorName, setAuthorName] = useState("AI Workstation");
	const [selected, setSelected] = useState<Record<PublishPlatform, boolean>>({
		wechat: true,
		redbook: true,
		zhihu: true,
		twitter: true,
	});
	const [editing, setEditing] = useState<PublishPlatform | null>(null);
	const [menuFor, setMenuFor] = useState<PublishPlatform | null>(null);
	const [slideIdx, setSlideIdx] = useState(0);
	const [exporting, setExporting] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [accounts, setAccounts] = useState<PlatformAccountInfo[]>([]);
	const [accountId, setAccountId] = useState<number | null>(null);
	const [records, setRecords] = useState<PublishRecord[]>([]);

	const wechatCoverRef = useRef<HTMLDivElement>(null);
	const deckRef = useRef<HTMLDivElement>(null);
	const runIdRef = useRef(0);

	const theme = CARD_THEMES[cardTheme];

	// 小红书卡片：AI 拆卡优先，否则机械回退
	const slides = useMemo(() => {
		if (!isOpen) return [];
		if (variants?.cards) return slidesFromAiPlan(variants.cards);
		return slidesFromMechanical(title, contentHtml, authorName);
	}, [isOpen, variants, title, contentHtml, authorName]);

	useEffect(() => {
		if (slideIdx >= slides.length && slides.length > 0) setSlideIdx(0);
	}, [slides.length, slideIdx]);

	const reloadAccounts = useCallback(async () => {
		const all = await fetchPlatformAccounts();
		const wechat = all.filter(
			(a) => a.platform === "wechat-mp" && a.status === "active",
		);
		setAccounts(wechat);
		setAccountId((prev) => prev ?? wechat[0]?.id ?? null);
	}, []);

	const reloadRecords = useCallback(async () => {
		setRecords(await fetchPublishRecords(documentId));
	}, [documentId]);

	// AI 一把梭（或按 focus「换一版」）；AI 不可用时确定性回退，链路永不断
	const runGenerate = useCallback(
		async (focus?: VariantFocus) => {
			const runId = ++runIdRef.current;
			if (focus) setRegenerating(focus);
			else setPhase("generating");
			try {
				const res = await requestPublishVariants({
					documentId,
					title,
					contentText,
					focus,
				});
				if (runId !== runIdRef.current) return;
				if (res.aiGenerated && Object.keys(res.variants).length > 0) {
					setAiGenerated(true);
					setVariants((prev) => ({
						...(prev ?? buildFallbackVariants(title, contentText)),
						...res.variants,
					}));
				} else if (!focus) {
					setVariants(buildFallbackVariants(title, contentText));
					setAiGenerated(false);
				} else {
					toast.warning("AI 暂不可用，该部分保持现有内容");
				}
			} catch (err) {
				if (runId !== runIdRef.current) return;
				if (!focus) {
					setVariants(buildFallbackVariants(title, contentText));
					setAiGenerated(false);
				}
				toast.danger(
					`生成失败：${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				if (runId === runIdRef.current) {
					setPhase("ready");
					setRegenerating(null);
				}
			}
		},
		[documentId, title, contentText],
	);

	useEffect(() => {
		if (!isOpen) return;
		setSlideIdx(0);
		setEditing(null);
		void reloadAccounts();
		void reloadRecords();
		void runGenerate();
	}, [isOpen, runGenerate, reloadAccounts, reloadRecords]);

	const patchVariant = <K extends keyof VariantsState>(
		key: K,
		patch: Partial<VariantsState[K]>,
	) => {
		setVariants(
			(prev) =>
				prev && {
					...prev,
					[key]: { ...(prev[key] as object), ...patch },
				},
		);
	};

	// 离屏渲染公众号封面（900×383，跟随当前主题）
	const captureCover = async (): Promise<string> => {
		if (!wechatCoverRef.current) throw new Error("封面渲染失败");
		return captureElementToDataUrl(
			wechatCoverRef.current,
			COVER_SPECS.wechat.pixelRatio,
		);
	};

	// 导出小红书素材包：全部卡片 PNG + 文案，fflate 打包为单个 zip 下载
	const exportAllSlides = async () => {
		const deck = deckRef.current;
		if (!deck || slides.length === 0) return;
		setExporting(true);
		try {
			const nodes = Array.from(deck.children) as HTMLElement[];
			const files: Record<string, Uint8Array> = {};
			for (let i = 0; i < nodes.length; i++) {
				const dataUrl = await captureElementToDataUrl(nodes[i], 3);
				const buffer = new Uint8Array(
					await (await fetch(dataUrl)).arrayBuffer(),
				);
				files[`卡片-${String(i + 1).padStart(2, "0")}.png`] = buffer;
			}
			if (variants) {
				const topics = variants.redbook.topics.map((t) => `#${t}`).join(" ");
				files["文案.txt"] = new TextEncoder().encode(
					`${variants.redbook.title}\n\n${variants.redbook.body}\n\n${topics}\n`,
				);
			}
			const zipped = zipSync(files, { level: 6 });
			triggerFileDownload(
				`${title || "小红书"}-发布素材.zip`,
				new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" }),
			);
		} finally {
			setExporting(false);
		}
	};

	// 剪贴板降级通道（红线 6：永久保留，收进卡片操作）
	const handleCopy = async (platform: PublishPlatform) => {
		if (!variants) return;
		if (platform === "wechat")
			await copyWechatFormatted({ title, contentHtml, contentText, markdown });
		if (platform === "redbook") await copyRedbookText(variants.redbook);
		if (platform === "zhihu") await copyZhihuMarkdown(variants.zhihu, markdown);
		if (platform === "twitter") await copyTwitterText(variants.twitter);
		toast.success("已复制，可直接粘贴到平台编辑器");
	};

	const handleRedbookBundle = async () => {
		await exportAllSlides();
		if (variants) await copyRedbookText(variants.redbook);
		toast.success("卡片 PNG 已导出，文案（含话题）已复制");
	};

	// 一次总确认：确认屏的显式点击即发布授权（红线 1）
	const handleConfirmPublish = async () => {
		if (!variants || !accountId) return;
		setPublishing(true);
		try {
			const coverImageDataUrl = await captureCover();
			const record = await publishToWechat({
				documentId,
				accountId,
				title: variants.wechat.title,
				author: variants.wechat.author.trim() || authorName,
				digest: variants.wechat.digest.trim(),
				contentHtml,
				coverImageDataUrl,
				confirmed: true,
			});
			toast.success(
				record.platformUrl
					? "公众号已发布 ✅ 其他平台素材请在卡片上取走"
					: "公众号已提交发布，其他平台素材请在卡片上取走",
			);
			await reloadRecords();
		} catch (err) {
			toast.danger(
				`发布失败：${err instanceof Error ? err.message : String(err)}`,
			);
			await reloadRecords();
		} finally {
			setPublishing(false);
		}
	};

	// 生成/导出/发布进行中关闭需二次确认，避免误丢进度
	const requestClose = () => {
		const busy =
			phase === "generating" ||
			regenerating !== null ||
			exporting ||
			publishing;
		if (busy) {
			const message =
				phase === "generating"
					? "AI 正在生成各平台产物，现在关闭将中断本次生成。确定要关闭吗？"
					: publishing
						? "正在发布到公众号，现在关闭可能导致状态不一致。确定要关闭吗？"
						: "正在导出素材包，现在关闭将中断导出。确定要关闭吗？";
			if (!window.confirm(message)) return;
			runIdRef.current++; // 使进行中的生成结果被忽略
		}
		onClose();
	};

	const lastRecord = records[0] ?? null;
	const canPublish = selected.wechat && accountId !== null && !!variants;

	const renderEditPanel = (platform: PublishPlatform) => {
		if (!variants) return null;
		if (platform === "wechat") {
			return (
				<div className="px-3 py-2 space-y-2 border-t border-border/50">
					<input
						type="text"
						value={variants.wechat.title}
						onChange={(e) => patchVariant("wechat", { title: e.target.value })}
						placeholder="标题（≤64 字）"
						className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent"
					/>
					<input
						type="text"
						value={variants.wechat.author}
						onChange={(e) => patchVariant("wechat", { author: e.target.value })}
						placeholder="作者署名（可空）"
						className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent"
					/>
					<textarea
						value={variants.wechat.digest}
						onChange={(e) =>
							patchVariant("wechat", { digest: e.target.value.slice(0, 120) })
						}
						rows={2}
						placeholder={`摘要（${variants.wechat.digest.length}/120）`}
						className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent resize-none leading-relaxed"
					/>
				</div>
			);
		}
		if (platform === "redbook") {
			return (
				<div className="px-3 py-2 space-y-2 border-t border-border/50">
					<input
						type="text"
						value={variants.redbook.title}
						onChange={(e) =>
							patchVariant("redbook", { title: e.target.value.slice(0, 20) })
						}
						placeholder={`标题（${variants.redbook.title.length}/20 硬限）`}
						className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent"
					/>
					<textarea
						value={variants.redbook.body}
						onChange={(e) =>
							patchVariant("redbook", { body: e.target.value.slice(0, 1000) })
						}
						rows={4}
						placeholder={`正文（${variants.redbook.body.length}/1000）`}
						className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent resize-none leading-relaxed"
					/>
					<input
						type="text"
						value={variants.redbook.topics.join(" ")}
						onChange={(e) =>
							patchVariant("redbook", {
								topics: e.target.value
									.split(/[,，\s]+/)
									.map((t) => t.replace(/^#/, "").trim())
									.filter(Boolean)
									.slice(0, 6),
							})
						}
						placeholder="话题标签（空格分隔，≤6 个）"
						className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent"
					/>
					<input
						type="text"
						value={authorName}
						onChange={(e) => setAuthorName(e.target.value)}
						placeholder="卡片署名"
						className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent"
					/>
				</div>
			);
		}
		if (platform === "zhihu") {
			return (
				<div className="px-3 py-2 space-y-2 border-t border-border/50">
					<input
						type="text"
						value={variants.zhihu.title}
						onChange={(e) => patchVariant("zhihu", { title: e.target.value })}
						placeholder="知乎专栏标题"
						className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent"
					/>
					<textarea
						value={variants.zhihu.intro}
						onChange={(e) => patchVariant("zhihu", { intro: e.target.value })}
						rows={2}
						placeholder="开篇导语"
						className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent resize-none leading-relaxed"
					/>
				</div>
			);
		}
		return (
			<div className="px-3 py-2 space-y-2 border-t border-border/50">
				<textarea
					value={variants.twitter.text}
					onChange={(e) =>
						patchVariant("twitter", { text: e.target.value.slice(0, 280) })
					}
					rows={3}
					placeholder={`推文（${variants.twitter.text.length}/280）`}
					className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent resize-none leading-relaxed"
				/>
			</div>
		);
	};

	const renderPreview = (platform: PublishPlatform) => {
		if (!variants) return null;
		if (platform === "wechat") {
			const spec = COVER_SPECS.wechat;
			const scale = 240 / spec.logicalWidth;
			return (
				<div
					className="rounded-lg overflow-hidden shadow-sm shrink-0"
					style={{
						width: spec.logicalWidth * scale,
						height: spec.logicalHeight * scale,
					}}
				>
					<div
						style={{
							transform: `scale(${scale})`,
							transformOrigin: "top left",
						}}
					>
						<CoverCard
							spec={spec}
							theme={theme}
							title={variants.wechat.title}
							author={variants.wechat.author || authorName}
						/>
					</div>
				</div>
			);
		}
		if (platform === "redbook") {
			const slide = slides[slideIdx];
			if (!slide) return null;
			const scale = 140 / 360;
			return (
				<div className="flex flex-col items-center gap-2">
					<div
						className="rounded-lg overflow-hidden shadow-sm shrink-0"
						style={{ width: 360 * scale, height: 480 * scale }}
					>
						<div
							style={{
								transform: `scale(${scale})`,
								transformOrigin: "top left",
							}}
						>
							<RedbookSlideCard
								slide={slide}
								theme={theme}
								author={authorName}
							/>
						</div>
					</div>
					<div className="flex items-center gap-2 text-[10px] text-muted">
						<button
							type="button"
							disabled={slideIdx === 0}
							onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
							className="p-0.5 rounded hover:bg-surface disabled:opacity-40 cursor-pointer"
						>
							<ChevronLeft className="w-3 h-3" />
						</button>
						<span className="font-mono">
							{slideIdx + 1}/{slides.length}
						</span>
						<button
							type="button"
							disabled={slideIdx >= slides.length - 1}
							onClick={() =>
								setSlideIdx((i) => Math.min(slides.length - 1, i + 1))
							}
							className="p-0.5 rounded hover:bg-surface disabled:opacity-40 cursor-pointer"
						>
							<ChevronRight className="w-3 h-3" />
						</button>
						<button
							type="button"
							title="换一版卡片（AI 重新拆卡）"
							disabled={regenerating !== null}
							onClick={() => void runGenerate("cards")}
							className="p-0.5 rounded hover:bg-surface text-muted hover:text-accent cursor-pointer disabled:opacity-40"
						>
							{regenerating === "cards" ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<RefreshCw className="w-3 h-3" />
							)}
						</button>
					</div>
				</div>
			);
		}
		if (platform === "zhihu") {
			return (
				<div className="w-full text-[11px] text-muted leading-relaxed px-1">
					<p className="font-semibold text-foreground line-clamp-2">
						{variants.zhihu.title}
					</p>
					<p className="mt-1 line-clamp-3">{variants.zhihu.intro}</p>
					<p className="mt-1 text-[10px]">正文 = 当前文档 Markdown 全文</p>
				</div>
			);
		}
		return (
			<div className="w-full text-[11px] text-muted leading-relaxed px-1 whitespace-pre-line line-clamp-5">
				{variants.twitter.text}
			</div>
		);
	};

	const renderSummary = (platform: PublishPlatform) => {
		if (!variants) return null;
		if (platform === "wechat") {
			return (
				<div className="px-3 py-2 space-y-1 text-[11px]">
					<p className="font-medium text-foreground line-clamp-1">
						{variants.wechat.title}
					</p>
					<p className="text-muted line-clamp-2">{variants.wechat.digest}</p>
					{accounts.length > 0 ? (
						<select
							value={accountId ?? ""}
							onChange={(e) => setAccountId(Number(e.target.value))}
							className="w-full text-[11px] px-2 py-1 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent"
						>
							{accounts.map((a) => (
								<option key={a.id} value={a.id}>
									{a.label}
								</option>
							))}
						</select>
					) : (
						<p className="text-warning">未配置公众号：设置中心 → 发布平台</p>
					)}
					{lastRecord && (
						<p className="text-[10px] text-muted">
							上次：
							{lastRecord.status === "published"
								? "✅ 已发布"
								: lastRecord.status === "failed"
									? `❌ ${lastRecord.error ?? "失败"}`
									: lastRecord.status}
							{lastRecord.platformUrl && (
								<a
									href={lastRecord.platformUrl}
									target="_blank"
									rel="noreferrer"
									className="ml-1 text-accent hover:underline"
								>
									查看文章
								</a>
							)}
						</p>
					)}
				</div>
			);
		}
		if (platform === "redbook") {
			return (
				<div className="px-3 py-2 space-y-1 text-[11px]">
					<p className="font-medium text-foreground line-clamp-1">
						{variants.redbook.title}
						<span className="ml-1 text-muted font-normal">
							{variants.redbook.title.length}/20
						</span>
					</p>
					<p className="text-accent line-clamp-1">
						{variants.redbook.topics.map((t) => `#${t}`).join(" ")}
					</p>
				</div>
			);
		}
		return null;
	};

	const renderCard = (platform: PublishPlatform) => {
		const meta = PLATFORM_META[platform];
		const PlatformIcon = meta.icon;
		const isSelected = selected[platform];
		const isEditing = editing === platform;
		const isRegenerating = regenerating === platform;
		return (
			<div
				key={platform}
				className={`rounded-xl border bg-surface overflow-hidden flex flex-col transition-opacity ${
					isSelected ? "border-border" : "border-border/60 opacity-55"
				}`}
			>
				{/* 卡头：平台 + 通道 + 勾选 */}
				<div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
					<div className="flex items-center gap-1.5 text-xs font-medium min-w-0">
						<PlatformIcon className="w-3.5 h-3.5 text-accent shrink-0" />
						<span className="truncate">{meta.name}</span>
						<span className="text-[10px] text-muted font-normal truncate">
							{meta.channel}
						</span>
					</div>
					<input
						type="checkbox"
						checked={isSelected}
						onChange={(e) =>
							setSelected((prev) => ({ ...prev, [platform]: e.target.checked }))
						}
						className="accent-accent cursor-pointer"
						title="纳入本次分发"
					/>
				</div>

				{/* 预览区 */}
				<div className="flex items-center justify-center bg-muted/10 px-3 py-3 min-h-[170px]">
					{renderPreview(platform)}
				</div>

				{/* 摘要 or 编辑下钻 */}
				{isEditing ? renderEditPanel(platform) : renderSummary(platform)}

				{/* 操作行：换一版为主，编辑为辅，… 菜单收降级通道 */}
				<div className="mt-auto flex items-center gap-1.5 px-3 py-2 border-t border-border/60">
					<Button
						size="sm"
						variant="secondary"
						className="text-[11px] flex-1"
						isPending={isRegenerating}
						isDisabled={regenerating !== null}
						onPress={() => void runGenerate(platform)}
					>
						{!isRegenerating && <RefreshCw className="w-3 h-3" />}
						换一版
					</Button>
					<Button
						size="sm"
						variant={isEditing ? "primary" : "ghost"}
						className="text-[11px]"
						onPress={() => setEditing(isEditing ? null : platform)}
					>
						{isEditing ? (
							<Check className="w-3 h-3" />
						) : (
							<PencilLine className="w-3 h-3" />
						)}
						{isEditing ? "完成" : "编辑"}
					</Button>
					{platform === "redbook" ? (
						<Button
							size="sm"
							variant="primary"
							className="text-[11px]"
							isPending={exporting}
							onPress={() => void handleRedbookBundle()}
						>
							<Download className="w-3 h-3" />
							取走素材
						</Button>
					) : (
						<div className="relative">
							<Button
								size="sm"
								variant="ghost"
								className="text-[11px]"
								onPress={() =>
									setMenuFor(menuFor === platform ? null : platform)
								}
							>
								<Ellipsis className="w-3.5 h-3.5" />
							</Button>
							{menuFor === platform && (
								<>
									<button
										type="button"
										aria-label="关闭菜单"
										className="fixed inset-0 z-10 cursor-default"
										onClick={() => setMenuFor(null)}
									/>
									<div className="absolute right-0 bottom-8 z-20 min-w-[140px] rounded-lg border border-border bg-surface shadow-lg py-1">
										<button
											type="button"
											onClick={() => {
												setMenuFor(null);
												void handleCopy(platform);
											}}
											className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-foreground hover:bg-muted/10 cursor-pointer"
										>
											<Copy className="w-3 h-3" />
											{platform === "wechat" && "复制适配排版"}
											{platform === "zhihu" && "复制 Markdown"}
											{platform === "twitter" && "复制推文"}
										</button>
									</div>
								</>
							)}
						</div>
					)}
				</div>
			</div>
		);
	};

	return (
		<Drawer.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) requestClose();
			}}
		>
			<Drawer.Content placement="right">
				<Drawer.Dialog className="h-full w-[92vw]! sm:w-[640px]!">
					{/* 头部 */}
					<Drawer.Header className="flex flex-row items-center justify-between border-b border-border py-3 px-5 shrink-0">
						<div className="flex items-center gap-2">
							<Send className="w-5 h-5 text-accent" />
							<span className="font-semibold text-base">
								一次生成 · 全平台直发
							</span>
						</div>
						<div className="flex items-center gap-3">
							{/* 主题（P1 封面矩阵联动，AI 视觉层在 P3 接入） */}
							<div className="flex items-center gap-1.5">
								{(Object.keys(CARD_THEMES) as CardTheme[]).map((key) => (
									<button
										key={key}
										type="button"
										title={CARD_THEMES[key].name}
										onClick={() => setCardTheme(key)}
										className={`w-4 h-4 rounded-full border transition-all cursor-pointer ${
											cardTheme === key
												? "ring-2 ring-accent border-black/10"
												: "border-black/10 hover:scale-110"
										}`}
										style={{ backgroundColor: CARD_THEMES[key].background }}
									/>
								))}
							</div>
							<button
								type="button"
								onClick={requestClose}
								className="p-1 rounded-md text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
							>
								<X className="w-4 h-4" />
							</button>
						</div>
					</Drawer.Header>

					{/* 主体 */}
					<Drawer.Body className="p-5 flex-1">
						{phase === "generating" ? (
							<div className="space-y-3">
								{/* 状态条 */}
								<div className="flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5">
									<Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
									<div className="flex-1">
										<p className="text-xs font-medium text-foreground">
											AI 正在通读全文，生成各平台产物…
										</p>
										<p className="text-[10px] text-muted">
											标题 / 摘要 / 话题 / 卡片拆分一次完成，通常需要 5-20 秒
										</p>
									</div>
								</div>
								{/* 海报墙骨架：预告产物布局，加载感更强 */}
								<div className="grid grid-cols-2 gap-3">
									{PLATFORM_ORDER.map((platform) => {
										const SkeletonIcon = PLATFORM_META[platform].icon;
										return (
											<div
												key={platform}
												className="rounded-xl border border-border bg-surface overflow-hidden animate-pulse"
											>
												<div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60">
													<SkeletonIcon className="w-3.5 h-3.5 text-muted" />
													<span className="text-xs text-muted">
														{PLATFORM_META[platform].name}
													</span>
												</div>
												<div className="flex items-center justify-center bg-muted/10 px-3 py-3 min-h-[170px]">
													<div className="w-[120px] h-[150px] rounded-lg bg-muted/20" />
												</div>
												<div className="px-3 py-2 space-y-1.5">
													<div className="h-2.5 rounded bg-muted/20 w-3/4" />
													<div className="h-2 rounded bg-muted/20 w-1/2" />
												</div>
												<div className="px-3 py-2 border-t border-border/60">
													<div className="h-6 rounded bg-muted/20" />
												</div>
											</div>
										);
									})}
								</div>
							</div>
						) : (
							<div className="space-y-3">
								<p className="text-[11px] text-muted">
									{aiGenerated
										? "AI 已生成各平台产物，过目后点底部「确认发布」；不满意点卡片上的「换一版」。"
										: "未配置 LLM，已按规则生成兜底产物；配置 API Key 后可获得智能拆卡与平台包装。"}
								</p>
								<div className="grid grid-cols-2 gap-3">
									{PLATFORM_ORDER.map(renderCard)}
								</div>
							</div>
						)}
					</Drawer.Body>

					{/* 底栏：一次总确认（红线 1：显式总确认即授权） */}
					<Drawer.Footer className="border-t border-border py-3 px-5 flex items-center gap-3 shrink-0">
						<span className="flex-1 text-[10px] text-muted leading-snug">
							确认发布 = 对勾选平台的发布授权；小红书/知乎/X
							素材在各卡片「取走素材 / ⋯」中一键获取。
						</span>
						<Button size="sm" variant="ghost" onPress={requestClose}>
							关闭
						</Button>
						<Button
							size="sm"
							variant="primary"
							className="text-xs"
							isPending={publishing}
							isDisabled={!canPublish}
							onPress={() => void handleConfirmPublish()}
						>
							<Send className="w-3.5 h-3.5" />
							确认发布 · 公众号直连
						</Button>
					</Drawer.Footer>

					{/* 离屏渲染：公众号封面（发布时捕获）+ 小红书整套卡片（导出时捕获） */}
					{variants && (
						<div
							aria-hidden
							style={{ position: "absolute", left: -9999, top: 0 }}
						>
							<div ref={wechatCoverRef}>
								<CoverCard
									spec={COVER_SPECS.wechat}
									theme={theme}
									title={variants.wechat.title}
									author={variants.wechat.author || authorName}
								/>
							</div>
							<div ref={deckRef}>
								{slides.map((slide) => (
									<RedbookSlideCard
										key={slide.pageIndicator}
										slide={slide}
										theme={theme}
										author={authorName}
									/>
								))}
							</div>
						</div>
					)}
				</Drawer.Dialog>
			</Drawer.Content>
		</Drawer.Backdrop>
	);
}
