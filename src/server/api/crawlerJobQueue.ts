/**
 * In-memory job queue bridging the AI server tools and the AI Collector
 * extension background worker (silent crawler channel, M3 phase 1).
 *
 * Flow: server tool `createJob` + `awaitJobResult` -> extension long-polls
 * `takeJob` -> extension posts back via `completeJob`.
 */

export interface CrawlJob {
	id: string;
	url: string;
	selector?: string | null;
	waitMs?: number | null;
	mode?: "content" | "skeleton" | null;
	fullPage?: boolean;
	createdAt: number;
}

export interface CrawlSkeletonBlock {
	index: number;
	cssPath: string;
	tag: string;
	className: string;
	textLength: number;
	linkDensity: number;
	childCount: number;
	preview: string;
}

export interface CrawlJobResult {
	success: boolean;
	title?: string;
	markdown?: string;
	finalUrl?: string;
	extractedBy?: "selector" | "article" | "full";
	totalLength?: number;
	truncated?: boolean;
	skeleton?: CrawlSkeletonBlock[];
	error?: string;
}

const MAX_JOB_AGE_MS = 5 * 60 * 1000;
const EXTENSION_ONLINE_WINDOW_MS = 30_000;

const pendingJobs: CrawlJob[] = [];
const takeWaiters: Array<{
	resolve: (job: CrawlJob | null) => void;
	timer: NodeJS.Timeout;
}> = [];
const resultWaiters = new Map<
	string,
	{
		resolve: (result: CrawlJobResult | null) => void;
		timer: NodeJS.Timeout;
	}
>();

/**
 * Results that arrived before anyone called awaitJobResult (or after its
 * waiter already timed out). Fixes the race where the extension completes a
 * trivial job faster than the tool registers its waiter, and lets late
 * reposts (extension retry queue) still resolve a re-registered waiter.
 */
const completedResults = new Map<
	string,
	{ result: CrawlJobResult; completedAt: number }
>();

let lastPollAt = 0;
let jobSeq = 0;

export function markExtensionPoll(): void {
	lastPollAt = Date.now();
}

export function isExtensionOnline(): boolean {
	return lastPollAt > 0 && Date.now() - lastPollAt < EXTENSION_ONLINE_WINDOW_MS;
}

function sweepExpiredJobs(): void {
	const now = Date.now();
	for (let i = pendingJobs.length - 1; i >= 0; i--) {
		const job = pendingJobs[i];
		if (job && now - job.createdAt > MAX_JOB_AGE_MS) {
			pendingJobs.splice(i, 1);
			settleResult(job.id, null);
		}
	}
	for (const [jobId, entry] of completedResults) {
		if (now - entry.completedAt > MAX_JOB_AGE_MS) {
			completedResults.delete(jobId);
		}
	}
}

function settleResult(jobId: string, result: CrawlJobResult | null): void {
	const waiter = resultWaiters.get(jobId);
	if (!waiter) {
		if (result) {
			completedResults.set(jobId, { result, completedAt: Date.now() });
		}
		return;
	}
	resultWaiters.delete(jobId);
	clearTimeout(waiter.timer);
	waiter.resolve(result);
}

function takeCompletedResult(jobId: string): CrawlJobResult | null {
	const entry = completedResults.get(jobId);
	if (!entry) return null;
	completedResults.delete(jobId);
	if (Date.now() - entry.completedAt > MAX_JOB_AGE_MS) return null;
	return entry.result;
}

export function createJob(input: {
	url: string;
	selector?: string | null;
	waitMs?: number | null;
	mode?: "content" | "skeleton" | null;
	fullPage?: boolean;
}): CrawlJob {
	sweepExpiredJobs();
	const job: CrawlJob = {
		id: `crawl_${Date.now()}_${++jobSeq}`,
		url: input.url,
		selector: input.selector ?? null,
		waitMs: input.waitMs ?? null,
		mode: input.mode ?? null,
		fullPage: input.fullPage ?? false,
		createdAt: Date.now(),
	};
	pendingJobs.push(job);

	// Hand the job to a waiting extension long-poll immediately if any
	const waiter = takeWaiters.shift();
	if (waiter) {
		clearTimeout(waiter.timer);
		waiter.resolve(pendingJobs.shift() ?? null);
	}
	return job;
}

/**
 * Long-poll side: resolves with the oldest pending job, or null on timeout.
 */
export function takeJob(timeoutMs: number): Promise<CrawlJob | null> {
	const job = pendingJobs.shift();
	if (job) return Promise.resolve(job);
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			const idx = takeWaiters.findIndex((w) => w.resolve === resolve);
			if (idx >= 0) takeWaiters.splice(idx, 1);
			resolve(null);
		}, timeoutMs);
		takeWaiters.push({ resolve, timer });
	});
}

/**
 * Tool side: waits for the extension to post the job result.
 * Resolves null on timeout.
 */
export function awaitJobResult(
	jobId: string,
	timeoutMs: number,
): Promise<CrawlJobResult | null> {
	const completed = takeCompletedResult(jobId);
	if (completed) return Promise.resolve(completed);
	return new Promise((resolve) => {
		const timer = setTimeout(() => settleResult(jobId, null), timeoutMs);
		resultWaiters.set(jobId, { resolve, timer });
	});
}

export function completeJob(jobId: string, result: CrawlJobResult): void {
	settleResult(jobId, result);
}
