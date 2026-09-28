/**
 * Background image fetch proxy: tries the page as Referer first (hotlink
 * protection), then no-referrer, then a plain direct fetch. Returns the
 * image as a data URL for the content script.
 */
export async function smartFetchImageAsDataUrl(
	url: string,
	pageUrl?: string,
): Promise<string> {
	const fetchWithTimeout = async (
		targetUrl: string,
		options: RequestInit,
		timeoutMs = 8000,
	) => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			return await fetch(targetUrl, { ...options, signal: controller.signal });
		} finally {
			clearTimeout(timer);
		}
	};

	const executeSmartFetch = async (): Promise<Blob> => {
		// Attempt 1: If pageUrl provided, try with pageUrl as referer (helps with strict hotlink-protected sites)
		if (pageUrl && pageUrl.startsWith("http")) {
			try {
				const res = await fetchWithTimeout(url, {
					headers: { Referer: pageUrl },
					credentials: "omit",
				});
				if (res.ok) {
					const blob = await res.blob();
					if (blob.size > 0) return blob;
				}
			} catch {
				// Fallback to next attempt
			}
		}

		// Attempt 2: Try no-referrer policy (helps with sites that only allow empty referer)
		try {
			const res = await fetchWithTimeout(url, {
				referrerPolicy: "no-referrer",
				credentials: "omit",
			});
			if (res.ok) {
				const blob = await res.blob();
				if (blob.size > 0) return blob;
			}
		} catch {
			// Fallback to direct fetch
		}

		// Attempt 3: Standard direct fetch
		const res = await fetchWithTimeout(url, { credentials: "omit" });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.blob();
	};

	const blob = await executeSmartFetch();
	return await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error("FileReader failed"));
		reader.readAsDataURL(blob);
	});
}
