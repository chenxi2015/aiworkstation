import { ExecutionContext } from 'hono';
import { createApp } from './app.js';
import { syncEnv } from './config/env.js';
import { seedPlansIfEmpty } from './modules/plans/plans.data.js';

const app = createApp();

let isPlanSeeded = false;

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

    // Lazily seed initial database plans in background on first incoming request
    if (!isPlanSeeded && ctx?.waitUntil) {
      isPlanSeeded = true;
      ctx.waitUntil(
        seedPlansIfEmpty().catch((err) => {
          console.warn('[Cloudflare Worker] Background seedPlans failed:', err);
        }),
      );
    }

    return app.fetch(request, envBindings, ctx);
  },
};
