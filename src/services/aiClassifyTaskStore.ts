import { toast } from "@heroui/react";
import { useSyncExternalStore } from "react";
import type {
	AIClassificationResult,
	BookmarkTDKItem,
	Folder,
	WorkbenchItem,
	WorkbenchSettings,
} from "../components/workbench/types";
import { AIClassifierService } from "./aiClassifier";

export type AIClassifyTaskStatus = "idle" | "running" | "completed" | "error";

export interface AIClassifyTaskState {
	status: AIClassifyTaskStatus;
	progressText: string;
	progressPercent: number;
	logs: string[];
	results: AIClassificationResult[];
	errorMsg: string;
	startedAt: number | null;
	totalCount: number;
	/** Incremented every time the user sends the task to background; header watches it to flash a guide hint */
	bgHintNonce: number;
}

const INITIAL_STATE: AIClassifyTaskState = {
	status: "idle",
	progressText: "",
	progressPercent: 0,
	logs: [],
	results: [],
	errorMsg: "",
	startedAt: null,
	totalCount: 0,
	bgHintNonce: 0,
};

let state: AIClassifyTaskState = INITIAL_STATE;
let abortController: AbortController | null = null;
let incrementalResults: AIClassificationResult[] = [];
const listeners = new Set<() => void>();

function setState(patch: Partial<AIClassifyTaskState>) {
	state = { ...state, ...patch };
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getSnapshot() {
	return state;
}

/** Subscribe React components to the background AI classification task */
export function useAIClassifyTask(): AIClassifyTaskState {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Start the AI classification task. Runs independently of any component
 * lifecycle, so closing the modal keeps the task alive in the background.
 */
export async function startClassifyTask(params: {
	targetItems: WorkbenchItem[];
	settings: WorkbenchSettings;
	folders: Folder[];
}): Promise<void> {
	const { targetItems, settings, folders } = params;
	if (state.status === "running") return;
	if (targetItems.length === 0) {
		toast.info("当前没有待分类的书签");
		return;
	}

	const categories = Array.from(
		new Set([
			...folders.map((f) => f.category),
			"自媒体",
			"技能",
			"电商",
			"收藏",
			"chrome插件",
			"skills",
		]),
	);
	const existingFoldersList = folders.map((f) => ({
		name: f.name,
		category: f.category,
		desc: f.desc,
	}));

	const tdkPayload: BookmarkTDKItem[] = targetItems.map((item) => ({
		id: item.id || item.url || Math.random().toString(),
		title: item.name,
		url: item.url || "",
		description: item.description || item.summary || "",
		keywords: item.keywords || "",
		folderPath: item.folderName || "",
		parentTitle: item.folderName || "",
	}));

	abortController = new AbortController();
	incrementalResults = [];
	setState({
		status: "running",
		errorMsg: "",
		progressPercent: 0,
		progressText: "正在启动 AI 并发分析池...",
		startedAt: Date.now(),
		totalCount: targetItems.length,
		results: [],
		logs: [
			`🚀 已就绪，正在准备 ${targetItems.length} 条书签的语义特征向量与提示词...`,
		],
	});

	try {
		const classifiedResults = await AIClassifierService.classifyBookmarks(
			tdkPayload,
			{
				settings,
				existingCategories: categories,
				existingFolders: existingFoldersList,
				concurrency: 3,
				signal: abortController.signal,
				onBatchComplete: (batch) => {
					incrementalResults.push(...batch);
				},
				onLog: (line) => {
					const prev = state.logs;
					const next = [...prev, line];
					setState({
						logs: next.length > 200 ? next.slice(next.length - 200) : next,
					});
				},
				onProgress: (current, total, msg) => {
					setState({
						progressText: msg,
						progressPercent: Math.round((current / total) * 100),
					});
				},
			},
		);

		if (abortController.signal.aborted) {
			if (incrementalResults.length > 0) {
				setState({ status: "completed", results: incrementalResults });
				toast.info(
					`已终止分析，已保留已完成的 ${incrementalResults.length} 条书签分类`,
				);
			} else {
				setState({ ...INITIAL_STATE });
				toast.info("已取消 AI 分类");
			}
			return;
		}

		setState({
			status: "completed",
			results: classifiedResults,
			progressPercent: 100,
			progressText: `分析完成，共识别 ${classifiedResults.length} 个书签分类`,
		});
		toast.success(`AI 分析完成，共识别 ${classifiedResults.length} 个书签分类`);
	} catch (err) {
		if (abortController.signal.aborted) {
			if (incrementalResults.length > 0) {
				setState({ status: "completed", results: incrementalResults });
				toast.info(
					`已终止分析，已保留已完成的 ${incrementalResults.length} 条书签分类`,
				);
			} else {
				setState({ ...INITIAL_STATE });
				toast.info("已取消 AI 分类");
			}
		} else {
			const message =
				err instanceof Error
					? err.message
					: "AI 分类服务请求失败，请检查网络或 API Key";
			setState({ status: "error", errorMsg: message });
			toast.danger("AI 分类失败");
		}
	}
}

/** Abort the running task; incremental results are kept (handled in catch) */
export function abortClassifyTask() {
	abortController?.abort();
}

/** Notify the header to flash a guide hint pointing at the task indicator */
export function requestBackgroundHint() {
	setState({ bgHintNonce: state.bgHintNonce + 1 });
}

/** Clear task state back to idle (after applying results or dismissing) */
export function resetClassifyTask() {
	if (state.status === "running") return;
	abortController = null;
	incrementalResults = [];
	setState({ ...INITIAL_STATE });
}
