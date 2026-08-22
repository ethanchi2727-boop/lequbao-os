import { createHash, timingSafeEqual } from 'node:crypto';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { IntakeObjectStore } from './intake-object-store.js';
import type {
  MiniProgramLifecycleService,
  MiniProgramProviderEvent,
} from './mini-program-lifecycle-service.js';

const DecodedEventSchema = z.object({
  tenantId: UuidSchema,
  appId: z.string().min(1).max(128),
  providerEventId: z.string().min(1).max(255),
  eventType: z.enum(['AUTH_REVOKED', 'REVIEW_APPROVED', 'REVIEW_REJECTED']),
  externalAuditId: z.string().min(1).max(255).optional(),
  reasonCode: z.string().min(1).max(120).optional(),
  reasonSummary: z.string().min(1).max(1000).optional(),
});

export type MiniProgramDecodedProviderEvent = z.infer<typeof DecodedEventSchema>;

export interface MiniProgramCallbackDecoder {
  decodeCallback(input: {
    encrypted: string;
    timestamp: string;
    nonce: string;
    traceId: string;
  }): Promise<MiniProgramDecodedProviderEvent>;
}

export interface MiniProgramCallbackService {
  receive(input: {
    signature: string;
    timestamp: string;
    nonce: string;
    xml: string;
    traceId: string;
  }): Promise<{ accepted: true }>;
}

export class MiniProgramCallbackAuthenticationError extends Error {}
export class MiniProgramCallbackUnavailableError extends Error {}

const xmlTag = (xml: string, name: string): string | undefined => {
  const match = new RegExp(
    `<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${name}>`,
    'u',
  ).exec(xml);
  return match?.[1] ?? match?.[2];
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function verifyMiniProgramCallbackSignature(input: {
  token: string;
  timestamp: string;
  nonce: string;
  encrypted: string;
  signature: string;
  now?: number;
}) {
  if (!/^\d{10,13}$/u.test(input.timestamp)) throw new MiniProgramCallbackAuthenticationError();
  const milliseconds = Number(input.timestamp) * (input.timestamp.length === 10 ? 1000 : 1);
  if (
    !Number.isSafeInteger(milliseconds) ||
    Math.abs((input.now ?? Date.now()) - milliseconds) > 5 * 60_000
  )
    throw new MiniProgramCallbackAuthenticationError('stale callback');
  if (!/^[a-f0-9]{40}$/iu.test(input.signature)) throw new MiniProgramCallbackAuthenticationError();
  const expected = createHash('sha1')
    .update([input.token, input.timestamp, input.nonce, input.encrypted].sort().join(''))
    .digest();
  const actual = Buffer.from(input.signature, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual))
    throw new MiniProgramCallbackAuthenticationError();
}

export function createMiniProgramCallbackService(options: {
  token: string;
  decoder: MiniProgramCallbackDecoder;
  objectStore: Pick<IntakeObjectStore, 'putText'>;
  lifecycle: Pick<MiniProgramLifecycleService, 'handleProviderEvent'>;
  now?: () => number;
}): MiniProgramCallbackService {
  if (Buffer.byteLength(options.token, 'utf8') < 16)
    throw new Error('MINI_PROGRAM_CALLBACK_TOKEN must contain at least 16 bytes');
  return {
    async receive(input) {
      const encrypted = xmlTag(input.xml, 'Encrypt');
      if (!encrypted) throw new MiniProgramCallbackAuthenticationError();
      verifyMiniProgramCallbackSignature({
        token: options.token,
        timestamp: input.timestamp,
        nonce: input.nonce,
        encrypted,
        signature: input.signature,
        ...(options.now ? { now: options.now() } : {}),
      });

      const ciphertextHash = sha256(encrypted);
      const xmlHash = sha256(input.xml);
      const day = new Date(options.now?.() ?? Date.now()).toISOString().slice(0, 10);
      const objectKey = `mini-program-callbacks/${day}/${xmlHash}.xml`;
      try {
        await options.objectStore.putText({ objectKey, content: input.xml, sha256: xmlHash });
      } catch {
        throw new MiniProgramCallbackUnavailableError('encrypted callback evidence unavailable');
      }

      let decoded: MiniProgramDecodedProviderEvent;
      try {
        decoded = DecodedEventSchema.parse(
          await options.decoder.decodeCallback({
            encrypted,
            timestamp: input.timestamp,
            nonce: input.nonce,
            traceId: input.traceId,
          }),
        );
      } catch {
        throw new MiniProgramCallbackUnavailableError('callback decoder unavailable');
      }
      const event: MiniProgramProviderEvent = {
        tenantId: decoded.tenantId,
        appId: decoded.appId,
        providerEventId: decoded.providerEventId,
        eventType: decoded.eventType,
        ...(decoded.externalAuditId ? { externalAuditId: decoded.externalAuditId } : {}),
        ...(decoded.reasonCode ? { reasonCode: decoded.reasonCode } : {}),
        ...(decoded.reasonSummary ? { reasonSummary: decoded.reasonSummary } : {}),
        ciphertextHash,
        encryptedPayloadObjectRef: objectKey,
        receivedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
        traceId: input.traceId,
      };
      await options.lifecycle.handleProviderEvent(event);
      return { accepted: true };
    },
  };
}
