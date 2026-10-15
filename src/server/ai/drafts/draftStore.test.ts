import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createDraft,
	deleteDraft,
	getDraft,
	listDrafts,
	markArchived,
	sweepDrafts,
	updateDraftContent,
} from "./draftStore.ts";

const TEST_BASE_DIR = join(process.cwd(), "scratch", "test_drafts");
const TEST_TRASH_DIR = join(process.cwd(), "scratch", "test_trash");

describe("draftStore", () => {
	beforeEach(() => {
		rmSync(TEST_BASE_DIR, { recursive: true, force: true });
		rmSync(TEST_TRASH_DIR, { recursive: true, force: true });
		mkdirSync(TEST_BASE_DIR, { recursive: true });
		mkdirSync(TEST_TRASH_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_BASE_DIR, { recursive: true, force: true });
		rmSync(TEST_TRASH_DIR, { recursive: true, force: true });
	});

	it("creates a draft, writes .md and persists index entry", () => {
		const fixedDate = new Date("2026-03-01T12:00:00.000Z");
		const draft = createDraft(
			{
				title: "测试长文",
				content: "这是正文第一段。\n\n这是正文第二段。",
				sessionId: "session_123",
			},
			{
				baseDir: TEST_BASE_DIR,
				trashDir: TEST_TRASH_DIR,
				now: () => fixedDate,
			},
		);

		expect(draft.id).toBeDefined();
		expect(draft.title).toBe("测试长文");
		expect(draft.status).toBe("pending");
		expect(draft.sessionId).toBe("session_123");
		expect(draft.createdAt).toBe(fixedDate.toISOString());
		expect(draft.content).toContain("这是正文第一段。");

		// Check file on disk
		const filePath = join(TEST_BASE_DIR, `${draft.id}.md`);
		expect(existsSync(filePath)).toBe(true);
		const raw = readFileSync(filePath, "utf-8");
		expect(raw).toContain('title: "测试长文"');
		expect(raw).toContain("这是正文第一段。");

		// Check getDraft and listDrafts
		const fetched = getDraft(draft.id, { baseDir: TEST_BASE_DIR });
		expect(fetched).not.toBeNull();
		expect(fetched?.title).toBe("测试长文");
		expect(fetched?.content).toBe("这是正文第一段。\n\n这是正文第二段。");

		const all = listDrafts({ baseDir: TEST_BASE_DIR });
		expect(all.length).toBe(1);
		expect(all[0].id).toBe(draft.id);
	});

	it("creates and updates an excalidraw draft with raw json preserved", () => {
		const excalidrawJson = JSON.stringify({ type: "excalidraw", elements: [] });
		const draft = createDraft(
			{
				title: "行情研判画板",
				content: excalidrawJson,
				kind: "excalidraw",
				wordCount: 0,
			},
			{ baseDir: TEST_BASE_DIR },
		);

		expect(draft.kind).toBe("excalidraw");
		expect(existsSync(join(TEST_BASE_DIR, `${draft.id}.excalidraw`))).toBe(true);

		const updatedJson = JSON.stringify({
			type: "excalidraw",
			elements: [{ id: "el_1" }],
		});
		const updated = updateDraftContent(
			draft.id,
			updatedJson,
			{ baseDir: TEST_BASE_DIR },
			1,
		);

		expect(updated.wordCount).toBe(1);
		const fetched = getDraft(draft.id, { baseDir: TEST_BASE_DIR });
		expect(fetched?.content).toBe(updatedJson);
		expect(fetched?.kind).toBe("excalidraw");
	});

	it("marks draft archived to document or note target", () => {
		const draft = createDraft(
			{ title: "即将归档", content: "内容" },
			{ baseDir: TEST_BASE_DIR },
		);

		const archived = markArchived(
			draft.id,
			{ kind: "document", ref: "doc_42" },
			{ baseDir: TEST_BASE_DIR },
		);

		expect(archived.status).toBe("archived");
		expect(archived.archivedTo).toEqual({ kind: "document", ref: "doc_42" });

		const refetched = getDraft(draft.id, { baseDir: TEST_BASE_DIR });
		expect(refetched?.status).toBe("archived");
		expect(refetched?.archivedTo?.ref).toBe("doc_42");
	});

	it("deletes draft via trash and marks status expired", () => {
		const draft = createDraft(
			{ title: "将被丢弃", content: "垃圾内容" },
			{ baseDir: TEST_BASE_DIR, trashDir: TEST_TRASH_DIR },
		);

		const filePath = join(TEST_BASE_DIR, `${draft.id}.md`);
		expect(existsSync(filePath)).toBe(true);

		const success = deleteDraft(draft.id, {
			baseDir: TEST_BASE_DIR,
			trashDir: TEST_TRASH_DIR,
		});
		expect(success).toBe(true);
		expect(existsSync(filePath)).toBe(false);

		const refetched = getDraft(draft.id, { baseDir: TEST_BASE_DIR });
		expect(refetched?.status).toBe("expired");
	});

	it("performs startup sweep: expires pending drafts older than 7 days and deletes archived files", () => {
		const day0 = new Date("2026-03-01T00:00:00.000Z");
		const day8 = new Date("2026-03-09T00:00:00.000Z"); // 8 days later

		// 1. Pending draft created on day0 (old)
		const oldDraft = createDraft(
			{ title: "老草稿", content: "很久以前的内容" },
			{ baseDir: TEST_BASE_DIR, trashDir: TEST_TRASH_DIR, now: () => day0 },
		);

		// 2. Pending draft created on day7 (fresh)
		const day7 = new Date("2026-03-08T00:00:00.000Z");
		const freshDraft = createDraft(
			{ title: "新鲜草稿", content: "新内容" },
			{ baseDir: TEST_BASE_DIR, trashDir: TEST_TRASH_DIR, now: () => day7 },
		);

		// 3. Archived draft
		const archivedDraft = createDraft(
			{ title: "已归档草稿", content: "已归档内容" },
			{ baseDir: TEST_BASE_DIR, trashDir: TEST_TRASH_DIR, now: () => day7 },
		);
		markArchived(
			archivedDraft.id,
			{ kind: "document", ref: "1" },
			{ baseDir: TEST_BASE_DIR },
		);

		const oldFilePath = join(TEST_BASE_DIR, `${oldDraft.id}.md`);
		const freshFilePath = join(TEST_BASE_DIR, `${freshDraft.id}.md`);
		const archivedFilePath = join(TEST_BASE_DIR, `${archivedDraft.id}.md`);

		expect(existsSync(oldFilePath)).toBe(true);
		expect(existsSync(freshFilePath)).toBe(true);
		expect(existsSync(archivedFilePath)).toBe(true);

		// Sweep on day 8
		const sweepResult = sweepDrafts({
			baseDir: TEST_BASE_DIR,
			trashDir: TEST_TRASH_DIR,
			now: () => day8,
			maxAgeDays: 7,
		});

		expect(sweepResult.sweptPending).toBe(1);
		expect(sweepResult.expiredIds).toContain(oldDraft.id);
		expect(sweepResult.deletedArchivedFiles).toBe(1);

		// Old pending draft file moved to trash, status in index is expired
		expect(existsSync(oldFilePath)).toBe(false);
		const oldMeta = getDraft(oldDraft.id, { baseDir: TEST_BASE_DIR });
		expect(oldMeta?.status).toBe("expired");

		// Fresh draft still exists and pending
		expect(existsSync(freshFilePath)).toBe(true);
		const freshMeta = getDraft(freshDraft.id, { baseDir: TEST_BASE_DIR });
		expect(freshMeta?.status).toBe("pending");

		// Archived draft file removed immediately, index kept with status archived
		expect(existsSync(archivedFilePath)).toBe(false);
		const archivedMeta = getDraft(archivedDraft.id, { baseDir: TEST_BASE_DIR });
		expect(archivedMeta?.status).toBe("archived");
	});
});
