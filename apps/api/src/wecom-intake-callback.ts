import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
import type pg from 'pg';
import type { MerchantIntakeMessageService } from './merchant-intake-message-service.js';
import type { SessionIdentity } from './session-identity.js';

export type WeComTenantConfig = {
  tenantId: string;
  corpId: string;
  token: string;
  encodingAesKey: string;
};

export interface WeComConfigResolver {
  resolveCorp(corpId: string): Promise<WeComTenantConfig | undefined>;
  resolveMember(
    config: WeComTenantConfig,
    memberId: string,
  ): Promise<{ identity: SessionIdentity; intakeSessionId: string } | undefined>;
}

export interface WeComReceiptStore {
  claim(input: {
    tenantId: string;
    eventId: string;
    payloadHash: string;
  }): Promise<'NEW' | 'REPLAY' | 'CONFLICT'>;
  finish(input: {
    tenantId: string;
    eventId: string;
    status: 'PROCESSED' | 'FAILED' | 'REJECTED';
  }): Promise<void>;
}

export class WeComCallbackAuthenticationError extends Error {}
export class WeComCallbackConflictError extends Error {}
export class WeComMediaExpiredError extends Error {}

export interface WeComIntakeCallbackService {
  receive(input: {
    signature: string;
    timestamp: string;
    nonce: string;
    xml: string;
    traceId: string;
  }): Promise<{
    accepted: boolean;
    replayed: boolean;
    retryableError?: string;
  }>;
}

const tag = (xml: string, name: string): string | undefined => {
  const match = new RegExp(
    `<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${name}>`,
    'u',
  ).exec(xml);
  return match?.[1] ?? match?.[2];
};
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function verifyWeComSignature(input: {
  token: string;
  timestamp: string;
  nonce: string;
  encrypted: string;
  signature: string;
}) {
  if (!/^\d{10,13}$/u.test(input.timestamp)) throw new WeComCallbackAuthenticationError();
  const milliseconds = Number(input.timestamp) * (input.timestamp.length === 10 ? 1000 : 1);
  if (!Number.isSafeInteger(milliseconds) || Math.abs(Date.now() - milliseconds) > 5 * 60_000)
    throw new WeComCallbackAuthenticationError('stale callback');
  const expected = createHash('sha1')
    .update([input.token, input.timestamp, input.nonce, input.encrypted].sort().join(''))
    .digest('hex');
  if (!/^[a-f0-9]{40}$/iu.test(input.signature)) throw new WeComCallbackAuthenticationError();
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(input.signature, 'hex')))
    throw new WeComCallbackAuthenticationError();
}

export function decryptWeComMessage(
  encrypted: string,
  encodingAesKey: string,
  expectedCorpId: string,
): string {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (key.length !== 32) throw new WeComCallbackAuthenticationError('invalid AES key');
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
    decipher.setAutoPadding(false);
    const padded = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);
    const padding = padded.at(-1) ?? 0;
    if (padding < 1 || padding > 32) throw new Error('invalid padding');
    const plain = padded.subarray(0, -padding);
    const length = plain.readUInt32BE(16);
    const end = 20 + length;
    if (end > plain.length) throw new Error('invalid length');
    const message = plain.subarray(20, end).toString('utf8');
    if (plain.subarray(end).toString('utf8') !== expectedCorpId) throw new Error('corp mismatch');
    return message;
  } catch (error) {
    if (error instanceof WeComCallbackAuthenticationError) throw error;
    throw new WeComCallbackAuthenticationError(String(error));
  }
}

