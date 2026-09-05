import fs from "node:fs";
import path from "node:path";
import { DB_DIR, DB_PATH } from "./db/connection.ts";
import { workbenchDb } from "./db/sqlite.ts";

// ================= Database Backup =================

const BACKUP_DIR = path.join(DB_DIR, "backups");
const MAX_BACKUPS = 3;

/**
 * Copy workbench.db into .aiworkstation/backups and rotate old backups (keep latest MAX_BACKUPS).
 * Returns the backup file path, or null if the database file does not exist yet.
 */
export function backupDatabase(): string | null {
	if (!fs.existsSync(DB_PATH)) return null;
	if (!fs.existsSync(BACKUP_DIR)) {
		fs.mkdirSync(BACKUP_DIR, { recursive: true });
	}
	const stamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.replace("T", "_")
		.slice(0, 19);
	const backupPath = path.join(BACKUP_DIR, `workbench-${stamp}.db`);
	fs.copyFileSync(DB_PATH, backupPath);

	// Rotate: keep only the newest MAX_BACKUPS files
	const backups = fs
		.readdirSync(BACKUP_DIR)
		.filter((f) => f.startsWith("workbench-") && f.endsWith(".db"))
		.sort();
	while (backups.length > MAX_BACKUPS) {
		const oldest = backups.shift();
		if (oldest) {
			try {
				fs.unlinkSync(path.join(BACKUP_DIR, oldest));
			} catch {
				// best-effort rotation
			}
		}
	}
	return backupPath;
}

// ================= Dead Link Scanning (async background job) =================

export type DeadLinkStatus = "alive" | "dead" | "unknown";

export interface DeadLinkItem {
	id: string;
	url: string;
	title: string;
	status: DeadLinkStatus;
	httpStatus?: number;
	reason?: string;
}

export interface DeadLinkScanJob {
	id: string;
	total: number;
	checked: number;
	done: boolean;
	startedAt: string;
	finishedAt?: string;
	items: DeadLinkItem[];
}

const SCAN_CONCURRENCY = 8;
const SCAN_TIMEOUT_MS = 8000;
const JOB_TTL_MS = 30 * 60 * 1000;

const scanJobs = new Map<string, DeadLinkScanJob>();

const BROWSER_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const DEAD_NETWORK_CODES = new Set([
	"ENOTFOUND",
	"EAI_AGAIN",
	"ECONNREFUSED",
	"ERR_INVALID_URL",
]);

function classifyHttpStatus(status: number): DeadLinkStatus {
	if (status >= 200 && status < 400) return "alive";
	if (status === 404 || status === 410) return "dead";
	// 401/403/405 and 5xx: anti-bot or transient server errors, never auto-delete
	return "unknown";
}

function classifyError(err: unknown): {
	status: DeadLinkStatus;
	reason: string;
} {
	if (err instanceof Error && err.name === "AbortError") {
		return { status: "unknown", reason: "请求超时" };
	}
	const cause = (err as { cause?: { code?: string } })?.cause;
	const code = cause?.code;
	if (code && DEAD_NETWORK_CODES.has(code)) {
		return { status: "dead", reason: `网络错误 (${code})` };
	}
	if (code) {
		return { status: "unknown", reason: `网络错误 (${code})` };
	}
	return {
		status: "unknown",
		reason: err instanceof Error ? err.message : String(err),
	};
}

// HEAD is unreliable on many sites: anti-bot gateways and misconfigured servers
// answer 403/404/410/405/501 to HEAD while the same URL loads fine with GET
// (e.g. xiaohongshu.com returns 404 for HEAD, 200 for GET). Treat those statuses
// from HEAD as untrustworthy and always confirm with GET before judging.
const HEAD_UNTRUSTED_STATUSES = new Set([403, 404, 405, 410, 501]);

