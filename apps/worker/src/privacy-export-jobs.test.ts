import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { dispatchPrivacyExportJobs } from './privacy-export-jobs.js';

const tenantId = '12000000-0000-4000-8000-000000000001';
const requestId = '12000000-0000-4000-8000-000000000002';

function pool() {
  const statements: Array<[string, unknown[] | undefined]> = [];
  let connection = 0;
  return {
    statements,
    value: {
      connect: async () => {
        connection++;
        return {
          query: async (sql: string, parameters?: unknown[]) => {
            statements.push([sql, parameters]);
            if (sql.includes('RETURNING request.id'))
              return {
                rowCount: 1,
                rows: [
                  {
                    id: requestId,
                    customer_id: '12000000-0000-4000-8000-000000000003',
                    requested_by_session_id: '12000000-0000-4000-8000-000000000004',
                    scope: ['profile', 'conversations'],
                  },
                ],
              };
            return { rowCount: 1, rows: [] };
          },
          release: () => undefined,
        };
      },
      get connectionCount() {
        return connection;
      },
    } as unknown as pg.Pool,
  };
}

describe('privacy export worker', () => {
  it('PRI-001 requests an encrypted 15-minute export and records delivery audit evidence', async () => {
    const fixture = pool();
    const gateway = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        tenantId,
        encryption: 'KMS_ENVELOPE_AES_256_GCM',
        expiresInSeconds: 900,
        deliverToVerifiedSession: true,
      });
      return new Response(
        JSON.stringify({
          objectKey: `${tenantId}/privacy-exports/${requestId}.enc`,
          encryptionKeyRef: 'kms://privacy/key-1',
          expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(),
          encrypted: true,
          deliveryAccepted: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    await expect(
      dispatchPrivacyExportJobs({
        pool: fixture.value,
        tenantId,
        gatewayUrl: 'https://privacy.example.test',
        gatewayToken: 'x'.repeat(32),
        fetch: gateway,
      }),
    ).resolves.toEqual([{ requestId, accepted: true }]);
    expect(
      fixture.statements.some(([sql]) => sql.includes("request_type='VIEW'") && sql.includes('$1')),
    ).toBe(true);
    expect(fixture.statements.some(([sql]) => sql.includes('privacy.export.delivered'))).toBe(true);
    expect(JSON.stringify(fixture.statements)).not.toContain('downloadUrl');
  });

  it('rejects an unencrypted or overlong gateway receipt without marking completion', async () => {
    const fixture = pool();
    const gateway = vi.fn(async () =>
      Response.json({
        objectKey: `${tenantId}/privacy-exports/${requestId}`,
        encryptionKeyRef: 'plain',
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        encrypted: false,
        deliveryAccepted: true,
      }),
    );
    await expect(
      dispatchPrivacyExportJobs({
        pool: fixture.value,
        tenantId,
        gatewayUrl: 'https://privacy.example.test',
        gatewayToken: 'x'.repeat(32),
        fetch: gateway,
      }),
    ).resolves.toEqual([{ requestId, accepted: false }]);
    expect(fixture.statements.some(([sql]) => sql.includes("status='FAILED'"))).toBe(true);
    expect(fixture.statements.some(([sql]) => sql.includes("status='COMPLETED'"))).toBe(false);
  });
});
