/**
 * AI Collector - video stream sniffer (MAIN world)
 *
 * Runs in the page's main world to hook fetch / XMLHttpRequest and detect
 * HLS playlist (.m3u8) and progressive video file (.mp4/.webm/...) requests.
 * Detected URLs are relayed to the content script via window.postMessage.
 */
(function () {
  if (window.__aicHlsSnifferInstalled) return;
  window.__aicHlsSnifferInstalled = true;

  var seen = new Set();
  var MAX_SEEN = 500;

  function isHlsUrl(url) {
    return typeof url === 'string' && /\.m3u8(\?|#|$)/i.test(url);
  }

  function isVideoFileUrl(url) {
    return typeof url === 'string' && /\.(mp4|webm|mov|m4v|flv)(\?|#|$)/i.test(url);
  }

  // CDNs that serve progressive video over MSE / range fetches
  var KNOWN_VIDEO_CDN_RE = /(^|\.)(douyinvod\.com|douyincdn\.com|xhscdn\.com)$/i;

  function isKnownVideoCdn(url) {
    try {
      return KNOWN_VIDEO_CDN_RE.test(new URL(url).hostname);
    } catch (err) {
      return false;
    }
  }

  function report(rawUrl, via) {
    try {
      var abs = new URL(rawUrl, location.href).href;
      var kind = isHlsUrl(abs) ? 'hls' : isVideoFileUrl(abs) ? 'file' : null;
      if (!kind || seen.has(abs)) return;
      // fetch/xhr hits of video files are usually MSE fragments; only known
      // video CDNs (Xiaohongshu/Douyin) serve whole files that way
      if (kind === 'file' && (via === 'fetch' || via === 'xhr') && !isKnownVideoCdn(abs)) return;
      if (seen.size > MAX_SEEN) return;
      seen.add(abs);
      window.postMessage(
        {
          source: 'aic-hls-sniffer',
          type: 'HLS_DETECTED',
          payload: { url: abs, via: via, kind: kind },
        },
        '*',
      );
    } catch (err) {
      /* ignore */
    }
  }

  // Hook window.fetch
  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : input && input.url;
        if (url) report(url, 'fetch');
      } catch (err) {
        /* ignore */
      }
      return origFetch.apply(this, arguments);
    };
  }

  // Hook XMLHttpRequest.open
  try {
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        if (url) report(String(url), 'xhr');
      } catch (err) {
        /* ignore */
      }
      return origOpen.apply(this, arguments);
    };
  } catch (err) {
    /* ignore */
  }

  // Passive scan of the resource timing buffer. Catches playlists that were
  // requested before this script was injected (content scripts run late).
  function scanPerformanceEntries() {
    try {
      var entries = performance.getEntriesByType('resource') || [];
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry.name) continue;
        // For progressive video files, only trust <video> element loads.
        // fetch/xhr hits of .mp4 are typically MSE fragments of an HLS/DASH
        // stream and would flood the list with per-segment entries.
        if (
          !isHlsUrl(entry.name) &&
          entry.initiatorType !== 'video' &&
          !isKnownVideoCdn(entry.name)
        )
          continue;
        report(entry.name, 'performance');
      }
    } catch (err) {
      /* ignore */
    }
  }

  // Listen for reset and rescan command from content script
  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data) return;
    if (event.data.source === 'aic-content' && event.data.type === 'RESCAN_HLS_STREAMS') {
      seen.clear();
      scanPerformanceEntries();
    }
  });

  scanPerformanceEntries();
  setInterval(scanPerformanceEntries, 5000);
})();
