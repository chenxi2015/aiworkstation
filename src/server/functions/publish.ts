import { existsSync } from "node:fs";
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

/** 检测图片二进制头部并返回真实的格式与 MIME 类型 */
function detectImageFormat(buffer: Buffer): { ext: string; mime: string } {
	if (
		buffer.length >= 3 &&
		buffer[0] === 0xff &&
		buffer[1] === 0xd8 &&
		buffer[2] === 0xff
	) {
		return { ext: "jpg", mime: "image/jpeg" };
	}
	if (
		buffer.length >= 8 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47
	) {
		return { ext: "png", mime: "image/png" };
	}
	if (
		buffer.length >= 3 &&
		buffer[0] === 0x47 &&
		buffer[1] === 0x49 &&
		buffer[2] === 0x46
	) {
		return { ext: "gif", mime: "image/gif" };
	}
	if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
		return { ext: "bmp", mime: "image/bmp" };
	}
	return { ext: "jpg", mime: "image/jpeg" };
}

/** 读取任意来源（Data URL、HTTP/HTTPS 远程、本地 /api/files/ 等）的图片为 Buffer */
async function resolveImageBuffer(
	src: string,
	defaultName = "image",
): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
	if (!src || typeof src !== "string") return null;
	const trimmed = src.trim();

	try {
		// 1. Data URL（兼容各类 mime、带参数以及换行符的 base64）
		if (trimmed.startsWith("data:")) {
			const base64Index = trimmed.indexOf(";base64,");
			if (base64Index !== -1) {
				const rawBase64 = trimmed.slice(base64Index + 8).replace(/\s/g, "");
				const buffer = Buffer.from(rawBase64, "base64");
				const detected = detectImageFormat(buffer);
				return {
					buffer,
					filename: `${defaultName}.${detected.ext}`,
					mimeType: detected.mime,
				};
			}
		}

		// 2. 本地文件系统 /api/files/
		if (trimmed.startsWith("/api/files/")) {
			const rel = decodeURIComponent(trimmed.slice("/api/files/".length));
			let abs = join(getFilesRootDir(), rel);
			assertPathWithinRoot(abs, getFilesRootDir());

			// 若引用的是 .webp，优先检查同目录下是否存在同名 .png 或 .jpg
			if (abs.toLowerCase().endsWith(".webp")) {
				const pngCandidate = `${abs.slice(0, -5)}.png`;
				const jpgCandidate = `${abs.slice(0, -5)}.jpg`;
				try {
					if (existsSync(pngCandidate)) {
						abs = pngCandidate;
					} else if (existsSync(jpgCandidate)) {
						abs = jpgCandidate;
					}
				} catch {
					// Fallback to original
				}
			}

			const buffer = await readFile(abs);
			const detected = detectImageFormat(buffer);
			return {
				buffer,
				filename: basename(abs) || `${defaultName}.${detected.ext}`,
				mimeType: detected.mime,
			};
		}

		// 3. 远程 HTTP/HTTPS URL
		if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
			const res = await fetch(trimmed, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
				},
			});
			if (!res.ok) return null;
			const arrayBuf = await res.arrayBuffer();
			const buffer = Buffer.from(arrayBuf);
			const detected = detectImageFormat(buffer);
			return {
				buffer,
				filename: `${defaultName}.${detected.ext}`,
				mimeType: detected.mime,
			};
		}

		// 4. 纯 Base64 兜底
		if (/^[A-Za-z0-9+/=]{100,}$/.test(trimmed.replace(/\s/g, ""))) {
			const buffer = Buffer.from(trimmed.replace(/\s/g, ""), "base64");
			const detected = detectImageFormat(buffer);
			return {
				buffer,
				filename: `${defaultName}.${detected.ext}`,
				mimeType: detected.mime,
			};
		}

		return null;
	} catch (err) {
		console.warn("[resolveImageBuffer] failed to resolve image:", err);
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
		const resolved = await resolveImageBuffer(src, "inline-image");
		if (!resolved) {
			console.warn(
				"[uploadInlineImages] could not resolve image source:",
				src.slice(0, 80),
			);
			continue;
		}
		try {
			const cdnUrl = await uploadContentImage(
				token,
				resolved.buffer,
				resolved.filename,
				resolved.mimeType,
			);
			result = result.split(src).join(cdnUrl);
		} catch (uploadErr) {
			console.warn(
				"[uploadInlineImages] uploadContentImage failed for image:",
				resolved.filename,
				uploadErr,
			);
			// 单张图上传失败不阻断整体发布，保留原 src
		}
	}
	return result;
}

