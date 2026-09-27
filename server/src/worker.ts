import { ExecutionContext } from 'hono';
import { createApp } from './app.js';
import { syncEnv } from './config/env.js';

const app = createApp();

interface HyperdriveBinding {
  connectionString: string;
}

export default {
  /**
   * Cloudflare Worker fetch handler entrypoint
   */
  async fetch(
    request: Request,
    envBindings: Record<string, unknown> & { HYPERDRIVE?: HyperdriveBinding },
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Prefer the Hyperdrive-managed connection string when the binding exists.
    // Hyperdrive keeps a global connection pool to Supabase, so workers at the
    // edge don't pay a fresh cross-region TCP handshake per request.
    if (envBindings.HYPERDRIVE?.connectionString) {
      envBindings = { ...envBindings, DATABASE_URL: envBindings.HYPERDRIVE.connectionString };
    }

    // Inject Cloudflare Worker environment variables and bindings into config
    syncEnv(envBindings);

    return app.fetch(request, envBindings, ctx);
  },
};
