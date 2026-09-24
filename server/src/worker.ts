import { ExecutionContext } from 'hono';
import { createApp } from './app.js';
import { syncEnv } from './config/env.js';

const app = createApp();

export default {
  /**
   * Cloudflare Worker fetch handler entrypoint
   */
  async fetch(
    request: Request,
    envBindings: Record<string, unknown>,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Inject Cloudflare Worker environment variables and bindings into config
    syncEnv(envBindings);

    return app.fetch(request, envBindings, ctx);
  },
};
