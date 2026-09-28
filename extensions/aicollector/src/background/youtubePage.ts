import { registerYoutubePageStream } from "./streamRegistry";

/**
 * YouTube page detection: instead of sniffing googlevideo traffic (SABR
 * multiplexing and player-side caching make it unreliable), watch pages are
 * registered as yt-dlp tasks handled by the local workbench.
 */

const YOUTUBE_VIDEO_URL_RE =
	/(?:youtube\.com\/(?:watch\?[^#]*[?&]v=|shorts\/)([A-Za-z0-9_-]{6,})|youtu\.be\/([A-Za-z0-9_-]{6,}))/i;

/** Canonical watch URL for a YouTube page URL, or null when not a video */
export function canonicalYoutubeVideoUrl(pageUrl: string): string | null {
	const m = YOUTUBE_VIDEO_URL_RE.exec(pageUrl);
	const videoId = m?.[1] ?? m?.[2];
	if (!videoId) return null;
	return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Registers the video page of a tab as a yt-dlp downloadable stream */
export async function resolveYoutubePage(
	tabId: number,
	pageUrl: string,
): Promise<void> {
	const canonical = canonicalYoutubeVideoUrl(pageUrl);
	if (!canonical) return;
	await registerYoutubePageStream(tabId, { url: canonical, pageUrl });
}
