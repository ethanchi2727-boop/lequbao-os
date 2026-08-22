import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';

const AddressInputSchema = z.object({
  id: UuidSchema.optional(),
  recipientName: z.string().trim().min(1).max(80),
  mobile: z
    .string()
    .trim()
    .regex(/^1[3-9]\d{9}$/u),
  provinceCode: z.string().min(1).max(20),
  cityCode: z.string().min(1).max(20),
  districtCode: z.string().min(1).max(20),
  addressLine: z.string().trim().min(1).max(300),
  isDefault: z.boolean().default(false),
});

export interface PlatformAddressCipher {
  encrypt(value: string): string;
  decrypt(value: string): string;
}

export interface PlatformAddressService {
  list(identity: LifeConsumerSessionIdentity): Promise<unknown[]>;
  save(identity: LifeConsumerSessionIdentity, input: unknown): Promise<unknown>;
  archive(identity: LifeConsumerSessionIdentity, addressId: string): Promise<void>;
}

export class PlatformAddressAuthenticationError extends Error {}
export class PlatformAddressNotFoundError extends Error {}

export function createPlatformAddressCipher(base64Key: string): PlatformAddressCipher {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32)
    throw new Error('PLATFORM_ADDRESS_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
    },
    decrypt(value) {
      const [version, ivPart, tagPart, ciphertextPart] = value.split('.');
      if (version !== 'v1' || !ivPart || !tagPart || ciphertextPart === undefined)
        throw new Error('unsupported address ciphertext');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextPart, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}

export function createPlatformAddressService(
  pool: Pick<pg.Pool, 'connect'>,
  cipher: PlatformAddressCipher,
): PlatformAddressService {
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
        `SELECT 1
           FROM platform_consumer_sessions session
           JOIN platform_consumer_accounts account ON account.id=session.account_id
          WHERE session.session_id=$1 AND session.account_id=$2
            AND session.revoked_at IS NULL AND session.expires_at>now()
            AND account.status='ACTIVE'`,
        [identity.sessionId, identity.accountId],
      );
      if (session.rowCount !== 1) throw new PlatformAddressAuthenticationError();
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

  const mapAddress = (row: {
    id: string;
    recipient_name_ciphertext: string;
    mobile_ciphertext: string;
    province_code: string;
    city_code: string;
    district_code: string;
    address_ciphertext: string;
    is_default: boolean;
    version: number;
  }) => ({
    id: row.id,
    recipientName: cipher.decrypt(row.recipient_name_ciphertext),
    mobile: cipher.decrypt(row.mobile_ciphertext),
    provinceCode: row.province_code,
    cityCode: row.city_code,
    districtCode: row.district_code,
    addressLine: cipher.decrypt(row.address_ciphertext),
    isDefault: row.is_default,
    version: row.version,
  });

  async function get(client: pg.PoolClient, accountId: string, addressId: string) {
    const result = await client.query<{
      id: string;
      recipient_name_ciphertext: string;
      mobile_ciphertext: string;
      province_code: string;
      city_code: string;
      district_code: string;
      address_ciphertext: string;
      is_default: boolean;
      version: number;
    }>(
      `SELECT id,recipient_name_ciphertext,mobile_ciphertext,province_code,city_code,
              district_code,address_ciphertext,is_default,version
         FROM platform_consumer_addresses
        WHERE account_id=$1 AND id=$2 AND status='ACTIVE'`,
      [accountId, addressId],
    );
    if (!result.rows[0]) throw new PlatformAddressNotFoundError();
    return mapAddress(result.rows[0]);
  }

  return {
    async list(identity) {
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT id,recipient_name_ciphertext,mobile_ciphertext,province_code,city_code,
                  district_code,address_ciphertext,is_default,version
             FROM platform_consumer_addresses
            WHERE account_id=$1 AND status='ACTIVE'
            ORDER BY is_default DESC,updated_at DESC,id`,
          [identity.accountId],
        );
        return result.rows.map(mapAddress);
      });
    },

    async save(identity, rawInput) {
      const input = AddressInputSchema.parse(rawInput);
      return transaction(identity, async (client) => {
        if (input.isDefault)
          await client.query(
            `UPDATE platform_consumer_addresses SET is_default=false,version=version+1,
                    updated_at=now()
              WHERE account_id=$1 AND status='ACTIVE' AND is_default`,
            [identity.accountId],
          );
        const addressId = input.id ?? randomUUID();
        const values = [
          addressId,
          identity.accountId,
          cipher.encrypt(input.recipientName),
          cipher.encrypt(input.mobile),
          input.provinceCode,
          input.cityCode,
          input.districtCode,
          cipher.encrypt(input.addressLine),
          input.isDefault,
        ];
        if (input.id) {
          const updated = await client.query(
            `UPDATE platform_consumer_addresses
                SET recipient_name_ciphertext=$3,mobile_ciphertext=$4,province_code=$5,
                    city_code=$6,district_code=$7,address_ciphertext=$8,is_default=$9,
                    version=version+1,updated_at=now()
              WHERE id=$1 AND account_id=$2 AND status='ACTIVE'`,
            values,
          );
          if (updated.rowCount !== 1) throw new PlatformAddressNotFoundError();
        } else
          await client.query(
            `INSERT INTO platform_consumer_addresses(
               id,account_id,recipient_name_ciphertext,mobile_ciphertext,province_code,city_code,
               district_code,address_ciphertext,is_default
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            values,
          );
        return get(client, identity.accountId, addressId);
      });
    },

    async archive(identity, rawAddressId) {
      const addressId = UuidSchema.parse(rawAddressId);
      await transaction(identity, async (client) => {
        const archived = await client.query(
          `UPDATE platform_consumer_addresses
              SET status='ARCHIVED',is_default=false,version=version+1,updated_at=now()
            WHERE account_id=$1 AND id=$2 AND status='ACTIVE'`,
          [identity.accountId, addressId],
        );
        if (archived.rowCount !== 1) throw new PlatformAddressNotFoundError();
      });
    },
  };
}
