import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createPlatformAddressCipher,
  createPlatformAddressService,
  PlatformAddressAuthenticationError,
} from './platform-address-service.js';

const accountId = '7e000000-0000-4000-8000-000000000001';
const identity = { accountId, sessionId: 'address-session', authLevel: 'PHONE_BOUND' as const };
const result = (rows: unknown[] = [], rowCount = rows.length) => ({ rows, rowCount });

function fixture(active = true) {
  const cipher = createPlatformAddressCipher(randomBytes(32).toString('base64'));
  let stored: Record<string, unknown> | undefined;
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (sql.startsWith('SELECT 1 FROM platform_consumer_sessions'))
      return active ? result([{ ok: true }]) : result();
    if (sql.startsWith('INSERT INTO platform_consumer_addresses')) {
      stored = {
        id: values?.[0],
        recipient_name_ciphertext: values?.[2],
        mobile_ciphertext: values?.[3],
        province_code: values?.[4],
        city_code: values?.[5],
        district_code: values?.[6],
        address_ciphertext: values?.[7],
        is_default: values?.[8],
        version: 1,
      };
      return result([], 1);
    }
    if (sql.startsWith('SELECT id,recipient_name_ciphertext'))
      return stored ? result([stored]) : result();
    return result([], 1);
  });
  return {
    query,
    service: createPlatformAddressService(
      { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never,
      cipher,
    ),
    stored: () => stored,
  };
}

describe('platform consumer addresses', () => {
  it('encrypts recipient, mobile and street fields at rest and returns only to the owner', async () => {
    const fx = fixture();
    const saved = await fx.service.save(identity, {
      recipientName: '禾木同学',
      mobile: '13812345678',
      provinceCode: '31',
      cityCode: '3101',
      districtCode: '310106',
      addressLine: '南京西路 1688 号',
      isDefault: true,
    });
    expect(saved).toMatchObject({ recipientName: '禾木同学', mobile: '13812345678' });
    expect(JSON.stringify(fx.stored())).not.toContain('13812345678');
    expect(JSON.stringify(fx.stored())).not.toContain('南京西路');
  });

  it('rejects a revoked platform session before address reads', async () => {
    await expect(fixture(false).service.list(identity)).rejects.toBeInstanceOf(
      PlatformAddressAuthenticationError,
    );
  });

  it('rejects malformed encryption keys at startup', () => {
    expect(() => createPlatformAddressCipher('short')).toThrow('32-byte key');
    const key = randomBytes(32).toString('base64');
    expect(() => createPlatformAddressCipher(`${key}!`)).toThrow('canonical base64');
  });
});
