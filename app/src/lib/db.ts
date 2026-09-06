import { getDatabase } from '@netlify/database';
import pg from 'pg';
import { types as neonTypes } from '@neondatabase/serverless';

// Keep Postgres `date` columns as 'YYYY-MM-DD' strings (like PostgREST did)
// instead of letting the drivers parse them into JS Date objects, which would
// JSON-serialize as full timestamps and change API response shapes.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (v: string) => v);
neonTypes.setTypeParser(DATE_OID, (v: string) => v);

// Server-only Postgres access (Netlify DB). NEVER import this from a
// `client:*` Svelte island — it would try to ship the driver to the browser.
//
// In production Netlify injects NETLIFY_DB_URL into the environment; for
// local `astro dev` we pass it through from .env (Astro only exposes env
// files via import.meta.env, not process.env).
const localUrl = import.meta.env.NETLIFY_DB_URL as string | undefined;

const db = getDatabase(localUrl ? { connectionString: localUrl } : undefined);

// Tagged template: `await sql`select * from t where id = ${id}`` → rows array.
// Helpers: sql.identifier(), sql.values(), sql.raw(), sql.unsafe(), sql.default.
export const sql = db.sql;

// pg-style pool for transactions and dynamically-built queries. Narrowed to
// the query shape we use — pg's full overload union trips TS when the params
// array is a mixed-type unknown[].
export const pool = db.pool as unknown as {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  connect: () => Promise<import('pg').PoolClient>;
};
