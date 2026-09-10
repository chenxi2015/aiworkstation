import { toPng } from "html-to-image";
import { triggerFileDownload } from "./exporters";
import type { CardTheme, CardThemeConfig } from "./types";

/**
 * 预设主题配置
 */
export const CARD_THEMES: Record<CardTheme, CardThemeConfig> = {
	"minimal-light": {
		id: "minimal-light",
		name: "极简纯白",
		background: "#ffffff",
		textColor: "#1f2937",
		mutedColor: "#6b7280",
		accentColor: "#2563eb",
		cardBorder: "#e5e7eb",
		quoteBorder: "#3b82f6",
		headerBg: "#f9fafb",
	},
	"geek-dark": {
		id: "geek-dark",
		name: "极客暗黑",
		background: "#0d1117",
		textColor: "#e6edf3",
		mutedColor: "#8b949e",
		accentColor: "#58a6ff",
		cardBorder: "#30363d",
		quoteBorder: "#1f6feb",
		headerBg: "#161b22",
	},
	"vintage-paper": {
		id: "vintage-paper",
		name: "复古暖纸",
		background: "#fbf7ee",
		textColor: "#2d241e",
		mutedColor: "#7c7267",
		accentColor: "#b45309",
		cardBorder: "#e8dec8",
		quoteBorder: "#d97706",
		headerBg: "#f4ede0",
	},
	redbook: {
		id: "redbook",
		name: "小红书红",
		background: "#fffaf9",
		textColor: "#262626",
		mutedColor: "#737373",
		accentColor: "#ff2442",
		cardBorder: "#fed7d7",
		quoteBorder: "#ff2442",
		headerBg: "#fff1f0",
	},
};

export interface RedbookCardData {
	index: number;
	total: number;
	type: "cover" | "body" | "outro";
	title?: string;
	contentHtml: string;
	summary?: string;
	pageIndicator: string;
}

/**
 * 将 HTML 文本智能拆解为小红书 3:4 比例的多张卡片内容
 * @param title 文章标题
 * @param htmlContent 完整 HTML 内容
 * @param author 作者/水印
 */
export function sliceIntoRedbookCards(
	title: string,
	htmlContent: string,
	author = "AI Workstation",
): RedbookCardData[] {
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${htmlContent}</div>`, "text/html");
	const container = doc.body.firstElementChild;
	const childElements = container ? Array.from(container.children) : [];

	// 提取第一段或摘要作为封面副标题
	let firstSummary = "";
	const contentChunks: string[] = [];
	let currentChunkHtml = "";
	let currentTextLength = 0;

	for (const el of childElements) {
		const text = el.textContent?.trim() || "";
		if (!text) continue;

		if (!firstSummary && el.tagName.toLowerCase() === "p") {
			firstSummary = text.slice(0, 100);
		}

		const elHtml = el.outerHTML;
		// 每张内容卡片约 180~250 字符
		if (currentTextLength > 0 && currentTextLength + text.length > 220) {
			contentChunks.push(currentChunkHtml);
			currentChunkHtml = elHtml;
			currentTextLength = text.length;
		} else {
			currentChunkHtml += elHtml;
			currentTextLength += text.length;
		}
	}

	if (currentChunkHtml) {
		contentChunks.push(currentChunkHtml);
	}

	// 如果没有分出任何内容块，至少垫底一个默认块
	if (contentChunks.length === 0) {
		contentChunks.push(`<p>${htmlContent || "正文内容"}</p>`);
	}

	const total = contentChunks.length + 2; // 封面 + 内容页 + 封底
	const cards: RedbookCardData[] = [];

	// 1. 封面卡片
	cards.push({
		index: 1,
		total,
		type: "cover",
		title: title || "精选文章",
		summary: firstSummary || "深度好文 · 划重点精读",
		contentHtml: "",
		pageIndicator: `01 / ${String(total).padStart(2, "0")}`,
	});

	// 2. 正文卡片
	contentChunks.forEach((chunkHtml, idx) => {
		const cardIndex = idx + 2;
		cards.push({
			index: cardIndex,
			total,
			type: "body",
			contentHtml: chunkHtml,
			pageIndicator: `${String(cardIndex).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
		});
	});

	// 3. 封底卡片
	cards.push({
		index: total,
		total,
		type: "outro",
		title: "欢迎交流探讨",
		summary: `感谢阅读《${title || "本文"}》。如果对你有帮助，欢迎点赞、收藏与关注！\n—— ${author}`,
		contentHtml: "",
		pageIndicator: `${String(total).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
	});

	return cards;
}

/**
 * 提取文章金句（优先找 blockquote，若无则取首段）
 */
export function extractQuoteSnippet(htmlContent: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${htmlContent}</div>`, "text/html");
	const blockquote = doc.querySelector("blockquote");
	if (blockquote?.textContent?.trim()) {
		return blockquote.textContent.trim();
	}
	const firstP = doc.querySelector("p");
	if (firstP?.textContent?.trim()) {
		return firstP.textContent.trim().slice(0, 160);
	}
	return "行文若流水，思绪有归处。";
}

/**
 * 捕获指定 DOM 节点并渲染导出为高清 PNG 文件
 */
export async function captureAndDownloadElement(
	element: HTMLElement,
	filename: string,
): Promise<void> {
	try {
		const dataUrl = await toPng(element, {
			quality: 0.96,
			pixelRatio: 2, // 2x 高清视网膜分辨率
			cacheBust: true,
		});

		// 将 dataURL 转换为 Blob 进行下载
		const res = await fetch(dataUrl);
		const blob = await res.blob();
		triggerFileDownload(filename, blob);
	} catch (error) {
		console.error(
			"[CardExporter] Failed to capture DOM element to image:",
			error,
		);
		throw error;
	}
}
