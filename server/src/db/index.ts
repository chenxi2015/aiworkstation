import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let queryClient: postgres.Sql | null = null;
let dbInstance: Db | null = null;

const CLIENT_OPTIONS: postgres.Options<Record<string, never>> = {
  // Each Worker isolate / request keeps its own small pool so many isolates
  // don't exhaust the upstream (Hyperdrive / Supavisor) connection budget.
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
  // Supabase transaction pooler (port 6543) and Hyperdrive both require
  // prepared statements to be disabled.
  prepare: false,
  onnotice: () => {}, // Suppress notice logs
};

/**
 * Per-request database context for Cloudflare Workers.
 *
 * Workers forbid sharing I/O objects (TCP sockets) created inside one request
 * handler with another request ("Cannot perform I/O on behalf of a different
 * request"). So in Worker mode every request gets its own lazily-created
 * postgres client, tracked here and closed via ctx.waitUntil() in worker.ts.
 */
export interface DbRequestContext {
  connectionString: string;
  client?: postgres.Sql;
  db?: Db;
}

export const dbContext = new AsyncLocalStorage<DbRequestContext>();

function createDb(connectionString: string): { client: postgres.Sql; db: Db } {
  const client = postgres(connectionString, CLIENT_OPTIONS);
  return { client, db: drizzle(client, { schema }) };
}

/**
 * Get or initialize database connection
 */
export function getDb() {
  const requestContext = dbContext.getStore();
  if (requestContext) {
    if (!requestContext.db) {
      const { client, db } = createDb(requestContext.connectionString);
      requestContext.client = client;
      requestContext.db = db;
    }
    return requestContext.db;
  }

  // Long-running Node.js server mode: a shared pool across requests is fine.
  if (!dbInstance) {
    const { client, db } = createDb(env.DATABASE_URL);
    queryClient = client;
    dbInstance = db;
  }
  return dbInstance;
}

export { schema };
