import type { MerchantIntakeService } from './merchant-intake-service.js';

export type IntakeProcessableAsset = {
  tenantId: string;
  assetId: string;
  assetType: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'TEXT';
  objectKey: string;
  contentType: string | null;
  sha256: string;
};

export type ExtractedCandidate = {
  fieldPath: string;
  candidateValue: unknown;
  confidence?: number | null;
};

export interface MalwareScanner {
  scan(
    asset: IntakeProcessableAsset,
  ): Promise<
    | { verdict: 'SAFE' }
    | { verdict: 'REJECTED'; errorCode: string }
    | { verdict: 'FAILED'; errorCode: string }
  >;
}

export interface ContentExtractor {
  extract(asset: IntakeProcessableAsset): Promise<{ text: string; sourceMap?: unknown }>;
}

export interface StructuredCandidateExtractor {
  extract(input: { asset: IntakeProcessableAsset; text: string; sourceMap?: unknown }): Promise<{
    candidates: ExtractedCandidate[];
    missingItems: string[];
    impactTargets: Array<'MINI_PROGRAM' | 'GEO' | 'AI_SERVICE' | 'PRODUCT' | 'GROUP_BUY'>;
  }>;
}

export interface IntakeProcessingOrchestrator {
  process(input: {
    asset: IntakeProcessableAsset;
    processorId: string;
    idempotencyKey: string;
    traceId: string;
  }): Promise<void>;
}

export function createIntakeProcessingOrchestrator(dependencies: {
  intake: Pick<MerchantIntakeService, 'recordProcessingResult'>;
  malware: MalwareScanner;
  extractors: Record<IntakeProcessableAsset['assetType'], ContentExtractor>;
  candidates: StructuredCandidateExtractor;
}): IntakeProcessingOrchestrator {
  return {
    async process(input) {
      const scan = await dependencies.malware.scan(input.asset);
      if (scan.verdict !== 'SAFE') {
        await dependencies.intake.recordProcessingResult({
          tenantId: input.asset.tenantId,
          processorId: input.processorId,
          idempotencyKey: input.idempotencyKey,
          traceId: input.traceId,
          body: {
            assetId: input.asset.assetId,
            securityStatus: scan.verdict,
            errorCode: scan.errorCode,
          },
        });
        return;
      }

      try {
        const extracted = await dependencies.extractors[input.asset.assetType].extract(input.asset);
        const structured = await dependencies.candidates.extract({
          asset: input.asset,
          text: extracted.text,
          ...(extracted.sourceMap === undefined ? {} : { sourceMap: extracted.sourceMap }),
        });
        await dependencies.intake.recordProcessingResult({
          tenantId: input.asset.tenantId,
          processorId: input.processorId,
          idempotencyKey: input.idempotencyKey,
          traceId: input.traceId,
          body: {
            assetId: input.asset.assetId,
            securityStatus: 'SAFE',
            candidates: structured.candidates,
            missingItems: structured.missingItems,
            impactTargets: structured.impactTargets,
          },
        });
      } catch (error) {
        await dependencies.intake.recordProcessingResult({
          tenantId: input.asset.tenantId,
          processorId: input.processorId,
          idempotencyKey: input.idempotencyKey,
          traceId: input.traceId,
          body: {
            assetId: input.asset.assetId,
            securityStatus: 'FAILED',
            errorCode:
              error instanceof Error ? `EXTRACTION_FAILED:${error.name}` : 'EXTRACTION_FAILED',
          },
        });
      }
    },
  };
}

export function createHttpIntakeProcessorAdapters(options: {
  malwareUrl: string;
  ocrUrl: string;
  asrUrl: string;
  candidateUrl: string;
  bearerToken: string;
  fetch?: typeof globalThis.fetch;
}) {
  for (const url of [options.malwareUrl, options.ocrUrl, options.asrUrl, options.candidateUrl]) {
    if (!URL.canParse(url)) throw new Error('intake processor URLs must be absolute');
  }
  const request = options.fetch ?? globalThis.fetch;
  const post = async (url: string, body: unknown) => {
    const response = await request(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.bearerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`processor gateway returned ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  };
  const extractor = (url: string): ContentExtractor => ({
    async extract(asset) {
      const result = await post(url, { asset });
      if (typeof result.text !== 'string') throw new Error('processor response has no text');
      return {
        text: result.text,
        ...(result.sourceMap === undefined ? {} : { sourceMap: result.sourceMap }),
      };
    },
  });
  return {
    malware: {
      async scan(asset: IntakeProcessableAsset) {
        const result = await post(options.malwareUrl, { asset });
        if (!['SAFE', 'REJECTED', 'FAILED'].includes(String(result.verdict)))
          throw new Error('malware response has invalid verdict');
        if (result.verdict === 'SAFE') return { verdict: 'SAFE' as const };
        if (typeof result.errorCode !== 'string')
          throw new Error('malware rejection has no error code');
        return { verdict: result.verdict as 'REJECTED' | 'FAILED', errorCode: result.errorCode };
      },
    } satisfies MalwareScanner,
    extractors: {
      IMAGE: extractor(options.ocrUrl),
      DOCUMENT: extractor(options.ocrUrl),
      AUDIO: extractor(options.asrUrl),
      TEXT: extractor(options.ocrUrl),
    } satisfies Record<IntakeProcessableAsset['assetType'], ContentExtractor>,
    candidates: {
      async extract(input: { asset: IntakeProcessableAsset; text: string; sourceMap?: unknown }) {
        const result = await post(options.candidateUrl, input);
        if (
          !Array.isArray(result.candidates) ||
          !Array.isArray(result.missingItems) ||
          !Array.isArray(result.impactTargets)
        )
          throw new Error('candidate response is incomplete');
        return result as unknown as Awaited<ReturnType<StructuredCandidateExtractor['extract']>>;
      },
    } satisfies StructuredCandidateExtractor,
  };
}
