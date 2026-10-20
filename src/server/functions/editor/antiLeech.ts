export interface PlatformRefererRule {
	matches: (hostname: string) => boolean;
	referer: string;
}

/**
 * Platform specific anti-hotlinking referer rules
 */
export const PLATFORM_REFERER_RULES: PlatformRefererRule[] = [
	// WeChat public platform & Tencent media
	{
		matches: (host) =>
			host.endsWith("qpic.cn") ||
			host.endsWith("qq.com") ||
			host.endsWith("gtimg.com"),
		referer: "https://mp.weixin.qq.com/",
	},
	// YouTube & Google Video / Thumbnail CDN
	{
		matches: (host) =>
			host.endsWith("youtube.com") ||
			host.endsWith("youtu.be") ||
			host.endsWith("googlevideo.com") ||
			host.endsWith("ytimg.com") ||
			host.endsWith("ggpht.com"),
		referer: "https://www.youtube.com/",
	},
	// Douyin & ByteDance CDN
	{
		matches: (host) =>
			host.endsWith("douyin.com") ||
			host.endsWith("iesdouyin.com") ||
			host.endsWith("douyincdn.com") ||
			host.endsWith("byteimg.com") ||
			host.endsWith("volces.com"),
		referer: "https://www.douyin.com/",
	},
	// TikTok
	{
		matches: (host) =>
			host.endsWith("tiktok.com") ||
			host.endsWith("tiktokcdn.com") ||
			host.endsWith("ibytedtos.com"),
		referer: "https://www.tiktok.com/",
	},
	// Kuaishou
	{
		matches: (host) =>
			host.endsWith("kuaishou.com") ||
			host.endsWith("yximgs.com") ||
			host.endsWith("ksapisrv.com") ||
			host.endsWith("gifshow.com"),
		referer: "https://www.kuaishou.com/",
	},
	// Bilibili
	{
		matches: (host) =>
			host.endsWith("hdslb.com") ||
			host.endsWith("bilibili.com") ||
			host.endsWith("biliapi.net"),
		referer: "https://www.bilibili.com/",
	},
	// Xiaohongshu
	{
		matches: (host) =>
			host.endsWith("xhscdn.com") || host.endsWith("xiaohongshu.com"),
		referer: "https://www.xiaohongshu.com/",
	},
	// Weibo & Sina
	{
		matches: (host) =>
			host.endsWith("sinaimg.cn") ||
			host.endsWith("weibo.com") ||
			host.endsWith("weibo.cn") ||
			host.endsWith("sina.com.cn"),
		referer: "https://weibo.com/",
	},
	// Zhihu
	{
		matches: (host) => host.endsWith("zhimg.com") || host.endsWith("zhihu.com"),
		referer: "https://www.zhihu.com/",
	},
	// X / Twitter
	{
		matches: (host) =>
			host.endsWith("twimg.com") ||
			host.endsWith("twitter.com") ||
			host.endsWith("x.com"),
		referer: "https://x.com/",
	},
	// Xigua Video
	{
		matches: (host) =>
			host.endsWith("ixigua.com") || host.endsWith("xigua.com"),
		referer: "https://www.ixigua.com/",
	},
	// Toutiao
	{
		matches: (host) =>
			host.endsWith("toutiao.com") || host.endsWith("toutiaoimg.com"),
		referer: "https://www.toutiao.com/",
	},
	// Medium
	{
		matches: (host) =>
			host.endsWith("medium.com") || host.endsWith("miro.medium.com"),
		referer: "https://medium.com/",
	},
	// Substack
	{
		matches: (host) =>
			host.endsWith("substack.com") || host.endsWith("substackcdn.com"),
		referer: "https://substack.com/",
	},
	// Crypto & Web3 Media
	{
		matches: (host) =>
			host.endsWith("foresightnews.pro") || host.endsWith("foresightnews.com"),
		referer: "https://foresightnews.pro/",
	},
	{
		matches: (host) =>
			host.endsWith("theblockbeats.info") ||
			host.endsWith("theblockbeats.cn") ||
			host.endsWith("blockbeats.cn"),
		referer: "https://www.theblockbeats.info/",
	},
	{
		matches: (host) => host.endsWith("techflowpost.com"),
		referer: "https://www.techflowpost.com/",
	},
	{
		matches: (host) => host.endsWith("odaily.news"),
		referer: "https://www.odaily.news/",
	},
	{
		matches: (host) => host.endsWith("jinse.cn") || host.endsWith("jinse.com"),
		referer: "https://www.jinse.cn/",
	},
	{
		matches: (host) => host.endsWith("coindesk.com"),
		referer: "https://www.coindesk.com/",
	},
	{
		matches: (host) => host.endsWith("decrypt.co"),
		referer: "https://decrypt.co/",
	},
	{
		matches: (host) => host.endsWith("cointelegraph.com"),
		referer: "https://cointelegraph.com/",
	},
	{
		matches: (host) => host.endsWith("mirror.xyz"),
		referer: "https://mirror.xyz/",
	},
	// Developer & Tech Media
	{
		matches: (host) => host.endsWith("csdnimg.cn") || host.endsWith("csdn.net"),
		referer: "https://blog.csdn.net/",
	},
	{
		matches: (host) => host.endsWith("juejin.cn"),
		referer: "https://juejin.cn/",
	},
	{
		matches: (host) =>
			host.endsWith("jianshu.io") || host.endsWith("jianshu.com"),
		referer: "https://www.jianshu.com/",
	},
	{
		matches: (host) =>
			host.endsWith("36kr.com") || host.endsWith("36krcdn.com"),
		referer: "https://36kr.com/",
	},
	{
		matches: (host) => host.endsWith("sspai.com"),
		referer: "https://sspai.com/",
	},
	{
		matches: (host) => host.endsWith("wallstreetcn.com"),
		referer: "https://wallstreetcn.com/",
	},
	{
		matches: (host) =>
			host.endsWith("baidu.com") ||
			host.endsWith("bdimg.com") ||
			host.endsWith("baidupcs.com"),
		referer: "https://www.baidu.com/",
	},
	{
		matches: (host) =>
			host.endsWith("163.com") ||
			host.endsWith("netease.com") ||
			host.endsWith("126.net"),
		referer: "https://www.163.com/",
	},
];

