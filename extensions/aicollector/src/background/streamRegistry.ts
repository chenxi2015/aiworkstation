import type { SniffedStream } from "../types";
import {
	broadcastHlsStreams,
	MAX_STREAMS_PER_TAB,
	readHlsStreams,
	writeHlsStreams,
} from "./streamStore";

/** Progressive video file extensions worth sniffing (Douyin / Xiaohongshu style) */
const VIDEO_FILE_URL_RE = /\.(mp4|webm|mov|m4v|flv)(\?|#|$)/i;
/** DASH segments (.m4s) are handled by the dash resolver, never as plain files */
const DASH_SEGMENT_URL_RE = /\.m4s(\?|#|$)/i;
/** Ignore tiny clips: ad preloads, poster animations, preview loops */
const MIN_VIDEO_FILE_BYTES = 512 * 1024;
/**
 * CDN hosts known to serve progressive video over MSE / range fetches
 * instead of plain <video> element loads (Xiaohongshu, Douyin fallback).
 * For these hosts the 'media' request-type restriction is lifted.
 */
const KNOWN_VIDEO_CDN_HOST_RE =
	/(^|\.)(douyinvod\.com|douyincdn\.com|xhscdn\.com)$/i;

export function isVideoFileUrl(url: string): boolean {
	return VIDEO_FILE_URL_RE.test(url);
}

export function isKnownVideoCdn(url: string): boolean {
	try {
		return KNOWN_VIDEO_CDN_HOST_RE.test(new URL(url).hostname);
	} catch {
		return false;
	}
}

export function isBelowMinVideoSize(contentLength?: number): boolean {
	return (
		typeof contentLength === "number" && contentLength < MIN_VIDEO_FILE_BYTES
	);
}

/** Strips platform suffixes so titles read like the actual video title */
function cleanPageTitle(title?: string): string | undefined {
	if (!title) return undefined;
	const cleaned = title
		.replace(/\s*[-_]\s*抖音$/, "")
		.replace(/_哔哩哔哩_bilibili$/i, "")
		.replace(/\s*-\s*哔哩哔哩.*$/i, "")
		.replace(/\s*-\s*小红书$/, "")
		.replace(/\s*-\s*YouTube$/i, "")
		.trim();
	return cleaned || undefined;
}

/**
 * Network-level sniffing (webRequest) has no access to the page title, so
 * resolve it from the tab itself as a fallback for nicer display names.
 */
async function resolveTabTitle(tabId: number): Promise<string | undefined> {
	try {
		const tab = await chrome.tabs.get(tabId);
		return cleanPageTitle(tab?.title);
	} catch {
		return undefined;
	}
}

interface HlsPlaylistInfo {
	role: "master" | "media";
	/** Absolute URLs of variant + rendition playlists referenced by a master */
	children: string[];
	hasAudio?: boolean;
	bestResolution?: string;
	variantCount?: number;
}

/**
 * Fetches and classifies an m3u8 playlist. Master playlists list their
 * variant/audio child playlists, which lets us group one video's multiple
 * network entries (e.g. Twitter splits video and audio tracks) into a
 * single downloadable stream.
 */
async function classifyHlsPlaylist(
	url: string,
): Promise<HlsPlaylistInfo | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 8000);
		let res: Response;
		try {
			res = await fetch(url, {
				credentials: "omit",
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timer);
		}
		if (!res.ok) return null;
		const text = await res.text();
		if (!text.includes("#EXTM3U")) return null;

		if (text.includes("#EXT-X-STREAM-INF")) {
			const children: string[] = [];
			const lines = text.split("\n").map((l) => l.trim());
			let bestResolution: string | undefined;
			let bestArea = 0;
			let variantCount = 0;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i] ?? "";

				if (line.startsWith("#EXT-X-MEDIA")) {
					const uriMatch = line.match(/URI="([^"]+)"/);
					if (uriMatch?.[1]) {
						try {
							children.push(new URL(uriMatch[1], url).href);
						} catch {
							// Skip unresolvable rendition URI
						}
					}
					continue;
				}

				if (line.startsWith("#EXT-X-STREAM-INF")) {
					variantCount++;
					const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
					if (resMatch) {
						const area = Number(resMatch[1]) * Number(resMatch[2]);
						if (area > bestArea) {
							bestArea = area;
							bestResolution = `${resMatch[1]}x${resMatch[2]}`;
						}
					}
					// Variant URI sits on the next non-empty, non-comment line
					for (let j = i + 1; j < lines.length; j++) {
						const uri = lines[j];
						if (!uri) continue;
						if (uri.startsWith("#")) break;
						try {
							children.push(new URL(uri, url).href);
						} catch {
							// Skip unresolvable variant URI
						}
						break;
					}
				}
			}

			return {
				role: "master",
				children,
				hasAudio: /#EXT-X-MEDIA:[^\n]*TYPE=AUDIO[^\n]*URI="/.test(text),
				bestResolution,
				variantCount,
			};
		}

		if (text.includes("#EXTINF")) {
			return { role: "media", children: [] };
		}

		return null;
	} catch {
		// Network/CORS/abort failure: keep the stream listed as-is
		return null;
	}
}

