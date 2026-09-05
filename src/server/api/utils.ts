import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Sets standardized CORS headers for Chrome Extension cross-origin requests
 */
export function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Sends a JSON response with status code and Content-Type header
 */
export function sendJson(res: ServerResponse, data: any, status = 200): void {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

/**
 * Reads and parses JSON body from IncomingMessage
 */
export function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        resolve(parsed as T);
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}
