import { registerDashStream, registerVideoFileStream } from "./streamRegistry";

/* ------------------------------------------------------------------ */
/* Bilibili: resolve DASH streams via the public playurl API           */
/* ------------------------------------------------------------------ */

export const BILIBILI_VIDEO_URL_RE = /bilibili\.com\/video\/(BV[0-9A-Za-z]+)/i;
const BILI_API_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

/** Successfully resolved bvid per tab; cleared on navigation so a page
 *  refresh always re-resolves (signed URLs expire anyway) */
const bilibiliResolvedByTab = new Map<number, string>();
/** In-flight resolutions, so concurrent events don't duplicate API calls */
const bilibiliInFlight = new Set<string>();

interface BiliDashStream {
	baseUrl?: string;
	base_url?: string;
	bandwidth?: number;
}

function pickBiliDashUrl(streams: BiliDashStream[] | undefined): string | null {
	if (!Array.isArray(streams) || streams.length === 0) return null;
	const best = streams.reduce((a, b) =>
		(b.bandwidth ?? 0) > (a.bandwidth ?? 0) ? b : a,
	);
	return best.baseUrl || best.base_url || null;
}

async function fetchBiliJson(url: string): Promise<any | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 10000);
		let res: Response;
		try {
			res = await fetch(url, {
				// Extension pages may send first-party cookies for permitted hosts,
				// which unlocks higher quality tiers for logged-in users
				credentials: "include",
				headers: { "User-Agent": BILI_API_UA },
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timer);
		}
		if (!res.ok) return null;
		const data = await res.json();
		return data?.code === 0 ? data.data : null;
	} catch {
		return null;
	}
}

/**
 * Resolves the real DASH stream URLs for a Bilibili video page and
 * registers them as a sniffed stream. Falls back to the progressive mp4
 * (durl) when DASH is unavailable.
 */
export async function resolveBilibiliVideo(
	tabId: number,
	pageUrl: string,
): Promise<void> {
	const bvid = BILIBILI_VIDEO_URL_RE.exec(pageUrl)?.[1];
	if (!bvid) return;
	// Only skip when a previous resolution actually succeeded
	if (bilibiliResolvedByTab.get(tabId) === bvid) return;
	const flightKey = `${tabId}:${bvid}`;
	if (bilibiliInFlight.has(flightKey)) return;
	bilibiliInFlight.add(flightKey);

	try {
		const view = await fetchBiliJson(
			`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
		);
		const cid = view?.cid;
		const pageTitle: string | undefined = view?.title;
		if (!cid) return;

		const play = await fetchBiliJson(
			`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16&fourk=1&platform=pc`,
		);
		if (!play) return;

		const videoUrl = pickBiliDashUrl(play.dash?.video);
		const audioUrl = pickBiliDashUrl(play.dash?.audio);

		if (videoUrl && audioUrl) {
			await registerDashStream(tabId, {
				url: videoUrl,
				audioUrl,
				pageUrl,
				pageTitle,
				via: "bilibili-playurl",
			});
			bilibiliResolvedByTab.set(tabId, bvid);
			return;
		}

		// Progressive fallback (low quality, no login required)
		const durl = play.durl?.[0]?.url;
		if (typeof durl === "string" && durl) {
			await registerVideoFileStream(tabId, {
				url: durl,
				pageUrl,
				pageTitle,
				via: "bilibili-playurl",
			});
			bilibiliResolvedByTab.set(tabId, bvid);
		}
	} finally {
		bilibiliInFlight.delete(flightKey);
	}
}

/** Forget a closed tab's resolved bvid so a reused tab id can resolve again */
export function clearBilibiliTab(tabId: number): void {
	bilibiliResolvedByTab.delete(tabId);
}
