import { Button, toast } from "@heroui/react";
import {
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	Download,
	Globe,
	Image as ImageIcon,
	Layers,
	Palette,
	Quote,
	Share2,
	Sparkles,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	CARD_THEMES,
	captureAndDownloadElement,
	extractQuoteSnippet,
	sliceIntoRedbookCards,
} from "./cardExporter";
import type { CardExportMode, CardTheme, PublishPlatform } from "./types";

interface DistributionModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	contentHtml: string;
	contentText: string;
	markdown: string;
}

export function DistributionModal({
	isOpen,
	onClose,
	title,
	contentHtml,
	contentText,
	markdown,
}: DistributionModalProps) {
	const [activeMainTab, setActiveMainTab] = useState<"card" | "distribute">(
		"card",
	);

	// 卡片导出状态
	const [cardMode, setCardMode] = useState<CardExportMode>("redbook-slices");
	const [cardTheme, setCardTheme] = useState<CardTheme>("redbook");
	const [authorName, setAuthorName] = useState("AI Workstation");
	const [currentCardIndex, setCurrentCardIndex] = useState(0);
	const [isCapturing, setIsCapturing] = useState(false);

	// 平台分发状态
	const [targetPlatform, setTargetPlatform] =
		useState<PublishPlatform>("wechat");
	const [isCopied, setIsCopied] = useState(false);

	const cardPreviewRef = useRef<HTMLDivElement>(null);
	const longImageRef = useRef<HTMLDivElement>(null);
	const quoteCardRef = useRef<HTMLDivElement>(null);

	const theme = CARD_THEMES[cardTheme];

	// 小红书卡片切片数据
	const redbookCards = useMemo(() => {
		if (!isOpen) return [];
		return sliceIntoRedbookCards(title, contentHtml, authorName);
	}, [isOpen, title, contentHtml, authorName]);

	// 金句提取
	const quoteSnippet = useMemo(() => {
		return extractQuoteSnippet(contentHtml);
	}, [contentHtml]);

	// 限制页码在切片范围
	useEffect(() => {
		if (currentCardIndex >= redbookCards.length && redbookCards.length > 0) {
			setCurrentCardIndex(0);
		}
	}, [redbookCards.length, currentCardIndex]);

	// 触发单张卡片下载
	const handleDownloadCurrentCard = async () => {
		let targetEl: HTMLElement | null = null;
		let filename = `${title || "文章"}_`;

		if (cardMode === "redbook-slices") {
			targetEl = cardPreviewRef.current;
			filename += `小红书卡片_${currentCardIndex + 1}.png`;
		} else if (cardMode === "long-image") {
			targetEl = longImageRef.current;
			filename += "移动端长图.png";
		} else {
			targetEl = quoteCardRef.current;
			filename += "金句分享卡.png";
		}

		if (!targetEl) return;

		try {
			setIsCapturing(true);
			await captureAndDownloadElement(targetEl, filename);
			toast.success("卡片图片已成功导出下载");
		} catch (_error) {
			toast.danger("图片导出失败，请重试");
		} finally {
			setIsCapturing(false);
		}
	};

	// 一键批量下载所有小红书卡片
	const handleDownloadAllRedbookCards = async () => {
		if (redbookCards.length === 0) return;
		setIsCapturing(true);
		toast.info(`正在批量导出 ${redbookCards.length} 张卡片，请稍候…`);

		try {
			// 保存当前索引以在完成后恢复
			const originalIndex = currentCardIndex;
			for (let i = 0; i < redbookCards.length; i++) {
				setCurrentCardIndex(i);
				// 等待 React DOM 渲染完毕
				await new Promise((resolve) => setTimeout(resolve, 180));
				if (cardPreviewRef.current) {
					await captureAndDownloadElement(
						cardPreviewRef.current,
						`${title || "文章"}_小红书_${i + 1}of${redbookCards.length}.png`,
					);
				}
				// 避免同时弹过多下载窗口触发浏览器拦截
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
			setCurrentCardIndex(originalIndex);
			toast.success("所有小红书卡片导出完毕");
		} catch (_err) {
			toast.danger("批量导出中断，请重试");
		} finally {
			setIsCapturing(false);
		}
	};

	// 格式化不同平台的正文内容并写入剪贴板
	const handleCopyFormattedContent = async () => {
		try {
			if (targetPlatform === "wechat") {
				// 微信公众号富文本复制：带行高与内联排版
				const wechatHtml = `
					<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.8; color: #333333; letter-spacing: 0.5px; padding: 10px 0;">
						<h1 style="font-size: 20px; font-weight: 700; margin-bottom: 20px; color: #111111; line-height: 1.4;">${title || ""}</h1>
						${contentHtml}
						<p style="margin-top: 24px; font-size: 12px; color: #888888; text-align: center;">—— 本文由 AI Workstation 创作者工作台赋能 ——</p>
					</div>
				`;
				const blobHtml = new Blob([wechatHtml], { type: "text/html" });
				const blobText = new Blob([contentText], { type: "text/plain" });
				await navigator.clipboard.write([
					new ClipboardItem({
						"text/html": blobHtml,
						"text/plain": blobText,
					}),
				]);
				toast.success(
					"已复制微信公众号适配排版（含格式，直接在编辑器粘贴即可）",
				);
			} else if (targetPlatform === "redbook") {
				// 小红书文本：带标题、正文与推荐话题
				const tags = ["#干货分享", "#AI生产力", "#自我提升", "#内容创作"];
				const redbookText = `【${title || "精选文章"}】\n\n${contentText.slice(0, 800)}\n\n${tags.join(" ")}\n欢迎评论区交流～`;
				await navigator.clipboard.writeText(redbookText);
				toast.success("已复制小红书带标签文案到剪贴板");
			} else if (targetPlatform === "twitter") {
				// 推特短文
				const tweetText = `${title ? `《${title}》\n\n` : ""}${contentText.slice(0, 200)}...\n\n#AIWorkstation #Productivity`;
				await navigator.clipboard.writeText(tweetText);
				toast.success("已复制适合 X / Twitter 的精简推文");
			} else {
				// 知乎 Markdown / 文本
				const zhihuContent = `# ${title || ""}\n\n${markdown}`;
				await navigator.clipboard.writeText(zhihuContent);
				toast.success("已复制知乎适配排版");
			}

			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000);
		} catch (_err) {
			toast.danger("写入剪贴板失败，请手动复制");
		}
	};

	const currentCard = redbookCards[currentCardIndex];

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
			onClick={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				className="bg-surface dark:bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
				onClick={(e) => e.stopPropagation()}
			>
				{/* 模态框头部 */}
				<div className="flex items-center justify-between border-b border-border py-3 px-6 shrink-0">
					<div className="flex items-center gap-2">
						<Share2 className="w-5 h-5 text-accent" />
						<span className="font-semibold text-base">
							贴图生成与多平台分发 (Editor-δ)
						</span>
					</div>
					<div className="flex items-center gap-3">
						{/* 顶栏 Tab 切换 */}
						<div className="flex items-center bg-muted/10 p-0.5 rounded-lg text-xs">
							<button
								type="button"
								onClick={() => setActiveMainTab("card")}
								className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
									activeMainTab === "card"
										? "bg-surface shadow-xs text-foreground font-medium"
										: "text-muted hover:text-foreground"
								}`}
							>
								<ImageIcon className="w-3.5 h-3.5" />📱 贴图卡片
							</button>
							<button
								type="button"
								onClick={() => setActiveMainTab("distribute")}
								className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
									activeMainTab === "distribute"
										? "bg-surface shadow-xs text-foreground font-medium"
										: "text-muted hover:text-foreground"
								}`}
							>
								<Globe className="w-3.5 h-3.5" />🚀 平台分发
							</button>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="p-1 rounded-md text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* 模态框主体 */}
				<div className="p-6 overflow-y-auto flex-1">
					{/* ===== Tab 1: 贴图卡片 ===== */}
					{activeMainTab === "card" && (
						<div className="grid grid-cols-1 md:grid-cols-12 gap-6">
							{/* 左侧：控制参数 */}
							<div className="md:col-span-4 space-y-5">
								{/* 模式选择 */}
								<div>
									<div className="text-xs font-medium text-muted block mb-1.5">
										导出模式
									</div>
									<div className="grid grid-cols-3 gap-1.5 bg-muted/10 p-1 rounded-lg">
										<button
											type="button"
											onClick={() => setCardMode("redbook-slices")}
											className={`flex flex-col items-center py-2 px-1 rounded text-xs transition-colors cursor-pointer ${
												cardMode === "redbook-slices"
													? "bg-surface text-accent font-medium shadow-xs"
													: "text-muted hover:text-foreground"
											}`}
										>
											<Layers className="w-4 h-4 mb-1" />
											小红书 3:4
										</button>
										<button
											type="button"
											onClick={() => setCardMode("long-image")}
											className={`flex flex-col items-center py-2 px-1 rounded text-xs transition-colors cursor-pointer ${
												cardMode === "long-image"
													? "bg-surface text-accent font-medium shadow-xs"
													: "text-muted hover:text-foreground"
											}`}
										>
											<ImageIcon className="w-4 h-4 mb-1" />
											全篇长图
										</button>
										<button
											type="button"
											onClick={() => setCardMode("quote")}
											className={`flex flex-col items-center py-2 px-1 rounded text-xs transition-colors cursor-pointer ${
												cardMode === "quote"
													? "bg-surface text-accent font-medium shadow-xs"
													: "text-muted hover:text-foreground"
											}`}
										>
											<Quote className="w-4 h-4 mb-1" />
											金句卡片
										</button>
									</div>
								</div>

								{/* 主题选择 */}
								<div>
									<div className="text-xs font-medium text-muted block mb-1.5 flex items-center gap-1">
										<Palette className="w-3.5 h-3.5" />
										视觉配色主题
									</div>
									<div className="grid grid-cols-2 gap-2">
										{(Object.keys(CARD_THEMES) as CardTheme[]).map((tKey) => {
											const t = CARD_THEMES[tKey];
											const isSelected = cardTheme === tKey;
											return (
												<button
													key={tKey}
													type="button"
													onClick={() => setCardTheme(tKey)}
													className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all cursor-pointer ${
														isSelected
															? "border-accent bg-accent/5 ring-1 ring-accent"
															: "border-border hover:border-muted/50"
													}`}
												>
													<span
														className="w-4 h-4 rounded-full border border-black/10 shrink-0"
														style={{ backgroundColor: t.background }}
													/>
													<span className="font-medium">{t.name}</span>
												</button>
											);
										})}
									</div>
								</div>

								{/* 水印/署名 */}
								<div>
									<label
										htmlFor="card-author-name-input"
										className="text-xs font-medium text-muted block mb-1.5"
									>
										水印与署名
									</label>
									<input
										id="card-author-name-input"
										type="text"
										value={authorName}
										onChange={(e) => setAuthorName(e.target.value)}
										placeholder="例如：AI Workstation / 作者名"
										className="w-full text-xs px-3 py-1.5 rounded-md bg-surface-secondary border border-border outline-none focus:border-accent"
									/>
								</div>

								{/* 导出按钮操作区 */}
								<div className="pt-2 space-y-2">
									<Button
										variant="primary"
										className="w-full text-xs font-medium flex items-center justify-center gap-1.5"
										isPending={isCapturing}
										onPress={handleDownloadCurrentCard}
									>
										<Download className="w-4 h-4" />
										<span>
											{cardMode === "redbook-slices"
												? `下载当前卡片 (${currentCardIndex + 1}/${redbookCards.length})`
												: "下载高清 PNG"}
										</span>
									</Button>

									{cardMode === "redbook-slices" && (
										<Button
											variant="secondary"
											className="w-full text-xs"
											isPending={isCapturing}
											onPress={handleDownloadAllRedbookCards}
										>
											一键导出全部 {redbookCards.length} 张卡片
										</Button>
									)}
								</div>
							</div>

							{/* 右侧：实时卡片预览区 */}
							<div className="md:col-span-8 flex flex-col items-center justify-center bg-muted/10 rounded-xl p-4 min-h-[420px]">
								{/* 小红书 3:4 多图卡片预览 */}
								{cardMode === "redbook-slices" && currentCard && (
									<div className="flex flex-col items-center w-full">
										{/* 翻页器 */}
										<div className="flex items-center gap-3 mb-3 text-xs text-muted">
											<button
												type="button"
												disabled={currentCardIndex === 0}
												onClick={() =>
													setCurrentCardIndex((prev) => Math.max(0, prev - 1))
												}
												className="p-1 rounded hover:bg-surface disabled:opacity-40 cursor-pointer"
											>
												<ChevronLeft className="w-4 h-4" />
											</button>
											<span className="font-mono font-medium">
												{currentCard.pageIndicator}
											</span>
											<button
												type="button"
												disabled={currentCardIndex === redbookCards.length - 1}
												onClick={() =>
													setCurrentCardIndex((prev) =>
														Math.min(redbookCards.length - 1, prev + 1),
													)
												}
												className="p-1 rounded hover:bg-surface disabled:opacity-40 cursor-pointer"
											>
												<ChevronRight className="w-4 h-4" />
											</button>
										</div>

										{/* 渲染卡片 (保持 3:4 比例) */}
										<div
											ref={cardPreviewRef}
											style={{
												backgroundColor: theme.background,
												color: theme.textColor,
												borderColor: theme.cardBorder,
											}}
											className="w-[300px] h-[400px] rounded-xl shadow-lg border p-6 flex flex-col justify-between overflow-hidden relative"
										>
											{/* 卡片头部 */}
											<div className="flex items-center justify-between pb-3 border-b border-border/40 text-[11px] text-muted">
												<span className="font-semibold tracking-wider">
													{authorName}
												</span>
												<span className="font-mono text-[10px]">
													{currentCard.pageIndicator}
												</span>
											</div>

											{/* 卡片主体 */}
											<div className="flex-1 flex flex-col justify-center my-3 overflow-hidden">
												{currentCard.type === "cover" && (
													<div className="space-y-3">
														<div
															className="w-8 h-1 rounded-full"
															style={{
																backgroundColor: theme.accentColor,
															}}
														/>
														<h2 className="text-xl font-bold leading-snug line-clamp-3">
															{currentCard.title}
														</h2>
														<p
															className="text-xs leading-relaxed line-clamp-4"
															style={{ color: theme.mutedColor }}
														>
															{currentCard.summary}
														</p>
													</div>
												)}

												{currentCard.type === "body" && (
													<div
														className="text-xs leading-relaxed space-y-2 overflow-hidden"
														// biome-ignore lint/security/noDangerouslySetInnerHtml: Trusted rich text preview
														dangerouslySetInnerHTML={{
															__html: currentCard.contentHtml,
														}}
													/>
												)}

												{currentCard.type === "outro" && (
													<div className="text-center space-y-3 py-4">
														<Sparkles
															className="w-8 h-8 mx-auto"
															style={{ color: theme.accentColor }}
														/>
														<h3 className="text-base font-bold">
															{currentCard.title}
														</h3>
														<p
															className="text-xs whitespace-pre-line leading-relaxed"
															style={{ color: theme.mutedColor }}
														>
															{currentCard.summary}
														</p>
													</div>
												)}
											</div>

											{/* 卡片底栏 */}
											<div className="pt-2 border-t border-border/30 flex items-center justify-between text-[10px] text-muted">
												<span>精读分享 · 划重点</span>
												<span>Swipe ➔</span>
											</div>
										</div>
									</div>
								)}

								{/* 全篇长图预览 */}
								{cardMode === "long-image" && (
									<div className="max-h-[360px] overflow-y-auto w-full flex justify-center py-2">
										<div
											ref={longImageRef}
											style={{
												backgroundColor: theme.background,
												color: theme.textColor,
												borderColor: theme.cardBorder,
											}}
											className="w-[320px] rounded-xl shadow-lg border p-6 space-y-4"
										>
											<div className="border-b border-border/40 pb-3">
												<span
													className="text-[10px] uppercase font-bold tracking-widest"
													style={{ color: theme.accentColor }}
												>
													{authorName}
												</span>
												<h1 className="text-lg font-bold mt-1 leading-snug">
													{title || "未命名文章"}
												</h1>
											</div>
											<div
												className="text-xs leading-relaxed space-y-3"
												// biome-ignore lint/security/noDangerouslySetInnerHtml: Trusted rich text preview
												dangerouslySetInnerHTML={{
													__html: contentHtml,
												}}
											/>
											<div className="border-t border-border/40 pt-3 text-center text-[10px] text-muted">
												—— 本文阅读完毕 · 感谢关注 ——
											</div>
										</div>
									</div>
								)}

								{/* 金句卡片预览 */}
								{cardMode === "quote" && (
									<div
										ref={quoteCardRef}
										style={{
											backgroundColor: theme.background,
											color: theme.textColor,
											borderColor: theme.cardBorder,
										}}
										className="w-[340px] rounded-xl shadow-lg border p-7 relative overflow-hidden"
									>
										<Quote
											className="w-12 h-12 opacity-15 absolute top-3 left-4"
											style={{ color: theme.accentColor }}
										/>
										<div className="relative z-10 space-y-4">
											<p className="text-sm font-medium leading-relaxed italic pt-3">
												“{quoteSnippet}”
											</p>
											<div className="border-t border-border/40 pt-3 flex items-center justify-between text-xs text-muted">
												<span className="font-semibold text-foreground truncate max-w-[180px]">
													《{title || "未命名文档"}》
												</span>
												<span className="text-[11px]">{authorName}</span>
											</div>
										</div>
									</div>
								)}
							</div>
						</div>
					)}

					{/* ===== Tab 2: 平台分发 ===== */}
					{activeMainTab === "distribute" && (
						<div className="space-y-6">
							{/* 平台选择器 */}
							<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
								{[
									{
										id: "wechat",
										name: "微信公众号",
										desc: "自适应微信排版/带字间距",
									},
									{
										id: "redbook",
										name: "小红书",
										desc: "精简文案 + 热门话题标签",
									},
									{
										id: "zhihu",
										name: "知乎专栏",
										desc: "标准 Markdown / 论文排版",
									},
									{
										id: "twitter",
										name: "X / Twitter",
										desc: "280 字符极简推文提炼",
									},
								].map((p) => {
									const isSelected = targetPlatform === p.id;
									return (
										<button
											key={p.id}
											type="button"
											onClick={() => setTargetPlatform(p.id as PublishPlatform)}
											className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
												isSelected
													? "border-accent bg-accent/5 ring-1 ring-accent"
													: "border-border hover:border-muted/50"
											}`}
										>
											<div className="font-semibold text-xs mb-1">{p.name}</div>
											<div className="text-[11px] text-muted line-clamp-1">
												{p.desc}
											</div>
										</button>
									);
								})}
							</div>

							{/* 平台预览预览区与操作 */}
							<div className="bg-surface-secondary border border-border rounded-xl p-4 space-y-4">
								<div className="flex items-center justify-between">
									<span className="text-xs font-medium text-muted">
										排版格式适配预览
									</span>
									<Button
										size="sm"
										variant="primary"
										className="text-xs flex items-center gap-1.5"
										onPress={handleCopyFormattedContent}
									>
										{isCopied ? (
											<Check className="w-3.5 h-3.5" />
										) : (
											<Copy className="w-3.5 h-3.5" />
										)}
										<span>{isCopied ? "已复制格式" : "复制适配排版"}</span>
									</Button>
								</div>

								{/* 内容预览窗 */}
								<div className="bg-surface border border-border/60 rounded-lg p-4 max-h-[220px] overflow-y-auto text-xs text-muted leading-relaxed font-mono">
									{targetPlatform === "wechat" && (
										<div>
											<p className="font-bold text-foreground mb-2">
												【微信公众号格式预览】
											</p>
											<p>标题：{title}</p>
											<p className="mt-2 text-foreground/80">
												正文已包装内联样式（font-size: 15px; line-height: 1.8;
												color:
												#333）。点击上方「复制适配排版」后，可直接在微信公众号网页编辑器中粘贴，保留排版。
											</p>
										</div>
									)}
									{targetPlatform === "redbook" && (
										<div>
											<p className="font-bold text-foreground mb-1">
												【小红书文案预览】
											</p>
											<p>【{title || "精选文章"}】</p>
											<p className="my-2">{contentText.slice(0, 300)}...</p>
											<p className="text-accent font-sans">
												#干货分享 #AI生产力 #自我提升 #内容创作
											</p>
										</div>
									)}
									{targetPlatform === "twitter" && (
										<div>
											<p className="font-bold text-foreground mb-1">
												【X / Twitter 推文预览】
											</p>
											<p>{title ? `《${title}》\n\n` : ""}</p>
											<p>{contentText.slice(0, 180)}...</p>
											<p className="text-accent mt-2">
												#AIWorkstation #Productivity
											</p>
										</div>
									)}
									{targetPlatform === "zhihu" && (
										<div>
											<p className="font-bold text-foreground mb-1">
												【知乎专栏 Markdown 预览】
											</p>
											<p className="whitespace-pre-line">
												# {title || ""}\n\n{markdown.slice(0, 400)}...
											</p>
										</div>
									)}
								</div>

								{/* 插件控制通道与红线提示 */}
								<div className="bg-accent/5 border border-accent/20 rounded-lg p-3 text-[11px] text-muted space-y-1.5">
									<div className="flex items-center gap-1.5 text-foreground font-medium">
										<Sparkles className="w-3.5 h-3.5 text-accent" />
										浏览器插件控制通道 (AI Collector P2)
									</div>
									<p>
										当 AI Collector
										插件在后台运行时，可将当前草稿直接填充至微信公众号、小红书创作者平台编辑器。
									</p>
									<p className="text-warning text-[10px]">
										⚠️
										架构红线：为避免平台风控与误发，系统仅做富文本草稿填充，最终发布动作必须由人工在平台网页审核后手动点击。
									</p>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* 模态框底栏 */}
				<div className="border-t border-border py-3 px-6 flex justify-end shrink-0">
					<Button size="sm" variant="ghost" onPress={onClose}>
						关闭
					</Button>
				</div>
			</div>
		</div>
	);
}
