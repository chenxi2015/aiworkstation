import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatDurationMs(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	const totalSeconds = ms / 1000;
	if (totalSeconds < 60) {
		const rounded = Math.round(totalSeconds * 10) / 10;
		return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}秒`;
	}
	const seconds = Math.round(totalSeconds);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const restSeconds = seconds % 60;
	if (hours > 0) {
		return `${hours}时${minutes > 0 ? `${minutes}分` : ""}${restSeconds > 0 ? `${restSeconds}秒` : ""}`;
	}
	return `${minutes}分${restSeconds > 0 ? `${restSeconds}秒` : ""}`;
}
