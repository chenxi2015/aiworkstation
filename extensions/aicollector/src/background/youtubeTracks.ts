import {
	registerDashStream,
	registerVideoFileStream,
	removeStreamByUrl,
} from "./streamRegistry";

/**
 * YouTube DASH track router.
 *
 * YouTube serves video via MSE from `*.googlevideo.com/videoplayback?...`.
 * Every video and every track shares that same path; tracks are told apart
 * by query params: `id` (playback session / video id), `itag` (format) and
 * `mime`. The player issues many small range requests per track, so full
 * URLs differ only in volatile params (`range`, `rn`, ...) — we dedupe on
 * (id, itag) and store a range-stripped URL that downloads the whole file.
 *
 * When both the video-only and audio-only track of one `id` have been seen,
 * they are registered as a single DASH stream (same pipeline as Bilibili).
 * Combined progressive formats (itag 18/22/...) register as plain files.
 */

const GOOGLEVIDEO_HOST_RE = /(^|\.)googlevideo\.com$/i;

/** Progressive formats that already contain both audio and video */
const COMBINED_ITAGS = new Set(["18", "22", "37", "38", "59"]);

/** Volatile query params to strip so the stored URL downloads the full track */
const VOLATILE_PARAMS = ["range", "rn", "rbuf", "alr", "ump"];

export function isGoogleVideoPlaybackUrl(url: string): boolean {
	try {
		const u = new URL(url);
		return (
			GOOGLEVIDEO_HOST_RE.test(u.hostname) &&
			u.pathname.startsWith("/videoplayback")
		);
	} catch {
		return false;
	}
}

interface TrackInfo {
	url: string;
	itag: string;
	mime: string;
	totalBytes?: number;
	sizeIsTotal?: boolean;
}

interface TrackPair {
	video?: TrackInfo;
	audio?: TrackInfo;
	/** True once any stream entry (provisional file or dash) was registered */
	registered?: boolean;
	/** Pending registration timer for a video track awaiting its audio pair */
	timer?: ReturnType<typeof setTimeout>;
}

/** tabId → videoId → observed tracks */
const pairsByTab = new Map<number, Map<string, TrackPair>>();

/** Forget a tab's partially observed tracks (navigation / tab close) */
export function clearYoutubeTab(tabId: number): void {
	const pairs = pairsByTab.get(tabId);
	if (pairs) {
		for (const pair of pairs.values()) {
			if (pair.timer) clearTimeout(pair.timer);
		}
	}
	pairsByTab.delete(tabId);
}

/** Grace period for the audio track to show up after the video track */
const PAIRING_WINDOW_MS = 6000;

interface ParsedTrack {
	id: string;
	itag: string;
	mime: string;
	/** Full-track URL with volatile range params stripped */
	cleanUrl: string;
}

function parseTrack(url: string, fallbackMime?: string): ParsedTrack | null {
	try {
		const u = new URL(url);
		const id = u.searchParams.get("id");
		// itag is absent on SABR multiplexed streams (audio+video in one flow)
		const itag = u.searchParams.get("itag") ?? "";
		if (!id) return null;
		const mime = (u.searchParams.get("mime") || fallbackMime || "").toLowerCase();
		for (const p of VOLATILE_PARAMS) u.searchParams.delete(p);
		return { id, itag, mime, cleanUrl: u.href };
	} catch {
		return null;
	}
}

/** Parses Content-Type / Content-Range / Content-Length for video AND audio */
export function parseGoogleVideoHeaders(
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
			const m = /\/(\d+)\s*$/.exec(h.value ?? "");
			if (m) {
				const n = Number(m[1]);
				if (Number.isFinite(n)) rangeTotal = n;
			}
		}
	}

	if (!contentType.startsWith("video/") && !contentType.startsWith("audio/")) {
		return null;
	}
	const mimeType = contentType.split(";")[0]?.trim() ?? "";
	if (typeof rangeTotal === "number") {
		return { mimeType, contentLength: rangeTotal, sizeIsTotal: true };
	}
	return {
		mimeType,
		contentLength,
		sizeIsTotal: typeof contentLength === "number" ? statusCode === 200 : undefined,
	};
}

/**
 * Handles a googlevideo /videoplayback response: classifies the track,
 * accumulates it per (tab, video id), and registers a downloadable stream
 * once a video+audio pair (or a combined format) is complete.
 */
