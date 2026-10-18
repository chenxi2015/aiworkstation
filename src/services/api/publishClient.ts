import type {
	PlatformAccountInfo,
	PublishRecord,
} from "../../components/editor/types";
import {
	deletePlatformAccount,
	getDocumentPublishDraft,
	listPlatformAccounts,
	listPublishRecords,
	publishDocumentToWechat,
	saveDocumentPublishDraft,
	saveWechatMpAccount,
	validatePlatformAccount,
	type WechatPublishInput,
} from "../../server/functions/publish";
import {
	generatePublishMetadata,
	type PublishMetadataInput,
} from "../../server/functions/publishAi";

export async function fetchPlatformAccounts(): Promise<PlatformAccountInfo[]> {
	try {
		return (await listPlatformAccounts()) ?? [];
	} catch (err) {
		console.warn("[publishClient] listPlatformAccounts error:", err);
		return [];
	}
}

export async function createWechatMpAccount(input: {
	label: string;
	appid: string;
	appsecret: string;
}): Promise<PlatformAccountInfo> {
	return saveWechatMpAccount({ data: input });
}

export async function revalidatePlatformAccount(
	id: number,
): Promise<{ ok: boolean; reason?: string }> {
	return validatePlatformAccount({ data: { id } });
}

export async function removePlatformAccount(id: number): Promise<void> {
	await deletePlatformAccount({ data: { id } });
}

export async function fetchPublishRecords(
	documentId: number,
): Promise<PublishRecord[]> {
	try {
		return (await listPublishRecords({ data: { documentId } })) ?? [];
	} catch (err) {
		console.warn("[publishClient] listPublishRecords error:", err);
		return [];
	}
}

export async function publishToWechat(
	input: WechatPublishInput,
): Promise<PublishRecord> {
	return publishDocumentToWechat({ data: input });
}

/** 智能提炼/生成发布标题与标签 */
export async function requestPublishMetadata(input: PublishMetadataInput): Promise<{
	titles: string[];
	tags: string[];
	summary: string;
	aiGenerated: boolean;
}> {
	return generatePublishMetadata({ data: input });
}

/** 从数据库获取文档的发布中心草稿 */
export async function fetchDocumentPublishDraft(
	documentId: number,
): Promise<string | null> {
	try {
		return (await getDocumentPublishDraft({ data: { documentId } })) ?? null;
	} catch (err) {
		console.warn("[publishClient] fetchDocumentPublishDraft error:", err);
		return null;
	}
}

/** 持久化保存发布中心草稿到 SQLite 数据库 */
export async function persistDocumentPublishDraft(
	documentId: number,
	draftJson: string,
): Promise<boolean> {
	try {
		const res = await saveDocumentPublishDraft({
			data: { documentId, draftJson },
		});
		return res?.success ?? false;
	} catch (err) {
		console.warn("[publishClient] persistDocumentPublishDraft error:", err);
		return false;
	}
}
