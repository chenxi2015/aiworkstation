import { Calendar } from "@heroui/react";
import {
	type CalendarDate,
	getLocalTimeZone,
	today,
} from "@internationalized/date";
import { Link } from "@tanstack/react-router";
import { Inbox, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { I18nProvider } from "react-aria-components";
import { getActivityDayEvents } from "../../../server/functions/dashboard";
import type { ActivityDay, ActivityEvent, ActivityKind } from "../types";
import type { DashboardWidgetProps } from "./widgetProps";

/** 事件类型的展示身份：标签 + 圆点/徽章配色（亮/暗双模式） */
const KIND_META: Record<
	ActivityKind,
	{ label: string; dot: string; badge: string }
> = {
	bookmark: {
		label: "收藏",
		dot: "bg-sky-600 dark:bg-sky-400",
		badge: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
	},
	material: {
		label: "素材",
		dot: "bg-amber-600 dark:bg-amber-400",
		badge:
			"bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
	},
	document: {
		label: "创作",
		dot: "bg-emerald-700 dark:bg-emerald-300",
		badge:
			"bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
	},
};

const KIND_ORDER: ActivityKind[] = ["bookmark", "material", "document"];

/** 热点强度 0-4（固定阈值，跨月可比，类 GitHub contributions 的 Less→More） */
function intensityLevel(total: number): number {
	if (total <= 0) return 0;
	if (total <= 2) return 1;
	if (total <= 5) return 2;
	if (total <= 9) return 3;
	return 4;
}

const LEVEL_BG = [
	"",
	"bg-emerald-100 dark:bg-emerald-400/15",
	"bg-emerald-200 dark:bg-emerald-400/30",
	"bg-emerald-400/60 dark:bg-emerald-400/50",
	"bg-emerald-500/80 dark:bg-emerald-400/70",
];

/** 各类事件的深链：点标题跳回所属模块并定位条目 */
function eventLink(kind: ActivityKind, id: string | number) {
	switch (kind) {
		case "bookmark":
			return { to: "/bookmarks" as const, search: { item: String(id) } };
		case "material":
			return {
				to: "/creator/materials" as const,
			};
		case "document":
			return {
				to: "/creator/studio" as const,
				search: {
					mode: "doc" as const,
					doc: Number(id),
				},
			};
	}
}

/**
 * 活动日历：HeroUI Calendar 月历 + 按日热点强度（收藏/素材/创作三类动作聚合）。
 * 点日期按需加载当日事件明细（不随汇总接口全量下发），标题可深链回所属模块定位。
 */
export function ActivityCalendarWidget({ summary }: DashboardWidgetProps) {
	const dayMap = useMemo(() => {
		const map = new Map<string, ActivityDay>();
		for (const day of summary.activity.days) map.set(day.date, day);
		return map;
	}, [summary.activity.days]);

	const todayDate = today(getLocalTimeZone());

	const [selected, setSelected] = useState<CalendarDate | null>(todayDate);
	const [focused, setFocused] = useState<CalendarDate>(todayDate);
	/** 已展开「全部事件」的日期（换日期自动收回预览态） */
	const [expandedFor, setExpandedFor] = useState<string | null>(null);
	/** 单日事件明细缓存（按日期懒加载，避免汇总接口携带近半年全量明细） */
	const [eventsCache, setEventsCache] = useState<
		ReadonlyMap<string, ActivityEvent[]>
	>(() => new Map());
	const [loadingFor, setLoadingFor] = useState<string | null>(null);
	const requestSeq = useRef(0);

	const goToday = () => {
		setSelected(todayDate);
		setFocused(todayDate);
	};

	const selectedStr = selected?.toString() ?? "";
	const selectedDay = selectedStr ? dayMap.get(selectedStr) : undefined;
	const selectedLabel = selected
		? `${selected.month}月${selected.day}日`
		: "未选择日期";
	const expanded = expandedFor === selectedStr;

	// 选中日期有活动且未缓存时按需拉取明细；seq 防旧请求覆盖新选择
	useEffect(() => {
		if (!selectedStr || !selectedDay || selectedDay.total === 0) return;
		if (eventsCache.has(selectedStr)) return;
		const seq = ++requestSeq.current;
		setLoadingFor(selectedStr);
		getActivityDayEvents({ data: selectedStr })
			.then((events) => {
				if (requestSeq.current !== seq) return;
				setEventsCache((prev) => new Map(prev).set(selectedStr, events));
			})
			.catch((err) => {
				if (requestSeq.current !== seq) return;
				console.warn("[ActivityCalendar] load day events error:", err);
				setEventsCache((prev) => new Map(prev).set(selectedStr, []));
			})
			.finally(() => {
				if (requestSeq.current === seq) setLoadingFor(null);
			});
	}, [selectedStr, selectedDay, eventsCache]);

	const selectedEvents =
		(selectedStr ? eventsCache.get(selectedStr) : undefined) ?? [];
	const eventsLoading =
		loadingFor === selectedStr && !eventsCache.has(selectedStr);
	/** 预览态只显示前几条，点「其余 N 条」展开后在面板内滚动 */
	const PREVIEW_COUNT = 8;
	const visibleEvents =
		!expanded && selectedEvents.length > PREVIEW_COUNT
			? selectedEvents.slice(0, PREVIEW_COUNT)
			: selectedEvents;

	return (
		<div className="flex flex-col gap-3 h-full">
			<div className="flex flex-col sm:flex-row gap-3 flex-1 min-h-0 min-w-0">
				{/* HeroUI Calendar：受控选中 + 焦点日期（控制可见月份） */}
				<I18nProvider locale="zh-CN">
					<Calendar
						aria-label="活动日历"
						value={selected}
						onChange={setSelected}
						focusedValue={focused}
						onFocusChange={setFocused}
						firstDayOfWeek="mon"
						className="w-full max-w-none sm:w-63 sm:max-w-63 shrink-0"
					>
						<Calendar.Header>
							<Calendar.Heading className="text-sm font-semibold" />
							<div className="flex items-center gap-1">
								<button
									type="button"
									onClick={goToday}
									className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-secondary text-muted hover:text-foreground cursor-pointer"
								>
									今天
								</button>
								<Calendar.NavButton slot="previous" />
								<Calendar.NavButton slot="next" />
							</div>
						</Calendar.Header>
						<Calendar.Grid>
							<Calendar.GridHeader>
								{(day) => (
									<Calendar.HeaderCell className="text-[10px]">
										{day}
									</Calendar.HeaderCell>
								)}
							</Calendar.GridHeader>
							<Calendar.GridBody>
								{(date) => {
									const dateStr = date.toString();
									const day = dayMap.get(dateStr);
									const total = day?.total ?? 0;
									const level = intensityLevel(total);
									return (
										<Calendar.Cell
											date={date}
											className={`rounded-lg ${LEVEL_BG[level]} data-[selected=true]:bg-accent`}
										>
											{({ formattedDate, isToday, isSelected }) => (
												<span className="flex flex-col items-center justify-center gap-[3px] leading-none">
													<span
														className={`text-[11px] ${
															isToday && !isSelected
																? "font-bold"
																: "font-medium"
														} ${
															level >= 3 && !isSelected
																? "text-emerald-950 dark:text-emerald-50"
																: ""
														}`}
													>
														{formattedDate}
													</span>
													{day && (
														<span
															className={`flex gap-[3px] items-center rounded-full px-[3px] py-[2px] ${
																isSelected ? "" : "bg-white/80 dark:bg-black/35"
															}`}
														>
															{KIND_ORDER.filter((k) => day.counts[k] > 0).map(
																(k) => (
																	<span
																		key={k}
																		className={`w-[5px] h-[5px] rounded-full ${
																			isSelected
																				? "bg-accent-foreground"
																				: KIND_META[k].dot
																		}`}
																	/>
																),
															)}
														</span>
													)}
												</span>
											)}
										</Calendar.Cell>
									);
								}}
							</Calendar.GridBody>
						</Calendar.Grid>
					</Calendar>
				</I18nProvider>

				{/* 当日任务明细 */}
				<div className="flex-1 min-w-0 min-h-0 max-h-80 flex flex-col rounded-xl border border-border/50 bg-surface/60 dark:bg-surface-secondary/30">
					<div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 shrink-0">
						<span className="text-xs font-semibold">{selectedLabel}</span>
						{selectedDay ? (
							<span className="flex items-center gap-1.5 flex-wrap">
								{KIND_ORDER.filter((k) => selectedDay.counts[k] > 0).map(
									(k) => (
										<span
											key={k}
											className={`px-1.5 py-px rounded-full text-[10px] font-medium ${KIND_META[k].badge}`}
										>
											{KIND_META[k].label} {selectedDay.counts[k]}
										</span>
									),
								)}
							</span>
						) : (
							<span className="text-[10px] text-muted">无记录</span>
						)}
					</div>
					{eventsLoading ? (
						<div className="flex-1 min-h-24 flex items-center justify-center gap-2 text-muted">
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
							<span className="text-[11px]">加载当日记录…</span>
						</div>
					) : selectedDay && visibleEvents.length > 0 ? (
						<ul className="flex-1 min-h-0 overflow-y-auto px-2 py-1.5 space-y-0.5">
							{visibleEvents.map((event) => {
								const meta = KIND_META[event.kind];
								const link = eventLink(event.kind, event.id);
								return (
									<li key={`${event.kind}-${event.id}`}>
										<Link
											to={link.to}
											search={link.search}
											title={`打开「${event.title}」`}
											className="flex items-center gap-1.5 min-w-0 rounded-md px-1.5 py-1 text-[11px] text-muted hover:bg-surface-secondary hover:text-foreground transition-colors"
										>
											<span
												className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`}
											/>
											<span
												className={`shrink-0 px-1 rounded text-[9px] font-medium ${meta.badge}`}
											>
												{meta.label}
											</span>
											<span className="flex-1 min-w-0 truncate">
												{event.title}
											</span>
										</Link>
									</li>
								);
							})}
							{!expanded && selectedEvents.length > visibleEvents.length && (
								<li>
									<button
										type="button"
										onClick={() => setExpandedFor(selectedStr)}
										className="w-full px-1.5 py-1 rounded-md text-[10px] text-accent hover:bg-surface-secondary cursor-pointer transition-colors"
									>
										… 展开其余 {selectedEvents.length - visibleEvents.length} 条
									</button>
								</li>
							)}
							{expanded && selectedDay.total > selectedEvents.length && (
								<li className="px-1.5 py-1 text-[10px] text-muted">
									… 另有 {selectedDay.total - selectedEvents.length}{" "}
									条未加载（单日最多加载 50 条明细）
								</li>
							)}
						</ul>
					) : (
						<div className="flex-1 min-h-24 flex flex-col items-center justify-center gap-2 p-4 text-center select-none">
							<div className="w-8 h-8 rounded-full bg-surface-secondary flex items-center justify-center text-muted/70">
								<Inbox className="w-4 h-4" />
							</div>
							<p className="text-[11px] text-muted">
								当天没有收藏、素材或创作记录
							</p>
						</div>
					)}
				</div>
			</div>

			{/* 图例 */}
			<div className="flex items-center justify-between gap-3 shrink-0 text-[10px] text-muted">
				<div className="flex items-center gap-3">
					{KIND_ORDER.map((k) => (
						<span key={k} className="flex items-center gap-1">
							<span
								className={`w-1.5 h-1.5 rounded-full ${KIND_META[k].dot}`}
							/>
							{KIND_META[k].label}
						</span>
					))}
				</div>
				<div className="flex items-center gap-1">
					少
					{LEVEL_BG.slice(1).map((bg) => (
						<span
							key={bg}
							className={`w-2.5 h-2.5 rounded-[3px] ${bg} border border-border/30`}
						/>
					))}
					多
				</div>
			</div>
		</div>
	);
}