/**
 * Builds candidate referrers in priority order for anti-hotlinking circumvention
 */
export function resolveRefererCandidates(
	url: string,
	customReferer?: string,
): (string | undefined)[] {
	const candidates: (string | undefined)[] = [];
	if (customReferer?.trim()) {
		candidates.push(customReferer.trim());
	}

	try {
		const urlObj = new URL(url);
		const host = urlObj.hostname.toLowerCase();

		// 1. Check known platform rules
		const matchedRule = PLATFORM_REFERER_RULES.find((rule) =>
			rule.matches(host),
		);
		if (matchedRule && !candidates.includes(matchedRule.referer)) {
			candidates.push(matchedRule.referer);
		}

		// 2. Resource Origin (e.g. "https://cdn.example.com/")
		const originReferer = `${urlObj.origin}/`;
		if (!candidates.includes(originReferer)) {
			candidates.push(originReferer);
		}

		// 3. Root Domain Origin (infer main site by stripping CDN/asset subdomains)
		const hostParts = host.split(".");
		if (hostParts.length > 2) {
			const rootDomain = hostParts.slice(-2).join(".");
			const rootDomainReferer = `${urlObj.protocol}//www.${rootDomain}/`;
			const apexDomainReferer = `${urlObj.protocol}//${rootDomain}/`;
			if (!candidates.includes(rootDomainReferer)) {
				candidates.push(rootDomainReferer);
			}
			if (!candidates.includes(apexDomainReferer)) {
				candidates.push(apexDomainReferer);
			}
		}

		// 4. Empty Referer (many CDN configurations whitelist requests with no referer)
		candidates.push(undefined);

		// 5. Fallback to exact resource URL
		if (!candidates.includes(url)) {
			candidates.push(url);
		}
	} catch {
		if (!candidates.includes(url)) {
			candidates.push(url);
		}
		candidates.push(undefined);
	}

	return candidates;
}

/**
 * Smartly resolves the primary Referer header for external media downloading.
 */
export function resolveAssetReferer(
	url: string,
	customReferer?: string,
): string {
	const candidates = resolveRefererCandidates(url, customReferer);
	return candidates[0] || url;
}

/**
 * Generates browser-grade HTTP request headers tailored for media assets
 */
export function buildAssetHeaders(
	url: string,
	referer: string | undefined,
	isVideo: boolean,
): Record<string, string> {
	const headers: Record<string, string> = {
		"User-Agent":
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		Accept: isVideo
			? "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5"
			: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
		"Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
		"Sec-Ch-Ua":
			'"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
		"Sec-Ch-Ua-Mobile": "?0",
		"Sec-Ch-Ua-Platform": '"macOS"',
		"Sec-Fetch-Dest": isVideo ? "video" : "image",
		"Sec-Fetch-Mode": "no-cors",
		Priority: "u=1, i",
	};

	if (referer) {
		headers.Referer = referer;
		try {
			const targetOrigin = new URL(url).origin;
			const refOrigin = new URL(referer).origin;
			headers["Sec-Fetch-Site"] =
				targetOrigin === refOrigin ? "same-origin" : "cross-site";
		} catch {
			headers["Sec-Fetch-Site"] = "cross-site";
		}
	} else {
		headers["Sec-Fetch-Site"] = "none";
	}

	return headers;
}

/**
 * Fetches external media asset using adaptive referrer candidate sequence
 */
export async function fetchAssetWithAdaptiveHeaders(
	url: string,
	customReferer?: string,
): Promise<Response> {
	const pathLower = url.toLowerCase();
	const isVideo =
		pathLower.includes(".mp4") ||
		pathLower.includes(".webm") ||
		pathLower.includes(".mov");

	const refererCandidates = resolveRefererCandidates(url, customReferer);
	let lastResponse: Response | null = null;
	let lastError: Error | null = null;

	for (const candidateReferer of refererCandidates) {
		const headers = buildAssetHeaders(url, candidateReferer, isVideo);
		try {
			const res = await fetch(url, {
				headers,
				signal: AbortSignal.timeout(20000),
			});

			if (res.ok) {
				const contentType = (
					res.headers.get("content-type") || ""
				).toLowerCase();
				// If 200 OK returned text/html, it is likely a WAF/Cloudflare challenge page
				if (contentType.includes("text/html")) {
					lastResponse = res;
					continue;
				}
				return res;
			}

			lastResponse = res;
			// Retry on anti-hotlinking status codes
			if (res.status === 403 || res.status === 401 || res.status === 400) {
				continue;
			}

			break;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
		}
	}

	if (lastResponse) {
		const contentType = (
			lastResponse.headers.get("content-type") || ""
		).toLowerCase();
		if (contentType.includes("text/html")) {
			throw new Error(
				"该图片受到源站安全防护（Cloudflare 或防爬盾）拦截，请在原页面右键复制图片后直接粘贴到编辑器中",
			);
		}
		throw new Error(
			`下载失败 (HTTP ${lastResponse.status} ${lastResponse.statusText})`,
		);
	}

	if (lastError) {
		if (lastError.name === "TimeoutError" || lastError.name === "AbortError") {
			throw new Error("下载外部图片超时，请检查网络连接");
		}
		throw lastError;
	}

	throw new Error("请求外部图片地址失败");
}