/**
 * Registers a sniffed playlist for a tab, classifying it so that variant and
 * audio-track playlists collapse into their master playlist entry.
 */
export async function registerHlsStream(
	tabId: number,
	payload: { url: string; pageUrl: string; pageTitle?: string; via?: string },
): Promise<void> {
	const streams = await readHlsStreams(tabId);
	if (streams.some((s) => s.url === payload.url)) return;

	const stream: SniffedStream = {
		url: payload.url,
		via: payload.via,
		pageUrl: payload.pageUrl,
		pageTitle:
			cleanPageTitle(payload.pageTitle) || (await resolveTabTitle(tabId)),
		detectedAt: Date.now(),
	};

	const info = await classifyHlsPlaylist(payload.url);
	if (info) {
		stream.role = info.role;
		if (info.role === "master") {
			stream.children = info.children;
			stream.hasAudio = info.hasAudio;
			stream.bestResolution = info.bestResolution;
			stream.variantCount = info.variantCount;
			// Hide child playlists that were sniffed before this master arrived
			for (const existing of streams) {
				if (info.children.includes(existing.url)) {
					existing.hidden = true;
				}
			}
		} else {
			// Hide this media playlist when an existing master already claims it
			const parent = streams.find(
				(s) => s.role === "master" && s.children?.includes(stream.url),
			);
			if (parent) stream.hidden = true;
		}
	}

	const next = [stream, ...streams].slice(0, MAX_STREAMS_PER_TAB);
	await writeHlsStreams(tabId, next);
	broadcastHlsStreams(tabId, next);
}

interface VideoFileStreamPayload {
	url: string;
	pageUrl: string;
	pageTitle?: string;
	via?: string;
	contentLength?: number;
	/** True when contentLength is the authoritative full file size */
	sizeIsTotal?: boolean;
	mimeType?: string;
}

/**
 * Dedupe key for a file stream. googlevideo.com serves every track of
 * every video from the same /videoplayback path, so tracks are told apart
 * by the `id` and `itag` query params instead.
 */
function videoFileDedupeKey(url: string): string {
	try {
		const u = new URL(url);
		if (/(^|\.)googlevideo\.com$/i.test(u.hostname)) {
			const id = u.searchParams.get("id");
			if (id) {
				return `${u.origin}${u.pathname}#id=${id}&itag=${u.searchParams.get("itag") ?? ""}`;
			}
		}
		return `${u.origin}${u.pathname}`;
	} catch {
		return url;
	}
}

/**
 * Learns a video file's total size via a Range: bytes=0-0 probe and stores
 * it on the matching stream entry. The response body is cancelled right
 * after the headers arrive, so no real download happens.
 */
