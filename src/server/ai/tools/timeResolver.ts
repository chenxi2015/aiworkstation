import type { ResolvedTimeRange } from "./types";

/**
 * Helper to calculate precise start and end boundaries for time ranges
 */
export function resolveTimeRange(
	timeRange?: string,
	customStart?: string,
	customEnd?: string,
): ResolvedTimeRange {
	const now = new Date();

	// If explicit custom date range is provided
	if (customStart || customEnd) {
		const startMs = customStart
			? new Date(`${customStart}T00:00:00`).getTime()
			: undefined;
		const endMs = customEnd
			? new Date(`${customEnd}T23:59:59.999`).getTime()
			: undefined;
		return {
			startTimeMs: startMs,
			endTimeMs: endMs,
			startDateStr: customStart,
			endDateStr: customEnd,
			description: `${customStart || "起始"} 至 ${customEnd || "至今"}`,
		};
	}

	if (!timeRange || timeRange === "all") {
		return { description: "全部时间" };
	}

	const todayStart = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		0,
		0,
		0,
		0,
	);
	const todayEnd = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		23,
		59,
		59,
		999,
	);

	switch (timeRange) {
		case "today": {
			return {
				startTimeMs: todayStart.getTime(),
				endTimeMs: todayEnd.getTime(),
				startDateStr: todayStart.toISOString().split("T")[0],
				endDateStr: todayEnd.toISOString().split("T")[0],
				description: "今天",
			};
		}
		case "yesterday": {
			const yStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
			const yEnd = new Date(todayStart.getTime() - 1);
			return {
				startTimeMs: yStart.getTime(),
				endTimeMs: yEnd.getTime(),
				startDateStr: yStart.toISOString().split("T")[0],
				endDateStr: yEnd.toISOString().split("T")[0],
				description: "昨天",
			};
		}
		case "this_week": {
			// Monday as the first day of the week
			const day = now.getDay();
			const diffToMonday = (day === 0 ? 6 : day - 1) * 24 * 60 * 60 * 1000;
			const mondayStart = new Date(todayStart.getTime() - diffToMonday);
			return {
				startTimeMs: mondayStart.getTime(),
				endTimeMs: todayEnd.getTime(),
				startDateStr: mondayStart.toISOString().split("T")[0],
				endDateStr: todayEnd.toISOString().split("T")[0],
				description: "本周",
			};
		}
		case "last_week": {
			const day = now.getDay();
			const diffToMonday = (day === 0 ? 6 : day - 1) * 24 * 60 * 60 * 1000;
			const thisMonday = new Date(todayStart.getTime() - diffToMonday);
			const lastMonday = new Date(
				thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000,
			);
			const lastSundayEnd = new Date(thisMonday.getTime() - 1);
			return {
				startTimeMs: lastMonday.getTime(),
				endTimeMs: lastSundayEnd.getTime(),
				startDateStr: lastMonday.toISOString().split("T")[0],
				endDateStr: lastSundayEnd.toISOString().split("T")[0],
				description: "上周",
			};
		}
		case "this_month": {
			const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
			return {
				startTimeMs: monthStart.getTime(),
				endTimeMs: todayEnd.getTime(),
				startDateStr: monthStart.toISOString().split("T")[0],
				endDateStr: todayEnd.toISOString().split("T")[0],
				description: "本月",
			};
		}
		case "recent_7_days": {
			const past7Days = new Date(
				todayStart.getTime() - 7 * 24 * 60 * 60 * 1000,
			);
			return {
				startTimeMs: past7Days.getTime(),
				endTimeMs: todayEnd.getTime(),
				startDateStr: past7Days.toISOString().split("T")[0],
				endDateStr: todayEnd.toISOString().split("T")[0],
				description: "最近 7 天",
			};
		}
		case "recent_30_days": {
			const past30Days = new Date(
				todayStart.getTime() - 30 * 24 * 60 * 60 * 1000,
			);
			return {
				startTimeMs: past30Days.getTime(),
				endTimeMs: todayEnd.getTime(),
				startDateStr: past30Days.toISOString().split("T")[0],
				endDateStr: todayEnd.toISOString().split("T")[0],
				description: "最近 30 天",
			};
		}
		default: {
			return { description: timeRange };
		}
	}
}
