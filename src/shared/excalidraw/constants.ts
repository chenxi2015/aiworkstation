/** Hand-drawn preset color palette shared by client and server generators. */
export const SHARED_COLOR_PALETTE: Record<
	string,
	{ stroke: string; bg: string }
> = {
	blue: { stroke: "#1971c2", bg: "#e7f5ff" },
	green: { stroke: "#2f9e44", bg: "#ebfbee" },
	yellow: { stroke: "#f59f00", bg: "#fff9db" },
	red: { stroke: "#e03131", bg: "#ffe3e3" },
	purple: { stroke: "#7048e8", bg: "#f3f0ff" },
	gray: { stroke: "#495057", bg: "#f1f3f5" },
	default: { stroke: "#1e1e1e", bg: "#ffffff" },
};
