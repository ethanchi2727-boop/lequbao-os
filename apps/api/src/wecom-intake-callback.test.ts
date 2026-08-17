import { createCipheriv, createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWeComIntakeCallbackService,
  WeComCallbackAuthenticationError,
  WeComMediaExpiredError,
  type WeComReceiptStore,
} from './wecom-intake-callback.js';

const corpId = 'ww-test-corp';
const token = 'callback-token';
const key = Buffer.alloc(32, 7);
const encodingAesKey = key.toString('base64').replace(/=$/u, '');
const timestamp = '1786989600';
const nonce = 'nonce-1';
const identity = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  roleCodes: ['MERCHANT_OWNER'],
  storeIds: [],
  sessionId: 'wecom-signed',
};

function encrypt(message: string) {
  const body = Buffer.from(message);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const plain = Buffer.concat([Buffer.alloc(16, 3), length, body, Buffer.from(corpId)]);
  const padding = 32 - (plain.length % 32);
  const padded = Buffer.concat([plain, Buffer.alloc(padding, padding)]);
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

function signedXml(message: string) {
  const encrypted = encrypt(message);
  const signature = createHash('sha1')
    .update([token, timestamp, nonce, encrypted].sort().join(''))
    .digest('hex');
  return {
    signature,
    timestamp,
    nonce,
    xml: `<xml><ToUserName><![CDATA[${corpId}]]></ToUserName><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`,
    traceId: 'trace-wecom',
  };
}

function dependencies() {
  const rows = new Map<string, string>();
  const statuses = new Map<string, string>();
  const finish = vi.fn(async ({ eventId, status }) => {
    statuses.set(eventId, status);
  });
  const receipts: WeComReceiptStore = {
    claim: async ({ eventId, payloadHash }) => {
      const existing = rows.get(eventId);
      if (existing === payloadHash && statuses.get(eventId) === 'FAILED') {
        statuses.set(eventId, 'RECEIVED');
        return 'NEW';
      }
      if (existing === payloadHash) return 'REPLAY';
      if (existing) return 'CONFLICT';
      rows.set(eventId, payloadHash);
      statuses.set(eventId, 'RECEIVED');
      return 'NEW';
    },
    finish,
  };
  const add = vi.fn().mockResolvedValue({});
  return {
    add,
    finish,
    base: {
      config: {
        resolveCorp: vi.fn().mockResolvedValue({
          tenantId: identity.tenantId,
          corpId,
          token,
          encodingAesKey,
        }),
        resolveMember: vi.fn().mockResolvedValue({
          identity,
          intakeSessionId: '00000000-0000-4000-8000-000000000003',
        }),
      },
      receipts,
      messages: { add },
    },
  };
}

describe('verified WeCom intake callback', () => {
  beforeEach(() => vi.setSystemTime(new Date(Number(timestamp) * 1000)));
  afterEach(() => vi.useRealTimers());

  it('decrypts a signed internal text message and replays by message ID and payload hash', async () => {
    const deps = dependencies();
    const service = createWeComIntakeCallbackService(deps.base);
    const request = signedXml(
      '<xml><FromUserName><![CDATA[member-1]]></FromUserName><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[补充营业时间]]></Content><MsgId>10001</MsgId></xml>',
    );
    await expect(service.receive(request)).resolves.toEqual({ accepted: true, replayed: false });
    await expect(service.receive(request)).resolves.toEqual({ accepted: true, replayed: true });
    expect(deps.add).toHaveBeenCalledTimes(1);
    expect(deps.add).toHaveBeenCalledWith(
      expect.objectContaining({
        identity,
        idempotencyKey: 'wecom:10001',
        body: expect.objectContaining({ content: '补充营业时间', sourceMessageId: '10001' }),
      }),
    );
  });

  it('rejects a bad signature before resolving a member or writing a receipt', async () => {
    const deps = dependencies();
    const service = createWeComIntakeCallbackService(deps.base);
    const request = signedXml(
      '<xml><FromUserName>member-1</FromUserName><MsgType>text</MsgType><Content>x</Content><MsgId>10002</MsgId></xml>',
    );
    await expect(service.receive({ ...request, signature: '0'.repeat(40) })).rejects.toBeInstanceOf(
      WeComCallbackAuthenticationError,
    );
    expect(deps.add).not.toHaveBeenCalled();
  });

  it('keeps an expired media callback retryable without altering the bound intake session', async () => {
    const deps = dependencies();
    const media = vi.fn().mockRejectedValue(new WeComMediaExpiredError());
    const service = createWeComIntakeCallbackService({ ...deps.base, media });
    const request = signedXml(
      '<xml><FromUserName>member-1</FromUserName><MsgType>image</MsgType><MediaId>expired-media</MediaId><MsgId>10003</MsgId></xml>',
    );
    await expect(service.receive(request)).resolves.toEqual({
      accepted: true,
      replayed: false,
      retryableError: 'WECOM_MEDIA_LINK_EXPIRED',
    });
    await expect(service.receive(request)).resolves.toEqual({
      accepted: true,
      replayed: false,
      retryableError: 'WECOM_MEDIA_LINK_EXPIRED',
    });
    expect(media).toHaveBeenCalledTimes(2);
    expect(deps.add).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: '10003', status: 'FAILED' }),
    );
  });
});
