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
});

