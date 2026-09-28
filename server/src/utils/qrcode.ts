import QRCode from 'qrcode';

export interface QrCodeOptions {
  width?: number;
  margin?: number;
}

/**
 * Generate QR code as an SVG Data URL.
 * Works seamlessly across Node.js and Cloudflare Workers (workerd) without canvas or DOM.
 */
export async function generateQrCodeDataUrl(
  text: string,
  options?: QrCodeOptions,
): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin: options?.margin ?? 2,
    width: options?.width ?? 260,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  const base64Svg =
    typeof Buffer !== 'undefined'
      ? Buffer.from(svg).toString('base64')
      : btoa(unescape(encodeURIComponent(svg)));

  return `data:image/svg+xml;base64,${base64Svg}`;
}
