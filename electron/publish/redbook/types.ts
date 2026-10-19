/**
 * Data structures and service contract for Xiaohongshu (Redbook) publishing
 */

export interface RedbookUserInfo {
	id: string;
	nickname: string;
	avatar: string;
}

export interface RedbookStatusResult {
	isLoggedIn: boolean;
	user?: RedbookUserInfo;
}

export interface RedbookLoginResult {
	success: boolean;
	user?: RedbookUserInfo;
	error?: string;
}

export interface RedbookPublishPayload {
	title: string;
	content: string;
	topics?: string[];
	images: string[]; // Absolute file paths, data URLs, or HTTP URLs
	mode?: "auto" | "fill_only"; // Default: "fill_only"
}

export interface RedbookPublishResult {
	success: boolean;
	mode: "auto" | "fill_only";
	message: string;
	error?: string;
}

export interface IRedbookPublishService {
	checkStatus(): Promise<RedbookStatusResult>;
	login(): Promise<RedbookLoginResult>;
	switchAccount(): Promise<RedbookLoginResult>;
	logout(): Promise<{ success: boolean }>;
	openCreatorPage(url?: string): Promise<{ success: boolean }>;
	publish(payload: RedbookPublishPayload): Promise<RedbookPublishResult>;
}

