import type { CSSProperties } from "react";
import type { CoverSpec } from "./cardExporter";
import type { CardThemeConfig } from "./types";

interface CoverCardProps {
	spec: CoverSpec;
	theme: CardThemeConfig;
	title: string;
	author: string;
	summary?: string;
	dateLabel?: string;
}

/**
 * 平台封面卡（docs/creator-publish-plan.md P1）
 * 干净清爽风格：纯色底 + 单一强调色短杠 + 大标题 + 底部署名行，
 * 无渐变/纹理/装饰。所有规格共用一套版式语言，仅随横竖版微调。
 * 供分发弹窗预览与公众号发布封面离屏渲染共用。
 */
export function CoverCard({
	spec,
	theme,
	title,
	author,
	summary,
	dateLabel,
}: CoverCardProps) {
	const isVertical = spec.logicalHeight > spec.logicalWidth;
	const padX = Math.round(spec.logicalWidth * 0.09);
	const padY = Math.round(spec.logicalHeight * 0.1);
	const titleSize = isVertical ? 30 : 28;
	const barWidth = Math.max(28, Math.round(spec.logicalWidth * 0.09));
	// 竖版摘要 3 行；横版在空间足够时（如 B站 16:9）放 1 行，公众号短头图不放
	const summaryClamp = isVertical ? 3 : spec.logicalHeight >= 230 ? 1 : 0;

	const containerStyle: CSSProperties = {
		width: spec.logicalWidth,
		height: spec.logicalHeight,
		backgroundColor: theme.background,
		color: theme.textColor,
		fontFamily:
			"-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif",
		display: "flex",
		flexDirection: "column",
		justifyContent: "space-between",
		padding: `${padY}px ${padX}px`,
		boxSizing: "border-box",
		border: `1px solid ${theme.cardBorder}`,
		overflow: "hidden",
	};

	const dateText =
		dateLabel ??
		new Date().toLocaleDateString("zh-CN", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});

	return (
		<div style={containerStyle}>
			{/* 顶部：强调色短杠 + 标题区 */}
			<div>
				<div
					style={{
						width: barWidth,
						height: 4,
						borderRadius: 2,
						backgroundColor: theme.accentColor,
						marginBottom: isVertical ? 20 : 14,
					}}
				/>
				<div
					style={{
						fontSize: titleSize,
						fontWeight: 700,
						lineHeight: 1.32,
						letterSpacing: 0.5,
						display: "-webkit-box",
						WebkitLineClamp: isVertical ? 3 : 2,
						WebkitBoxOrient: "vertical",
						overflow: "hidden",
					}}
				>
					{title || "未命名文章"}
				</div>
				{summary && summaryClamp > 0 && (
					<div
						style={{
							marginTop: 14,
							fontSize: 13,
							lineHeight: 1.7,
							color: theme.mutedColor,
							display: "-webkit-box",
							WebkitLineClamp: summaryClamp,
							WebkitBoxOrient: "vertical",
							overflow: "hidden",
						}}
					>
						{summary}
					</div>
				)}
			</div>

			{/* 底部：署名行 */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					fontSize: 11,
					color: theme.mutedColor,
					letterSpacing: 1.5,
					borderTop: `1px solid ${theme.cardBorder}`,
					paddingTop: isVertical ? 14 : 10,
				}}
			>
				<span style={{ fontWeight: 600, color: theme.accentColor }}>
					{author || "AI Workstation"}
				</span>
				<span>{dateText}</span>
			</div>
		</div>
	);
}
