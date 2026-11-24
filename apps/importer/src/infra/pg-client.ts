export interface PgClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export async function createPgClient(databaseUrl: string): Promise<PgClient> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
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
