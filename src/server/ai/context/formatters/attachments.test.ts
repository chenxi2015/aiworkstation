import { describe, expect, it } from "vitest";
import {
	type ChatContextItem,
	MAX_CHAT_ATTACHMENTS,
} from "../../../../types/chatContext.ts";
import { resolveAttachmentsPrompt } from "./attachments.ts";

describe("attachments limits and formatting", () => {
	it("defines MAX_CHAT_ATTACHMENTS as 10", () => {
		expect(MAX_CHAT_ATTACHMENTS).toBe(10);
	});

	it("strictly caps injected contextItems to MAX_CHAT_ATTACHMENTS (10)", async () => {
		// Create 15 mock context items
		const mockItems: ChatContextItem[] = Array.from(
			{ length: 15 },
			(_, i) => ({
				id: `item_${i + 1}`,
				type: "bookmark",
				title: `测试链接 ${i + 1}`,
				url: `https://example.com/${i + 1}`,
			}),
		);

		const result = await resolveAttachmentsPrompt(mockItems, "测试提问");
		// In the output prompt list, only items 1 to 10 should be formatted
		expect(result.attachmentsPrompt).toContain("1. [书签链接] 《测试链接 1》");
		expect(result.attachmentsPrompt).toContain("10. [书签链接] 《测试链接 10》");
		expect(result.attachmentsPrompt).not.toContain("11. [书签链接] 《测试链接 11》");
		expect(result.attachmentsPrompt).not.toContain("15. [书签链接] 《测试链接 15》");
	});

	it("resolves local file path correctly via resolveContextItemLocalPath", async () => {
		const { resolveContextItemLocalPath } = await import("./attachments.ts");

		const directPathItem: ChatContextItem = {
			id: "file_1",
			type: "file",
			title: "video.mp4",
			filePath: "/Users/test/video.mp4",
		};
		expect(resolveContextItemLocalPath(directPathItem)).toBe("/Users/test/video.mp4");

		const dataPathItem: ChatContextItem = {
			id: "file_2",
			type: "file",
			title: "recording.mp3",
			data: { filePath: "/Users/test/recording.mp3" },
		};
		expect(resolveContextItemLocalPath(dataPathItem)).toBe("/Users/test/recording.mp3");

		const noPathDocItem: ChatContextItem = {
			id: "doc_1",
			type: "document",
			title: "Draft Article",
			documentId: 101,
		};
		expect(resolveContextItemLocalPath(noPathDocItem)).toBeNull();
	});

	it("formats local path badges and guidance in attachments prompt", async () => {
		const mockItems: ChatContextItem[] = [
			{
				id: "upload_video",
				type: "file",
				title: "screen_recording.mp4",
				filePath: "/Users/test/screen_recording.mp4",
				data: { contentPreview: "video metadata" },
			},
			{
				id: "studio_doc",
				type: "document",
				title: "Project Plan",
				documentId: 202,
				data: { contentPreview: "Plan details" },
			},
		];

		const result = await resolveAttachmentsPrompt(mockItems, "Transcribe this");
		expect(result.attachmentsPrompt).toContain("[本地绝对路径: /Users/test/screen_recording.mp4]");
		expect(result.attachmentsPrompt).toContain("[存储: 本地 SQLite 数据库]");
		expect(result.attachmentsPrompt).toContain("- 本地文件绝对路径: `/Users/test/screen_recording.mp4`");
		expect(result.attachmentsPrompt).toContain("- 存储方式: 本地 SQLite 数据库托管 (id=202)");
		expect(result.attachmentsPrompt).toContain("★ 本地实体路径铁律（严禁盲目搜索）");
	});
});

