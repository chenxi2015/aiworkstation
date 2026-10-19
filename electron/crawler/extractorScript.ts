import type { CrawlJob } from "./types.js";

/**
 * Generates an IIFE JavaScript string to be injected into the Electron BrowserWindow
 * to extract structured Markdown and metadata directly from the live DOM.
 */
export function buildExtractorScript(job: CrawlJob): string {
	const paramsJson = JSON.stringify({
		jobId: job.id,
		selector: job.selector || null,
		mode: job.mode || "content",
		fullPage: Boolean(job.fullPage),
	});

	return `(() => {
    const params = ${paramsJson};
    const MAX_CONTENT_LENGTH = 20000;
    const FULL_PAGE_MAX_LENGTH = 500000;
    const cap = params.fullPage ? FULL_PAGE_MAX_LENGTH : MAX_CONTENT_LENGTH;

    function detectBlocked(): string | null {
      const title = document.title || "";
      if (/just a moment|attention required|checking your browser|checking if the site|安全验证|环境异常|访问验证|滑动验证|人机验证/i.test(title)) {
        return "blocked: 疑似反爬验证页（页面标题：「" + title + "」）";
      }
      if (document.querySelector('#cf-challenge-running, .cf-chl-widget, #challenge-stage, iframe[src*="captcha"], iframe[src*="challenge"], .geetest_panel, .verify-slider')) {
        return "blocked: 页面含验证码/Challenge 组件（Cloudflare/geetest 等）";
      }
      const bodyText = (document.body ? document.body.innerText : "").trim();
      if (bodyText.length > 0 && bodyText.length < 200 && /验证|captcha|robot|机器人|异常|频繁/i.test(bodyText)) {
        return "blocked: 正文极短且含验证关键词，疑似被拦截（内容：「" + bodyText.slice(0, 80) + "」）";
      }
      return null;
    }

    function cssPathOf(el) {
      const parts = [];
      let node = el;
      while (node && node !== document.documentElement && parts.length < 5) {
        let part = node.tagName.toLowerCase();
        if (node.id) {
          parts.unshift(part + "#" + node.id);
          break;
        }
        const classes = (node.getAttribute("class") || "")
          .trim()
          .split(/\\s+/)
          .filter(Boolean)
          .slice(0, 2);
        if (classes.length > 0) part += "." + classes.join(".");
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(" > ");
    }

    function calcLinkDensity(el) {
      const total = (el.innerText || "").trim().length;
      if (total === 0) return 1;
      let linkText = 0;
      const anchors = el.querySelectorAll("a");
      for (let i = 0; i < anchors.length; i++) {
        linkText += (anchors[i].textContent || "").trim().length;
      }
      return linkText / total;
    }

    function buildSkeleton() {
      const candidates = Array.from(
        document.querySelectorAll(
          'main, article, nav, aside, header, footer, section, [role="main"], [role="navigation"], [class*="content"], [class*="article"], [class*="post"], [id*="content"], [id*="main"]'
        )
      );
      if (document.body) candidates.push(document.body);
      const seen = new Set();
      const blocks = [];

      for (const el of candidates) {
        if (seen.has(el)) continue;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        seen.add(el);

        const text = (el.innerText || "").trim();
        if (text.length < 50) continue;

        blocks.push({
          index: 0,
          cssPath: cssPathOf(el),
          tag: el.tagName.toLowerCase(),
          className: (el.getAttribute("class") || "").trim().split(/\\s+/).slice(0, 3).join(" "),
          textLength: text.length,
          linkDensity: Math.round(calcLinkDensity(el) * 100) / 100,
          childCount: el.children.length,
          preview: text.slice(0, 100).replace(/\\s+/g, " "),
        });
      }

      blocks.sort((a, b) => b.textLength - a.textLength);
      return blocks.slice(0, 20).map((b, i) => ({ ...b, index: i }));
    }

    function domToMarkdown(node) {
      if (!node) return "";
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || "";
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const el = node;
      const tag = el.tagName.toLowerCase();

      // Ignore scripts, styles, inputs, svgs, comments
      if (["script", "style", "noscript", "svg", "iframe", "canvas"].includes(tag)) {
        return "";
      }

      // Check visibility
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        return "";
      }

      const getChildrenMarkdown = () => {
        let res = "";
        for (let i = 0; i < el.childNodes.length; i++) {
          res += domToMarkdown(el.childNodes[i]);
        }
        return res;
      };

      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1], 10);
        const prefix = "#".repeat(level) + " ";
        return "\\n\\n" + prefix + el.innerText.trim() + "\\n\\n";
      }

      if (tag === "p") {
        const text = getChildrenMarkdown().trim();
        return text ? "\\n\\n" + text + "\\n\\n" : "";
      }

      if (tag === "br") {
        return "\\n";
      }

      if (tag === "hr") {
        return "\\n\\n---\\n\\n";
      }

      if (tag === "pre" || tag === "code") {
        if (tag === "pre") {
          return "\\n\\n\`\`\`\\n" + (el.innerText || "").trim() + "\\n\`\`\`\\n\\n";
        }
        return " \`" + (el.textContent || "").trim() + "\` ";
      }

      if (tag === "blockquote") {
        const text = el.innerText.trim();
        return "\\n\\n> " + text.split("\\n").join("\\n> ") + "\\n\\n";
      }

      if (tag === "ul" || tag === "ol") {
        let listMarkdown = "\\n\\n";
        let index = 1;
        for (let i = 0; i < el.children.length; i++) {
          const li = el.children[i];
          if (li.tagName.toLowerCase() === "li") {
            const prefix = tag === "ol" ? (index++) + ". " : "- ";
            listMarkdown += prefix + (li.innerText || "").trim() + "\\n";
          }
        }
        return listMarkdown + "\\n";
      }

      if (tag === "a") {
        const text = (el.innerText || "").trim();
        const href = el.getAttribute("href") || "";
        if (!text) return "";
        if (!href || href.startsWith("javascript:") || href.startsWith("#")) return text;
        try {
          const absoluteUrl = new URL(href, window.location.href).href;
          return "[" + text + "](" + absoluteUrl + ")";
        } catch {
          return "[" + text + "](" + href + ")";
        }
      }

      if (tag === "strong" || tag === "b") {
        const text = getChildrenMarkdown().trim();
        return text ? " **" + text + "** " : "";
      }

      if (tag === "em" || tag === "i") {
        const text = getChildrenMarkdown().trim();
        return text ? " *" + text + "* " : "";
      }

      if (tag === "table") {
        // Simple plain text table representation
        return "\\n\\n" + (el.innerText || "").trim() + "\\n\\n";
      }

      return getChildrenMarkdown();
    }

    function cleanMarkdown(md) {
      return md
        .replace(/[ \\t]+\\n/g, "\\n")
        .replace(/\\n{3,}/g, "\\n\\n")
        .trim();
    }

    try {
      const blockedReason = detectBlocked();
      if (blockedReason) {
        return { success: false, error: blockedReason };
      }

      const pageUrl = window.location.href;
      const title = (document.title || "").trim();

      // 1. Skeleton mode
      if (params.mode === "skeleton") {
        return {
          success: true,
          title,
          finalUrl: pageUrl,
          skeleton: buildSkeleton(),
        };
      }

      // 2. Targeted selector mode
      if (params.selector) {
        let matched = [];
        try {
          matched = Array.from(document.querySelectorAll(params.selector));
        } catch {}
        if (matched.length > 0) {
          const combined = matched
            .map((el) => cleanMarkdown(domToMarkdown(el)))
            .filter((md) => md.length > 0)
            .join("\\n\\n");

          return {
            success: true,
            title,
            finalUrl: pageUrl,
            markdown: combined.slice(0, cap),
            totalLength: combined.length,
            truncated: combined.length > cap,
            extractedBy: "selector",
          };
        }
      }

      // 3. Auto main content heuristic
      const mainCandidates = Array.from(
        document.querySelectorAll("article, main, [role=\\"main\\"], .article, .post-content, #content, .content")
      );
      const bestMain =
        mainCandidates
          .filter((el) => (el.innerText || "").trim().length > 200 && calcLinkDensity(el) < 0.5)
          .sort((a, b) => (b.innerText || "").length - (a.innerText || "").length)[0] ||
        mainCandidates
          .filter((el) => (el.innerText || "").trim().length > 200)
          .sort((a, b) => (b.innerText || "").length - (a.innerText || "").length)[0];

      const rootEl = bestMain || document.body || document.documentElement;
      const extractedBy = bestMain ? "article" : "full";
      const fullMarkdown = cleanMarkdown(domToMarkdown(rootEl));

      return {
        success: true,
        title,
        finalUrl: pageUrl,
        markdown: fullMarkdown.slice(0, cap),
        totalLength: fullMarkdown.length,
        truncated: fullMarkdown.length > cap,
        extractedBy,
      };
    } catch (err) {
      return {
        success: false,
        error: String(err && err.message ? err.message : err),
      };
    }
  })()`;
}

