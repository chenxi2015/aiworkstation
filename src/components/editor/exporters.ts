import type { JSONContent } from "@tiptap/core";

/**
 * 触发浏览器端文件下载辅助函数
 */
export function triggerFileDownload(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

const EXPORT_FONT_STACK =
	'-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

/**
 * 把 HTML 里的富媒体块离屏渲染成高清 PNG 图片替换：
 * - div[data-chart]（ECharts 图表节点）——docx / html-to-image 都不认识 canvas
 * - pre > code.language-mermaid（Mermaid 代码块）——导出目标无法渲染 mermaid 源码
 */
export async function embedRichBlocksAsImages(
	htmlContent: string,
): Promise<string> {
	if (
		!htmlContent.includes("data-chart") &&
		!htmlContent.includes("language-mermaid")
	) {
		return htmlContent;
	}
	const parser = new DOMParser();
	const docDom = parser.parseFromString(
		`<div>${htmlContent}</div>`,
		"text/html",
	);
	const container = docDom.body.firstElementChild;
	if (!container) return htmlContent;

	const chartNodes = Array.from(container.querySelectorAll("div[data-chart]"));

	if (chartNodes.length > 0) {
		const { parseChartSpec, renderChartToDataURL } = await import(
			"./extensions/chart/chartSpec"
		);
		for (const el of chartNodes) {
			try {
				const spec = parseChartSpec(el.getAttribute("data-spec"));
				const dataUrl = await renderChartToDataURL(spec);
				const img = docDom.createElement("img");
				img.src = dataUrl;
				img.style.cssText =
					"max-width: 100%; display: block; margin: 8px auto;";
				el.replaceWith(img);
			} catch {
				// 渲染失败时移除占位，避免导出残留空容器
				el.remove();
			}
		}
	}

	// Mermaid 代码块 → 高清 PNG（按 viewBox 固有尺寸放大渲染，避免小图模糊）
	const mermaidBlocks = Array.from(
		container.querySelectorAll("pre > code.language-mermaid"),
	);
	if (mermaidBlocks.length > 0) {
		const { renderMermaidToPngDataURL } = await import(
			"./utils/mermaidRenderer"
		);
		for (const codeEl of mermaidBlocks) {
			const pre = codeEl.parentElement;
			if (!pre) continue;
			try {
				const dataUrl = await renderMermaidToPngDataURL(
					codeEl.textContent || "",
				);
				const img = docDom.createElement("img");
				img.src = dataUrl;
				img.alt = "Mermaid 图表";
				img.style.cssText =
					"max-width: 100%; display: block; margin: 8px auto;";
				pre.replaceWith(img);
			} catch {
				// 渲染失败保留原始代码块，导出内容不丢失
			}
		}
	}
	return container.innerHTML;
}

/**
 * 遍历 TipTap 文档 JSON，把 chart 节点与 mermaid 代码块替换为高清 PNG 图片节点，
 * 供 Markdown 导出/复制使用（Markdown 无法表达图表，只能嵌图）。
 * 渲染失败的节点保留原样，保证内容不丢失。
 */
export async function embedRichBlocksInDoc(
	node: JSONContent,
): Promise<JSONContent> {
	if (node.type === "chart") {
		try {
			const { parseChartSpec, renderChartToDataURL } = await import(
				"./extensions/chart/chartSpec"
			);
			const spec = parseChartSpec(node.attrs?.spec);
			const dataUrl = await renderChartToDataURL(spec);
			return {
				type: "image",
				attrs: { src: dataUrl, alt: spec.title || "图表" },
			};
		} catch {
			return node;
		}
	}
	if (
		node.type === "codeBlock" &&
		String(node.attrs?.language || "").toLowerCase() === "mermaid"
	) {
		const code = node.content?.map((c) => c.text ?? "").join("") ?? "";
		try {
			const { renderMermaidToPngDataURL } = await import(
				"./utils/mermaidRenderer"
			);
			const dataUrl = await renderMermaidToPngDataURL(code);
			return {
				type: "image",
				attrs: { src: dataUrl, alt: "Mermaid 图表" },
			};
		} catch {
			return node;
		}
	}
	if (node.content) {
		return {
			...node,
			content: await Promise.all(node.content.map(embedRichBlocksInDoc)),
		};
	}
	return node;
}

/**
 * 导出前预处理 HTML：
 * 1. unwrapContainers 时展开 section/div 包裹层（docx 无法识别嵌套卡片，需要摊平成
 *    h2/p/pre/ul 等基础标签；PDF 走 html2canvas 位图渲染，必须保留包裹层的内联样式）
 * 2. video 标签替换成链接段落（docx / html2canvas 都不支持视频）
 */
function preprocessHtmlForExport(
	htmlContent: string,
	{ unwrapContainers = true }: { unwrapContainers?: boolean } = {},
): string {
	const parser = new DOMParser();
	const docDom = parser.parseFromString(
		`<div>${htmlContent}</div>`,
		"text/html",
	);
	const container = docDom.body.firstElementChild;
	if (!container) return htmlContent;

	if (unwrapContainers) {
		let wrapper = container.querySelector("section, div");
		while (wrapper) {
			wrapper.replaceWith(...Array.from(wrapper.childNodes));
			wrapper = container.querySelector("section, div");
		}
	}

	for (const video of Array.from(container.querySelectorAll("video"))) {
		const p = docDom.createElement("p");
		p.textContent = `[▶ 视频: ${video.getAttribute("src") || ""}]`;
		video.replaceWith(p);
	}

	return container.innerHTML;
}

/**
 * html-to-docx 嵌入图片（data URL → word/media）时引用 Node 的 Buffer 全局，
 * 浏览器里没有会抛 "ReferenceError: Buffer is not defined"。
 * 导出期间临时挂一个最小 Buffer shim（from 支持 string/ArrayBuffer/TypedArray，
 * toString 支持 base64 与 utf-8），结束后移除，避免干扰其他库的环境检测。
 */
function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const CHUNK_SIZE = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
	}
	return btoa(binary);
}

