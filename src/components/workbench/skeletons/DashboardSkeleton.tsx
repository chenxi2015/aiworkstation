import { Card } from "@heroui/react";

/**
 * Widget 骨架的内容形态，按真实 widget 主体的结构选取：
 * - hero-rows：大数字横幅 + 条目行（待整理 / Skills 概览）
 * - rows：图标 + 双行文本的条目列表（最近收藏 / 创作文档 / 常用文件夹）
 * - tiles-rows：3 格统计块 + 条目行（自媒体管道）
 * - tiles：2×3 统计块网格（资产与健康）
 * - calendar：图例行 + 7 列日格（活动日历）
 */
type WidgetVariant = "hero-rows" | "rows" | "tiles-rows" | "tiles" | "calendar";

/** 镜像 widgetRegistry 注册表的默认顺序与宽窄，保持骨架与首屏布局一致 */
const WIDGET_SKELETONS: ReadonlyArray<{
	key: string;
	wide?: boolean;
	variant: WidgetVariant;
}> = [
	{ key: "inbox", variant: "hero-rows" },
	{ key: "recent-bookmarks", wide: true, variant: "rows" },
	{ key: "creator-pipeline", variant: "tiles-rows" },
	{ key: "editor-recent", variant: "rows" },
	{ key: "folder-shortcuts", variant: "rows" },
	{ key: "skills-overview", variant: "hero-rows" },
	{ key: "insights", wide: true, variant: "tiles" },
	{ key: "activity-calendar", wide: true, variant: "calendar" },
];

/** 列表行占位：图标 + 标题/副标题双行 + 右侧时间戳 */
function RowsBody({ count }: { count: number }) {
	return (
		<ul className="space-y-2.5">
			{Array.from({ length: count }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are static
				<li key={i} className="flex items-center gap-2.5">
					<span className="w-6 h-6 rounded-md bg-surface-secondary/70 shrink-0" />
					<span className="flex-1 min-w-0 space-y-1">
						<span className="block w-4/5 h-3 rounded bg-surface-secondary/70" />
						<span className="block w-2/5 h-2 rounded bg-surface-secondary/40" />
					</span>
					<span className="w-8 h-2.5 rounded bg-surface-secondary/40 shrink-0" />
				</li>
			))}
		</ul>
	);
}

function WidgetBody({ variant }: { variant: WidgetVariant }) {
	switch (variant) {
		case "hero-rows":
			return (
				<div className="flex flex-col gap-2.5">
					<div className="flex items-baseline gap-2 rounded-xl bg-surface-secondary/50 px-3 py-2">
						<span className="w-10 h-7 rounded bg-surface-secondary/80" />
						<span className="w-24 h-2.5 rounded bg-surface-secondary/50" />
					</div>
					<div className="space-y-1.5 px-1">
						<div className="w-11/12 h-2.5 rounded bg-surface-secondary/50" />
						<div className="w-4/5 h-2.5 rounded bg-surface-secondary/40" />
						<div className="w-3/5 h-2.5 rounded bg-surface-secondary/40" />
					</div>
				</div>
			);
		case "tiles-rows":
			return (
				<div className="flex flex-col gap-2.5">
					<div className="grid grid-cols-3 gap-2">
						{Array.from({ length: 3 }, (_, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are static
								key={i}
								className="rounded-xl bg-surface-secondary/50 px-2.5 py-2 space-y-1.5"
							>
								<div className="w-8 h-4 rounded bg-surface-secondary/80" />
								<div className="w-10 h-2 rounded bg-surface-secondary/50" />
							</div>
						))}
					</div>
					<div className="space-y-1.5 px-1">
						<div className="w-11/12 h-2.5 rounded bg-surface-secondary/50" />
						<div className="w-3/5 h-2.5 rounded bg-surface-secondary/40" />
					</div>
				</div>
			);
		case "tiles":
			return (
				<div className="grid grid-cols-3 gap-2">
					{Array.from({ length: 6 }, (_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are static
							key={i}
							className="rounded-xl bg-surface-secondary/50 px-3 py-2.5 space-y-1.5"
						>
							<div className="w-10 h-4 rounded bg-surface-secondary/80" />
							<div className="w-12 h-2 rounded bg-surface-secondary/50" />
						</div>
					))}
				</div>
			);
		case "calendar":
			return (
				<div className="flex flex-col gap-2.5">
					<div className="flex items-center gap-2">
						{Array.from({ length: 4 }, (_, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are static
								key={i}
								className="flex items-center gap-1"
							>
								<span className="w-2 h-2 rounded-full bg-surface-secondary/70" />
								<span className="w-6 h-2 rounded bg-surface-secondary/50" />
							</span>
						))}
					</div>
					<div className="grid grid-cols-7 gap-1">
						{Array.from({ length: 35 }, (_, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are static
								key={i}
								className="aspect-square rounded-md bg-surface-secondary/40 border border-border/30"
							/>
						))}
					</div>
				</div>
			);
		default:
			return <RowsBody count={4} />;
	}
}