export async function handleGoogleVideoResponse(
	tabId: number,
	payload: {
		url: string;
		pageUrl: string;
		contentType?: string;
		contentLength?: number;
		sizeIsTotal?: boolean;
	},
): Promise<void> {
	const track = parseTrack(payload.url, payload.contentType);
	if (!track) return;

	const isAudio = track.mime.startsWith("audio/");
	const isVideo = track.mime.startsWith("video/");
	if (!isAudio && !isVideo) return;

	console.info(
		`[AI Collector] YouTube track: id=${track.id} itag=${track.itag || "(none)"} mime=${track.mime} tab=${tabId}`,
	);

	// Combined formats (itag 18/22/...) and SABR multiplexed streams (no
	// itag) already contain audio+video — register as a plain file
	if (isVideo && (COMBINED_ITAGS.has(track.itag) || !track.itag)) {
		await registerVideoFileStream(tabId, {
			url: track.cleanUrl,
			pageUrl: payload.pageUrl,
			via: "youtube-googlevideo",
			contentLength: payload.contentLength,
			sizeIsTotal: payload.sizeIsTotal,
			mimeType: track.mime,
		});
		return;
	}

	let pairs = pairsByTab.get(tabId);
	if (!pairs) {
		pairs = new Map();
		pairsByTab.set(tabId, pairs);
	}
	const pair = pairs.get(track.id) ?? {};

	const slot = isAudio ? "audio" : "video";
	const info: TrackInfo =
		pair[slot] ?? { url: track.cleanUrl, itag: track.itag, mime: track.mime };
	if (payload.sizeIsTotal && typeof payload.contentLength === "number") {
		info.totalBytes = payload.contentLength;
		info.sizeIsTotal = true;
	} else if (
		!info.sizeIsTotal &&
		typeof payload.contentLength === "number" &&
		payload.contentLength > (info.totalBytes ?? 0)
	) {
		info.totalBytes = payload.contentLength;
	}
	pair[slot] = info;
	pairs.set(track.id, pair);

	if (!pair.video || !pair.audio) {
		// Video track arrived first: give the audio track a short window to
		// appear (it may already be cached player-side). If it never shows —
		// e.g. SABR multiplex or a cached audio track — register the video
		// track alone as a file so the user still sees a downloadable entry.
		if (isVideo && !pair.registered && !pair.timer) {
			pair.timer = setTimeout(() => {
				const current = pairsByTab.get(tabId)?.get(track.id);
				if (!current || current.registered || !current.video) return;
				current.registered = true;
				console.info(
					`[AI Collector] YouTube pairing timeout: registering video track alone (id=${track.id})`,
				);
				registerVideoFileStream(tabId, {
					url: current.video.url,
					pageUrl: payload.pageUrl,
					via: "youtube-googlevideo",
					contentLength: current.video.totalBytes,
					sizeIsTotal: current.video.sizeIsTotal,
					mimeType: current.video.mime,
				}).catch(() => {});
			}, PAIRING_WINDOW_MS);
		}
		return;
	}

	// Pair complete: replace any provisional single-track entry with the
	// full audio+video DASH entry
	if (pair.timer) {
		clearTimeout(pair.timer);
		pair.timer = undefined;
	}
	if (pair.registered) {
		await removeStreamByUrl(tabId, pair.video.url);
	}
	pair.registered = true;
	const bothTotalsKnown = Boolean(pair.video.sizeIsTotal && pair.audio.sizeIsTotal);
	const combinedBytes = (pair.video.totalBytes ?? 0) + (pair.audio.totalBytes ?? 0);

	console.info(
		`[AI Collector] YouTube pair registered: id=${track.id} video=${pair.video.itag} audio=${pair.audio.itag} bytes=${combinedBytes}`,
	);
	await registerDashStream(tabId, {
		url: pair.video.url,
		audioUrl: pair.audio.url,
		pageUrl: payload.pageUrl,
		via: "youtube-googlevideo",
		contentLength: combinedBytes > 0 ? combinedBytes : undefined,
		sizeIsTotal: bothTotalsKnown,
		mimeType: pair.video.mime,
		audioMimeType: pair.audio.mime,
	});
}
