import type {
	PlatformAccountInfo,
	PublishRecord,
	PublishVariants,
	VariantFocus,
} from "../../components/editor/types";
import {
	deletePlatformAccount,
	listPlatformAccounts,
	listPublishRecords,
	publishDocumentToWechat,
	saveWechatMpAccount,
	validatePlatformAccount,
	type WechatPublishInput,
} from "../../server/functions/publish";
import { generatePublishVariants } from "../../server/functions/publishAi";

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

/** 内容层 AI：一次生成全平台发布变体（P2 一把梭；focus = 单平台「换一版」） */
export async function requestPublishVariants(input: {
	documentId: number;
	title: string;
	contentText: string;
	focus?: VariantFocus;
}): Promise<{ variants: Partial<PublishVariants>; aiGenerated: boolean }> {
	return generatePublishVariants({ data: input });
}
