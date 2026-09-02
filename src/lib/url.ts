/**
 * Utility functions for URL parsing and domain extraction
 */

/**
 * Safely extracts the domain name or hostname from a given URL string.
 * Strips out 'www.' prefix for cleaner display in UI badges and cards.
 *
 * @param url Target URL string
 * @returns Clean domain name or fallback string
 */
export function extractDomain(url?: string): string {
	if (!url) return "";
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, "");
	} catch {
		return url.slice(0, 30);
	}
}

/**
 * Validates if a string is a valid HTTP/HTTPS URL
 */
export function isValidUrl(url?: string): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}
