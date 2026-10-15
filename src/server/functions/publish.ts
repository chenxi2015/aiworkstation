import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type {
	PlatformAccountInfo,
	PublishRecord,
} from "../../components/editor/types.ts";
import { assertPathWithinRoot } from "../ai/fs/fsSafety.ts";
import { toAccountInfo } from "../db/repositories/publish.repo.ts";
import { workbenchDb } from "../db/sqlite.ts";
import {
	decryptCredentials,
	encryptCredentials,
	maskCredentialsHint,
} from "../publish/crypto.ts";
import {
	addDraft,
	getAccessToken,
	getFreePublishStatus,
	invalidateAccessToken,
	submitFreePublish,
	uploadContentImage,
	uploadThumbMaterial,
	type WechatMpCredentials,
	WechatMpError,
} from "../publish/wechatMp.ts";
import { getFilesRootDir } from "../services/filesRoot.ts";

/**
 * 平台发布 Server Functions（docs/creator-publish-plan.md P0 公众号直连）
 *
 * 红线实现：
 * - 凭证只在本文件内解密，输出给前端的永远是掩码视图；
 * - publishDocumentToWechat 必须 confirmed===true 才执行（UI 二次确认，服务端兜底校验）。
 */

function decryptWechatCredentials(encrypted: string): WechatMpCredentials {
	const raw = decryptCredentials(encrypted);
	const appid = String(raw.appid ?? "").trim();
	const appsecret = String(raw.appsecret ?? "").trim();
	if (!appid || !appsecret) throw new Error("账号凭据不完整，请重新配置");
	return { appid, appsecret };
}

function toInfo(
	entity: NonNullable<ReturnType<typeof workbenchDb.getPlatformAccount>>,
): PlatformAccountInfo {
	let hint = "已配置";
	try {
		hint = maskCredentialsHint(decryptCredentials(entity.credentials));
	} catch {
		hint = "（凭据无法解密，请重新配置）";
	}
	return toAccountInfo(entity, hint);
}

/** Server Function: 平台账号列表（掩码视图） */
export const listPlatformAccounts = createServerFn({ method: "GET" }).handler(
	async (): Promise<PlatformAccountInfo[]> => {
		return workbenchDb.listPlatformAccounts().map(toInfo);
	},
);

/** Server Function: 保存公众号账号（先验证可取 token 再落库） */
export const saveWechatMpAccount = createServerFn({ method: "POST" })
	.validator(
		(data: { label: string; appid: string; appsecret: string }) => data,
	)
	.handler(async ({ data }): Promise<PlatformAccountInfo> => {
		const label = data.label?.trim() || "默认公众号";
		const appid = data.appid?.trim();
		const appsecret = data.appsecret?.trim();
		if (!appid || !appsecret) throw new Error("appid 与 appsecret 不能为空");

		// 先真实拉取 access_token 验证凭据有效
		await getAccessToken({ appid, appsecret });

		const id = workbenchDb.upsertPlatformAccount({
			platform: "wechat-mp",
			channel: "api",
			label,
			credentials: encryptCredentials({ appid, appsecret }),
			status: "active",
		});
		const entity = workbenchDb.getPlatformAccount(id);
		if (!entity) throw new Error("账号保存失败");
		return toInfo(entity);
	});

/** Server Function: 重新验证账号连接 */
export const validatePlatformAccount = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
		const entity = workbenchDb.getPlatformAccount(data.id);
		if (!entity) throw new Error("账号不存在");
		try {
			if (entity.platform === "wechat-mp") {
				const cred = decryptWechatCredentials(entity.credentials);
				invalidateAccessToken(cred.appid);
				await getAccessToken(cred);
			}
			workbenchDb.markPlatformAccountStatus(entity.id, "active");
			return { ok: true };
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			workbenchDb.markPlatformAccountStatus(entity.id, "invalid");
			return { ok: false, reason };
		}
	});

/** Server Function: 删除平台账号 */
export const deletePlatformAccount = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		workbenchDb.deletePlatformAccount(data.id);
		return { success: true };
	});

/** Server Function: 文档的发布记录列表 */
export const listPublishRecords = createServerFn({ method: "GET" })
	.validator((data: { documentId: number }) => data)
	.handler(async ({ data }): Promise<PublishRecord[]> => {
		return workbenchDb.listPublishRecordsByDocument(data.documentId);
	});

/** 解析封面 dataURL → Buffer */
function decodeDataUrl(dataUrl: string): Buffer {
	const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl);
	if (!match) throw new Error("封面图格式不正确");
	return Buffer.from(match[2], "base64");
}

/** 读取正文 <img> 引用的图片为 Buffer（本地 /api/files 或远程 http） */
async function resolveImageBuffer(
	src: string,
): Promise<{ buffer: Buffer; filename: string } | null> {
	try {
		if (src.startsWith("/api/files/")) {
			const rel = decodeURIComponent(src.slice("/api/files/".length));
			const abs = join(getFilesRootDir(), rel);
			assertPathWithinRoot(abs, getFilesRootDir());
			const buffer = await readFile(abs);
			return { buffer, filename: basename(abs) };
		}
		if (src.startsWith("http://") || src.startsWith("https://")) {
			const res = await fetch(src);
			if (!res.ok) return null;
			const buffer = Buffer.from(await res.arrayBuffer());
			const filename = basename(new URL(src).pathname) || "image.png";
			return { buffer, filename };
		}
		if (src.startsWith("data:image/")) {
			return { buffer: decodeDataUrl(src), filename: "image.png" };
		}
		return null;
	} catch {
		return null;
	}
}

