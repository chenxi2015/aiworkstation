/**
 * Legacy compatibility wrapper for Xiaohongshu note publisher.
 * Delegates to the unified RedbookPublishService.
 */

import {
	type RedbookPublishPayload,
	type RedbookPublishResult,
	redbookPublishService,
} from "./redbook/index.js";

export * from "./redbook/types.js";

export async function executeRedbookPublish(
	payload: RedbookPublishPayload,
): Promise<RedbookPublishResult> {
	return redbookPublishService.publish(payload);
}
