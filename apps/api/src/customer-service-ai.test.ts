import { describe, expect, it, vi } from 'vitest';
import {
  createCustomerServiceAiOrchestrator,
  CustomerServiceAiSecurityError,
  type CustomerServiceCitation,
} from './customer-service-ai.js';

const tenantId = '47000000-0000-4000-8000-000000000001';
const otherTenantId = '47000000-0000-4000-8000-000000000002';
const storeId = '47000000-0000-4000-8000-000000000003';
const conversationId = '47000000-0000-4000-8000-000000000004';
const customerId = '47000000-0000-4000-8000-000000000005';
const jobId = '47000000-0000-4000-8000-000000000006';
const customerMessageId = '47000000-0000-4000-8000-000000000007';
const answerMessageId = '47000000-0000-4000-8000-000000000008';
const citationId = '47000000-0000-4000-8000-000000000009';
const publicationId = '47000000-0000-4000-8000-000000000010';
const documentId = '47000000-0000-4000-8000-000000000011';

type QueryResult = { rows: unknown[]; rowCount: number };
const result = (rows: unknown[] = [], rowCount = rows.length): QueryResult => ({ rows, rowCount });

const citation = (citationTenantId = tenantId): CustomerServiceCitation => ({
  id: citationId,
  publicationId,
  tenantId: citationTenantId,
  storeId,
  documentId,
  documentVersion: 3,
  title: '本店营业时间',
  excerpt: '周一至周日 09:00-21:00。',
  sourceType: 'MERCHANT_RULE',
  expiresAt: '2027-08-18T04:00:00.000Z',
});

function fixture(
  options: {
    queryText?: string;
    citations?: CustomerServiceCitation[];
    answerClaimed?: boolean;
    toolFailure?: boolean;
  } = {},
) {
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    void values;
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    if (sql.startsWith("UPDATE conversation_ai_jobs SET status='RUNNING'"))
      return result([
        {
          id: jobId,
          conversation_id: conversationId,
          customer_message_id: customerMessageId,
          attempt_count: 1,
        },
      ]);
    if (sql.startsWith('SELECT conversation.id AS conversation_id'))
      return result([
        {
          conversation_id: conversationId,
          store_id: storeId,
          customer_id: customerId,
          status: 'BOT_ACTIVE',
          context_type: 'NONE',
          context_id: null,
          auth_level: 'PHONE_BOUND',
          content_object_key: `${tenantId}/customer-service/question.txt`,
          sender_type: 'CUSTOMER',
        },
      ]);
    if (sql.startsWith('SELECT 1 FROM conversation_ai_jobs job'))
      return options.answerClaimed === false ? result() : result([{ ok: true }]);
    if (sql.startsWith('INSERT INTO conversation_messages'))
      return result([{ id: answerMessageId }]);
    return result();
  });
  const client = { query, release: vi.fn() };
  const getText = vi.fn().mockResolvedValue(options.queryText ?? '请问你们几点营业？');
  const putText = vi.fn().mockResolvedValue(undefined);
  const requestHumanBySystem = vi.fn().mockResolvedValue({ id: conversationId });
  const knowledge = {
    search: vi.fn().mockResolvedValue(options.citations ?? [citation()]),
  };
  const tools = {
    query: options.toolFailure
      ? vi.fn().mockRejectedValue(new Error('realtime unavailable'))
      : vi.fn().mockResolvedValue({
          data: { status: 'OPEN' },
          sourceVersion: 'store-v4',
          observedAt: '2026-08-18T04:00:00.000Z',
        }),
  };
  const model = {
    answer: vi.fn().mockResolvedValue({
      answer: '本店每天 09:00 至 21:00 营业。',
      usedCitationIds: [citationId],
      confidence: 0.96,
      requiresHuman: false,
      riskLabels: [],
      modelRoute: 'GROUNDING_STANDARD',
      modelCode: 'model-safe-1',
      provider: 'MODEL_GATEWAY',
      modelTraceRef: 'model-trace://redacted/1',
      inputUnits: 80,
      outputUnits: 20,
      costMinorUnits: 2,
    }),
  };
  return {
    query,
    getText,
    putText,
    requestHumanBySystem,
    knowledge,
    tools,
    model,
    service: createCustomerServiceAiOrchestrator({
      pool: { connect: vi.fn(async () => client) } as never,
      objectStore: { getText, putText },
      customerService: { requestHumanBySystem },
      knowledge,
      tools,
      model,
    }),
  };
}

const processInput = { tenantId, jobId, workerId: 'ai-worker-1', traceId: 'trace-ai-1' };

describe('grounded customer-service AI orchestrator', () => {
  it('CS-002 answers from current merchant knowledge and stores exact citation evidence', async () => {
    const fx = fixture();
    await expect(fx.service.process(processInput)).resolves.toEqual({
      status: 'SUCCEEDED',
      messageId: answerMessageId,
    });
    expect(fx.knowledge.search).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, storeId, query: '请问你们几点营业？' }),
    );
    const evidence = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO conversation_answer_evidence'),
    );
    expect(JSON.stringify(evidence?.[1])).toContain(publicationId);
    expect(JSON.stringify(evidence?.[1])).toContain(documentId);
    expect(JSON.stringify(evidence?.[1])).not.toContain('周一至周日 09:00-21:00。');
  });

  it('CS-003 rejects a cross-tenant retrieval result and escalates without calling the model', async () => {
    const fx = fixture({ citations: [citation(otherTenantId)] });
    await expect(fx.service.process(processInput)).rejects.toBeInstanceOf(
      CustomerServiceAiSecurityError,
    );
    expect(fx.requestHumanBySystem).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'KNOWLEDGE_SCOPE_VIOLATION', priority: 'URGENT' }),
    );
    expect(fx.model.answer).not.toHaveBeenCalled();
    expect(
      fx.query.mock.calls.some(
        ([sql]) =>
          String(sql).includes("SET status='HANDOFF'") || String(sql).includes('status=$3'),
      ),
    ).toBe(true);
  });

  it('does not guess real-time store status when its read-only tool is unavailable', async () => {
    const fx = fixture({ queryText: '你们现在开门吗，营业状态是什么？', toolFailure: true });
    await expect(fx.service.process(processInput)).resolves.toEqual({
      status: 'SUCCEEDED',
      messageId: answerMessageId,
    });
    expect(fx.model.answer).not.toHaveBeenCalled();
    expect(fx.putText).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('实时业务信息暂时无法确认'),
      }),
    );
  });

  it('CS-005 drops a late AI answer when a human acquired the conversation during inference', async () => {
    const fx = fixture({ answerClaimed: false });
    await expect(fx.service.process(processInput)).resolves.toEqual({ status: 'CANCELLED' });
    expect(
      fx.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO conversation_messages'),
      ),
    ).toBe(false);
  });
});
