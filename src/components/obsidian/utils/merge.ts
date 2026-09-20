import { applyPatch, structuredPatch } from "diff";

/**
 * git 式三方合并（行级）：把 base→theirs 的改动以补丁形式应用到 ours 上。
 * 上下文精确匹配（fuzzFactor=0），任何一处应用失败即视为冲突，返回 null。
 * 服务端保存与客户端合并回写共用，保证两处语义一致。
 */
export function tryThreeWayMerge(
	base: string,
	ours: string,
	theirs: string,
): string | null {
	if (theirs === base) return ours;
	if (ours === theirs || ours === base) return theirs;
	const patch = structuredPatch("note", "note", base, theirs, "", "", {
		context: 3,
	});
	const merged = applyPatch(ours, patch, { fuzzFactor: 0 });
	return merged === false ? null : merged;
}

/**
 * 把 from→to 的改动重放到 target 上：
 * 用于自动保存飞行期间用户继续编辑时，把这些编辑重新应用到服务端的合并结果之上。
 */
export function tryReapplyChanges(
	target: string,
	from: string,
	to: string,
): string | null {
	if (from === to) return target;
	const patch = structuredPatch("note", "note", from, to, "", "", {
		context: 3,
	});
	const rebased = applyPatch(target, patch, { fuzzFactor: 0 });
	return rebased === false ? null : rebased;
}