export interface WechatPublishInput {
	documentId: number;
	accountId: number;
	title: string;
	author?: string;
	digest?: string;
	contentHtml: string;
	/** 封面图 URL 或 dataURL（PNG/JPEG base64/http(s)） */
	coverImageDataUrl: string;
	/** 文章标签，用于快照归档与正文结尾呈现 */
	tags?: string[];
	/** 发布模式：draft (推送到草稿箱，默认推荐) | publish (推送到草稿箱并尝试发布) */
	publishMode?: "draft" | "publish";
	/** 红线兜底：必须为 true（UI 二次确认后置位） */
	confirmed: boolean;
}

/** Server Function: 发布文档到微信公众号（支持草稿箱与直接发布） */
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
		const title = (data.title?.trim() || "未命名文章").slice(0, 64);
		if (!title) throw new Error("标题不能为空");
		if (!data.coverImageDataUrl)
			throw new Error("未选择或生成封面图，请先设置封面图");

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
				tags: data.tags || [],
			}),
			status: "publishing",
		});

		try {
			const cred = decryptWechatCredentials(entity.credentials);
			let token = await getAccessToken(cred);

			// 1. 封面图解析为 Buffer 并上传为微信永久素材 thumb_media_id
			const resolvedCover = await resolveImageBuffer(
				data.coverImageDataUrl,
				"cover",
			);
			if (!resolvedCover) {
				throw new Error("封面图解析失败，请检查封面格式或重新生成/上传");
			}

			const thumbMediaId = await uploadThumbMaterial(
				token,
				resolvedCover.buffer,
				resolvedCover.filename,
				resolvedCover.mimeType,
			);

			// 2. 正文内嵌图片上传到微信 CDN 替换
			let content = await uploadInlineImages(token, data.contentHtml);

			// 3. 将标签（Tags）优雅附在正文文末展示
			if (data.tags && data.tags.length > 0) {
				const cleanTags = data.tags
					.map((t) => t.trim().replace(/^#+/, ""))
					.filter(Boolean);
				if (cleanTags.length > 0) {
					const tagSection = `<section style="margin-top: 28px; padding-top: 14px; border-top: 1px dashed #e2e8f0; color: #576b95; font-size: 13px; line-height: 1.6;">${cleanTags.map((t) => `#${t}`).join(" ")}</section>`;
					content = `${content}${tagSection}`;
				}
			}

			const author = (data.author?.trim() || "AI Workstation").slice(0, 16);
			const digest = data.digest?.trim().slice(0, 120) || undefined;

			// 4. 新建草稿到微信公众号草稿箱
			let draftMediaId: string;
			try {
				draftMediaId = await addDraft(token, {
					title,
					author,
					digest,
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
						author,
						digest,
						content,
						thumbMediaId,
					});
				} else {
					throw err;
				}
			}

			// 5. 根据模式处理发布：若指定 publish 则尝试发表，默认或失败时稳妥保留草稿
			let articleUrl: string | null = null;
			let publishId: string = draftMediaId;

			if (data.publishMode === "publish") {
				try {
					publishId = await submitFreePublish(token, draftMediaId);
					try {
						const status = await getFreePublishStatus(token, publishId);
						articleUrl = status.articleUrl;
					} catch {
						// 回查失败不阻断发布成功
					}
				} catch (publishErr) {
					// 若公众号没有群发/直接发表权限（如未认证），捕获并优雅降级为草稿箱已同步
					console.warn(
						"[publishDocumentToWechat] submitFreePublish fallback to draft:",
						publishErr,
					);
				}
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
