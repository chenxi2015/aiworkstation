/**
 * Normalize a URL for deduplication purposes.
 * Lowercases protocol/host, strips default ports, strips a leading "www.",
 * removes trailing slash from the pathname.
 */
export function normalizeUrl(raw: string): string {
	try {
		const u = new URL(raw);
		let host = u.hostname.toLowerCase();
		if (host.startsWith("www.")) host = host.slice(4);
		let path = u.pathname || "/";
		if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
		return `${u.protocol.toLowerCase()}//${host}${path}${u.search}`;
	} catch {
		return raw.trim().toLowerCase();
	}
}

/**
 * Extract a short hostname for favicon lookups, "" on parse failure.
 */
export function hostnameOf(raw: string): string {
	try {
		return new URL(raw).hostname.toLowerCase();
	} catch {
		return "";
	}
}
