import pg from 'pg';
import { TenantIdSchema, type TenantId } from '@lequ/contracts';

const { Pool } = pg;

export interface Queryable {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<pg.QueryResult<T>>;
}

export function createPool(connectionString: string): pg.Pool {
  return new Pool({ connectionString, max: 20, idleTimeoutMillis: 30_000 });
}

export async function withTenantTransaction<T>(
  pool: pg.Pool,
  tenantIdInput: string,
  work: (client: pg.PoolClient, tenantId: TenantId) => Promise<T>,
): Promise<T> {
  const tenantId = TenantIdSchema.parse(tenantIdInput);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await work(client, tenantId);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