type BufferShimBytes = Uint8Array & { _isBuffer: true };

const bufferShimProto = Object.create(Uint8Array.prototype) as object;
Object.defineProperties(bufferShimProto, {
	_isBuffer: { value: true },
	toString: {
		value(this: Uint8Array, encoding?: string): string {
			if (encoding === "base64") return bytesToBase64(this);
			return new TextDecoder("utf-8").decode(this);
		},
	},
});

const BufferShim = {
	from(
		input: string | ArrayBuffer | ArrayBufferView | ArrayLike<number>,
		encoding?: string,
	): BufferShimBytes {
		let bytes: Uint8Array;
		if (typeof input === "string") {
			bytes =
				encoding === "base64"
					? base64ToBytes(input)
					: new TextEncoder().encode(input);
		} else if (input instanceof ArrayBuffer) {
			bytes = new Uint8Array(input);
		} else if (ArrayBuffer.isView(input)) {
			bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
		} else {
			bytes = Uint8Array.from(input);
		}
		Object.setPrototypeOf(bytes, bufferShimProto);
		return bytes as BufferShimBytes;
	},

	isBuffer(value: unknown): boolean {
		return (value as { _isBuffer?: boolean } | null)?._isBuffer === true;
	},

	byteLength(
		input: string | ArrayBuffer | ArrayBufferView,
		encoding?: string,
	): number {
		if (typeof input === "string") {
			if (encoding === "base64") {
				return Math.floor((input.replace(/=+$/, "").length * 3) / 4);
			}
			return new TextEncoder().encode(input).length;
		}
		return input.byteLength;
	},

	alloc(size: number): BufferShimBytes {
		return BufferShim.from(new Uint8Array(size));
	},

	allocUnsafe(size: number): BufferShimBytes {
		return BufferShim.from(new Uint8Array(size));
	},

	concat(list: Uint8Array[]): BufferShimBytes {
		const total = list.reduce((sum, item) => sum + item.length, 0);
		const out = new Uint8Array(total);
		let offset = 0;
		for (const item of list) {
			out.set(item, offset);
			offset += item.length;
		}
		Object.setPrototypeOf(out, bufferShimProto);
		return out as BufferShimBytes;
	},
};

