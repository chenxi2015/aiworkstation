import { ElectronCrawlerService } from "./service.js";
import type { CrawlJob, CrawlJobResult } from "./types.js";

const LONG_POLL_TIMEOUT_MS = 20_000;
const RETRY_BACKOFF_MS = 2_000;

export class ElectronCrawlerWorker {
	private serverPort: number;
	private isRunning = false;
	private abortController: AbortController | null = null;

	constructor(serverPort: number) {
		this.serverPort = serverPort;
	}

	public start(): void {
		if (this.isRunning) return;
		this.isRunning = true;
		this.abortController = new AbortController();
		console.log(
			`[ElectronCrawlerWorker] Started listening on port ${this.serverPort}`,
		);
		this.pollLoop();
	}

	public stop(): void {
		this.isRunning = false;
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		console.log("[ElectronCrawlerWorker] Stopped");
	}

	private async pollLoop(): Promise<void> {
		while (this.isRunning) {
			try {
				const job = await this.fetchNextJob();
				if (job) {
					console.log(`[ElectronCrawlerWorker] Processing job: ${job.id} (${job.url})`);
					const result = await ElectronCrawlerService.crawl(job);
					await this.submitJobResult(job.id, result);
				}
			} catch (err: unknown) {
				if (!this.isRunning) break;
				// Transient network or server error, back off briefly
				await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
			}
		}
	}

	private async fetchNextJob(): Promise<CrawlJob | null> {
		const url = `http://127.0.0.1:${this.serverPort}/api/crawler/jobs/next?timeout=${LONG_POLL_TIMEOUT_MS}`;
		try {
			const res = await fetch(url, {
				signal: AbortSignal.timeout(LONG_POLL_TIMEOUT_MS + 5_000),
			});
			if (!res.ok) return null;
			const data = (await res.json()) as { success: boolean; job?: CrawlJob | null };
			return data.job ?? null;
		} catch {
			return null;
		}
	}

	private async submitJobResult(jobId: string, result: CrawlJobResult): Promise<void> {
		const url = `http://127.0.0.1:${this.serverPort}/api/crawler/jobs/${jobId}/result`;
		try {
			await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(result),
			});
		} catch (err) {
			console.error(`[ElectronCrawlerWorker] Failed to post result for ${jobId}:`, err);
		}
	}
}

