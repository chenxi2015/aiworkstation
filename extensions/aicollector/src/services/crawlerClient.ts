/**
 * Silent Crawler Client (M3 Phase 1)
 *
 * Long-polls the workbench server for crawl jobs, executes them by opening
 * a hidden background tab (with the user's real browser session), injects
 * the crawl-extractor script, and posts the result back.
 *
 * MV3 service worker notes: each long-poll fetch is short enough to stay
 * within the idle window; a chrome.alarms heartbeat re-wakes the worker if
 * it gets suspended between polls (defineBackground re-runs and restarts
 * the loop).
 */

import { WorkbenchService } from './workbench';

interface CrawlJob {
  id: string;
  url: string;
  selector?: string | null;
  waitMs?: number | null;
  mode?: 'content' | 'skeleton' | null;
  fullPage?: boolean;
}

interface SkeletonBlock {
  index: number;
  cssPath: string;
  tag: string;
  className: string;
  textLength: number;
  linkDensity: number;
  childCount: number;
  preview: string;
}

interface CrawlJobResult {
  success: boolean;
  title?: string;
  markdown?: string;
  finalUrl?: string;
  extractedBy?: 'selector' | 'article' | 'full';
  totalLength?: number;
  truncated?: boolean;
  skeleton?: SkeletonBlock[];
  error?: string;
}

const LONG_POLL_TIMEOUT_MS = 20_000;
const TAB_LOAD_TIMEOUT_MS = 15_000;
const EXTRACT_TIMEOUT_MS = 15_000;
const DEFAULT_SPA_SETTLE_MS = 1_500;
const MAX_SPA_SETTLE_MS = 10_000;
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries chrome.scripting.executeScript on transient "Could not load file"
 * errors. In WXT dev mode the output directory is rebuilt on source change,
 * and there is a brief window where the bundle file is missing mid-write;
 * Chrome's loaded extension also lags behind until reloaded. A short wait +
 * retry rides out that window instead of failing the whole job.
 */
async function executeScriptWithRetry(
  injection:
    | { target: { tabId: number }; files: string[] }
    | { target: { tabId: number }; func: (...args: any[]) => unknown; args?: unknown[] },
  retries = 2,
): Promise<chrome.scripting.InjectionResult<unknown>[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await chrome.scripting.executeScript(
        injection as chrome.scripting.ScriptInjection<unknown[], unknown>,
      )) as chrome.scripting.InjectionResult<unknown>[];
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (!/could not load file/i.test(msg) || attempt >= retries) throw err;
      console.warn('[AI Collector Crawler] Script file not ready, retrying:', msg);
      await sleep(1_000);
    }
  }
}

/**
 * Failed result posts are queued in chrome.storage and retried on the next
 * poll cycle, per PROJECT.md decision 5 (采集失败进队列，恢复后批量补发).
 */
const RESULT_RETRY_QUEUE_KEY = 'crawlResultRetryQueue';
const RESULT_RETRY_QUEUE_MAX = 50;

interface QueuedResult {
  jobId: string;
  result: CrawlJobResult;
  queuedAt: number;
}

