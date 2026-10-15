/**
 * 微信公众号专用排版与图片资源格式化器
 *
 * 核心设计原则：
 * 1. 绝对尊重用户现有排版（Non-destructive）：
 *    若文档已通过 AI 优化样式排版（包含 section 卡片、自定义配色、字号或内联样式），
 *    100% 完整保留原有设计，绝不覆盖或打乱已有样式！
 * 2. 仅对无样式的裸 HTML 进行智能保底排版（Safe Fallback）：
 *    对于未排版的纯文本/Markdown，注入优雅的微信内联排版（微信不支持外部 CSS 与 <style> 标签）。
 * 3. 样式合并而非暴力覆盖（Merge, Don't Overwrite）：
 *    对样式注入采用属性级安全合并，用户已有的样式优先级最高。
 * 4. 微信图片兼容转码：
 *    通过 Canvas 将本地图片、WebP、SVG 无损转为微信 uploadimg 接口唯一支持的 PNG/JPEG DataURL。
 */

/**
 * 将任意图片来源（特别是本地 /api/files/ 和 WebP）通过 Canvas 转为标准 PNG DataURL。
 * 微信 MP uploadimg 接口严格只支持 JPEG 与 PNG 格式。
 */
export async function convertImageToPngDataUrl(
	url: string,
): Promise<string | null> {
	if (!url) return null;

	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = img.naturalWidth || img.width || 800;
				canvas.height = img.naturalHeight || img.height || 600;
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					resolve(null);
					return;
				}
				ctx.drawImage(img, 0, 0);
				const pngDataUrl = canvas.toDataURL("image/png");
				resolve(pngDataUrl);
			} catch (err) {
				console.warn("[wechatFormatter] canvas export error:", err);
				resolve(null);
			}
		};
		img.onerror = () => {
			console.warn("[wechatFormatter] image load failed:", url);
			resolve(null);
		};
		img.src = url;
	});
}

/**
 * 扫描 HTML 中的所有 <img>，将本地资源及 WebP 转换为标准 PNG DataURL，
 * 保证后续上传至微信 CDN 时不会因 WebP 格式被微信服务器拦截。
 */
export async function prepareWechatImages(
	htmlContent: string,
): Promise<string> {
	if (!htmlContent || !htmlContent.includes("<img")) return htmlContent;
	const parser = new DOMParser();
	const docDom = parser.parseFromString(
		`<div>${htmlContent}</div>`,
		"text/html",
	);
	const container = docDom.body.firstElementChild;
	if (!container) return htmlContent;

	const imgElements = Array.from(container.querySelectorAll("img"));
	if (imgElements.length === 0) return htmlContent;

	await Promise.all(
		imgElements.map(async (img) => {
			const src = img.getAttribute("src");
			if (!src || src.includes("mmbiz.qpic.cn")) return;

			const pngDataUrl = await convertImageToPngDataUrl(src);
			if (pngDataUrl) {
				img.setAttribute("src", pngDataUrl);
			}
		}),
	);

	return container.innerHTML;
}

/**
 * 检测 HTML 是否已经包含深度排版样式（如 AI 优化排版生成的 section 卡片、自定义配色等）
 */
export function hasOptimizedLayout(container: Element): boolean {
	// 1. 是否包含带背景色或边框样式的 section / div 卡片（AI 优化的显著特征）
	const styledSections = container.querySelectorAll(
		"section[style], div[style*='background'], div[style*='border']",
	);
	if (styledSections.length >= 2) return true;

	// 2. 是否大部分核心元素已经自带内联 style
	const allBlocks = container.querySelectorAll(
		"p, h1, h2, h3, blockquote, pre",
	);
	if (allBlocks.length === 0) return false;
	let styledCount = 0;
	allBlocks.forEach((el) => {
		if (el.getAttribute("style")?.trim()) styledCount++;
	});

	// 若超过 25% 的块级元素已经设置了内联样式，判定为已有样式排版
	return styledCount / allBlocks.length > 0.25;
}

/**
 * 安全合并样式：仅在元素尚未声明该 CSS 属性时注入 fallback 属性，
 * 永远优先保留用户或 AI 原本的自定义样式属性！
 */
function safeMergeStyle(el: Element, fallbackStyle: string): void {
	const existing = el.getAttribute("style") || "";
	if (!existing.trim()) {
		el.setAttribute("style", fallbackStyle);
		return;
	}

	// 解析现有的 CSS 键值对
	const existingRules = new Map<string, string>();
	for (const rule of existing.split(";")) {
		const colon = rule.indexOf(":");
		if (colon !== -1) {
			const prop = rule.slice(0, colon).trim().toLowerCase();
			const val = rule.slice(colon + 1).trim();
			if (prop && val) existingRules.set(prop, val);
		}
	}

	// 仅补充缺失的 fallback 属性，绝不覆盖已有样式
	for (const rule of fallbackStyle.split(";")) {
		const colon = rule.indexOf(":");
		if (colon !== -1) {
			const prop = rule.slice(0, colon).trim().toLowerCase();
			const val = rule.slice(colon + 1).trim();
			if (prop && val && !existingRules.has(prop)) {
				existingRules.set(prop, val);
			}
		}
	}

	const merged = Array.from(existingRules.entries())
		.map(([k, v]) => `${k}: ${v}`)
		.join("; ");
	el.setAttribute("style", merged);
}

/**
 * 微信公众号排版处理：
 * 1. 若文章已经包含 AI 优化排版（自定义卡片、颜色、边框等），100% 完整保留原有排版设计，不做破坏性重置；
 * 2. 若文章为无样式的裸 HTML，安全注入保底排版，确保在微信公众号不失真；
 * 3. 始终确保图片自适应宽度不撑破屏幕。
 */
