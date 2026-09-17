import { createMermaidPlugin } from "@streamdown/mermaid";

/**
 * 共享 Mermaid 实例：编辑器内预览（MermaidPreview）与导出离屏渲染
 * （exporters / useDocumentExport）共用同一份主题配置，保证所见即所得。
 */
const mermaidPlugin = createMermaidPlugin({
	config: {
		startOnLoad: false,
		theme: "base",
		darkMode: false,
		securityLevel: "loose",
		// 导出需把 SVG 位图化为 PNG：htmlLabels 会产生 <foreignObject>，
		// 浏览器安全策略会将被污染的 canvas 拦截（toDataURL 抛 SecurityError）。
		// 关掉后标签渲染为 SVG <text>，<br/> 换行不受影响，画布可正常导出。
		// 注意：必须设在顶层。mermaid 11 已废弃 flowchart.htmlLabels（渲染时只读
		// 全局 htmlLabels），写在 flowchart 下会被忽略，含 <br/> 的流程图标签仍会
		// 生成 foreignObject 导致导出图片失败。
		htmlLabels: false,
		fontFamily:
			"ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
		themeVariables: {
			darkMode: false,
			background: "transparent",
			mainBkg: "#ffffff",
			nodeBorder: "#c7d2fe",
			primaryColor: "#eef2ff",
			primaryTextColor: "#334155",
			primaryBorderColor: "#c7d2fe",
			lineColor: "#b6bdd0",
			secondaryColor: "#f5f3ff",
			secondaryTextColor: "#334155",
			secondaryBorderColor: "#ddd6fe",
			tertiaryColor: "#f8fafc",
			tertiaryTextColor: "#334155",
			tertiaryBorderColor: "#e2e8f0",
			clusterBkg: "#f8fafc",
			clusterBorder: "#e2e8f0",
			edgeLabelBackground: "#ffffff",
			textColor: "#334155",
			fontFamily: "ui-sans-serif, system-ui, sans-serif",
			fontSize: "13px",
		},
	},
});

const mermaidInstance = mermaidPlugin.getMermaid();

let renderSeq = 0;

/**
 * 渲染 Mermaid 源码为 SVG 字符串（导出 / 下载场景用）。
 * 渲染失败时清理 mermaid 残留的孤儿 DOM 节点。
 */
export async function renderMermaidToSvg(code: string): Promise<string> {
	const renderId = `mermaid-export-${Date.now().toString(36)}-${(renderSeq++).toString(36)}`;
	try {
		const { svg } = await mermaidInstance.render(renderId, code);
		return svg;
	} catch (err) {
		const orphan = document.getElementById(`d${renderId}`);
		if (orphan) orphan.remove();
		throw err;
	}
}

/** 从 SVG 字符串中解析固有尺寸（优先 viewBox，其次 width/height 属性） */
function getSvgIntrinsicSize(svg: string): { width: number; height: number } {
	const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
	if (viewBoxMatch) {
		const parts = viewBoxMatch[1]
			.trim()
			.split(/[\s,]+/)
			.map(Number);
		if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
			return { width: parts[2], height: parts[3] };
		}
	}
	const widthMatch = svg.match(/\bwidth="([\d.]+)"/);
	const heightMatch = svg.match(/\bheight="([\d.]+)"/);
	if (widthMatch && heightMatch) {
		return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
	}
	return { width: 800, height: 600 };
}

/**
 * 渲染 Mermaid 源码为高清 PNG dataURL。
 * Mermaid SVG 固有尺寸通常只有几百像素，直接 1x 位图化会非常小且模糊——
 * 这里按 minWidth（默认 1600px）反推放大倍数（上限 maxScale），保证导出清晰。
 */
export async function renderMermaidToPngDataURL(
	code: string,
	{
		minWidth = 1600,
		maxScale = 4,
	}: { minWidth?: number; maxScale?: number } = {},
): Promise<string> {
	const svg = await renderMermaidToSvg(code);
	const { width, height } = getSvgIntrinsicSize(svg);
	const scale = Math.min(maxScale, Math.max(2, Math.ceil(minWidth / width)));

	// 写入显式宽高，部分浏览器对 width="100%" 的 SVG 无法确定位图尺寸
	const sizedSvg = svg
		.replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1")
		.replace(
			/<svg/,
			`<svg width="${width * scale}" height="${height * scale}"`,
		);

	const blob = new Blob([sizedSvg], { type: "image/svg+xml;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = () => reject(new Error("SVG 位图化失败"));
			image.src = url;
		});
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(width * scale);
		canvas.height = Math.round(height * scale);
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("无法创建 Canvas 上下文");
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/png");
	} finally {
		URL.revokeObjectURL(url);
	}
}
