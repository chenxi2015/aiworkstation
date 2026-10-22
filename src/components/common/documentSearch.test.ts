import { describe, expect, it } from "vitest";
import {
	applyPreserveCase,
	computeReplacementText,
} from "./documentSearchUtils";

// Extracted search matching pure utility for comprehensive unit tests
function executeTextMatch(
	text: string,
	query: string,
	options: {
		caseSensitive: boolean;
		wholeWord: boolean;
		isRegex: boolean;
	},
): {
	matches: Array<{ from: number; to: number; text: string }>;
	error: string | null;
} {
	if (!query) {
		return { matches: [], error: null };
	}

	let regex: RegExp;
	try {
		let pattern = options.isRegex
			? query
			: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (options.wholeWord) {
			pattern = `\\b${pattern}\\b`;
		}
		regex = new RegExp(pattern, options.caseSensitive ? "gu" : "gui");
	} catch {
		return { matches: [], error: "无效正则" };
	}

	const matches: Array<{ from: number; to: number; text: string }> = [];
	regex.lastIndex = 0;
	let match: RegExpExecArray | null = regex.exec(text);
	while (match !== null) {
		const from = match.index;
		const to = from + match[0].length;
		if (from < to) {
			matches.push({ from, to, text: match[0] });
		}
		if (!regex.global) break;
		match = regex.exec(text);
	}

	return { matches, error: null };
}

describe("documentSearch matching logic", () => {
	const sampleText =
		"Migrate from v1 to v2. The migration tool helps migrate everything. Case MIGRATE test.";

	it("matches case-insensitively by default", () => {
		const res = executeTextMatch(sampleText, "migrate", {
			caseSensitive: false,
			wholeWord: false,
			isRegex: false,
		});

		expect(res.error).toBeNull();
		expect(res.matches.length).toBe(3); // Migrate, migrate, MIGRATE
	});

	it("respects case sensitivity toggle", () => {
		const res = executeTextMatch(sampleText, "migrate", {
			caseSensitive: true,
			wholeWord: false,
			isRegex: false,
		});

		expect(res.error).toBeNull();
		expect(res.matches.length).toBe(1); // lowercase "migrate"
		expect(res.matches.map((m) => m.text)).toEqual(["migrate"]);
	});

	it("respects whole-word matching toggle", () => {
		const res = executeTextMatch(sampleText, "migrate", {
			caseSensitive: false,
			wholeWord: true,
			isRegex: false,
		});

		expect(res.error).toBeNull();
		// "Migrate", "migrate", "MIGRATE" should match, but "migration" should NOT match
		expect(res.matches.length).toBe(3);
		expect(res.matches.map((m) => m.text)).toEqual([
			"Migrate",
			"migrate",
			"MIGRATE",
		]);
	});

	it("safely handles special regex characters in plain mode without syntax error", () => {
		const plainText = "Check function(arg) with [index] and obj.prop * 2";
		const res = executeTextMatch(plainText, "[index]", {
			caseSensitive: false,
			wholeWord: false,
			isRegex: false,
		});

		expect(res.error).toBeNull();
		expect(res.matches.length).toBe(1);
		expect(res.matches[0].text).toBe("[index]");
	});

	it("supports valid regex patterns", () => {
		const res = executeTextMatch(sampleText, "v[12]", {
			caseSensitive: false,
			wholeWord: false,
			isRegex: true,
		});

		expect(res.error).toBeNull();
		expect(res.matches.length).toBe(2);
		expect(res.matches.map((m) => m.text)).toEqual(["v1", "v2"]);
	});

	it("gracefully captures and reports invalid regex patterns without crashing", () => {
		const res = executeTextMatch(sampleText, "(unclosed [pattern", {
			caseSensitive: false,
			wholeWord: false,
			isRegex: true,
		});

		expect(res.error).toBe("无效正则");
		expect(res.matches.length).toBe(0);
	});

	it("handles navigation index wrapping accurately", () => {
		const total = 5;
		const nextIndex = (curr: number) => (curr + 1) % total;
		const prevIndex = (curr: number) => (curr - 1 + total) % total;

		expect(nextIndex(0)).toBe(1);
		expect(nextIndex(4)).toBe(0); // wraps forward

		expect(prevIndex(4)).toBe(3);
		expect(prevIndex(0)).toBe(4); // wraps backward
	});

	it("preserves casing correctly with applyPreserveCase", () => {
		expect(applyPreserveCase("HELLO", "world")).toBe("WORLD");
		expect(applyPreserveCase("Hello", "world")).toBe("World");
		expect(applyPreserveCase("hello", "WORLD")).toBe("world");
	});

	it("computes regex replacement with capture groups", () => {
		const replaced = computeReplacementText("image-123", "pic-$1", {
			isRegex: true,
			preserveCase: false,
			searchPattern: "image-(\\d+)",
			caseSensitive: false,
		});
		expect(replaced).toBe("pic-123");
	});
});
