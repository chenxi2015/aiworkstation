/**
 * Utility for cleaning tracking parameters and sanitizing URLs
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'spm',
  'spm_id_from',
  'from',
  'ref',
  'ref_src',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'twclid',
  '_hsenc',
  '_hsmi',
  'mc_cid',
  'mc_eid',
  'feature',
  'si',
  'share_source',
  'share_medium',
]);

/**
 * Strips common analytics, marketing, and affiliate query parameters from a URL
 */
export function cleanUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  try {
    const url = new URL(rawUrl);
    const keysToDelete: string[] = [];

    url.searchParams.forEach((_, key) => {
      const lowerKey = key.toLowerCase();
      if (
        TRACKING_PARAMS.has(lowerKey) ||
        lowerKey.startsWith('utm_') ||
        lowerKey.startsWith('spm_') ||
        lowerKey.startsWith('hsa_')
      ) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => url.searchParams.delete(key));

    // Remove trailing '?' if query string is empty
    let cleaned = url.toString();
    if (cleaned.endsWith('?')) {
      cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
  } catch {
    // If URL parsing fails, return the original string safely
    return rawUrl;
  }
}
