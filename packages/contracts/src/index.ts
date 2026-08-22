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

export const RevenueRightHolderInputSchema = z.object({
  beneficiaryId: UuidSchema,
  shareBps: z.int().min(1).max(7000),
});

export const CreateRevenueRightRequestSchema = z
  .object({
    sourceContractRef: z.string().min(1).max(255),
    startsAt: z.iso.datetime({ offset: true }),
    createdBy: UuidSchema,
    evidence: z.record(z.string(), z.unknown()).default({}),
    holders: z.array(RevenueRightHolderInputSchema).min(1),
  })
  .superRefine((value, context) => {
    const total = value.holders.reduce((sum, holder) => sum + holder.shareBps, 0);
    if (total !== 7000) {
      context.addIssue({
        code: 'custom',
        path: ['holders'],
        message: `active business revenue right must total 7000 bps, got ${total}`,
      });
    }
    if (
      new Set(value.holders.map((holder) => holder.beneficiaryId)).size !== value.holders.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['holders'],
        message: 'beneficiary IDs must be unique within a revenue right',
      });
    }
  });

export const RevenueRightResponseSchema = z.object({
  id: UuidSchema,
  merchantProfileId: UuidSchema,
  status: z.literal('ACTIVE'),
  startsAt: z.iso.datetime({ offset: true }),
  holders: z.array(RevenueRightHolderInputSchema),
});

export type CreateRevenueRightRequest = z.infer<typeof CreateRevenueRightRequestSchema>;
export type RevenueRightResponse = z.infer<typeof RevenueRightResponseSchema>;
