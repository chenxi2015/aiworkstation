import { describe, expect, it } from "vitest";
import { resolveImagePartsFromContext } from "./resolveImages.ts";

describe("resolveImagePartsFromContext", () => {
	it("returns empty array when contextItems is empty or undefined", () => {
		expect(resolveImagePartsFromContext()).toEqual([]);
		expect(resolveImagePartsFromContext([])).toEqual([]);
	});

	it("converts direct base64 data URIs into image parts", () => {
		const result = resolveImagePartsFromContext([
			{
				id: "img_1",
				type: "image",
				title: "test.png",
				thumbnail: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
			},
		]);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			type: "image",
			source: {
				type: "data",
				value: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
				mimeType: "image/png",
			},
		});
	});

	it("converts external http(s) URLs into url sources", () => {
		const result = resolveImagePartsFromContext([
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

	it("ignores non-image context items without thumbnails", () => {
		const result = resolveImagePartsFromContext([
			{
				id: "doc_1",
				type: "document",
				title: "test.docx",
			},
		]);

		expect(result).toHaveLength(0);
	});
});

