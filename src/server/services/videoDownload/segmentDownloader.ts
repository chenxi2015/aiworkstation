import { createDecipheriv } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { VideoSegmentItem } from "./types.ts";

export async function fetchText(
	url: string,
	headers?: Record<string, string>,
): Promise<string> {
	const res = await fetch(url, { headers });
	if (!res.ok) throw new Error(`请求播放列表失败 (HTTP ${res.status}): ${url}`);
	return await res.text();
}

const keyCache = new Map<string, Promise<Buffer>>();

function fetchKeyCached(
	url: string,
	headers?: Record<string, string>,
	signal?: AbortSignal,
): Promise<Buffer> {
	const cached = keyCache.get(url);
	if (cached) return cached;

	const promise = (async () => {
		const res = await fetch(url, { headers, signal });
		if (!res.ok)
			throw new Error(`获取解密密钥失败 (HTTP ${res.status}): ${url}`);
		const ab = await res.arrayBuffer();
		return Buffer.from(ab);
	})();

	keyCache.set(url, promise);
	return promise;
}

/**
 * Downloads a single segment to disk with timeout, retries, and atomic fs.writeFile.
 * Transparently decrypts AES-128 encrypted HLS chunks.
 */
async function downloadSegmentToFile(
	segment: VideoSegmentItem,
	destPath: string,
	headers?: Record<string, string>,
	signal?: AbortSignal,
	retries = 3,
): Promise<void> {
	let lastErr: any;

	for (let attempt = 0; attempt <= retries; attempt++) {
		if (signal?.aborted) throw new Error("Download aborted");
		if (attempt > 0) {
			await new Promise((r) => setTimeout(r, 500 * attempt));
		}

		const timeoutCtrl = new AbortController();
		const timer = setTimeout(() => timeoutCtrl.abort(), 25000);

		const onParentAbort = () => timeoutCtrl.abort();
		signal?.addEventListener("abort", onParentAbort);

		try {
			const res = await fetch(segment.url, {
				headers,
				signal: timeoutCtrl.signal,
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);

			const arrayBuffer = await res.arrayBuffer();
			let buffer = Buffer.from(arrayBuffer);

			if (segment.crypto && segment.crypto.method === "AES-128") {
				const keyBuf = await fetchKeyCached(
					segment.crypto.keyUrl,
					headers,
					signal,
				);
				const decipher = createDecipheriv(
					"aes-128-cbc",
					keyBuf,
					segment.crypto.iv,
				);
				decipher.setAutoPadding(true);
				try {
					buffer = Buffer.concat([decipher.update(buffer), decipher.final()]);
				} catch {
					const fallback = createDecipheriv(
						"aes-128-cbc",
						keyBuf,
						segment.crypto.iv,
					);
					fallback.setAutoPadding(false);
					buffer = Buffer.concat([fallback.update(buffer), fallback.final()]);
				}
			}

			// Atomic write without unhandled stream error events
			await fs.writeFile(destPath, buffer);
			return;
		} catch (err: any) {
			lastErr = err;
			if (signal?.aborted) throw err;
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onParentAbort);
		}
	}

	throw new Error(
		`分片下载失败 (${lastErr?.message || "未知错误"}): ${segment.url}`,
	);
}

/**
 * Downloads segments with bounded concurrency, robust error containment and graceful abort.
 */
export async function downloadTrackSegments(
	segments: VideoSegmentItem[],
	tempDir: string,
	trackPrefix: string,
	headers: Record<string, string> | undefined,
	signal: AbortSignal,
	concurrency: number,
	onProgress: () => void,
): Promise<string[]> {
	const downloadedFiles: string[] = new Array(segments.length);
	let cursor = 0;
	let firstError: Error | null = null;

	const worker = async () => {
		while (true) {
			if (signal.aborted || firstError) return;
			const index = cursor++;
			if (index >= segments.length) return;

			const segment = segments[index];
			const segFile = join(
				tempDir,
				`${trackPrefix}_${String(index).padStart(6, "0")}.seg`,
			);

			try {
				await downloadSegmentToFile(segment, segFile, headers, signal);
				downloadedFiles[index] = segFile;
				onProgress();
			} catch (err: any) {
				if (!firstError && !signal.aborted) {
					firstError = err instanceof Error ? err : new Error(String(err));
				}
				return;
			}
		}
	};

	const pool = Array.from(
		{ length: Math.min(concurrency, segments.length) },
		() => worker(),
	);
	// Wait for all workers to gracefully complete/exit before proceeding
	await Promise.allSettled(pool);

	if (firstError) {
		throw firstError;
	}
	if (signal.aborted) {
		throw new Error("Download aborted by user");
	}

	return downloadedFiles;
}
