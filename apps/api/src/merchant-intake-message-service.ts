import { createHash } from 'node:crypto';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { IntakeObjectStore } from './intake-object-store.js';
import type { MerchantIntakeService } from './merchant-intake-service.js';
import type { SessionIdentity } from './session-identity.js';

const MessageSchema = z.object({
  sessionId: UuidSchema,
  content: z.string().trim().min(1).max(4000),
  sourceMessageId: z.string().min(1).max(255).nullable().optional(),
});

interface MessageCommand {
  identity: SessionIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
}

export interface MerchantIntakeMessageService {
  add(command: MessageCommand): ReturnType<MerchantIntakeService['addAsset']>;
}

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export function createMerchantIntakeMessageService(
  intake: Pick<MerchantIntakeService, 'addAsset'>,
  objectStore: Pick<IntakeObjectStore, 'putText'>,
): MerchantIntakeMessageService {
  return {
    async add(command) {
      const input = MessageSchema.parse(command.body);
      const contentHash = sha(input.content);
      const stableKey = sha(
        `${command.identity.tenantId}\n${input.sessionId}\n${command.idempotencyKey}`,
      );
      const objectKey = `${command.identity.tenantId}/intake/${input.sessionId}/messages/${stableKey}.txt`;
      await objectStore.putText({ objectKey, content: input.content, sha256: contentHash });
      return intake.addAsset({
        ...command,
        body: {
          sessionId: input.sessionId,
          assetType: 'TEXT',
          sha256: contentHash,
          objectKey,
          mimeType: 'text/plain; charset=utf-8',
          sourceMessageId: input.sourceMessageId,
        },
      });
    },
  };
}
