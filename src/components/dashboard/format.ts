/** ISO 时间 → 相对时间（刚刚 / N 分钟前 / N 小时前 / N 天前） */
export function formatRelativeTime(iso?: string): string {
	if (!iso) return "-";
	const time = new Date(iso).getTime();
	if (Number.isNaN(time)) return "-";
	const diff = Date.now() - time;
	if (diff < 60_000) return "刚刚";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
	if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
	const d = new Date(time);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** URL → 域名展示（失败原样返回） */
export function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

/** editor 文档状态 → 展示名 */
export function documentStatusLabel(status: string): string {
	const map: Record<string, string> = {
		editing: "编辑中",
		finalized: "已定稿",
		archived: "已归档",
	};
	return map[status] ?? status;
}

/** editor 文档状态配色 */
export function documentStatusTone(status: string): string {
	const map: Record<string, string> = {
		editing: "bg-sky-100 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
		finalized:
			"bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
		archived: "bg-surface-secondary text-muted",
	};
	return map[status] ?? "bg-surface-secondary text-muted";
}