/**
 * Word 导出前给表格注入内联样式。
 * @turbodocx/html-to-docx 只解析元素的内联 style（不读 <style> 标签），
 * 编辑器表格靠 CSS 类渲染的边框进入 docx 后会丢成"无线框"，这里补齐
 * 边框/内边距/表头底色（取值与 PDF 导出的表格样式保持一致）。
 */
function inlineTableStylesForWord(htmlContent: string): string {
	if (!htmlContent.includes("<table")) return htmlContent;
	const parser = new DOMParser();
	const docDom = parser.parseFromString(
		`<div>${htmlContent}</div>`,
		"text/html",
	);
	const container = docDom.body.firstElementChild;
	if (!container) return htmlContent;
	for (const table of Array.from(container.querySelectorAll("table"))) {
		table.setAttribute(
			"style",
			`${table.getAttribute("style") || ""};border-collapse:collapse;width:100%`,
		);
		for (const cell of Array.from(table.querySelectorAll("th, td"))) {
			const isHeader = cell.tagName === "TH";
			const extra = isHeader
				? "border:1px solid #d1d5db;padding:8px 12px;background-color:#f9fafb;font-weight:600"
				: "border:1px solid #d1d5db;padding:8px 12px";
			cell.setAttribute(
				"style",
				`${cell.getAttribute("style") || ""};${extra}`,
			);
		}
	}
	return container.innerHTML;
}

/**
 * 将 HTML 字符串转换为原生 Word (.docx) 文档并触发下载。
 * 使用 @turbodocx/html-to-docx（html-to-docx 的浏览器兼容维护分支），
 * 保留标题层级、加粗/斜体/颜色/字号等内联样式、列表、表格与图片。
 */
export async function exportToWordDocx(
	title: string,
	htmlContent: string,
): Promise<void> {
	const safeTitle = title || "未命名文档";
	const bodyHtml = inlineTableStylesForWord(
		preprocessHtmlForExport(await embedRichBlocksAsImages(htmlContent)),
	);
	const fullHtml = `<h1>${safeTitle}</h1>${bodyHtml}`;

	// @turbodocx/html-to-docx 的浏览器构建在返回值检测处引用了裸 global，
	// 浏览器环境下会抛 ReferenceError，这里补一个指向 globalThis 的 shim
	if (!("global" in globalThis)) {
		Object.defineProperty(globalThis, "global", {
			value: globalThis,
			configurable: true,
		});
	}
	const globalScope = globalThis as unknown as Record<string, unknown>;
	const hadBuffer = "Buffer" in globalThis;
	if (!hadBuffer) {
		globalScope.Buffer = BufferShim;
	}
	try {
		const { default: HTMLtoDOCX } = await import("@turbodocx/html-to-docx");
		const result = (await HTMLtoDOCX(fullHtml, null, {
			title: safeTitle,
			font: "PingFang SC",
			fontSize: 24, // 半磅单位，24 = 12pt
			margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
			table: { row: { cantSplit: true } },
		})) as Blob | Uint8Array;
		// 挂了 Buffer shim 后库会走 Node 分支返回 Buffer（Uint8Array），统一包成 Blob 再下载
		const fileBlob =
			result instanceof Blob
				? result
				: new Blob([new Uint8Array(result)], {
						type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
					});
		triggerFileDownload(`${safeTitle}.docx`, fileBlob);
	} finally {
		if (!hadBuffer) {
			delete globalScope.Buffer;
		}
	}
}

/**
 * 将排版后的 HTML 导出为 PDF 文件。
 * 方案：html-to-image（SVG foreignObject，直接用浏览器排版引擎，grid/flex/gap/
 * 圆角/阴影等现代 CSS 全部保真）渲染成画布，再按 A4 页面切片写入 jsPDF。
 */
