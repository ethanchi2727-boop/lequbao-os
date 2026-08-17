import { describe, expect, it, vi } from 'vitest';
import { createMerchantIntakeMessageService } from './merchant-intake-message-service.js';

const identity = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  roleCodes: ['MERCHANT_OWNER'],
  storeIds: [],
  sessionId: 'signed',
};

describe('merchant intake text messages', () => {
  it('stores raw text under a deterministic tenant key before registering an asset', async () => {
    const putText = vi.fn().mockResolvedValue(undefined);
    const addAsset = vi.fn().mockResolvedValue({ id: 'asset' });
    const service = createMerchantIntakeMessageService({ addAsset }, { putText });
    const command = {
      identity,
      idempotencyKey: 'message-1',
      traceId: 'trace-1',
      body: {
        sessionId: '00000000-0000-4000-8000-000000000003',
        content: '  我还需要补充门店电话  ',
        sourceMessageId: 'wecom-1',
      },
    };
    await service.add(command);
    await service.add(command);
    expect(putText.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ content: '我还需要补充门店电话' }),
    );
    expect(putText.mock.calls[1]?.[0].objectKey).toBe(putText.mock.calls[0]?.[0].objectKey);
    expect(addAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ assetType: 'TEXT', sourceMessageId: 'wecom-1' }),
      }),
    );
  });

  it('does not register an asset when durable text storage fails', async () => {
    const addAsset = vi.fn();
    const service = createMerchantIntakeMessageService(
      { addAsset },
      { putText: vi.fn().mockRejectedValue(new Error('offline')) },
    );
    await expect(
      service.add({
        identity,
        idempotencyKey: 'message-2',
        traceId: 'trace-2',
        body: {
          sessionId: '00000000-0000-4000-8000-000000000003',
          content: '补充资料',
        },
      }),
    ).rejects.toThrow('offline');
    expect(addAsset).not.toHaveBeenCalled();
  });
});
