/** 字节数 → 人类可读体积 */
export function formatBytes(bytes: number): string {
	if (!bytes) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const idx = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** idx;
	return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
}

/** epoch ms → YYYY-MM-DD */
export function formatDate(ms: number): string {
	if (!ms) return "-";
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