export function formatHtmlForWechat(htmlContent: string): string {
	if (!htmlContent) return "";
	const parser = new DOMParser();
	const docDom = parser.parseFromString(
		`<div>${htmlContent}</div>`,
		"text/html",
	);
	const container = docDom.body.firstElementChild;
	if (!container) return htmlContent;

	// 始终确保图片具备自适应宽度，防止撑出屏幕
	container.querySelectorAll("img").forEach((el) => {
		safeMergeStyle(
			el,
			"max-width: 100% !important; height: auto !important; display: block; margin: 20px auto; border-radius: 8px;",
		);
	});

	// 如果文章本身已经拥有丰富的 AI 优化排版，直接跳过默认模板注入，原汁原味呈现原有设计！
	const isAlreadyStyled = hasOptimizedLayout(container);
	if (isAlreadyStyled) {
		return container.innerHTML;
	}

	// 针对未排版的裸 HTML 进行智能保底排版（使用 safeMergeStyle，绝不硬覆盖）
	// 1. 标题
	container.querySelectorAll("h1, h2").forEach((el) => {
		safeMergeStyle(
			el,
			"font-size: 19px; font-weight: 700; color: #1a1a1a; margin: 34px 0 16px; padding-left: 12px; border-left: 4px solid #07c160; line-height: 1.4; display: block;",
		);
	});

	container.querySelectorAll("h3").forEach((el) => {
		safeMergeStyle(
			el,
			"font-size: 16px; font-weight: 600; color: #2d3748; margin: 26px 0 12px; padding-left: 8px; border-left: 3px solid #10b981; line-height: 1.4; display: block;",
		);
	});

	container.querySelectorAll("h4, h5, h6").forEach((el) => {
		safeMergeStyle(
			el,
			"font-size: 15px; font-weight: 600; color: #374151; margin: 18px 0 10px;",
		);
	});

	// 2. 段落
	container.querySelectorAll("p").forEach((el) => {
		safeMergeStyle(
			el,
			"font-size: 15px; line-height: 1.85; color: #333333; margin: 16px 0; letter-spacing: 0.5px; text-align: justify; word-break: break-word;",
		);
	});

	// 3. 引用块
	container.querySelectorAll("blockquote").forEach((el) => {
		safeMergeStyle(
			el,
			"background: #f7f9fa; border-left: 4px solid #07c160; padding: 14px 16px; margin: 20px 0; color: #555555; border-radius: 4px; font-size: 14px; line-height: 1.7;",
		);
	});

	// 4. 代码块
	container.querySelectorAll("pre").forEach((el) => {
		safeMergeStyle(
			el,
			"background: #282c34; color: #abb2bf; padding: 14px 16px; border-radius: 8px; margin: 20px 0; overflow-x: auto; font-family: Menlo, Monaco, Consolas, Courier New, monospace; font-size: 13px; line-height: 1.55; display: block;",
		);
		const code = el.querySelector("code");
		if (code) {
			safeMergeStyle(
				code,
				"background: transparent; color: inherit; padding: 0; font-family: inherit; font-size: inherit; display: block;",
			);
		}
	});

	// 5. 行内代码
	container.querySelectorAll("code").forEach((el) => {
		if (el.parentElement?.tagName.toLowerCase() !== "pre") {
			safeMergeStyle(
				el,
				"background: #f3f4f6; color: #e11d48; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: Menlo, Monaco, Consolas, monospace; margin: 0 2px;",
			);
		}
	});

	// 6. 列表
	container.querySelectorAll("ul, ol").forEach((el) => {
		safeMergeStyle(
			el,
			"margin: 14px 0 14px 20px; padding: 0 0 0 10px; font-size: 15px; line-height: 1.85; color: #333333;",
		);
	});
	container.querySelectorAll("li").forEach((el) => {
		safeMergeStyle(el, "margin: 6px 0; line-height: 1.85; color: #333333;");
	});

	// 7. 表格
	container.querySelectorAll("table").forEach((el) => {
		safeMergeStyle(
			el,
			"width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; text-align: left;",
		);
	});
	container.querySelectorAll("th").forEach((el) => {
		safeMergeStyle(
			el,
			"border: 1px solid #e5e7eb; padding: 10px 12px; background: #f9fafb; font-weight: 600; color: #111827;",
		);
	});
	container.querySelectorAll("td").forEach((el) => {
		safeMergeStyle(
			el,
			"border: 1px solid #e5e7eb; padding: 8px 12px; color: #374151;",
		);
	});

	// 8. 强调
	container.querySelectorAll("strong, b").forEach((el) => {
		safeMergeStyle(el, "font-weight: 700; color: #111827;");
	});

	// 9. 外层包裹安全阅读容器
	return `<section style="max-width: 677px; margin: 0 auto; padding: 12px 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; -webkit-font-smoothing: antialiased; letter-spacing: 0.5px;">${container.innerHTML}</section>`;
}

/**
 * 综合预处理微信图文内容：
 * 依次进行富媒体转图、本地与WebP图片转码、微信内联排版注入
 */
export async function prepareWechatContent(
	htmlContent: string,
): Promise<string> {
	if (!htmlContent) return "";
	// 1. 将本地图片和 WebP 转为 PNG
	const withImages = await prepareWechatImages(htmlContent);
	// 2. 注入微信公众平台专用排版（若已优化排版则智能保留）
	return formatHtmlForWechat(withImages);
}
