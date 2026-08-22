import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createMiniProgramCallbackService,
  MiniProgramCallbackAuthenticationError,
  MiniProgramCallbackUnavailableError,
} from './mini-program-callback.js';

const now = Date.UTC(2026, 7, 18, 4, 0, 0);
const timestamp = String(Math.floor(now / 1000));
const nonce = 'nonce-1';
const token = 'callback-token-at-least-16-bytes';
const encrypted = 'encrypted-provider-payload';
const xml = `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`;
const signature = createHash('sha1')
  .update([token, timestamp, nonce, encrypted].sort().join(''))
  .digest('hex');

const decoded = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  appId: 'wx-app-1',
  providerEventId: 'evt-1',
  eventType: 'REVIEW_APPROVED' as const,
  externalAuditId: 'audit-1',
};

function setup() {
  const putText = vi.fn().mockResolvedValue(undefined);
  const decodeCallback = vi.fn().mockResolvedValue(decoded);
  const handleProviderEvent = vi.fn().mockResolvedValue({});
  return {
    putText,
    decodeCallback,
    handleProviderEvent,
    service: createMiniProgramCallbackService({
      token,
      decoder: { decodeCallback },
      objectStore: { putText },
      lifecycle: { handleProviderEvent },
      now: () => now,
    }),
  };
}

describe('mini-program provider callback boundary', () => {
  it('rejects a forged signature before storing or decoding the payload', async () => {
    const fixture = setup();
    await expect(
      fixture.service.receive({
        signature: '0'.repeat(40),
        timestamp,
        nonce,
        xml,
        traceId: 'trace-1',
      }),
    ).rejects.toBeInstanceOf(MiniProgramCallbackAuthenticationError);
    expect(fixture.putText).not.toHaveBeenCalled();
    expect(fixture.decodeCallback).not.toHaveBeenCalled();
    expect(fixture.handleProviderEvent).not.toHaveBeenCalled();
  });

  it('rejects a stale callback before any side effect', async () => {
    const fixture = setup();
    const staleTimestamp = String(Math.floor((now - 5 * 60_000 - 1) / 1000));
    const staleSignature = createHash('sha1')
      .update([token, staleTimestamp, nonce, encrypted].sort().join(''))
      .digest('hex');
    await expect(
      fixture.service.receive({
        signature: staleSignature,
        timestamp: staleTimestamp,
        nonce,
        xml,
        traceId: 'trace-1',
      }),
    ).rejects.toBeInstanceOf(MiniProgramCallbackAuthenticationError);
    expect(fixture.putText).not.toHaveBeenCalled();
  });

  it('stores the verified encrypted original before decoding and applying the event', async () => {
    const fixture = setup();
    const order: string[] = [];
    fixture.putText.mockImplementation(async () => {
      order.push('stored');
    });
    fixture.decodeCallback.mockImplementation(async () => {
      order.push('decoded');
      return decoded;
    });
    fixture.handleProviderEvent.mockImplementation(async () => {
      order.push('applied');
      return {};
    });

    await expect(
      fixture.service.receive({ signature, timestamp, nonce, xml, traceId: 'trace-1' }),
    ).resolves.toEqual({ accepted: true });
    expect(order).toEqual(['stored', 'decoded', 'applied']);
    expect(fixture.putText).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: expect.stringMatching(
          /^mini-program-callbacks\/2026-08-18\/[a-f0-9]{64}\.xml$/u,
        ),
        content: xml,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
    expect(fixture.handleProviderEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ...decoded,
        traceId: 'trace-1',
        ciphertextHash: createHash('sha256').update(encrypted).digest('hex'),
      }),
    );
  });

  it('does not acknowledge when durable encrypted evidence cannot be written', async () => {
    const fixture = setup();
    fixture.putText.mockRejectedValue(new Error('store unavailable'));
    await expect(
      fixture.service.receive({ signature, timestamp, nonce, xml, traceId: 'trace-1' }),
    ).rejects.toBeInstanceOf(MiniProgramCallbackUnavailableError);
    expect(fixture.decodeCallback).not.toHaveBeenCalled();
    expect(fixture.handleProviderEvent).not.toHaveBeenCalled();
  });
});
