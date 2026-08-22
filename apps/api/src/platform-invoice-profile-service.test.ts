import { describe, expect, it, vi } from 'vitest';
import {
  createPlatformInvoiceProfileService,
  PlatformInvoiceProfileAuthenticationError,
  PlatformInvoiceProfileNotFoundError,
} from './platform-invoice-profile-service.js';

const identity = {
  accountId: 'bf000000-0000-4000-8000-000000000001',
  sessionId: 'invoice-session',
  authLevel: 'PHONE_BOUND' as const,
};
const profileId = 'bf000000-0000-4000-8000-000000000002';

function fixture(options: { active?: boolean; owned?: boolean } = {}) {
  const query = vi.fn(async (rawSql: string) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (
      sql === 'BEGIN' ||
      sql === 'COMMIT' ||
      sql === 'ROLLBACK' ||
      sql.startsWith('SELECT set_config')
    )
      return { rows: [], rowCount: 0 };
    if (sql.includes('FROM platform_consumer_sessions'))
      return options.active === false
        ? { rows: [], rowCount: 0 }
        : { rows: [{ ok: true }], rowCount: 1 };
    if (sql.startsWith('SELECT 1 FROM platform_invoice_profiles'))
      return options.owned === false
        ? { rows: [], rowCount: 0 }
        : { rows: [{ ok: true }], rowCount: 1 };
    if (sql.startsWith('SELECT id,profile_type'))
      return {
        rows: [
          {
            id: profileId,
            profile_type: 'ENTERPRISE',
            title_ciphertext: 'cipher:乐趣公司',
            tax_identifier_ciphertext: 'cipher:TAX12345',
            email_ciphertext: 'cipher:invoice@example.com',
            is_default: true,
            version: 1,
          },
        ],
        rowCount: 1,
      };
    if (sql.startsWith('UPDATE platform_invoice_profiles')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const cipher = {
    encrypt: vi.fn((value: string) => `cipher:${value}`),
    decrypt: vi.fn((value: string) => value.replace(/^cipher:/u, '')),
  };
  return {
    query,
    cipher,
    service: createPlatformInvoiceProfileService(
      { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never,
      cipher,
    ),
  };
}

describe('platform invoice profiles', () => {
  it('decrypts profiles only after a live account session check', async () => {
    const { service } = fixture();
    await expect(service.list(identity)).resolves.toEqual([
      expect.objectContaining({ title: '乐趣公司', taxIdentifier: 'TAX12345', isDefault: true }),
    ]);
  });

  it('encrypts enterprise title, tax identifier and email before persistence', async () => {
    const { service, cipher } = fixture();
    await service.save(identity, {
      id: profileId,
      profileType: 'ENTERPRISE',
      title: '乐趣公司',
      taxIdentifier: 'TAX12345',
      email: 'invoice@example.com',
      isDefault: true,
    });
    expect(cipher.encrypt).toHaveBeenCalledWith('乐趣公司');
    expect(cipher.encrypt).toHaveBeenCalledWith('TAX12345');
    expect(cipher.encrypt).toHaveBeenCalledWith('invoice@example.com');
  });

  it('rejects a revoked session before reading invoice ciphertext', async () => {
    const { service } = fixture({ active: false });
    await expect(service.list(identity)).rejects.toBeInstanceOf(
      PlatformInvoiceProfileAuthenticationError,
    );
  });

  it('does not update a cross-account invoice profile', async () => {
    const { service } = fixture({ owned: false });
    await expect(
      service.save(identity, {
        id: profileId,
        profileType: 'PERSONAL',
        title: '个人',
      }),
    ).rejects.toBeInstanceOf(PlatformInvoiceProfileNotFoundError);
  });
});
