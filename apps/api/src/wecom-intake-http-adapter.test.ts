import { describe, expect, it, vi } from 'vitest';
import { createHttpWeComConfigResolver } from './wecom-intake-http-adapter.js';

const tenantId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const storeId = '10000000-0000-4000-8000-000000000003';
const intakeSessionId = '10000000-0000-4000-8000-000000000004';
const encodingAesKey = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

describe('multi-tenant WeCom configuration adapter', () => {
  it('resolves the corp and member without a static tenant binding', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tenantId, corpId: 'corp-1', token: 'callback', encodingAesKey }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            userId,
            roleCodes: ['MERCHANT_OWNER'],
            storeIds: [storeId],
            sessionId: 'wecom:member-1',
            intakeSessionId,
          }),
        ),
      );
    const resolver = createHttpWeComConfigResolver({
      baseUrl: 'https://identity.example/',
      serviceToken: 'configuration-token',
      fetch: request,
    });
    const config = await resolver.resolveCorp('corp-1');
    await expect(resolver.resolveMember(config!, 'member-1')).resolves.toEqual({
      identity: {
        tenantId,
        userId,
        roleCodes: ['MERCHANT_OWNER'],
        storeIds: [storeId],
        sessionId: 'wecom:member-1',
      },
      intakeSessionId,
    });
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      'https://identity.example/v1/wecom/corps/corp-1',
      'https://identity.example/v1/wecom/corps/corp-1/members/member-1',
    ]);
  });

  it('fails closed on cross-corp responses and returns no member for a trusted 404', async () => {
    const mismatch = createHttpWeComConfigResolver({
      baseUrl: 'https://identity.example',
      serviceToken: 'configuration-token',
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              tenantId,
              corpId: 'corp-attacker',
              token: 'callback',
              encodingAesKey,
            }),
          ),
      ),
    });
    await expect(mismatch.resolveCorp('corp-1')).rejects.toThrow(/corp mismatch/u);

    const missing = createHttpWeComConfigResolver({
      baseUrl: 'https://identity.example',
      serviceToken: 'configuration-token',
      fetch: vi.fn(async () => new Response(null, { status: 404 })),
    });
    await expect(
      missing.resolveMember({ tenantId, corpId: 'corp-1', token: 'x', encodingAesKey }, 'unknown'),
    ).resolves.toBeUndefined();
  });

  it('requires HTTPS and a nontrivial service credential', () => {
    expect(() =>
      createHttpWeComConfigResolver({
        baseUrl: 'http://identity.example',
        serviceToken: 'long-enough-token',
      }),
    ).toThrow(/HTTPS/u);
    expect(() =>
      createHttpWeComConfigResolver({ baseUrl: 'https://identity.example', serviceToken: 'short' }),
    ).toThrow(/at least 16 bytes/u);
  });
});