/** 把正文 HTML 中的图片逐一上传到微信 CDN 并替换 src（uploadimg） */
async function uploadInlineImages(
	token: string,
	html: string,
): Promise<string> {
	const imgRegex = /<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi;
	const matches = [...html.matchAll(imgRegex)];
	let result = html;
	for (const match of matches) {
		const src = match[1];
		if (src.includes("mmbiz.qpic.cn")) continue; // 已是微信 CDN
		const resolved = await resolveImageBuffer(src);
		if (!resolved) continue;
		try {
			const cdnUrl = await uploadContentImage(
				token,
				resolved.buffer,
				resolved.filename,
			);
			result = result.split(src).join(cdnUrl);
		} catch {
			// 单张图上传失败不阻断整体发布，保留原 src
		}
	}
	return result;
}

export interface WechatPublishInput {
	documentId: number;
	accountId: number;
	title: string;
	author: string;
	digest: string;
	contentHtml: string;
	/** 封面图 dataURL（PNG/JPEG base64），客户端由贴图管线生成 */
	coverImageDataUrl: string;
	/** 红线兜底：必须为 true（UI 二次确认后置位） */
	confirmed: boolean;
}

/** Server Function: 发布文档到微信公众号（草稿 → 发布 → 回查） */
export const publishDocumentToWechat = createServerFn({ method: "POST" })
	.validator((data: WechatPublishInput) => data)
	.handler(async ({ data }): Promise<PublishRecord> => {
		if (data.confirmed !== true) {
			throw new Error("发布动作需要人工确认（confirmed=true）");
		}
		const entity = workbenchDb.getPlatformAccount(data.accountId);
		if (!entity || entity.platform !== "wechat-mp") {
			throw new Error("公众号账号不存在，请先在设置中心配置");
		}
		const title = data.title?.trim();
		if (!title) throw new Error("标题不能为空");
		if (!data.coverImageDataUrl) throw new Error("封面图生成失败，请重试");

		// 先落一条 publishing 记录，失败也能留下痕迹
		const recordId = workbenchDb.createPublishRecord({
			documentId: data.documentId,
			accountId: entity.id,
			platform: "wechat-mp",
			channel: "api",
			variantJson: JSON.stringify({
				title,
				author: data.author,
				digest: data.digest,
			}),
			status: "publishing",
		});

		try {
			const cred = decryptWechatCredentials(entity.credentials);
			let token = await getAccessToken(cred);

			// 封面 → 永久素材 thumb_media_id
			const thumbBuffer = decodeDataUrl(data.coverImageDataUrl);
			const thumbMediaId = await uploadThumbMaterial(
				token,
				thumbBuffer,
				"cover.png",
			);

			// 正文图片 → 微信 CDN
			const content = await uploadInlineImages(token, data.contentHtml);

			let draftMediaId: string;
			try {
				draftMediaId = await addDraft(token, {
					title,
					author: data.author?.trim() || undefined,
					digest: data.digest?.trim().slice(0, 120) || undefined,
					content,
					thumbMediaId,
				});
			} catch (err) {
				// token 过期兜底：刷新一次重试
				if (
					err instanceof WechatMpError &&
					(err.errcode === 40001 || err.errcode === 42001)
				) {
					invalidateAccessToken(cred.appid);
					token = await getAccessToken(cred);
					draftMediaId = await addDraft(token, {
						title,
						author: data.author?.trim() || undefined,
						digest: data.digest?.trim().slice(0, 120) || undefined,
						content,
						thumbMediaId,
					});
				} else {
					throw err;
				}
			}

			const publishId = await submitFreePublish(token, draftMediaId);

			// 回查一次（微信发布通常是秒级异步任务）
			let articleUrl: string | null = null;
			try {
				const status = await getFreePublishStatus(token, publishId);
				articleUrl = status.articleUrl;
			} catch {
				// 回查失败不影响发布结果本身
			}

			workbenchDb.updatePublishRecord(recordId, {
				status: "published",
				platformPostId: publishId,
				platformUrl: articleUrl,
				error: null,
				publishedAt: new Date().toISOString(),
			});
			workbenchDb.markPlatformAccountStatus(entity.id, "active");

			const record = workbenchDb.getPublishRecord(recordId);
			if (!record) throw new Error("发布记录读取失败");
			return record;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			workbenchDb.updatePublishRecord(recordId, {
				status: "failed",
				error: message,
			});
			throw new Error(message);
		}
	});

/** Server Function: 获取文档的发布中心草稿（从 SQLite 读取） */
export const getDocumentPublishDraft = createServerFn({ method: "GET" })
	.validator((input: { documentId: number }) => input)
	.handler(async ({ data }): Promise<string | null> => {
		return workbenchDb.getDocumentPublishDraft(data.documentId);
	});

/** Server Function: 保存文档的发布中心草稿（持久化至 SQLite 数据库） */
export const saveDocumentPublishDraft = createServerFn({ method: "POST" })
	.validator((input: { documentId: number; draftJson: string }) => input)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		workbenchDb.saveDocumentPublishDraft(data.documentId, data.draftJson);
		return { success: true };
	});

