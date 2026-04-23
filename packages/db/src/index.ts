// packages/db/src/index.ts
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export * from './schema';

/**
 * Create a Drizzle db client.
 *
 * Call this once per process (web server, worker) and share the
 * instance. The underlying `postgres-js` driver handles connection
 * pooling; we expose `max` and `idleTimeout` as the two knobs most
 * worth tuning.
 */
export function createDbClient(options: {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly idleTimeoutSeconds?: number;
}): PostgresJsDatabase<typeof schema> {
  const sql = postgres(options.connectionString, {
    max: options.maxConnections ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    prepare: false,
  });
  return drizzle(sql, { schema });
}

export type Db = PostgresJsDatabase<typeof schema>;