async function probeVideoFileSize(tabId: number, url: string): Promise<void> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 8000);
	let res: Response;
	try {
		res = await fetch(url, {
			headers: { Range: "bytes=0-0" },
			credentials: "omit",
			signal: controller.signal,
		});
	} catch {
		clearTimeout(timer);
		return;
	}
	clearTimeout(timer);

	try {
		let total: number | undefined;
		const range = res.headers.get("content-range");
		const m = range ? /\/(\d+)\s*$/.exec(range) : null;
		if (m) {
			const n = Number(m[1]);
			if (Number.isFinite(n)) total = n;
		} else if (res.status === 200) {
			const n = Number(res.headers.get("content-length"));
			if (Number.isFinite(n) && n > 0) total = n;
		}
		res.body?.cancel().catch(() => {});

		if (typeof total === "number" && total > 0) {
			await registerVideoFileStream(tabId, {
				url,
				pageUrl: "",
				via: "size-probe",
				contentLength: total,
				sizeIsTotal: true,
			});
		}
	} catch {
		// Probe is best-effort
	}
}

/**
 * Registers a sniffed direct video file (progressive MP4/WebM/...). These
 * URLs point at the whole video, so downloading is a plain HTTP GET.
 * Signed CDN URLs are deduped by origin + pathname so refreshed signatures
 * and range requests don't create duplicate entries.
 */
