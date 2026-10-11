/**
 * 微信公众号官方 API 适配器（docs/creator-publish-plan.md P0）
 *
 * 直连链路：appid/secret → access_token（缓存复用）→
 *   正文图片 media/uploadimg → 封面 material/add_material →
 *   draft/add 新建草稿 → freepublish/submit 发布 → freepublish/get 回查
 *
 * 红线：发布动作由上层 UI 二次确认后才调用本模块，本模块不做任何自动重试群发。
 */

const API_BASE = "https://api.weixin.qq.com";

export interface WechatMpCredentials {
	appid: string;
	appsecret: string;
}

interface TokenCacheEntry {
	token: string;
	expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

/** 微信接口统一错误 */
export class WechatMpError extends Error {
	constructor(
		public readonly errcode: number,
		message: string,
	) {
		super(`微信接口错误 ${errcode}: ${message}`);
		this.name = "WechatMpError";
	}
}

function assertOk(payload: Record<string, unknown>): void {
	const errcode = Number(payload.errcode ?? 0);
	if (errcode !== 0) {
		throw new WechatMpError(errcode, String(payload.errmsg ?? "未知错误"));
	}
}

/** 获取 access_token（7200s 有效期，提前 5 分钟过期，内存缓存复用） */
export async function getAccessToken(
	credentials: WechatMpCredentials,
): Promise<string> {
	const cached = tokenCache.get(credentials.appid);
	if (cached && cached.expiresAt > Date.now()) return cached.token;

	const url =
		`${API_BASE}/cgi-bin/token?grant_type=client_credential` +
		`&appid=${encodeURIComponent(credentials.appid)}` +
		`&secret=${encodeURIComponent(credentials.appsecret)}`;
	const res = await fetch(url);
	const payload = (await res.json()) as Record<string, unknown>;
	assertOk(payload);
	const token = String(payload.access_token ?? "");
	if (!token) throw new WechatMpError(-1, "未返回 access_token");
	const expiresIn = Number(payload.expires_in ?? 7200);
	tokenCache.set(credentials.appid, {
		token,
		expiresAt: Date.now() + (expiresIn - 300) * 1000,
	});
	return token;
}

/** 使缓存 token 失效（接口返回 40001/42001 时调用方重试用） */
export function invalidateAccessToken(appid: string): void {
	tokenCache.delete(appid);
}

async function postForm(
	url: string,
	buffer: Buffer,
	filename: string,
): Promise<Record<string, unknown>> {
	const form = new FormData();
	form.append("media", new Blob([new Uint8Array(buffer)]), filename);
	const res = await fetch(url, { method: "POST", body: form });
	const payload = (await res.json()) as Record<string, unknown>;
	assertOk(payload);
	return payload;
}

/** 上传正文图片 → 微信 CDN URL（仅供图文消息正文内嵌使用） */
export async function uploadContentImage(
	token: string,
	buffer: Buffer,
	filename: string,
): Promise<string> {
	const payload = await postForm(
		`${API_BASE}/cgi-bin/media/uploadimg?access_token=${token}`,
		buffer,
		filename,
	);
	const url = String(payload.url ?? "");
	if (!url) throw new WechatMpError(-1, "uploadimg 未返回 url");
	return url;
}

/** 上传封面图（永久素材，type=image）→ thumb_media_id */
export async function uploadThumbMaterial(
	token: string,
	buffer: Buffer,
	filename: string,
): Promise<string> {
	const payload = await postForm(
		`${API_BASE}/cgi-bin/material/add_material?access_token=${token}&type=image`,
		buffer,
		filename,
	);
	const mediaId = String(payload.media_id ?? "");
	if (!mediaId) throw new WechatMpError(-1, "add_material 未返回 media_id");
	return mediaId;
}

export interface WechatDraftArticle {
	title: string;
	author?: string;
	digest?: string;
	content: string;
	thumbMediaId: string;
	contentSourceUrl?: string;
}

/** 新建草稿 → draft media_id */
export async function addDraft(
	token: string,
	article: WechatDraftArticle,
): Promise<string> {
	const res = await fetch(
		`${API_BASE}/cgi-bin/draft/add?access_token=${token}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				articles: [
					{
						title: article.title,
						author: article.author ?? "",
						digest: article.digest ?? "",
						content: article.content,
						content_source_url: article.contentSourceUrl ?? "",
						thumb_media_id: article.thumbMediaId,
						need_open_comment: 0,
						only_fans_can_comment: 0,
					},
				],
			}),
		},
	);
	const payload = (await res.json()) as Record<string, unknown>;
	assertOk(payload);
	const mediaId = String(payload.media_id ?? "");
	if (!mediaId) throw new WechatMpError(-1, "draft/add 未返回 media_id");
	return mediaId;
}

/** 发布草稿 → publish_id */
export async function submitFreePublish(
	token: string,
	mediaId: string,
): Promise<string> {
	const res = await fetch(
		`${API_BASE}/cgi-bin/freepublish/submit?access_token=${token}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ media_id: mediaId }),
		},
	);
	const payload = (await res.json()) as Record<string, unknown>;
	assertOk(payload);
	const publishId = String(payload.publish_id ?? "");
	if (!publishId)
		throw new WechatMpError(-1, "freepublish/submit 未返回 publish_id");
	return publishId;
}

export interface WechatPublishStatus {
	/** 0=发布成功, 1=发布中, 2=原创失败, 3=常规失败, 4=平台审核不通过, 5=成功后用户删除 */
	status: number;
	articleUrl: string | null;
	failIdx: number[];
}

/** 回查发布状态 */
export async function getFreePublishStatus(
	token: string,
	publishId: string,
): Promise<WechatPublishStatus> {
	const res = await fetch(
		`${API_BASE}/cgi-bin/freepublish/get?access_token=${token}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ publish_id: publishId }),
		},
	);
	const payload = (await res.json()) as Record<string, unknown>;
	assertOk(payload);
	const detail = payload.article_detail as
		| { item?: Array<{ article_url?: string }> }
		| undefined;
	const firstItem = detail?.item?.[0];
	return {
		status: Number(payload.status ?? -1),
		articleUrl: firstItem?.article_url ? String(firstItem.article_url) : null,
		failIdx: Array.isArray(payload.fail_idx)
			? (payload.fail_idx as number[])
			: [],
	};
}
