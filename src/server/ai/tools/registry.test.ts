import { describe, expect, it } from "vitest";
import { createAgentTools, isToolAvailable } from "./registry.ts";
import { getAgentToolMetadata } from "./types.ts";

function toolNames(ctx: Parameters<typeof createAgentTools>[1]): string[] {
	return createAgentTools(undefined, ctx).map(
		(t) => (t as { name: string }).name,
	);
}

describe("createAgentTools — precise provisioning", () => {
	it("provisions global + headless tools with no active view", () => {
		const names = toolNames({});
		// 全局工具在
		expect(names).toContain("query_bookmarks");
		expect(names).toContain("get_stats");
		expect(names).toContain("web_search");
		expect(names).toContain("fs_read_file");
		// headless 创建类全局可用
		expect(names).toContain("draft_article");
		expect(names).toContain("draft_canvas");
		expect(names).toContain("draft_excalidraw");
		expect(names).toContain("canvas_create_elements");
		expect(names).toContain("excalidraw_draw_elements");
		// 视图依赖工具不在
		expect(names).not.toContain("canvas_tidy_layout");
		expect(names).not.toContain("canvas_center_view");
		expect(names).not.toContain("canvas_update_node");
		expect(names).not.toContain("canvas_create_group");
		expect(names).not.toContain("excalidraw_update_element");
		expect(names).not.toContain("excalidraw_clear_canvas");
		expect(names).not.toContain("excalidraw_center_view");
		expect(names).not.toContain("trigger_paragraph_rewrite");
	});

	it("provisions canvas view tools only when a .canvas board is open", () => {
		const names = toolNames({
			module: "obsidian",
			activeNotePath: "notes/a.canvas",
		});
		expect(names).toContain("canvas_tidy_layout");
		expect(names).toContain("canvas_center_view");
		expect(names).toContain("canvas_update_node");
		expect(names).toContain("canvas_create_group");
		// excalidraw 视图工具不出现
		expect(names).not.toContain("excalidraw_update_element");
		expect(names).not.toContain("excalidraw_clear_canvas");
		// 改写流水线不对白板开放
		expect(names).not.toContain("trigger_paragraph_rewrite");
	});

	it("provisions excalidraw view tools only when an .excalidraw board is open", () => {
		const names = toolNames({
			module: "obsidian",
			activeNotePath: "notes/b.excalidraw",
		});
		expect(names).toContain("excalidraw_update_element");
		expect(names).toContain("excalidraw_clear_canvas");
		expect(names).toContain("excalidraw_center_view");
		expect(names).not.toContain("canvas_tidy_layout");
		expect(names).not.toContain("trigger_paragraph_rewrite");
	});

	it("provisions rewrite pipeline with an active editor document", () => {
		const names = toolNames({ module: "editor", activeDocumentId: 42 });
		expect(names).toContain("trigger_paragraph_rewrite");
		expect(names).toContain("read_document");
		expect(names).toContain("insert_document_block");
		expect(names).not.toContain("canvas_tidy_layout");
	});

	it("provisions rewrite pipeline for a plain obsidian note", () => {
		const names = toolNames({
			module: "obsidian",
			activeNotePath: "notes/c.md",
		});
		expect(names).toContain("trigger_paragraph_rewrite");
		expect(names).not.toContain("canvas_tidy_layout");
		expect(names).not.toContain("excalidraw_clear_canvas");
	});

	it("registers every tool at most once", () => {
		const names = toolNames({
			module: "obsidian",
			activeNotePath: "x.canvas",
			activeDocumentId: 1,
		});
		expect(new Set(names).size).toBe(names.length);
	});
});

describe("tool metadata declarations", () => {
	it("every provisioned tool carries a metadata block", () => {
		const tools = createAgentTools(undefined, {
			module: "obsidian",
			activeNotePath: "x.canvas",
			activeDocumentId: 1,
		});
		for (const tool of tools) {
			const meta = getAgentToolMetadata(tool);
			expect(meta, (tool as { name: string }).name).toBeDefined();
			expect(meta?.executionClass).toMatch(
				/^(global-headless|content-generating|context-dependent)$/,
			);
		}
	});

	it("client action directives surface on the right tools", () => {
		const tools = createAgentTools(undefined, {
			activeNotePath: "x.excalidraw",
			activeDocumentId: 1,
		});
		const byName = new Map(
			tools.map((t) => [(t as { name: string }).name, t] as const),
		);
		expect(
			getAgentToolMetadata(byName.get("draft_article"))?.clientAction,
		).toBe("draft");
		expect(getAgentToolMetadata(byName.get("draft_canvas"))?.clientAction).toBe(
			"draft",
		);
		expect(
			getAgentToolMetadata(byName.get("trigger_paragraph_rewrite"))
				?.clientAction,
		).toBe("rewrite");
		expect(
			getAgentToolMetadata(byName.get("excalidraw_clear_canvas"))?.clientAction,
		).toBe("canvas");
		expect(
			getAgentToolMetadata(byName.get("query_bookmarks"))?.clientAction,
		).toBeUndefined();
	});
});

describe("isToolAvailable", () => {
	it("treats missing metadata as always available", () => {
		expect(isToolAvailable(undefined, {})).toBe(true);
	});
});
