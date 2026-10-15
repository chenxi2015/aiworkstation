import { describe, expect, it } from "vitest";
import {
	compactTextForMatching,
	isBlockMatchingSnippet,
	normalizeTextForMatching,
} from "./documentTools.ts";

describe("documentTools text matching helpers", () => {
	it("normalizes markdown syntax, full-width punctuation, and whitespaces", () => {
		const snippetWithMarkdown =
			"**Star / Fork**: ⚠️待核实 (发布前请填入实时数据) ";
		const docTextWithFullWidth = "Star / Fork：⚠️待核实（发布前请填入实时数据）";

		const norm1 = normalizeTextForMatching(snippetWithMarkdown);
		const norm2 = normalizeTextForMatching(docTextWithFullWidth);

		expect(norm1).toBe("star / fork:⚠️待核实(发布前请填入实时数据)");
		expect(norm2).toBe("star / fork:⚠️待核实(发布前请填入实时数据)");
		expect(norm1).toBe(norm2);
	});

	it("compactText strips punctuation and whitespace while preserving emoji and characters", () => {
		const snippet = "**Star / Fork**: ⚠️待核实";
		const docText = "Star / Fork：⚠️待核实（发布前请填入实时数据）";

		const compactSnippet = compactTextForMatching(snippet);
		const compactDocText = compactTextForMatching(docText);

		expect(compactSnippet).toBe("starfork⚠️待核实");
		expect(compactDocText).toContain(compactSnippet);
	});

	it("matches node correctly when snippet has bold markdown and different punctuation", () => {
		const node = {
			type: "paragraph",
			content: [
				{
					type: "text",
					marks: [{ type: "bold" }],
					text: "Star / Fork",
				},
				{
					type: "text",
					text: "：⚠️待核实（发布前请填入实时数据）",
				},
			],
		};

		const snippet = "**Star / Fork**: ⚠️待核实 (发布前请填入实时数据) ";
		expect(isBlockMatchingSnippet(node, snippet)).toBe(true);
	});

	it("matches list items inside a bulletList", () => {
		const bulletList = {
			type: "bulletList",
			content: [
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [
								{
									type: "text",
									text: "仓库地址: https://github.com/example/repo",
								},
							],
						},
					],
				},
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [
								{
									type: "text",
									marks: [{ type: "bold" }],
									text: "Star / Fork",
								},
								{
									type: "text",
									text: "：⚠️待核实（发布前请填入实时数据）",
								},
							],
						},
					],
				},
			],
		};

		const snippet = "**Star / Fork**: ⚠️待核实 (发布前请填入实时数据) ";
		expect(isBlockMatchingSnippet(bulletList, snippet)).toBe(true);
		expect(isBlockMatchingSnippet(bulletList.content[1], snippet)).toBe(true);
		expect(isBlockMatchingSnippet(bulletList.content[0], snippet)).toBe(false);
	});

	it("replaces a single listItem without discarding other items in the bulletList", async () => {
		const bulletList = {
			type: "bulletList",
			content: [
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [
								{ type: "text", text: "仓库地址: https://github.com/..." },
							],
						},
					],
				},
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [
								{
									type: "text",
									marks: [{ type: "bold" }],
									text: "Star / Fork",
								},
								{ type: "text", text: "：⚠️待核实" },
							],
						},
					],
				},
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "一句话定位: 测试" }],
						},
					],
				},
			],
		};

		const docContent = [bulletList];
		const replacementSnippet = "**Star / Fork**: ⚠️待核实";
		// Single-item replacement
		const replacementNodes = [
			{
				type: "bulletList",
				content: [
					{
						type: "listItem",
						content: [
							{
								type: "paragraph",
								content: [{ type: "text", text: "Star / Fork: 60.7k" }],
							},
						],
					},
				],
			},
		];

		const { applyParagraphReplacement } = await import("./documentTools.ts");
		applyParagraphReplacement(
			docContent,
			0,
			replacementSnippet,
			replacementNodes,
		);

		// Ensure the list still has 3 items and only the 2nd item was updated
		expect(docContent[0].content).toHaveLength(3);
		expect(docContent[0].content[0].content[0].content[0].text).toContain(
			"仓库地址",
		);
		expect(docContent[0].content[1].content[0].content[0].text).toBe(
			"Star / Fork: 60.7k",
		);
		expect(docContent[0].content[2].content[0].content[0].text).toContain(
			"一句话定位",
		);
	});
});
