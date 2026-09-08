/**
 * Silent Crawler Extractor (M3 Phase 1)
 *
 * Unlisted script injected on demand by the background worker via
 * chrome.scripting.executeScript({ files: ['crawl-extractor.js'] }).
 * Job params are passed through `window.__AIC_CRAWL_JOB__` (set by a prior
 * executeScript call in the same isolated world), and the result is posted
 * back via chrome.runtime.sendMessage.
 */

import { extractPageTDK } from '../src/utils/tdk';
import { normalizeHtml } from '../src/utils/htmlNormalizer';
import { htmlToMarkdown } from '../src/utils/markdownConverter';

interface CrawlJobParams {
  jobId: string;
  selector: string | null;
  mode?: 'content' | 'skeleton' | null;
  fullPage?: boolean;
}

const MAX_MARKDOWN_LENGTH = 20000;
// fullPage 模式：完整正文要落盘成文件，不走 AI 上下文，上限放宽到 500KB
const FULL_PAGE_MAX_LENGTH = 500_000;
const MAX_SKELETON_BLOCKS = 20;

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

/** Short, stable CSS path usable directly as a querySelector argument. */
function cssPathOf(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.documentElement && parts.length < 6) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`${part}#${node.id}`);
      break;
    }
    const classes = (node.getAttribute('class') || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (classes.length > 0) part += `.${classes.join('.')}`;
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * Skeleton mode: pruned DOM walk returning candidate content blocks with
 * just enough metadata (css path, text stats, preview) for the AI to pick
 * which regions it wants, without shipping the full page over the wire.
 */
function buildSkeleton(): SkeletonBlock[] {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'main, article, nav, aside, header, footer, section, ' +
        '[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], ' +
        '[class*="content"], [class*="article"], [class*="post"], [class*="comment"], [class*="list"], ' +
        '[id*="content"], [id*="main"]',
    ),
  );
  if (document.body) candidates.push(document.body);

  const seen = new Set<HTMLElement>();
  const blocks: SkeletonBlock[] = [];
  for (const el of candidates) {
    if (seen.has(el) || !isVisible(el)) continue;
    seen.add(el);
    const text = (el.innerText || '').trim();
    if (text.length < 50) continue;
    blocks.push({
      index: 0,
      cssPath: cssPathOf(el),
      tag: el.tagName.toLowerCase(),
      className: (el.getAttribute('class') || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(' '),
      textLength: text.length,
      linkDensity: Math.round(linkDensity(el) * 100) / 100,
      childCount: el.children.length,
      preview: text.slice(0, 100).replace(/\s+/g, ' '),
    });
  }

  blocks.sort((a, b) => b.textLength - a.textLength);
  return blocks.slice(0, MAX_SKELETON_BLOCKS).map((block, i) => ({ ...block, index: i }));
}

/**
 * Classic readability signal: ratio of anchor text to total text. Navigation
 * blocks / chapter TOCs are link-dense (> ~0.5), real article body is not.
 */
function linkDensity(el: HTMLElement): number {
  const total = (el.innerText || '').trim().length;
  if (total === 0) return 1;
  let linkText = 0;
  for (const a of Array.from(el.querySelectorAll('a'))) {
    linkText += (a.textContent || '').trim().length;
  }
  return linkText / total;
}

function buildMarkdownPayloadFromMarkdown(full: string, extractedBy: string, cap = MAX_MARKDOWN_LENGTH) {
  return {
    markdown: full.slice(0, cap),
    totalLength: full.length,
    truncated: full.length > cap,
    extractedBy,
  };
}

function buildMarkdownPayload(rootEl: HTMLElement, pageUrl: string, extractedBy: string, cap?: number) {
  return buildMarkdownPayloadFromMarkdown(
    htmlToMarkdown(normalizeHtml(rootEl, pageUrl), pageUrl),
    extractedBy,
    cap,
  );
}

/**
 * Detects anti-bot challenge / verification pages so the caller gets an
 * explicit `blocked` error instead of "successfully extracted" garbage.
 * Conservative on purpose: only fires on strong signals (challenge titles,
 * known captcha widgets, or near-empty body with verification keywords).
 */
