import { describe, expect, it } from "vitest";
import {
	isImageExtension,
	isValidImageMime,
	isVideoExtension,
	MAX_BASE64_URI_LENGTH,
	MAX_IMAGE_FILE_BYTES,
	resolveBoardVisualAsDataUri,
	resolveImagePartsFromContext,
} from "./resolveImages.ts";

describe("resolveImages helpers", () => {
	it("correctly identifies image extensions", () => {
		expect(isImageExtension("png")).toBe(true);
		expect(isImageExtension(".jpg")).toBe(true);
		expect(isImageExtension(".jpeg")).toBe(true);
		expect(isImageExtension("webp")).toBe(true);
		expect(isImageExtension("svg")).toBe(true);
		expect(isImageExtension("gif")).toBe(true);
		expect(isImageExtension("md")).toBe(false);
		expect(isImageExtension("txt")).toBe(false);
		expect(isImageExtension("canvas")).toBe(false);
		expect(isImageExtension("mp4")).toBe(false);
	});

	it("correctly identifies video extensions", () => {
		expect(isVideoExtension("mp4")).toBe(true);
		expect(isVideoExtension(".mov")).toBe(true);
		expect(isVideoExtension("webm")).toBe(true);
		expect(isVideoExtension("png")).toBe(false);
		expect(isVideoExtension("md")).toBe(false);
	});

	it("validates legitimate image MIME types and rejects text/plain", () => {
		expect(isValidImageMime("image/png")).toBe(true);
		expect(isValidImageMime("image/jpeg")).toBe(true);
		expect(isValidImageMime("image/svg+xml")).toBe(true);
		expect(isValidImageMime("text/plain; charset=utf-8")).toBe(false);
		expect(isValidImageMime("text/plain")).toBe(false);
		expect(isValidImageMime("video/mp4")).toBe(false);
		expect(isValidImageMime("application/octet-stream")).toBe(false);
		expect(isValidImageMime(undefined)).toBe(false);
		expect(isValidImageMime(null)).toBe(false);
	});

	it("handles non-existent board path safely", () => {
		expect(resolveBoardVisualAsDataUri("/non/existent/path.canvas")).toBeNull();
	});
});

describe("resolveImagePartsFromContext", () => {
	it("returns empty array when contextItems is empty or undefined", async () => {
		expect(await resolveImagePartsFromContext()).toEqual([]);
		expect(await resolveImagePartsFromContext([])).toEqual([]);
	});

	it("converts direct base64 data URIs into image parts", async () => {
		const result = await resolveImagePartsFromContext([
			{
				id: "img_1",
				type: "image",
				title: "test.png",
				thumbnail:
					"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
			},
		]);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			type: "image",
			source: {
				type: "data",
				value:
					"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
				mimeType: "image/png",
			},
		});
	});

	it("strictly REJECTS text/plain or invalid MIME data URIs to prevent 400 error", async () => {
		const result = await resolveImagePartsFromContext([
			{
				id: "invalid_img",
				type: "image",
				title: "fake.txt",
				thumbnail: "data:text/plain; charset=utf-8;base64,5LiA5YyF5paH5pys",
			},
		]);

		expect(result).toHaveLength(0);
	});

	it("converts external http(s) URLs into url sources", async () => {
		const result = await resolveImagePartsFromContext([
			{
				id: "img_url",
				type: "image",
				title: "web-image.jpg",
				thumbnail: "https://example.com/photo.jpg",
			},
		]);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			type: "image",
			source: {
				type: "url",
				value: "https://example.com/photo.jpg",
			},
		});
	});

	it("ignores non-image context items such as notes and documents", async () => {
		const result = await resolveImagePartsFromContext([
			{
				id: "doc_1",
				type: "document",
				title: "test.docx",
			},
			{
				id: "note_1",
				type: "note",
				title: "在大模型竞技场，开发者几轮交手之后",
				notePath: "在大模型竞技场，开发者几轮交手之后.md",
			},
			{
				id: "canvas_1",
				type: "note",
				title: "架构图.canvas",
				notePath: "架构图.canvas",
			},
		]);

		expect(result).toHaveLength(0);
	});

	it("strictly enforces MAX_IMAGE_FILE_BYTES and MAX_BASE64_URI_LENGTH limits", async () => {
		expect(MAX_IMAGE_FILE_BYTES).toBe(10 * 1024 * 1024);
		expect(MAX_BASE64_URI_LENGTH).toBe(15 * 1024 * 1024);

		const oversizedDataUri = `data:image/png;base64,${"A".repeat(16 * 1024 * 1024)}`;
		const result = await resolveImagePartsFromContext([
			{
				id: "oversized_img",
				type: "image",
				title: "huge.png",
				thumbnail: oversizedDataUri,
			},
		]);

		expect(result).toHaveLength(0);
	});
});
