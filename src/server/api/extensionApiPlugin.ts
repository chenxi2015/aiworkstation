import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { setCorsHeaders } from './utils.ts';

type ApiHandler = (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<void> | void;

interface RouteDefinition {
  path: string;
  exact?: boolean;
  handler: ApiHandler;
}

/**
 * Standard Route Table for extension APIs.
 * Handlers are dynamically imported so editing handler business code
 * will NOT trigger full Vite dev server restarts.
 */
const routes: RouteDefinition[] = [
  {
    path: '/api/collect',
    exact: true,
    handler: async (req, res) => {
      const { handleCollectRequest } = await import('./handlers/collectHandler.ts');
      return handleCollectRequest(req, res);
    },
  },
  {
    path: '/api/video-tasks',
    exact: false,
    handler: async (req, res, pathname) => {
      const { handleVideoTasksRequest } = await import('./handlers/videoTasksHandler.ts');
      return handleVideoTasksRequest(req, res, pathname);
    },
  },
];

function matchRoute(pathname: string, route: RouteDefinition): boolean {
  if (route.exact) return pathname === route.path;
  return pathname === route.path || pathname.startsWith(`${route.path}/`);
}

/**
 * Vite plugin that mounts API middleware for the AI Collector Chrome Extension
 */
export function extensionApiPlugin(): Plugin {
  return {
    name: 'extension-collector-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const fullUrl = req.url || '';
        const pathname = fullUrl.split('?')[0];

        // 1. Match route from declarative table
        const matched = routes.find((r) => matchRoute(pathname, r));
        if (!matched) {
          return next();
        }

        // 2. Set CORS headers for Chrome Extension
        setCorsHeaders(res);

        if (req.method === 'OPTIONS' || req.method === 'HEAD') {
          res.statusCode = 204;
          res.end();
          return;
        }

        // 3. Dispatch to handler
        await matched.handler(req, res, pathname);
      });
    },
  };
}
