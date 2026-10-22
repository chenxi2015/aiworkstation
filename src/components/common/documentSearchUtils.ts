/**
 * Applies original string's casing style to replacement string
 * (e.g. UPPERCASE -> UPPERCASE, Capitalized -> Capitalized, lowercase -> lowercase)
 */
export function applyPreserveCase(
	original: string,
	replacement: string,
): string {
	if (!original || !replacement) return replacement;

	// All uppercase (and has at least one letter)
	if (
		original === original.toUpperCase() &&
		original !== original.toLowerCase()
	) {
		return replacement.toUpperCase();
	}

	// Capitalized / Title Case (first letter uppercase, rest lowercase)
	if (
		original.length > 1 &&
		original[0] === original[0].toUpperCase() &&
		original.slice(1) === original.slice(1).toLowerCase()
	) {
		return (
			replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase()
		);
	}

	// All lowercase
	if (
		original === original.toLowerCase() &&
		original !== original.toUpperCase()
	) {
		return replacement.toLowerCase();
	}

	return replacement;
}

/**
 * Computes replacement string for a matched occurrence, handling regex groups and case preservation
 */
export function computeReplacementText(
	matchedText: string,
	replacementTemplate: string,
	options: {
		isRegex: boolean;
		preserveCase: boolean;
		searchPattern?: string;
		caseSensitive?: boolean;
	},
): string {
	let result = replacementTemplate;

	if (options.isRegex && options.searchPattern) {
		try {
			const regex = new RegExp(
				options.searchPattern,
				options.caseSensitive ? "u" : "ui",
			);
			result = matchedText.replace(regex, replacementTemplate);
		} catch {
			result = replacementTemplate;
		}
	}

	if (options.preserveCase) {
		result = applyPreserveCase(matchedText, result);
	}

	return result;
}

