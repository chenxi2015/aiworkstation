import { beforeEach, describe, expect, it, vi } from "vitest";
import { workbenchDb } from "../../../db/sqlite.ts";
import {
	parseDocumentAst,
	resolveTargetDocument,
} from "./documentHelper.ts";
import { executeTriggerParagraphRewrite } from "./triggerParagraphRewriteTool.ts";

describe("documentHelper", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves explicitly provided document ID when document exists", () => {
		vi.spyOn(workbenchDb, "getDocument").mockReturnValue({
			id: 42,
			title: "测试文档",
			content: JSON.stringify({ type: "doc", content: [] }),
			contentText: "",
			status: "editing",
			createdAt: "2026-01-01",
			updatedAt: "2026-01-01",
		} as any);

		const result = resolveTargetDocument({ documentId: 42 }, { actionName: "测试" });
		expect(result.resolvedId).toBe(42);
		expect(result.doc?.title).toBe("测试文档");
		expect(result.errorSummary).toBeUndefined();
	});

	it("returns error summary when specified document ID does not exist", () => {
		vi.spyOn(workbenchDb, "getDocument").mockReturnValue(null);

		const result = resolveTargetDocument({ documentId: 999 }, { actionName: "测试" });
		expect(result.doc).toBeUndefined();
		expect(result.errorSummary).toContain("文档 ID=999 不存在，无法测试。");
	});

	it("falls back to the single recent document when no ID is provided", () => {
		vi.spyOn(workbenchDb, "listDocuments").mockReturnValue([
			{ id: 10, title: "唯一文档" } as any,
		]);
		vi.spyOn(workbenchDb, "getDocument").mockReturnValue({
			id: 10,
			title: "唯一文档",
		} as any);

		const result = resolveTargetDocument({}, { actionName: "测试" });
		expect(result.resolvedId).toBe(10);
		expect(result.doc?.title).toBe("唯一文档");
	});

	it("returns suggestion list when multiple documents exist and flag is set", () => {
		vi.spyOn(workbenchDb, "listDocuments").mockReturnValue([
			{ id: 1, title: "文档A" } as any,
			{ id: 2, title: "文档B" } as any,
		]);

		const result = resolveTargetDocument(
			{},
			{ actionName: "读取", provideSuggestionsOnMultiple: true },
		);
		expect(result.doc).toBeUndefined();
		expect(result.errorSummary).toContain("可传入对应 documentId 读取：");
		expect(result.errorSummary).toContain("• ID: 1 - 《文档A》");
	});

	it("parses valid JSON content and falls back gracefully for invalid JSON", () => {
		const validJson = JSON.stringify({
			type: "doc",
			content: [{ type: "paragraph", text: "hello" }],
		});
		const parsed = parseDocumentAst({ content: validJson });
		expect(parsed.type).toBe("doc");
		expect(parsed.content).toHaveLength(1);

		const invalidParsed = parseDocumentAst({
			content: "not-json",
			contentText: "hello markdown",
		});
		expect(invalidParsed.type).toBe("doc");
		expect(Array.isArray(invalidParsed.content)).toBe(true);
	});
});

describe("triggerParagraphRewriteTool", () => {
	it("returns execution result with summary", () => {
		const result = executeTriggerParagraphRewrite({
			instruction: "按公众号规范优化",
			strategySummary: "增加小标题与强调",
		});

		expect(result.toolName).toBe("trigger_paragraph_rewrite");
		expect(result.isMutation).toBe(false);
		expect(result.summary).toContain("按公众号规范优化");
		expect(result.summary).toContain("增加小标题与强调");
	});
});
