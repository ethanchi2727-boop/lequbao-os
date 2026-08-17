import { z } from 'zod';

export const UuidSchema = z.uuid();
export const TenantIdSchema = UuidSchema.brand<'TenantId'>();

// JSON 不原生支持 bigint；金额跨进程统一传非负十进制字符串。
export const MinorCurrencyAmountSchema = z.string().regex(/^(0|[1-9]\d*)$/);

export const EventEnvelopeSchema = z.object({
  eventId: UuidSchema,
  eventType: z.string().min(1).max(120),
  aggregateType: z.string().min(1).max(80),
  aggregateId: UuidSchema,
  tenantId: TenantIdSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  schemaVersion: z.int().positive(),
  idempotencyKey: z.string().min(1).max(255),
  payload: z.record(z.string(), z.unknown()),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export type TenantId = z.infer<typeof TenantIdSchema>;