async function probeUrl(
	url: string,
): Promise<Pick<DeadLinkItem, "status" | "httpStatus" | "reason">> {
	const attempt = async (method: "HEAD" | "GET") => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
		try {
			const res = await fetch(url, {
				method,
				redirect: "follow",
				signal: controller.signal,
				headers: { "User-Agent": BROWSER_UA, Accept: "*/*" },
			});
			// Only the status code matters; cancel the body to free the socket
			res.body?.cancel().catch(() => {});
			return res;
		} finally {
			clearTimeout(timer);
		}
	};

	try {
		const head = await attempt("HEAD").catch(() => null);
		if (head && !HEAD_UNTRUSTED_STATUSES.has(head.status)) {
			return {
				status: classifyHttpStatus(head.status),
				httpStatus: head.status,
			};
		}
		const res = await attempt("GET");
		return { status: classifyHttpStatus(res.status), httpStatus: res.status };
	} catch (err) {
		const { status, reason } = classifyError(err);
		return { status, reason };
	}
}

async function runScan(
	job: DeadLinkScanJob,
	targets: Array<{ id: string; url: string; title: string }>,
): Promise<void> {
	let cursor = 0;
	const worker = async () => {
		while (cursor < targets.length) {
			const target = targets[cursor++];
			const probe = await probeUrl(target.url);
			job.items.push({ ...target, ...probe });
			job.checked++;
		}
	};
	await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));
	job.done = true;
	job.finishedAt = new Date().toISOString();
	persistLastScan(job);
}

function pruneExpiredJobs(): void {
	const now = Date.now();
	for (const [id, job] of scanJobs) {
		if (now - new Date(job.startedAt).getTime() > JOB_TTL_MS) {
			scanJobs.delete(id);
		}
	}
}

// ================= Last Scan Snapshot (persisted on disk) =================

const LAST_SCAN_PATH = path.join(DB_DIR, "dead-link-scan.json");

function persistLastScan(job: DeadLinkScanJob): void {
	try {
		fs.writeFileSync(LAST_SCAN_PATH, JSON.stringify(job));
	} catch {
		// best-effort snapshot; scan results stay available in memory
	}
}

/**
 * Read the most recent completed scan snapshot from disk.
 * Survives server restarts and the in-memory job TTL.
 */
export function getLastDeadLinkScan(): DeadLinkScanJob | null {
	try {
		if (!fs.existsSync(LAST_SCAN_PATH)) return null;
		const parsed = JSON.parse(fs.readFileSync(LAST_SCAN_PATH, "utf-8"));
		if (!parsed || !Array.isArray(parsed.items)) return null;
		return parsed as DeadLinkScanJob;
	} catch {
		return null;
	}
}

/**
 * Remove deleted bookmark ids from the persisted snapshot so reopening the
 * cleanup modal does not resurface already-deleted links.
 */
export function removeIdsFromLastScan(ids: string[]): void {
	const last = getLastDeadLinkScan();
	if (!last) return;
	const removed = new Set(ids);
	last.items = last.items.filter((item) => !removed.has(item.id));
	persistLastScan(last);
}

/**
 * Start an async dead-link scan over all bookmarks. Returns immediately with a job id;
 * the scan runs in the background on the long-lived Node server process.
 */
export function startDeadLinkScan(): { jobId: string; total: number } {
	pruneExpiredJobs();
	const targets = workbenchDb.getAllUrls();
	const job: DeadLinkScanJob = {
		id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		total: targets.length,
		checked: 0,
		done: targets.length === 0,
		startedAt: new Date().toISOString(),
		items: [],
	};
	scanJobs.set(job.id, job);
	if (targets.length > 0) {
		runScan(job, targets).catch((err) => {
			console.error("[DeadLinkScan] job failed:", err);
			job.done = true;
		});
	}
	return { jobId: job.id, total: job.total };
}

/**
 * Read current progress/results of a dead-link scan job.
 */
export function getDeadLinkScanStatus(jobId: string): DeadLinkScanJob | null {
	pruneExpiredJobs();
	return scanJobs.get(jobId) ?? null;
}