export function createPostgresWeComReceiptStore(pool: Pick<pg.Pool, 'query'>): WeComReceiptStore {
  return {
    async claim(input) {
      const inserted = await pool.query(
        `INSERT INTO webhook_receipts(
           tenant_id, provider, external_event_id, signature_verified,
           payload_object_key, payload_hash, status, attempt_count
         ) VALUES ($1,'WECOM_INTAKE',$2,true,$3,$4,'RECEIVED',1)
         ON CONFLICT (provider, external_event_id) DO NOTHING RETURNING id`,
        [
          input.tenantId,
          input.eventId,
          `wecom://encrypted/${input.payloadHash}`,
          input.payloadHash,
        ],
      );
      if (inserted.rowCount === 1) return 'NEW';
      const existing = await pool.query<{
        tenant_id: string;
        payload_hash: string;
        status: string;
      }>(
        `SELECT tenant_id, payload_hash, status FROM webhook_receipts
          WHERE provider = 'WECOM_INTAKE' AND external_event_id = $1`,
        [input.eventId],
      );
      const receipt = existing.rows[0];
      if (receipt?.tenant_id !== input.tenantId || receipt.payload_hash !== input.payloadHash)
        return 'CONFLICT';
      if (receipt.status === 'FAILED') {
        const retry = await pool.query(
          `UPDATE webhook_receipts
              SET status = 'RECEIVED', attempt_count = attempt_count + 1, processed_at = NULL
            WHERE tenant_id = $1 AND provider = 'WECOM_INTAKE' AND external_event_id = $2
              AND status = 'FAILED'
          RETURNING id`,
          [input.tenantId, input.eventId],
        );
        if (retry.rowCount === 1) return 'NEW';
      }
      return 'REPLAY';
    },
    async finish(input) {
      await pool.query(
        `UPDATE webhook_receipts SET status = $3, processed_at = now()
          WHERE tenant_id = $1 AND provider = 'WECOM_INTAKE' AND external_event_id = $2`,
        [input.tenantId, input.eventId, input.status],
      );
    },
  };
}

export function createWeComIntakeCallbackService(dependencies: {
  config: WeComConfigResolver;
  receipts: WeComReceiptStore;
  messages: MerchantIntakeMessageService;
  media?: (input: {
    identity: SessionIdentity;
    intakeSessionId: string;
    messageId: string;
    mediaId: string;
    messageType: string;
  }) => Promise<void>;
}): WeComIntakeCallbackService {
  return {
    async receive(input: {
      signature: string;
      timestamp: string;
      nonce: string;
      xml: string;
      traceId: string;
    }) {
      const corpId = tag(input.xml, 'ToUserName');
      const encrypted = tag(input.xml, 'Encrypt');
      if (!corpId || !encrypted) throw new WeComCallbackAuthenticationError();
      const config = await dependencies.config.resolveCorp(corpId);
      if (!config || config.corpId !== corpId) throw new WeComCallbackAuthenticationError();
      verifyWeComSignature({
        token: config.token,
        timestamp: input.timestamp,
        nonce: input.nonce,
        encrypted,
        signature: input.signature,
      });
      const messageXml = decryptWeComMessage(encrypted, config.encodingAesKey, config.corpId);
      const messageId = tag(messageXml, 'MsgId');
      const memberId = tag(messageXml, 'FromUserName');
      const messageType = tag(messageXml, 'MsgType');
      if (!messageId || !memberId || !messageType) throw new WeComCallbackAuthenticationError();
      const member = await dependencies.config.resolveMember(config, memberId);
      if (!member || member.identity.tenantId !== config.tenantId)
        throw new WeComCallbackAuthenticationError();
      const payloadHash = sha256(encrypted);
      const claim = await dependencies.receipts.claim({
        tenantId: config.tenantId,
        eventId: messageId,
        payloadHash,
      });
      if (claim === 'CONFLICT') throw new WeComCallbackConflictError();
      if (claim === 'REPLAY') return { accepted: true, replayed: true };
      try {
        if (messageType === 'text') {
          const content = tag(messageXml, 'Content');
          if (!content) throw new Error('empty text message');
          await dependencies.messages.add({
            identity: member.identity,
            idempotencyKey: `wecom:${messageId}`,
            traceId: input.traceId,
            body: {
              sessionId: member.intakeSessionId,
              content,
              sourceMessageId: messageId,
            },
          });
        } else {
          const mediaId = tag(messageXml, 'MediaId');
          if (!mediaId || !dependencies.media) throw new Error('unsupported message type');
          await dependencies.media({
            identity: member.identity,
            intakeSessionId: member.intakeSessionId,
            messageId,
            mediaId,
            messageType,
          });
        }
        await dependencies.receipts.finish({
          tenantId: config.tenantId,
          eventId: messageId,
          status: 'PROCESSED',
        });
        return { accepted: true, replayed: false };
      } catch (error) {
        await dependencies.receipts.finish({
          tenantId: config.tenantId,
          eventId: messageId,
          status: error instanceof WeComMediaExpiredError ? 'FAILED' : 'REJECTED',
        });
        if (error instanceof WeComMediaExpiredError)
          return { accepted: true, replayed: false, retryableError: 'WECOM_MEDIA_LINK_EXPIRED' };
        throw error;
      }
    },
  };
}