/** 单个 widget 卡片骨架：镜像 WidgetCard 的标题栏（图标 chip + 标题/副标题 + 模块跳转 pill） */
function WidgetCardSkeleton({
	wide,
	variant,
}: {
	wide?: boolean;
	variant: WidgetVariant;
}) {
	return (
		<Card className={`min-w-0 ${wide ? "md:col-span-2" : ""}`}>
			<Card.Header className="flex-row items-center gap-3">
				<span className="w-8 h-8 rounded-lg bg-surface-secondary/80 shrink-0" />
				<div className="min-w-0 flex-1 space-y-1.5">
					<div className="w-20 h-3.5 rounded bg-surface-secondary/80" />
					<div className="w-32 h-2.5 rounded bg-surface-secondary/40" />
				</div>
				<div className="w-14 h-6 rounded-full bg-surface-secondary/50 shrink-0" />
			</Card.Header>
			<Card.Content>
				<WidgetBody variant={variant} />
			</Card.Content>
		</Card>
	);
}

/**
 * 工作台路由的 pending 骨架，按 DashboardApp 真实内容排布：
 * Hero 横幅（问候 + 日期 + 4 个统计 chip + 自定义布局按钮）+ 默认布局的 widget 网格。
 */
export function DashboardSkeleton() {
	return (
		<div className="h-full bg-surface-secondary/60 dark:bg-background text-foreground flex flex-col overflow-hidden">
			<main className="flex-1 overflow-y-auto">
				<div className="max-w-7xl mx-auto px-6 py-6 animate-pulse">
					{/* Hero 横幅骨架 */}
					<div className="mb-5 rounded-2xl border border-border/60 bg-surface px-5 py-4 flex items-center gap-4">
						<div className="flex-1 min-w-0 space-y-2">
							<div className="w-44 h-5 rounded bg-surface-secondary/80" />
							<div className="w-64 h-3 rounded bg-surface-secondary/40" />
						</div>
						<div className="hidden sm:flex items-center gap-2 shrink-0">
							{Array.from({ length: 4 }, (_, i) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are static
									key={i}
									className="px-3 py-1.5 rounded-xl bg-surface-secondary/60 border border-border/50 flex flex-col items-center gap-1"
								>
									<span className="w-8 h-3.5 rounded bg-surface-secondary/80" />
									<span className="w-9 h-2 rounded bg-surface-secondary/50" />
								</div>
							))}
						</div>
						<div className="w-20 h-8 rounded-full bg-surface-secondary/60 shrink-0" />
					</div>

					{/* Widget 网格骨架 */}
					<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-[minmax(180px,auto)]">
						{WIDGET_SKELETONS.map((widget) => (
							<WidgetCardSkeleton
								key={widget.key}
								wide={widget.wide}
								variant={widget.variant}
							/>
						))}
					</div>
				</div>
			</main>
		</div>
	);
}
