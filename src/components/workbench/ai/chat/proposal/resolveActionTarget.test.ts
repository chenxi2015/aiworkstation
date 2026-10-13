import { describe, expect, it } from "vitest";
import type { ChatContextItem } from "../../../../../types/chatContext";
import type { PageBridge } from "../../../../../types/pageBridge";
import { resolveActionTarget } from "./resolveActionTarget";

const obsidianBridge: PageBridge = {
	module: "obsidian",
	actions: [
		{ id: "stream_spin_rewrite", label: "二创", onAction: () => {} },
		{ id: "stream_full_rewrite", label: "润色", onAction: () => {} },
		{
			id: "stream_structure_rewrite",
			label: "结构化",
			onAction: () => {},
		},
	],
	activeNotePath: "notes/旅行清单.md",
	activeDocumentTitle: "旅行清单",
};

const workbenchBridge: PageBridge = {
	module: "workbench",
	actions: [],
};

describe("resolveActionTarget", () => {
	it("returns direct when the rewrite target is the currently open note", () => {
		const result = resolveActionTarget({
			prompt: "帮我改写这篇",
			skillContextItems: [],
			pageBridge: obsidianBridge,
			contextItems: [],
		});
		expect(result).toEqual({
			kind: "direct",
			actionId: "stream_spin_rewrite",
			target: {
				kind: "note",
				module: "obsidian",
				notePath: "notes/旅行清单.md",
				title: "旅行清单",
			},
		});
	});

	it("returns proposal when the target comes from an attached context item", () => {
		const noteItem: ChatContextItem = {
			id: "n1",
			type: "document",
			title: "产品复盘",
			data: { notePath: "notes/产品复盘.md" },
		};
		const result = resolveActionTarget({
			prompt: "帮我改写这篇",
			skillContextItems: [],
			pageBridge: obsidianBridge,
			contextItems: [noteItem],
		});
		expect(result.kind).toBe("proposal");
		if (result.kind === "proposal") {
			expect(result.target.notePath).toBe("notes/产品复盘.md");
			expect(result.reason).toBe("context-target");
		}
	});

	it("returns cross-module proposal when target module differs from current page", () => {
		const docItem: ChatContextItem = {
			id: "d1",
			type: "document",
			title: "公众号长文",
			data: { documentId: 42 },
		};
		const result = resolveActionTarget({
			prompt: "润色这篇文章",
			skillContextItems: [],
			pageBridge: obsidianBridge,
			contextItems: [docItem],
		});
		expect(result.kind).toBe("proposal");
		if (result.kind === "proposal") {
			expect(result.reason).toBe("cross-module");
			expect(result.target.module).toBe("creator");
			expect(result.target.documentId).toBe(42);
			expect(result.executionForm).toBe("双栏比对改写");
		}
	});

	it("returns proposal with skill guidance when skill context is attached", () => {
		const skillItem: ChatContextItem = {
			id: "s1",
			type: "skill",
			title: "爆款标题 skill",
			data: { dirPath: "/skills/title", content: "标题要短、有钩子" },
		};
		const result = resolveActionTarget({
			prompt: "帮我改写这篇",
			skillContextItems: [skillItem],
			pageBridge: obsidianBridge,
			contextItems: [],
		});
		expect(result.kind).toBe("proposal");
		if (result.kind === "proposal") {
			expect(result.reason).toBe("skill-context");
			expect(result.skillGuidance).toContain("标题要短、有钩子");
			expect(result.target.notePath).toBe("notes/旅行清单.md");
		}
	});

	it("falls back to agent when there is no writable target", () => {
		const result = resolveActionTarget({
			prompt: "帮我改写这篇",
			skillContextItems: [],
			pageBridge: workbenchBridge,
			contextItems: [],
		});
		expect(result).toEqual({ kind: "agent" });
	});

	it("falls back to agent when the prompt carries no rewrite intent", () => {
		const result = resolveActionTarget({
			prompt: "帮我总结这篇笔记",
			skillContextItems: [],
			pageBridge: obsidianBridge,
			contextItems: [],
		});
		expect(result).toEqual({ kind: "agent" });
	});
});
