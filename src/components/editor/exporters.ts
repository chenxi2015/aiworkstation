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
 * 将 HTML 字符串转换为原生 Word (.docx) 文档并触发下载。
 * 使用 @turbodocx/html-to-docx（html-to-docx 的浏览器兼容维护分支），
 * 保留标题层级、加粗/斜体/颜色/字号等内联样式、列表、表格与图片。
 */
export async function exportToWordDocx(
	title: string,
	htmlContent: string,
): Promise<void> {
	const safeTitle = title || "未命名文档";
	const bodyHtml = preprocessHtmlForExport(htmlContent);
	const fullHtml = `<h1>${safeTitle}</h1>${bodyHtml}`;

	// @turbodocx/html-to-docx 的浏览器构建在返回值检测处引用了裸 global，
	// 浏览器环境下会抛 ReferenceError，这里补一个指向 globalThis 的 shim
	if (!("global" in globalThis)) {
		Object.defineProperty(globalThis, "global", {
			value: globalThis,
			configurable: true,
		});
	}
	const { default: HTMLtoDOCX } = await import("@turbodocx/html-to-docx");
	const fileBlob = (await HTMLtoDOCX(fullHtml, null, {
		title: safeTitle,
		font: "PingFang SC",
		fontSize: 24, // 半磅单位，24 = 12pt
		margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
		table: { row: { cantSplit: true } },
	})) as Blob;

	triggerFileDownload(`${safeTitle}.docx`, fileBlob);
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
	const bodyHtml = preprocessHtmlForExport(htmlContent, {
		unwrapContainers: false,
	});

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
