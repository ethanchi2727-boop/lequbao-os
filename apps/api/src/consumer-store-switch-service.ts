import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type {
  ConsumerSessionIdentity,
  ConsumerSessionTokenSigner,
} from './consumer-session-identity.js';

const SwitchStoreSchema = z.object({ storeId: UuidSchema });

type SwitchCommand = {
  identity: ConsumerSessionIdentity;
  idempotencyKey: string;
  body: unknown;
};

export interface ConsumerStoreSwitchService {
  list(identity: ConsumerSessionIdentity): Promise<unknown[]>;
  switch(command: SwitchCommand): Promise<unknown>;
}

export class ConsumerStoreSwitchAuthenticationError extends Error {}
export class ConsumerStoreSwitchNotFoundError extends Error {}
export class ConsumerStoreSwitchConflictError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function createConsumerStoreSwitchService(
  pool: Pick<pg.Pool, 'connect'>,
  signer: ConsumerSessionTokenSigner,
): ConsumerStoreSwitchService {
  async function transaction<T>(
    identity: ConsumerSessionIdentity,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [identity.tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function liveSession(client: pg.PoolClient, identity: ConsumerSessionIdentity) {
    const session = await client.query<{
      auth_subject_hash: string;
      auth_level: 'WECHAT' | 'PHONE_BOUND';
      expires_at: Date | string;
      revoked_at: Date | string | null;
      revoke_reason: string | null;
    }>(
      `SELECT auth_subject_hash,auth_level,expires_at,revoked_at,revoke_reason
         FROM consumer_sessions
        WHERE tenant_id=$1 AND session_id=$2 AND customer_id=$3 AND store_id=$4
        FOR UPDATE`,
      [identity.tenantId, identity.sessionId, identity.customerId, identity.storeId],
    );
    const current = session.rows[0];
    if (!current || new Date(current.expires_at).getTime() <= Date.now())
      throw new ConsumerStoreSwitchAuthenticationError();
    return current;
  }

  return {
    async list(identity) {
      return transaction(identity, async (client) => {
        const session = await liveSession(client, identity);
        if (session.revoked_at) throw new ConsumerStoreSwitchAuthenticationError();
        const stores = await client.query<{
          id: string;
          store_name: string;
          city_code: string | null;
          district_code: string | null;
          opening_hours: unknown;
        }>(
          `SELECT id,store_name,city_code,district_code,opening_hours
             FROM stores WHERE tenant_id=$1 AND status='ACTIVE' ORDER BY store_name,id`,
          [identity.tenantId],
        );
        return stores.rows.map((store) => ({
          id: store.id,
          name: store.store_name,
          cityCode: store.city_code,
          districtCode: store.district_code,
          openingHours: store.opening_hours,
          current: store.id === identity.storeId,
        }));
      });
    },

    async switch(command) {
      const input = SwitchStoreSchema.parse(command.body);
      if (!command.idempotencyKey || command.idempotencyKey.length > 255)
        throw new ConsumerStoreSwitchConflictError('idempotency key is required');
      const replayMarker = `STORE_SWITCH:${digest(command.idempotencyKey).slice(0, 24)}`;
      const newSessionId = `store-switch:${digest(
        `${command.identity.tenantId}:${command.identity.sessionId}:${command.idempotencyKey}`,
      ).slice(0, 48)}`;
      const rotated = await transaction(command.identity, async (client) => {
        const session = await liveSession(client, command.identity);
        if (session.revoked_at) {
          if (session.revoke_reason !== replayMarker)
            throw new ConsumerStoreSwitchAuthenticationError();
          const replay = await client.query<{
            store_id: string;
            auth_level: 'WECHAT' | 'PHONE_BOUND';
            expires_at: Date | string;
            revoked_at: Date | string | null;
          }>(
            `SELECT store_id,auth_level,expires_at,revoked_at FROM consumer_sessions
              WHERE tenant_id=$1 AND session_id=$2 AND customer_id=$3`,
            [command.identity.tenantId, newSessionId, command.identity.customerId],
          );
          const existing = replay.rows[0];
          if (!existing || existing.store_id !== input.storeId || existing.revoked_at)
            throw new ConsumerStoreSwitchConflictError('store switch replay mismatch');
          return {
            identity: {
              ...command.identity,
              storeId: existing.store_id,
              sessionId: newSessionId,
              authLevel: existing.auth_level,
            },
            expiresAt: new Date(existing.expires_at),
          };
        }
        const store = await client.query(
          `SELECT 1 FROM stores WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'`,
          [command.identity.tenantId, input.storeId],
        );
        if (store.rowCount !== 1) throw new ConsumerStoreSwitchNotFoundError();
        if (input.storeId === command.identity.storeId)
          return {
            identity: command.identity,
            expiresAt: new Date(session.expires_at),
          };
        await client.query(
          `INSERT INTO consumer_sessions(
             session_id,tenant_id,customer_id,store_id,auth_subject_hash,auth_level,expires_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            newSessionId,
            command.identity.tenantId,
            command.identity.customerId,
            input.storeId,
            session.auth_subject_hash,
            session.auth_level,
            session.expires_at,
          ],
        );
        await client.query(
          `UPDATE consumer_sessions SET revoked_at=now(),revoke_reason=$3
            WHERE tenant_id=$1 AND session_id=$2 AND revoked_at IS NULL`,
          [command.identity.tenantId, command.identity.sessionId, replayMarker],
        );
        return {
          identity: {
            ...command.identity,
            storeId: input.storeId,
            sessionId: newSessionId,
            authLevel: session.auth_level,
          },
          expiresAt: new Date(session.expires_at),
        };
      });
      return {
        storeId: rotated.identity.storeId,
        accessToken: signer.sign(rotated.identity, Math.floor(rotated.expiresAt.getTime() / 1000)),
        expiresAt: rotated.expiresAt.toISOString(),
      };
    },
  };
}
