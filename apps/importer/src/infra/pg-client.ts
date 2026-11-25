import { STATE_SCHEMA } from "./pg-state-store.js";

export interface PgClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}


export async function createPgClient(databaseUrl: string): Promise<PgClient> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  // node-postgres ignores ?options= in the connection string, so the schema
  // is pinned here: the Outline database owns public.imports, and the
  // importer state must resolve to kb_importer.imports instead.
  await client.query(`SET search_path TO ${STATE_SCHEMA}, public`);
  return {
    query: async (text: string, params?: unknown[]) => {
      const result = await client.query(text, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[] };
    },
    end: async () => {
      await client.end();
    },
  };
}
