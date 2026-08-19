import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';
import type { PlatformAddressCipher } from './platform-address-service.js';

const InvoiceProfileSchema = z
  .object({
    id: UuidSchema.optional(),
    profileType: z.enum(['PERSONAL', 'ENTERPRISE']),
    title: z.string().trim().min(1).max(200),
    taxIdentifier: z.string().trim().min(5).max(80).optional(),
    email: z.string().trim().email().max(255).optional(),
    isDefault: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.profileType === 'ENTERPRISE' && !value.taxIdentifier)
      context.addIssue({ code: 'custom', path: ['taxIdentifier'], message: 'required' });
    if (value.profileType === 'PERSONAL' && value.taxIdentifier)
      context.addIssue({ code: 'custom', path: ['taxIdentifier'], message: 'not allowed' });
  });

export interface PlatformInvoiceProfileService {
  list(identity: LifeConsumerSessionIdentity): Promise<unknown[]>;
  save(identity: LifeConsumerSessionIdentity, input: unknown): Promise<unknown>;
  archive(identity: LifeConsumerSessionIdentity, profileId: string): Promise<void>;
}

export class PlatformInvoiceProfileAuthenticationError extends Error {}
export class PlatformInvoiceProfileNotFoundError extends Error {}

export function createPlatformInvoiceProfileService(
  pool: Pick<pg.Pool, 'connect'>,
  cipher: PlatformAddressCipher,
): PlatformInvoiceProfileService {
  async function transaction<T>(
    identity: LifeConsumerSessionIdentity,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
        identity.accountId,
      ]);
      const session = await client.query(
        `SELECT 1 FROM platform_consumer_sessions session
          JOIN platform_consumer_accounts account ON account.id=session.account_id
         WHERE session.session_id=$1 AND session.account_id=$2
           AND session.revoked_at IS NULL AND session.expires_at>now()
           AND account.status='ACTIVE'`,
        [identity.sessionId, identity.accountId],
      );
      if (session.rowCount !== 1) throw new PlatformInvoiceProfileAuthenticationError();
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

  const map = (row: {
    id: string;
    profile_type: 'PERSONAL' | 'ENTERPRISE';
    title_ciphertext: string;
    tax_identifier_ciphertext: string | null;
    email_ciphertext: string | null;
    is_default: boolean;
    version: number;
  }) => ({
    id: row.id,
    profileType: row.profile_type,
    title: cipher.decrypt(row.title_ciphertext),
    taxIdentifier: row.tax_identifier_ciphertext
      ? cipher.decrypt(row.tax_identifier_ciphertext)
      : null,
    email: row.email_ciphertext ? cipher.decrypt(row.email_ciphertext) : null,
    isDefault: row.is_default,
    version: row.version,
  });

  async function load(client: pg.PoolClient, accountId: string, id: string) {
    const result = await client.query<{
      id: string;
      profile_type: 'PERSONAL' | 'ENTERPRISE';
      title_ciphertext: string;
      tax_identifier_ciphertext: string | null;
      email_ciphertext: string | null;
      is_default: boolean;
      version: number;
    }>(
      `SELECT id,profile_type,title_ciphertext,tax_identifier_ciphertext,email_ciphertext,
              is_default,version FROM platform_invoice_profiles
        WHERE account_id=$1 AND id=$2 AND status='ACTIVE'`,
      [accountId, id],
    );
    if (!result.rows[0]) throw new PlatformInvoiceProfileNotFoundError();
    return map(result.rows[0]);
  }

  return {
    async list(identity) {
      return transaction(identity, async (client) => {
        const result = await client.query<{
          id: string;
          profile_type: 'PERSONAL' | 'ENTERPRISE';
          title_ciphertext: string;
          tax_identifier_ciphertext: string | null;
          email_ciphertext: string | null;
          is_default: boolean;
          version: number;
        }>(
          `SELECT id,profile_type,title_ciphertext,tax_identifier_ciphertext,email_ciphertext,
                  is_default,version FROM platform_invoice_profiles
            WHERE account_id=$1 AND status='ACTIVE' ORDER BY is_default DESC,updated_at DESC,id`,
          [identity.accountId],
        );
        return result.rows.map(map);
      });
    },

    async save(identity, rawInput) {
      const input = InvoiceProfileSchema.parse(rawInput);
      return transaction(identity, async (client) => {
        const id = input.id ?? randomUUID();
        if (input.id) {
          const owned = await client.query(
            `SELECT 1 FROM platform_invoice_profiles
              WHERE account_id=$1 AND id=$2 AND status='ACTIVE' FOR UPDATE`,
            [identity.accountId, id],
          );
          if (owned.rowCount !== 1) throw new PlatformInvoiceProfileNotFoundError();
        }
        if (input.isDefault)
          await client.query(
            `UPDATE platform_invoice_profiles SET is_default=false,updated_at=now(),version=version+1
              WHERE account_id=$1 AND status='ACTIVE' AND is_default AND id<>$2`,
            [identity.accountId, id],
          );
        await client.query(
          `INSERT INTO platform_invoice_profiles(
             id,account_id,profile_type,title_ciphertext,tax_identifier_ciphertext,
             email_ciphertext,is_default
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (account_id,id) DO UPDATE SET
             profile_type=EXCLUDED.profile_type,title_ciphertext=EXCLUDED.title_ciphertext,
             tax_identifier_ciphertext=EXCLUDED.tax_identifier_ciphertext,
             email_ciphertext=EXCLUDED.email_ciphertext,is_default=EXCLUDED.is_default,
             version=platform_invoice_profiles.version+1,updated_at=now()`,
          [
            id,
            identity.accountId,
            input.profileType,
            cipher.encrypt(input.title),
            input.taxIdentifier ? cipher.encrypt(input.taxIdentifier) : null,
            input.email ? cipher.encrypt(input.email) : null,
            input.isDefault,
          ],
        );
        return load(client, identity.accountId, id);
      });
    },

    async archive(identity, rawProfileId) {
      const profileId = UuidSchema.parse(rawProfileId);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `UPDATE platform_invoice_profiles
              SET status='ARCHIVED',is_default=false,version=version+1,updated_at=now()
            WHERE account_id=$1 AND id=$2 AND status='ACTIVE'`,
          [identity.accountId, profileId],
        );
        if (result.rowCount !== 1) throw new PlatformInvoiceProfileNotFoundError();
      });
    },
  };
}
