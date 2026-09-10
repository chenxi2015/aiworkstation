import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

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

/**
 * 将 HTML 字符串转换为原生 Word (.docx) 文档并触发下载
 */
export async function exportToWordDocx(
	title: string,
	htmlContent: string,
): Promise<void> {
	const parser = new DOMParser();
	const docDom = parser.parseFromString(
		`<div>${htmlContent}</div>`,
		"text/html",
	);
	const container = docDom.body.firstElementChild;

	const paragraphs: Paragraph[] = [];

	// 添加文档一级大标题
	paragraphs.push(
		new Paragraph({
			text: title || "未命名文档",
			heading: HeadingLevel.TITLE,
			spacing: { after: 300 },
		}),
	);

	if (container) {
		const childNodes = Array.from(container.children);
		for (const el of childNodes) {
			const tag = el.tagName.toLowerCase();
			// 检查是否包含视频元素
			const videoEl =
				tag === "video"
					? (el as HTMLVideoElement)
					: el.querySelector<HTMLVideoElement>("video");
			if (videoEl?.src) {
				paragraphs.push(
					new Paragraph({
						children: [
							new TextRun({
								text: `[▶ 视频: ${videoEl.src}]`,
								italics: true,
								color: "2563eb",
							}),
						],
						spacing: { before: 120, after: 120 },
					}),
				);
				continue;
			}

			const text = el.textContent?.trim() ?? "";
			if (!text) continue;

			if (tag === "h1") {
				paragraphs.push(
					new Paragraph({
						text,
						heading: HeadingLevel.HEADING_1,
						spacing: { before: 240, after: 120 },
					}),
				);
			} else if (tag === "h2") {
				paragraphs.push(
					new Paragraph({
						text,
						heading: HeadingLevel.HEADING_2,
						spacing: { before: 200, after: 100 },
					}),
				);
			} else if (tag === "h3") {
				paragraphs.push(
					new Paragraph({
						text,
						heading: HeadingLevel.HEADING_3,
						spacing: { before: 160, after: 80 },
					}),
				);
			} else if (tag === "blockquote") {
				paragraphs.push(
					new Paragraph({
						children: [new TextRun({ text, italics: true, color: "666666" })],
						spacing: { before: 120, after: 120 },
						indent: { left: 400 },
					}),
				);
			} else if (tag === "ul" || tag === "ol") {
				const items = Array.from(el.querySelectorAll("li"));
				for (const li of items) {
					paragraphs.push(
						new Paragraph({
							text: li.textContent?.trim() || "",
							bullet: { level: 0 },
							spacing: { after: 60 },
						}),
					);
				}
			} else {
				// 普通段落或预格式文本
				paragraphs.push(
					new Paragraph({
						text,
						spacing: { after: 120 },
					}),
				);
			}
		}
	}

	const doc = new Document({
		sections: [
			{
				properties: {},
				children: paragraphs,
			},
		],
	});

	const blob = await Packer.toBlob(doc);
	triggerFileDownload(`${title || "文档"}.docx`, blob);
}

/**
 * 触发干净无干扰的浏览器打印（另存为 PDF），免引入重量级 puppeteer
 */
export function exportToPdfPrint(title: string, htmlContent: string): void {
	const printIframe = document.createElement("iframe");
	printIframe.style.position = "fixed";
	printIframe.style.right = "0";
	printIframe.style.bottom = "0";
	printIframe.style.width = "0";
	printIframe.style.height = "0";
	printIframe.style.border = "0";

	document.body.appendChild(printIframe);

	const printDoc =
		printIframe.contentDocument || printIframe.contentWindow?.document;
	if (!printDoc) {
		document.body.removeChild(printIframe);
		window.print();
		return;
	}

	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="referrer" content="no-referrer" />
<title>${title || "文档"}</title>
<style>
  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
  }
  body {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #111827;
    line-height: 1.8;
    padding: 0;
    margin: 0;
  }
  h1 { font-size: 24pt; margin-bottom: 16pt; font-weight: 700; page-break-after: avoid; }
  h2 { font-size: 18pt; margin-top: 16pt; margin-bottom: 8pt; font-weight: 600; page-break-after: avoid; }
  h3 { font-size: 14pt; margin-top: 12pt; margin-bottom: 6pt; font-weight: 600; page-break-after: avoid; }
  p { margin: 8pt 0; font-size: 11pt; }
  blockquote {
    border-left: 3pt solid #e5e7eb;
    margin: 12pt 0;
    padding-left: 12pt;
    color: #4b5563;
    font-style: italic;
  }
  code {
    background: #f3f4f6;
    padding: 2pt 4pt;
    border-radius: 3pt;
    font-family: monospace;
    font-size: 10pt;
  }
  pre {
    background: #f8fafc;
    border: 1pt solid #e2e8f0;
    padding: 10pt;
    border-radius: 6pt;
    page-break-inside: avoid;
    overflow-x: auto;
  }
  img { max-width: 100%; border-radius: 6pt; page-break-inside: avoid; }
  .ast-video-card, video {
    max-width: 100%;
    border-radius: 6pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12pt 0;
    page-break-inside: avoid;
  }
  th, td {
    border: 1pt solid #d1d5db;
    padding: 6pt 10pt;
    text-align: left;
    font-size: 10pt;
  }
  th { background-color: #f9fafb; font-weight: 600; }
</style>
</head>
<body>
  <h1>${title || "未命名文档"}</h1>
  ${htmlContent}
</body>
</html>`;

	printDoc.open();
	printDoc.write(html);
	printDoc.close();

	setTimeout(() => {
		printIframe.contentWindow?.focus();
		printIframe.contentWindow?.print();
		setTimeout(() => {
			document.body.removeChild(printIframe);
		}, 1000);
	}, 250);
}
