import { Quote } from "lucide-react";
import type { CardThemeConfig } from "../types";
import type { SlideModel } from "./variantFallback";

/**
 * 小红书 3:4 卡片面（docs/creator-publish-plan.md P2）
 * 统一渲染 AI 文本卡与机械 HTML 卡；逻辑尺寸 360×480，
 * 预览时由父容器 transform scale 缩放，导出时按 pixelRatio=3 全像素捕获。
 */
export function RedbookSlideCard({
	slide,
	theme,
	author,
}: {
	slide: SlideModel;
	theme: CardThemeConfig;
	author: string;
}) {
	return (
		<div
			style={{
				backgroundColor: theme.background,
				color: theme.textColor,
				borderColor: theme.cardBorder,
			}}
			className="w-[360px] h-[480px] rounded-xl border p-7 flex flex-col justify-between overflow-hidden relative select-none"
		>
			{/* 卡片头部 */}
			<div className="flex items-center justify-between pb-3 border-b border-border/40 text-[12px] text-muted shrink-0">
				<span className="font-semibold tracking-wider">{author}</span>
				<span className="font-mono text-[11px]">{slide.pageIndicator}</span>
			</div>

			{/* 卡片主体 */}
			<div className="flex-1 flex flex-col justify-center my-4 overflow-hidden">
				{slide.type === "cover" && (
					<div className="space-y-4">
						<div
							className="w-10 h-1.5 rounded-full"
							style={{ backgroundColor: theme.accentColor }}
						/>
						<h2 className="text-[26px] font-bold leading-snug line-clamp-3">
							{slide.title}
						</h2>
						<p
							className="text-[14px] leading-relaxed line-clamp-3"
							style={{ color: theme.mutedColor }}
						>
							{slide.summary}
						</p>
					</div>
				)}

				{slide.type === "body" && slide.html === undefined && (
					<div className="space-y-3">
						{slide.heading && (
							<h3
								className="text-[17px] font-bold leading-snug"
								style={{ color: theme.accentColor }}
							>
								{slide.heading}
							</h3>
						)}
						<p className="text-[13.5px] leading-[1.9] whitespace-pre-line">
							{slide.text}
						</p>
					</div>
				)}

				{slide.type === "body" && slide.html !== undefined && (
					<div
						className="text-[13px] leading-relaxed space-y-2 overflow-hidden"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: 本地文档自产富文本预览
						dangerouslySetInnerHTML={{ __html: slide.html }}
					/>
				)}

				{slide.type === "outro" && (
					<div className="text-center space-y-4 py-4">
						<Quote
							className="w-9 h-9 mx-auto"
							style={{ color: theme.accentColor }}
						/>
						<h3 className="text-[18px] font-bold">{slide.title}</h3>
						<p
							className="text-[13px] whitespace-pre-line leading-relaxed"
							style={{ color: theme.mutedColor }}
						>
							{slide.summary}
						</p>
					</div>
				)}
			</div>

			{/* 卡片底栏 */}
			<div className="pt-3 border-t border-border/30 flex items-center justify-between text-[11px] text-muted shrink-0">
				<span>精读分享 · 划重点</span>
				<span>Swipe ➔</span>
			</div>
		</div>
	);
}