export async function registerVideoFileStream(
	tabId: number,
	payload: VideoFileStreamPayload,
): Promise<void> {
	// DASH segments are never plain downloadable files
	if (DASH_SEGMENT_URL_RE.test(payload.url)) return;

	const streams = await readHlsStreams(tabId);

	const pathnameKey = videoFileDedupeKey(payload.url);

	const existing = streams.find((s) => {
		if (s.kind === "hls" || (!s.kind && /\.m3u8(\?|#|$)/i.test(s.url)))
			return false;
		if (s.url === payload.url) return true;
		return videoFileDedupeKey(s.url) === pathnameKey;
	});

	if (existing) {
		// Enrich metadata when response headers arrive after registration
		if (!existing.pageTitle) {
			existing.pageTitle =
				cleanPageTitle(payload.pageTitle) || (await resolveTabTitle(tabId));
			if (existing.pageTitle) {
				await writeHlsStreams(tabId, streams);
				broadcastHlsStreams(tabId, streams);
			}
		}
		// Size updates: authoritative totals always win; partial 206 chunk
		// sizes only ever raise the lower bound, never lower it
		let lengthChanged = false;
		if (typeof payload.contentLength === "number") {
			if (
				payload.sizeIsTotal &&
				payload.contentLength !== existing.contentLength
			) {
				existing.contentLength = payload.contentLength;
				existing.sizeIsTotal = true;
				lengthChanged = true;
			} else if (
				!payload.sizeIsTotal &&
				existing.sizeIsTotal !== true &&
				payload.contentLength > (existing.contentLength ?? 0)
			) {
				existing.contentLength = payload.contentLength;
				lengthChanged = true;
			}
		}
		const mimeChanged =
			Boolean(payload.mimeType) && payload.mimeType !== existing.mimeType;
		if (lengthChanged || mimeChanged) {
			if (payload.mimeType) existing.mimeType = payload.mimeType;
			await writeHlsStreams(tabId, streams);
			broadcastHlsStreams(tabId, streams);
		}
		return;
	}

	const stream: SniffedStream = {
		url: payload.url,
		kind: "file",
		via: payload.via,
		pageUrl: payload.pageUrl,
		pageTitle:
			cleanPageTitle(payload.pageTitle) || (await resolveTabTitle(tabId)),
		contentLength: payload.contentLength,
		sizeIsTotal: payload.sizeIsTotal,
		mimeType: payload.mimeType,
		detectedAt: Date.now(),
	};

	const next = [stream, ...streams].slice(0, MAX_STREAMS_PER_TAB);
	await writeHlsStreams(tabId, next);
	broadcastHlsStreams(tabId, next);

	// Without an authoritative size, probe the CDN with a 1-byte range
	// request to learn the total (body is cancelled before any real download)
	if (payload.sizeIsTotal !== true) {
		probeVideoFileSize(tabId, payload.url).catch(() => {});
	}
}

/**
 * Parses Content-Type / Content-Length / Content-Range response headers into
 * video file metadata. Returns null for non-video responses.
 */
export function parseVideoResponseHeaders(
	headers: Array<{ name: string; value?: string }> | undefined,
	statusCode?: number,
): { mimeType: string; contentLength?: number; sizeIsTotal?: boolean } | null {
	let contentType = "";
	let contentLength: number | undefined;
	let rangeTotal: number | undefined;

	for (const h of headers ?? []) {
		const name = h.name.toLowerCase();
		if (name === "content-type") {
			contentType = (h.value ?? "").toLowerCase();
		} else if (name === "content-length") {
			const n = Number(h.value);
			if (Number.isFinite(n)) contentLength = n;
		} else if (name === "content-range") {
			// 206 range responses: "bytes 0-1023/12345678" — take the total size
			const m = /\/(\d+)\s*$/.exec(h.value ?? "");
			if (m) {
				const n = Number(m[1]);
				if (Number.isFinite(n)) rangeTotal = n;
			}
		}
	}

	if (!contentType.startsWith("video/")) return null;
	if (typeof rangeTotal === "number") {
		return {
			mimeType: contentType.split(";")[0]?.trim() ?? "video/mp4",
			contentLength: rangeTotal,
			sizeIsTotal: true,
		};
	}
	return {
		mimeType: contentType.split(";")[0]?.trim() ?? "video/mp4",
		contentLength,
		// A Content-Length on a 206 is only the chunk size, not the total
		sizeIsTotal: typeof contentLength === "number" ? statusCode === 200 : undefined,
	};
}

/**
 * Registers a DASH split-track stream (Bilibili): the url field carries the
 * video-only m4s URL and audioUrl the audio-only m4s URL. The downloader
 * fetches both and muxes them into a single MP4.
 */
export async function registerDashStream(
	tabId: number,
	payload: {
		url: string;
		audioUrl: string;
		pageUrl: string;
		pageTitle?: string;
		via?: string;
		contentLength?: number;
		sizeIsTotal?: boolean;
		mimeType?: string;
		audioMimeType?: string;
	},
): Promise<void> {
	const streams = await readHlsStreams(tabId);
	const existing = streams.find((s) => s.url === payload.url);
	if (existing) {
		// Enrich sizes as range responses reveal track totals
		let changed = false;
		if (
			typeof payload.contentLength === "number" &&
			payload.contentLength > 0 &&
			payload.contentLength !== existing.contentLength &&
			(payload.sizeIsTotal || existing.sizeIsTotal !== true)
		) {
			existing.contentLength = payload.contentLength;
			if (payload.sizeIsTotal) existing.sizeIsTotal = true;
			changed = true;
		}
		if (payload.mimeType && payload.mimeType !== existing.mimeType) {
			existing.mimeType = payload.mimeType;
			changed = true;
		}
		if (payload.audioMimeType && payload.audioMimeType !== existing.audioMimeType) {
			existing.audioMimeType = payload.audioMimeType;
			changed = true;
		}
		if (changed) {
			await writeHlsStreams(tabId, streams);
			broadcastHlsStreams(tabId, streams);
		}
		return;
	}

	const stream: SniffedStream = {
		url: payload.url,
		kind: "dash",
		audioUrl: payload.audioUrl,
		audioMimeType: payload.audioMimeType,
		via: payload.via,
		pageUrl: payload.pageUrl,
		pageTitle:
			cleanPageTitle(payload.pageTitle) || (await resolveTabTitle(tabId)),
		contentLength: payload.contentLength,
		sizeIsTotal: payload.sizeIsTotal,
		mimeType: payload.mimeType,
		detectedAt: Date.now(),
	};

	const next = [stream, ...streams].slice(0, MAX_STREAMS_PER_TAB);
	await writeHlsStreams(tabId, next);
	broadcastHlsStreams(tabId, next);
}

/**
 * Removes a registered stream by URL. Used to replace a provisional
 * single-track entry once its full audio+video pair arrives.
 */
export async function removeStreamByUrl(tabId: number, url: string): Promise<void> {
	const streams = await readHlsStreams(tabId);
	const next = streams.filter((s) => s.url !== url);
	if (next.length === streams.length) return;
	await writeHlsStreams(tabId, next);
	broadcastHlsStreams(tabId, next);
}
