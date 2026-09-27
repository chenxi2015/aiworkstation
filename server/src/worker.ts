import { ExecutionContext } from 'hono';
import { createApp } from './app.js';
import { env, syncEnv } from './config/env.js';
import { dbContext, type DbRequestContext } from './db/index.js';

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

    // Workers cannot share sockets across requests, so each request runs with
    // its own lazily-created database client (see db/index.ts). The client is
    // closed after the response via waitUntil.
    const dbRequestContext: DbRequestContext = { connectionString: env.DATABASE_URL };
    try {
      return await dbContext.run(dbRequestContext, () => app.fetch(request, envBindings, ctx));
    } finally {
      if (dbRequestContext.client) {
        ctx.waitUntil(dbRequestContext.client.end());
      }
    }
  },
};
