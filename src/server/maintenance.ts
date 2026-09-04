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

async function probeUrl(
	url: string,
): Promise<Pick<DeadLinkItem, "status" | "httpStatus" | "reason">> {
	const attempt = async (method: "HEAD" | "GET") => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
		try {
			return await fetch(url, {
				method,
				redirect: "follow",
				signal: controller.signal,
				headers: { "User-Agent": BROWSER_UA, Accept: "*/*" },
			});
		} finally {
			clearTimeout(timer);
		}
	};

	try {
		let res = await attempt("HEAD");
		// Some servers do not support HEAD at all; retry with GET before judging
		if (res.status === 405 || res.status === 501) {
			res = await attempt("GET");
		}
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
}

function pruneExpiredJobs(): void {
	const now = Date.now();
	for (const [id, job] of scanJobs) {
		if (now - new Date(job.startedAt).getTime() > JOB_TTL_MS) {
			scanJobs.delete(id);
		}
	}
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