function detectBlockedPage(): string | null {
  const title = document.title || '';
  if (
    /just a moment|attention required|checking your browser|checking if the site|安全验证|环境异常|访问验证|滑动验证|人机验证/i.test(
      title,
    )
  ) {
    return `blocked: 疑似反爬验证页（页面标题：「${title}」）`;
  }
  if (
    document.querySelector(
      '#cf-challenge-running, .cf-chl-widget, #challenge-stage, iframe[src*="captcha"], iframe[src*="challenge"], .geetest_panel, .verify-slider',
    )
  ) {
    return 'blocked: 页面含验证码/Challenge 组件（Cloudflare/geetest 等），需人工在可见标签页中通过验证';
  }
  const bodyText = (document.body?.innerText || '').trim();
  if (bodyText.length > 0 && bodyText.length < 200 && /验证|captcha|robot|机器人|异常|频繁/i.test(bodyText)) {
    return `blocked: 正文极短且含验证/风控关键词，疑似被拦截（内容：「${bodyText.slice(0, 80)}」）`;
  }
  return null;
}

/**
 * Job params are passed through `document.documentElement.dataset` (DOM is
 * shared across MAIN/ISOLATED worlds, unlike `window` globals) right before
 * this file runs. If the page performs a late redirect in between, retry
 * briefly before giving up.
 */
async function waitForParams(timeoutMs = 2500): Promise<CrawlJobParams | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const raw = document.documentElement?.dataset?.aicCrawlJob;
    if (raw) {
      try {
        const params = JSON.parse(raw) as CrawlJobParams;
        if (params?.jobId) return params;
      } catch {
        // Malformed params payload, keep waiting
      }
    }
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export default defineUnlistedScript(async () => {
  const params = await waitForParams();
  const currentJobId = params?.jobId;

  const reply = (payload: Record<string, unknown>) => {
    // Primary channel: DOM dataset (world-agnostic) polled by the background
    try {
      document.documentElement.dataset.aicCrawlResult = JSON.stringify({
        jobId: currentJobId ?? null,
        ...payload,
      });
    } catch {
      // Dataset write can fail on frozen documents; message channel below
    }
    // Secondary channel: runtime message (best effort)
    chrome.runtime
      .sendMessage({ type: 'CRAWL_JOB_RESULT', jobId: currentJobId ?? null, ...payload })
      .catch(() => {});
  };

  try {
    if (!params?.jobId) return;

    const blockedReason = detectBlockedPage();
    if (blockedReason) {
      reply({ success: false, error: blockedReason });
      return;
    }

    const pageUrl = window.location.href;
    const tdk = extractPageTDK(document);
    const title = tdk.title || document.title || '';
    const cap = params.fullPage ? FULL_PAGE_MAX_LENGTH : MAX_MARKDOWN_LENGTH;

    // 0. Skeleton mode: return candidate blocks for AI-side region selection
    if (params.mode === 'skeleton') {
      reply({
        success: true,
        title,
        finalUrl: pageUrl,
        skeleton: buildSkeleton(),
      });
      return;
    }

    // 1. Targeted extraction when a CSS selector is provided. querySelectorAll
    // (not querySelector) so multi-element selectors the AI loves to generate
    // — e.g. "article h2:nth-of-type(3) ~ *" for "everything after section 3"
    // — return all matches concatenated instead of silently taking only the
    // first element.
    if (params.selector) {
      let matched: Element[] = [];
      try {
        matched = Array.from(document.querySelectorAll(params.selector));
      } catch {
        // Invalid selector syntax -> fall through to auto extraction
      }
      if (matched.length > 0) {
        const combined = matched
          .map((el) => htmlToMarkdown(normalizeHtml(el as HTMLElement, pageUrl), pageUrl))
          .filter((md) => md.trim().length > 0)
          .join('\n\n');
        reply({
          success: true,
          title,
          finalUrl: pageUrl,
          matchedCount: matched.length,
          ...buildMarkdownPayloadFromMarkdown(combined, 'selector', cap),
        });
        return;
      }
    }

    // 2. Auto main-content heuristics: article / main / [role=main]
    const mainCandidates = Array.from(
      document.querySelectorAll<HTMLElement>('article, main, [role="main"]'),
    );
    // Prefer text-rich, link-sparse candidates so nav sidebars / chapter TOCs
    // don't win over the real article body; fall back to unfiltered if all
    // candidates are link-dense (e.g. index pages).
    const bestMain =
      mainCandidates
        .filter((el) => (el.innerText || '').trim().length > 200 && linkDensity(el) < 0.5)
        .sort((a, b) => (b.innerText || '').length - (a.innerText || '').length)[0] ??
      mainCandidates
        .filter((el) => (el.innerText || '').trim().length > 200)
        .sort((a, b) => (b.innerText || '').length - (a.innerText || '').length)[0];

    const rootEl = bestMain || document.body || document.documentElement;

    reply({
      success: true,
      title,
      finalUrl: pageUrl,
      ...buildMarkdownPayload(rootEl, pageUrl, bestMain ? 'article' : 'full', cap),
    });
  } catch (err: any) {
    reply({ success: false, error: String(err?.message || err) });
  }
});
