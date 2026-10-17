/**
 * Types and options for AI Visual Generation (Text-to-Image / Text-to-Video).
 */

export type VisualMediaType = "image" | "video";

export type VisualAspectRatio =
	| "auto"
	| "1:1"
	| "2:3"
	| "3:2"
	| "3:4"
	| "4:3"
	| "4:5"
	| "5:4"
	| "9:16"
	| "16:9"
	| "21:9";

export type VisualResolution = "1K" | "2K" | "4K";

export type VisualQuality = "Low" | "Medium" | "High" | "xHigh" | "Max";

// Video specific types
export type VideoAspectRatio =
	| "auto"
	| "16:9"
	| "4:3"
	| "1:1"
	| "3:4"
	| "9:16"
	| "21:9";

export type VideoResolution = "480p" | "720p" | "1080p";

export interface VisualPendingRequest {
	id: string;
	prompt: string;
	aspectRatio: string;
	resolution: string;
	mediaType: VisualMediaType;
	referenceImage?: string;
}

export interface VisualGenerationParams {
	mediaType: VisualMediaType;
	aspectRatio: VisualAspectRatio;
	resolution: VisualResolution;
	quality: VisualQuality;
	duration?: number; // Video duration in seconds
	referenceImage?: string; // Base64 data URL or remote URL
}

export interface VisualGenerationItem {
	id: string;
	url: string;
	mediaType?: VisualMediaType; // "image" | "video"
	prompt: string;
	aspectRatio: string;
	resolution: string;
	quality?: string;
	duration?: number; // Video duration in seconds
	model: string;
	provider: string;
	createdAt: number;
}

export interface VisualChatSession {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	items: VisualGenerationItem[];
}


export interface AspectRatioOption {
	id: VisualAspectRatio;
	label: string;
	// Geometric dimensions for rendering miniature ratio preview icon
	previewWidth: number;
	previewHeight: number;
	// Standard pixel size mapping
	pixelSize: string;
}

export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
	{ id: "auto", label: "自动", previewWidth: 16, previewHeight: 16, pixelSize: "1024x1024" },
	{ id: "1:1", label: "1:1", previewWidth: 14, previewHeight: 14, pixelSize: "1024x1024" },
	{ id: "2:3", label: "2:3", previewWidth: 12, previewHeight: 18, pixelSize: "832x1216" },
	{ id: "3:2", label: "3:2", previewWidth: 18, previewHeight: 12, pixelSize: "1216x832" },
	{ id: "3:4", label: "3:4", previewWidth: 12, previewHeight: 16, pixelSize: "768x1024" },
	{ id: "4:3", label: "4:3", previewWidth: 16, previewHeight: 12, pixelSize: "1024x768" },
	{ id: "4:5", label: "4:5", previewWidth: 13, previewHeight: 16, pixelSize: "864x1080" },
	{ id: "5:4", label: "5:4", previewWidth: 16, previewHeight: 13, pixelSize: "1080x864" },
	{ id: "9:16", label: "9:16", previewWidth: 10, previewHeight: 18, pixelSize: "720x1280" },
	{ id: "16:9", label: "16:9", previewWidth: 18, previewHeight: 10, pixelSize: "1280x720" },
	{ id: "21:9", label: "21:9", previewWidth: 20, previewHeight: 9, pixelSize: "1344x576" },
];

export const RESOLUTION_OPTIONS: VisualResolution[] = ["1K", "2K", "4K"];

export const QUALITY_OPTIONS: VisualQuality[] = ["Low", "Medium", "High", "xHigh", "Max"];

// Video ratio options matching user's reference screenshot 1
export interface VideoAspectRatioOption {
	id: VideoAspectRatio;
	label: string;
	previewWidth: number;
	previewHeight: number;
}

export const VIDEO_ASPECT_RATIO_OPTIONS: VideoAspectRatioOption[] = [
	{ id: "auto", label: "自动", previewWidth: 16, previewHeight: 16 },
	{ id: "16:9", label: "16:9", previewWidth: 18, previewHeight: 10 },
	{ id: "4:3", label: "4:3", previewWidth: 16, previewHeight: 12 },
	{ id: "1:1", label: "1:1", previewWidth: 14, previewHeight: 14 },
	{ id: "3:4", label: "3:4", previewWidth: 12, previewHeight: 16 },
	{ id: "9:16", label: "9:16", previewWidth: 10, previewHeight: 18 },
	{ id: "21:9", label: "21:9", previewWidth: 20, previewHeight: 9 },
];

export const VIDEO_RESOLUTION_OPTIONS: VideoResolution[] = ["480p", "720p", "1080p"];