export async function exportToPdf(
	title: string,
	htmlContent: string,
): Promise<void> {
	const safeTitle = title || "未命名文档";
	const bodyHtml = preprocessHtmlForExport(
		await embedRichBlocksAsImages(htmlContent),
		{ unwrapContainers: false },
	);

	// 离屏元素会被浏览器跳过绘制导致空白输出，因此用全屏白底覆盖层
	// 临时盖住页面渲染，生成完成后移除
	const overlay = document.createElement("div");
	overlay.style.cssText =
		"position: fixed; inset: 0; z-index: 99999; background: #ffffff; overflow: hidden; display: flex; justify-content: center; align-items: flex-start;";
	const container = document.createElement("div");
	// 注意：被 html-to-image 捕获的元素不能带 auto margin——
	// 它会把 getComputedStyle 解析后的像素 margin 内联进克隆节点，
	// 导致画布内内容整体偏移并被裁切
	container.style.cssText = `width: 794px; margin: 0; flex-shrink: 0; padding: 40px 48px; background: #ffffff; color: #1a1a1a; font-family: ${EXPORT_FONT_STACK}; line-height: 1.8;`;
	container.innerHTML = `
<style>
  h1 { font-size: 26px; font-weight: 700; margin: 0 0 20px; }
  h2 { font-size: 20px; font-weight: 600; margin: 24px 0 12px; }
  h3 { font-size: 17px; font-weight: 600; margin: 18px 0 8px; }
  p { margin: 10px 0; font-size: 14px; }
  blockquote { border-left: 3px solid #e5e7eb; margin: 14px 0; padding-left: 14px; color: #4b5563; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; }
  pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px; white-space: pre-wrap; word-break: break-all; font-size: 12px; }
  img { max-width: 100%; border-radius: 8px; }
  ul, ol { padding-left: 24px; margin: 10px 0; font-size: 14px; }
  li { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; font-size: 13px; }
  th { background: #f9fafb; font-weight: 600; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
</style>
<h1>${safeTitle}</h1>
${bodyHtml}`;
	overlay.appendChild(container);
	document.body.appendChild(overlay);

	try {
		const [{ toCanvas }, { jsPDF }] = await Promise.all([
			import("html-to-image"),
			import("jspdf"),
		]);
		const canvas = await toCanvas(container, {
			pixelRatio: 2,
			backgroundColor: "#ffffff",
		});

		const pdf = new jsPDF({
			unit: "mm",
			format: "a4",
			orientation: "portrait",
		});
		const marginX = 10;
		const marginY = 10;
		const contentWidthMm = 210 - marginX * 2;
		const contentHeightMm = 297 - marginY * 2;
		const pxPerMm = canvas.width / contentWidthMm;
		const pageHeightPx = Math.floor(contentHeightMm * pxPerMm);

		let offsetY = 0;
		let pageIndex = 0;
		while (offsetY < canvas.height) {
			const sliceHeight = Math.min(pageHeightPx, canvas.height - offsetY);
			const slice = document.createElement("canvas");
			slice.width = canvas.width;
			slice.height = sliceHeight;
			const ctx = slice.getContext("2d");
			if (!ctx) break;
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, slice.width, slice.height);
			ctx.drawImage(
				canvas,
				0,
				offsetY,
				canvas.width,
				sliceHeight,
				0,
				0,
				canvas.width,
				sliceHeight,
			);
			if (pageIndex > 0) pdf.addPage();
			pdf.addImage(
				slice.toDataURL("image/jpeg", 0.95),
				"JPEG",
				marginX,
				marginY,
				contentWidthMm,
				sliceHeight / pxPerMm,
			);
			offsetY += sliceHeight;
			pageIndex += 1;
		}

		pdf.save(`${safeTitle}.pdf`);
	} finally {
		document.body.removeChild(overlay);
	}
}