async function readRetryQueue(): Promise<QueuedResult[]> {
  try {
    const data = await chrome.storage.local.get(RESULT_RETRY_QUEUE_KEY);
    const queue = data[RESULT_RETRY_QUEUE_KEY];
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

async function writeRetryQueue(queue: QueuedResult[]): Promise<void> {
  try {
    await chrome.storage.local.set({
      [RESULT_RETRY_QUEUE_KEY]: queue.slice(-RESULT_RETRY_QUEUE_MAX),
    });
  } catch {
    // Storage unavailable (e.g. incognito split): results are best-effort anyway
  }
}

async function postResult(baseUrl: string, jobId: string, result: CrawlJobResult): Promise<void> {
  const res = await fetch(`${baseUrl}/api/crawler/jobs/${jobId}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function postResultWithRetryQueue(
  baseUrl: string,
  jobId: string,
  result: CrawlJobResult,
): Promise<void> {
  try {
    await postResult(baseUrl, jobId, result);
  } catch (err) {
    console.warn('[AI Collector Crawler] Result post failed, queued for retry:', jobId, err);
    const queue = await readRetryQueue();
    queue.push({ jobId, result, queuedAt: Date.now() });
    await writeRetryQueue(queue);
  }
}

async function flushRetryQueue(baseUrl: string): Promise<void> {
  const queue = await readRetryQueue();
  if (queue.length === 0) return;
  const remaining: QueuedResult[] = [];
  for (const item of queue) {
    try {
      await postResult(baseUrl, item.jobId, item.result);
    } catch {
      remaining.push(item);
    }
  }
  await writeRetryQueue(remaining);
  if (remaining.length < queue.length) {
    console.info('[AI Collector Crawler] Retried queued results:', queue.length - remaining.length, 'delivered');
  }
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('页面加载超时'));
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        clearTimeout(timer);
        reject(new Error(chrome.runtime.lastError?.message || '标签页创建失败'));
        return;
      }
      if (tab.status === 'complete') {
        clearTimeout(timer);
        resolve();
        return;
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

/**
 * Samples the tab's visible text length via executeScript. Returns 0 when the
 * tab is mid-navigation or otherwise inaccessible.
 */
async function sampleTextLength(tabId: number): Promise<number> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.body?.innerText?.trim().length ?? 0,
    });
    return injection?.result ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Content-stability based readiness check, replacing the old fixed sleep.
 * The page counts as ready once its visible text length stops growing for two
 * consecutive 500ms samples (with waitMs as minimum wait), capped by
 * MAX_SPA_SETTLE_MS. Handles both "SPA still rendering after load" and "load
 * event never fires but content is already there".
 */
async function waitForContentSettled(
  tabId: number,
  minWaitMs: number,
  selector: string | null,
): Promise<void> {
  const start = Date.now();
  const deadline = start + MAX_SPA_SETTLE_MS;
  let lastLength = -1;
  let stableRounds = 0;

  for (;;) {
    // Fast path: caller-provided selector already present in the DOM
    if (selector) {
      try {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId },
          func: (sel: string) => {
            try {
              const el = document.querySelector(sel);
              return (el?.textContent?.trim().length ?? 0) > 50;
            } catch {
              return false;
            }
          },
          args: [selector],
        });
        if (injection?.result) {
          await sleep(300); // brief settle so sibling content renders too
          return;
        }
      } catch {
        // Tab mid-navigation, keep waiting
      }
    }

    const length = await sampleTextLength(tabId);
    const elapsed = Date.now() - start;
    if (length > 0 && length === lastLength) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }
    lastLength = length;

    if (elapsed >= minWaitMs && stableRounds >= 2) return;
    if (Date.now() >= deadline) return;
    await sleep(500);
  }
}

/**
 * Polls the tab DOM for the extraction result written by crawl-extractor
 * onto `document.documentElement.dataset.aicCrawlResult`. DOM dataset is
 * shared across MAIN/ISOLATED worlds, making this channel immune to
 * script-world mismatch issues.
 */
async function pollExtractorResult(
  jobId: string,
  tabId: number,
  timeoutMs: number,
): Promise<CrawlJobResult> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.documentElement?.dataset?.aicCrawlResult ?? null,
      });
      const raw = injection?.result;
      const result =
        typeof raw === 'string' && raw
          ? (JSON.parse(raw) as CrawlJobResult & { jobId?: string })
          : null;
      if (result && result.jobId === jobId) {
        const { jobId: _jobId, ...rest } = result;
        return rest;
      }
    } catch {
      // Tab navigated away or became inaccessible: keep polling until timeout
    }

    if (Date.now() >= deadline) {
      throw new Error('内容提取超时');
    }
    await sleep(400);
  }
}

/**
 * Executes a single crawl job: open hidden tab -> wait for load + SPA settle
 * -> inject extractor -> await result -> always close the tab.
 */
async function handleCrawlJob(job: CrawlJob): Promise<CrawlJobResult> {
  let tabId: number | null = null;

  try {
    const tab = await chrome.tabs.create({ url: job.url, active: false });
    if (typeof tab.id !== 'number') {
      return { success: false, error: '无法创建后台标签页' };
    }
    tabId = tab.id;
    console.info('[AI Collector Crawler] Tab opened:', tabId, job.url);

    try {
      await waitForTabComplete(tabId, TAB_LOAD_TIMEOUT_MS);
    } catch (loadErr) {
      // load 事件超时不代表失败：长连接/被拦截的统计脚本会拖着 load 不触发，
      // 此时正文往往已经渲染出来。有实质内容就继续，否则才判失败。
      const hasContent = (await sampleTextLength(tabId)) > 300;
      if (!hasContent) throw loadErr;
      console.info('[AI Collector Crawler] Load timeout but content present, proceeding:', tabId);
    }
    await waitForContentSettled(tabId, job.waitMs ?? DEFAULT_SPA_SETTLE_MS, job.selector ?? null);

    // Pass job params via DOM dataset (shared across script worlds), then run the extractor
    await executeScriptWithRetry({
      target: { tabId },
      func: (params: {
        jobId: string;
        selector: string | null;
        mode: 'content' | 'skeleton';
        fullPage: boolean;
      }) => {
        document.documentElement.dataset.aicCrawlJob = JSON.stringify(params);
      },
      args: [
        {
          jobId: job.id,
          selector: job.selector ?? null,
          mode: job.mode ?? 'content',
          fullPage: job.fullPage ?? false,
        },
      ],
    });
    await executeScriptWithRetry({
      target: { tabId },
      files: ['crawl-extractor.js'],
    });
    console.info('[AI Collector Crawler] Extractor injected, awaiting result:', job.id);

    const result = await pollExtractorResult(job.id, tabId, EXTRACT_TIMEOUT_MS);
    console.info('[AI Collector Crawler] Job done:', job.id, result.success, result.extractedBy);
    return result;
  } catch (err: any) {
    const msg = String(err?.message || err);
    // 构建文件缺失多半发生在扩展热更新窗口或扩展未重新加载旧构建，
    // 给出可操作指引，而不是一个让人摸不着头脑的 Chrome 原始报错。
    if (/could not load file/i.test(msg)) {
      return {
        success: false,
        error:
          '扩展脚本文件加载失败（可能是扩展刚构建/热更新，Chrome 仍在运行旧版本）。请到 chrome://extensions 点击「重新加载」AI Collector 扩展后重试。',
      };
    }
    return { success: false, error: msg };
  } finally {
    if (tabId !== null) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}

/**
 * Starts the crawl-job long-poll loop. Called once from the background
 * entrypoint; safe to call again after a service worker restart since each
 * worker instance runs the loop exactly once.
 */
export function startCrawlerLoop(): void {
  // Heartbeat: re-wake the worker if suspended between polls
  chrome.alarms.onAlarm.addListener(() => {});
  chrome.alarms.create('crawler-keepalive', { periodInMinutes: 0.5 });

  let backoff = INITIAL_BACKOFF_MS;

  (async () => {
    for (;;) {
      try {
        const baseUrl = await WorkbenchService.getWorkbenchUrl();
        const res = await fetch(
          `${baseUrl}/api/crawler/jobs/next?timeout=${LONG_POLL_TIMEOUT_MS}`,
          { signal: AbortSignal.timeout(LONG_POLL_TIMEOUT_MS + 5_000) },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        backoff = INITIAL_BACKOFF_MS;
        const data = await res.json();
        const job = data?.job as CrawlJob | null;

        // Connection is alive: deliver any previously queued results first
        await flushRetryQueue(baseUrl);

        if (!job?.id || !job?.url) continue;

        const result = await handleCrawlJob(job);
        await postResultWithRetryQueue(baseUrl, job.id, result);
      } catch {
        // Workbench offline or network error: back off and retry
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  })().catch((err) => {
    console.warn('[AI Collector] Crawler loop crashed:', err);
  });
}
