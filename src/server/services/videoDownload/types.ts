export interface ServerVideoTask {
	id: string;
	url: string;
	kind?: "hls" | "file" | "dash";
	audioUrl?: string;
	pageTitle: string;
	pageUrl?: string;
	status: "pending" | "downloading" | "muxing" | "done" | "error" | "cancelled";
	percent: number;
	doneSegments: number;
	totalSegments: number;
	phase?: "downloading" | "muxing";
	outputPath?: string;
	filename?: string;
	error?: string;
	createdAt: number;
	completedAt?: number;
}

export interface SegmentCryptoInfo {
	method: "AES-128";
	keyUrl: string;
	iv: Buffer;
}

export interface VideoSegmentItem {
	url: string;
	crypto?: SegmentCryptoInfo;
}
