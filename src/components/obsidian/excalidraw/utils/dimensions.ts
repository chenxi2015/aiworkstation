import type { ExcalidrawElementInput } from "../../types";

const ABNORMAL_KEYWORDS = [
	"失败",
	"不足",
	"错误",
	"取消",
	"拒绝",
	"超时",
	"异常",
	"关闭",
	"终止",
	"驳回",
	"fail",
	"error",
	"cancel",
	"reject",
	"timeout",
	"abort",
];

const ABNORMAL_EDGE_KEYWORDS = ["否", "不足", "失败", "超时", "异常", "no"];

/**
 * Determine suitable dimensions for a node based on its type and text length
 */
export function getNodeDimensions(el: ExcalidrawElementInput): {
	width: number;
	height: number;
} {
	const textLen = el.label?.length || 0;

	switch (el.type) {
		case "diamond": {
			const size = textLen > 8 ? 120 : 100;
			return { width: size, height: size };
		}
		case "ellipse": {
			const w = Math.max(160, Math.min(240, textLen * 14 + 40));
			return { width: w, height: 60 };
		}
		case "text": {
			return { width: Math.max(120, textLen * 14), height: 40 };
		}
		default: {
			// Rectangle / Card: adapt width and height for readability
			const w = textLen > 14 ? 230 : textLen > 8 ? 200 : 180;
			const h = textLen > 16 ? 80 : 70;
			return { width: w, height: h };
		}
	}
}

/**
 * Check if a node represents an abnormal, abort, or failure branch
 */
export function isAbnormalBranchNode(
	el: ExcalidrawElementInput,
	incomingLabels: string[],
): boolean {
	if (el.color === "red") {
		return true;
	}

	const text = (el.label || "").toLowerCase();
	if (ABNORMAL_KEYWORDS.some((kw) => text.includes(kw))) {
		return true;
	}

	return incomingLabels.some((lbl) => {
		const lower = lbl.toLowerCase();
		return ABNORMAL_EDGE_KEYWORDS.some((kw) => lower.includes(kw));
	});
}
