import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';

let queryClient: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Get or initialize database connection
 */
export function getDb() {
  if (!dbInstance) {
    queryClient = postgres(env.DATABASE_URL, {
      // Each Worker isolate keeps its own pool; keep it small so many isolates
      // don't exhaust the upstream (Hyperdrive / Supavisor) connection budget.
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // Supabase transaction pooler (port 6543) and Hyperdrive both require
      // prepared statements to be disabled.
      prepare: false,
      onnotice: () => {}, // Suppress notice logs
    });
    dbInstance = drizzle(queryClient, { schema });
  }
  return dbInstance;
}

export { schema };
