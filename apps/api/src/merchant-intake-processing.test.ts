import { describe, expect, it, vi } from 'vitest';
import {
  createIntakeProcessingOrchestrator,
  type IntakeProcessableAsset,
} from './merchant-intake-processing.js';

const asset: IntakeProcessableAsset = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  assetId: '00000000-0000-4000-8000-000000000002',
  assetType: 'IMAGE',
  objectKey: 'tenant/intake/license.jpg',
  contentType: 'image/jpeg',
  sha256: 'a'.repeat(64),
};

const command = {
  asset,
  processorId: 'processor',
  idempotencyKey: 'process-1',
  traceId: 'trace-1',
};

describe('merchant intake processing boundary', () => {
  it('never sends rejected content to OCR or structured extraction', async () => {
    const recordProcessingResult = vi.fn().mockResolvedValue({});
    const extract = vi.fn();
    const candidates = vi.fn();
    const orchestrator = createIntakeProcessingOrchestrator({
      intake: { recordProcessingResult },
      malware: {
        scan: vi.fn().mockResolvedValue({ verdict: 'REJECTED', errorCode: 'MALWARE_DETECTED' }),
      },
      extractors: {
        IMAGE: { extract },
        DOCUMENT: { extract },
        AUDIO: { extract },
        TEXT: { extract },
      },
      candidates: { extract: candidates },
    });
    await orchestrator.process(command);
    expect(extract).not.toHaveBeenCalled();
    expect(candidates).not.toHaveBeenCalled();
    expect(recordProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ securityStatus: 'REJECTED' }) }),
    );
  });

  it('routes safe content through the asset-specific extractor and preserves candidates', async () => {
    const recordProcessingResult = vi.fn().mockResolvedValue({});
    const image = vi.fn().mockResolvedValue({ text: '执照内容', sourceMap: { page: 1 } });
    const structured = vi.fn().mockResolvedValue({
      candidates: [
        {
          fieldPath: 'merchant.legal_subject_name',
          candidateValue: '测试商户',
          confidence: 0.99,
        },
      ],
      missingItems: [],
      impactTargets: ['GEO'],
    });
    const orchestrator = createIntakeProcessingOrchestrator({
      intake: { recordProcessingResult },
      malware: { scan: vi.fn().mockResolvedValue({ verdict: 'SAFE' }) },
      extractors: {
        IMAGE: { extract: image },
        DOCUMENT: { extract: vi.fn() },
        AUDIO: { extract: vi.fn() },
        TEXT: { extract: vi.fn() },
      },
      candidates: { extract: structured },
    });
    await orchestrator.process(command);
    expect(image).toHaveBeenCalledWith(asset);
    expect(recordProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ securityStatus: 'SAFE', impactTargets: ['GEO'] }),
      }),
    );
  });

  it('records a retryable failure without inventing candidates', async () => {
    const recordProcessingResult = vi.fn().mockResolvedValue({});
    const orchestrator = createIntakeProcessingOrchestrator({
      intake: { recordProcessingResult },
      malware: { scan: vi.fn().mockResolvedValue({ verdict: 'SAFE' }) },
      extractors: {
        IMAGE: { extract: vi.fn().mockRejectedValue(new TypeError('offline')) },
        DOCUMENT: { extract: vi.fn() },
        AUDIO: { extract: vi.fn() },
        TEXT: { extract: vi.fn() },
      },
      candidates: { extract: vi.fn() },
    });
    await orchestrator.process(command);
    expect(recordProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          assetId: asset.assetId,
          securityStatus: 'FAILED',
          errorCode: 'EXTRACTION_FAILED:TypeError',
        },
      }),
    );
  });
});
