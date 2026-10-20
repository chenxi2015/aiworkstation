import { describe, expect, it } from "vitest";
import {
	convertChartCodeBlocks,
	markdownToHtml,
	markdownToTiptapDoc,
	markdownToTiptapJson,
} from "./markdown.ts";

describe("Markdown chart rendering & TipTap AST conversion", () => {
	const sampleChartJson = JSON.stringify({
		type: "line",
		title: "BTC 近期收盘价走势",
		categories: ["10/1", "10/2", "10/3"],
		series: [{ name: "BTC 收盘价", data: [84853, 84497, 84764] }],
	});

	it("renders ```chart code blocks into div[data-chart] HTML without escaping issues", () => {
		const md = `## 标题\n\n\`\`\`chart\n${sampleChartJson}\n\`\`\`\n\n结尾`;
		const html = markdownToHtml(md);

		expect(html).toContain("<div data-chart");
		expect(html).toContain('data-height="320"');
		expect(html).toContain("BTC 近期收盘价走势");
		expect(html).not.toContain("<pre><code class=\"hljs \">");
	});

	it("converts ```chart block to TipTap chart node AST", () => {
		const md = `## 标题\n\n\`\`\`chart\n${sampleChartJson}\n\`\`\``;
		const { nodes } = markdownToTiptapDoc(md);

		const chartNode = nodes.find((n) => n.type === "chart");
		expect(chartNode).toBeDefined();
		expect(chartNode?.attrs?.spec).toContain("BTC 近期收盘价走势");
		expect(chartNode?.attrs?.height).toBe(320);
	});

	it("auto-promotes json or untyped code block to chart if it matches ChartSpec shape", () => {
		const untypedMd = `\`\`\`\n${sampleChartJson}\n\`\`\``;
		const docUntyped = markdownToTiptapJson(untypedMd);
		const chartNode1 = docUntyped.content?.find((n) => n.type === "chart");
		expect(chartNode1).toBeDefined();
		expect(chartNode1?.attrs?.spec).toContain("BTC 近期收盘价走势");

		const jsonMd = `\`\`\`json\n${sampleChartJson}\n\`\`\``;
		const docJson = markdownToTiptapJson(jsonMd);
		const chartNode2 = docJson.content?.find((n) => n.type === "chart");
		expect(chartNode2).toBeDefined();
	});

	it("keeps normal code blocks untouched as codeBlock", () => {
		const codeMd = "```javascript\nconsole.log({ a: 1 });\n```";
		const { nodes } = markdownToTiptapDoc(codeMd);

		const codeBlock = nodes.find((n) => n.type === "codeBlock");
		expect(codeBlock).toBeDefined();
		expect(nodes.some((n) => n.type === "chart")).toBe(false);
	});

	it("converts AST directly using convertChartCodeBlocks", () => {
		const ast = {
			type: "doc",
			content: [
				{
					type: "codeBlock",
					attrs: { language: "chart" },
					content: [{ type: "text", text: sampleChartJson }],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "测试段落" }],
				},
			],
		};

		const converted = convertChartCodeBlocks(ast);
		expect(converted.content?.[0].type).toBe("chart");
		expect(converted.content?.[0].attrs?.spec).toBe(sampleChartJson);
		expect(converted.content?.[1].type).toBe("paragraph");
	});
});

