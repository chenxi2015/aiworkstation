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

/** creator 平台 code → 展示名 */
export function platformLabel(platform: string): string {
	const map: Record<string, string> = {
		xhs: "小红书",
		twitter: "推特",
		wechat: "公众号",
		script: "脚本",
	};
	return map[platform] ?? platform;
}

/** creator 草稿状态 → 展示名 */
export function draftStatusLabel(status: string): string {
	const map: Record<string, string> = {
		draft_ready: "待审稿",
		reviewing: "审稿中",
		approved: "已定稿",
		exported: "已导出",
	};
	return map[status] ?? status;
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
