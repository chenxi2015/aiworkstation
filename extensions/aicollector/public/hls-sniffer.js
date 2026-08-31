/**
 * AI Collector - HLS stream sniffer (MAIN world)
 *
 * Runs in the page's main world to hook fetch / XMLHttpRequest and detect
 * HLS playlist (.m3u8) requests. Detected URLs are relayed to the content
 * script via window.postMessage.
 */
(function () {
  if (window.__aicHlsSnifferInstalled) return;
  window.__aicHlsSnifferInstalled = true;

  var seen = new Set();
  var MAX_SEEN = 500;

  function isHlsUrl(url) {
    return typeof url === 'string' && /\.m3u8(\?|#|$)/i.test(url);
  }

  function report(rawUrl, via) {
    try {
      var abs = new URL(rawUrl, location.href).href;
      if (!isHlsUrl(abs) || seen.has(abs)) return;
      if (seen.size > MAX_SEEN) return;
      seen.add(abs);
      window.postMessage(
        {
          source: 'aic-hls-sniffer',
          type: 'HLS_DETECTED',
          payload: { url: abs, via: via },
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
        if (entries[i].name) report(entries[i].name, 'performance');
      }
    } catch (err) {
      /* ignore */
    }
  }

  scanPerformanceEntries();
  setInterval(scanPerformanceEntries, 5000);
})();
