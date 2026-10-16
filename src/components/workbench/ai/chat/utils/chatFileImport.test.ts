import { describe, expect, it } from "vitest";
import {
	getUnsupportedFileReason,
	isImportableChatFile,
	importChatFile,
} from "./chatFileImport.ts";

describe("chatFileImport utilities", () => {
	it("identifies supported file extensions correctly", () => {
		expect(isImportableChatFile(new File([""], "note.md"))).toBe(true);
		expect(isImportableChatFile(new File([""], "test.canvas"))).toBe(true);
		expect(isImportableChatFile(new File([""], "diagram.excalidraw"))).toBe(true);
		expect(isImportableChatFile(new File([""], "diagram.excalidraw.md"))).toBe(true);
		expect(isImportableChatFile(new File([""], "table.xlsx"))).toBe(true);
		expect(isImportableChatFile(new File([""], "doc.docx"))).toBe(true);
		expect(isImportableChatFile(new File([""], "manual.pdf"))).toBe(true);
		expect(isImportableChatFile(new File([""], "code.ts"))).toBe(true);
	});

	it("identifies unsupported file formats correctly", () => {
		expect(isImportableChatFile(new File([""], "video.mp4"))).toBe(false);
		expect(isImportableChatFile(new File([""], "archive.zip"))).toBe(false);
		expect(isImportableChatFile(new File([""], "installer.dmg"))).toBe(false);
		expect(isImportableChatFile(new File([""], "old.doc"))).toBe(false);
	});

	it("returns informative reasons for unsupported formats", () => {
		const mediaReason = getUnsupportedFileReason(new File([""], "clip.mp4"));
		expect(mediaReason).toContain("音视频");

		const zipReason = getUnsupportedFileReason(new File([""], "bundle.zip"));
		expect(zipReason).toContain("压缩包");

		const exeReason = getUnsupportedFileReason(new File([""], "app.exe"));
		expect(exeReason).toContain("程序安装包或系统镜像");

		const docReason = getUnsupportedFileReason(new File([""], "legacy.doc"));
		expect(docReason).toContain(".docx");
	});

	it("parses Obsidian Canvas JSON into topology markdown", async () => {
		const canvasJson = JSON.stringify({
			nodes: [
				{ id: "n1", type: "text", text: "系统架构主节点" },
				{ id: "n2", type: "file", file: "notes/database.md" },
			],
			edges: [
				{ id: "e1", fromNode: "n1", toNode: "n2", label: "读写依赖" },
			],
		});

		const file = new File([canvasJson], "architecture.canvas", {
			type: "application/json",
		});
		const item = await importChatFile(file, 1);

		expect(item).not.toBeNull();
		expect(item?.type).toBe("file");
		expect(item?.title).toBe("architecture.canvas");
		const preview = item?.data?.contentPreview as string;
		expect(preview).toContain("Obsidian Canvas 画板结构");
		expect(preview).toContain("系统架构主节点");
		expect(preview).toContain("database.md");
		expect(preview).toContain("读写依赖");
	});

	it("parses Excalidraw JSON into diagram markdown", async () => {
		const excalidrawJson = JSON.stringify({
			elements: [
				{ id: "el1", type: "rectangle", text: "网关服务" },
				{ id: "el2", type: "ellipse", label: { text: "用户认证" } },
				{ id: "el3", type: "arrow", start: { id: "el1" }, end: { id: "el2" }, label: { text: "校验" } },
			],
		});

		const file = new File([excalidrawJson], "flow.excalidraw", {
			type: "application/json",
		});
		const item = await importChatFile(file, 1);

		expect(item).not.toBeNull();
		expect(item?.type).toBe("file");
		expect(item?.title).toBe("flow.excalidraw");
		const preview = item?.data?.contentPreview as string;
		expect(preview).toContain("Excalidraw 手绘图板结构");
		expect(preview).toContain("网关服务");
		expect(preview).toContain("用户认证");
		expect(preview).toContain("校验");
	});
});

