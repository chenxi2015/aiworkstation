const DAY_NAMES = [
	"星期日",
	"星期一",
	"星期二",
	"星期三",
	"星期四",
	"星期五",
	"星期六",
];

/** Return formatted date string: e.g. "2026-09-11 (星期四)" */
export function getFormattedDate(): string {
	const now = new Date();
	const dateStr = now.toISOString().split("T")[0];
	const dayOfWeek = DAY_NAMES[now.getDay()];
	return `${dateStr} (${dayOfWeek})`;
}

/** Return current time string: e.g. "07:23:18" */
export function getFormattedTime(): string {
	return new Date().toTimeString().split(" ")[0];
}
