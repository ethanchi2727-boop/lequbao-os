import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { CustomerService } from './customer-service.js';
import { classifyCustomerServiceRisk } from './customer-service.js';
import type { IntakeObjectStore } from './intake-object-store.js';

const CitationSchema = z.object({
  id: UuidSchema,
  publicationId: UuidSchema,
  tenantId: UuidSchema,
  storeId: UuidSchema,
  documentId: UuidSchema,
  documentVersion: z.number().int().positive(),
  title: z.string().min(1).max(500),
  excerpt: z.string().min(1).max(2000),
  sourceType: z.enum([
    'MERCHANT_RULE',
    'PRODUCT_REALTIME',
    'ORDER_REALTIME',
    'MERCHANT_FILE',
    'EMPLOYEE_CONFIRMED_QA',
    'PUBLIC_REFERENCE',
  ]),
  expiresAt: z.string().datetime().nullable(),
});
const ToolResultSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  sourceVersion: z.string().min(1),
  observedAt: z.string().datetime(),
});
const ModelAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  usedCitationIds: z.array(UuidSchema),
  confidence: z.number().min(0).max(1),
  requiresHuman: z.boolean(),
  riskLabels: z.array(z.string().min(1).max(120)),
  modelRoute: z.string().min(1).max(120),
  modelCode: z.string().min(1).max(120),
  provider: z.string().min(1).max(120),
  modelTraceRef: z.string().min(1).max(500),
  inputUnits: z.number().int().nonnegative(),
  outputUnits: z.number().int().nonnegative(),
  costMinorUnits: z.number().int().nonnegative(),
});

export type CustomerServiceCitation = z.infer<typeof CitationSchema>;

export interface CustomerServiceKnowledgeGateway {
  search(input: {
    tenantId: string;
    storeId: string;
    query: string;
    limit: number;
    traceId: string;
  }): Promise<CustomerServiceCitation[]>;
}

export interface CustomerServiceBusinessToolGateway {
  query(input: {
    tenantId: string;
    storeId: string;
    customerId: string;
    toolCode: 'STORE_STATUS' | 'PRICE' | 'INVENTORY' | 'ORDER' | 'REFUND_STATUS';
    query: string;
    contextType: string | null;
    contextId: string | null;
    traceId: string;
  }): Promise<z.infer<typeof ToolResultSchema>>;
}

export interface CustomerServiceModelGateway {
  answer(input: {
    tenantId: string;
    storeId: string;
    query: string;
    citations: CustomerServiceCitation[];
    toolResult?: { toolCode: string; data: Record<string, unknown>; observedAt: string };
    promptVersion: string;
    traceId: string;
  }): Promise<z.infer<typeof ModelAnswerSchema>>;
}

export interface CustomerServiceAiOrchestrator {
  process(input: { tenantId: string; jobId: string; workerId: string; traceId: string }): Promise<{
    status: 'SUCCEEDED' | 'HANDOFF' | 'RETRY' | 'FAILED' | 'CANCELLED';
    messageId?: string;
  }>;
}

export class CustomerServiceAiSecurityError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function requiredTool(
  query: string,
): 'STORE_STATUS' | 'PRICE' | 'INVENTORY' | 'ORDER' | 'REFUND_STATUS' | undefined {
  if (/退款.*(状态|进度|到账)|退到哪里/u.test(query)) return 'REFUND_STATUS';
  if (/我的.*订单|订单.*(状态|进度|详情)/u.test(query)) return 'ORDER';
  if (/库存|还有货|售罄/u.test(query)) return 'INVENTORY';
  if (/价格|多少钱|优惠价|售价/u.test(query)) return 'PRICE';
  if (/营业状态|现在开门|今天开门/u.test(query)) return 'STORE_STATUS';
  return undefined;
}

export function createCustomerServiceAiOrchestrator(options: {
  pool: Pick<pg.Pool, 'connect'>;
  objectStore: Pick<IntakeObjectStore, 'getText' | 'putText'>;
  customerService: Pick<CustomerService, 'requestHumanBySystem'>;
  knowledge: CustomerServiceKnowledgeGateway;
  tools: CustomerServiceBusinessToolGateway;
  model: CustomerServiceModelGateway;
  promptVersion?: string;
}): CustomerServiceAiOrchestrator {
  const promptVersion = options.promptVersion ?? 'customer-service-grounded-v1';

  async function transaction<T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await options.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function finishJob(
    tenantId: string,
    jobId: string,
    status: 'SUCCEEDED' | 'HANDOFF' | 'FAILED' | 'CANCELLED',
    errorCode?: string,
  ) {
    await transaction(tenantId, async (client) => {
      await client.query(
        `UPDATE conversation_ai_jobs SET status=$3,locked_by=NULL,locked_at=NULL,
                last_error_code=$4,completed_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
        [tenantId, jobId, status, errorCode ?? null],
      );
    });
  }

  async function retryOrFail(tenantId: string, jobId: string, errorCode: string, attempts: number) {
    if (attempts >= 5) {
      await finishJob(tenantId, jobId, 'FAILED', errorCode);
      return { status: 'FAILED' as const };
    }
    await transaction(tenantId, async (client) => {
      await client.query(
        `UPDATE conversation_ai_jobs SET status='QUEUED',locked_by=NULL,locked_at=NULL,
                last_error_code=$3,updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
        [tenantId, jobId, errorCode],
      );
      await client.query(
        `UPDATE conversations SET ai_processing_state='QUEUED'
          WHERE tenant_id=$1 AND id=(SELECT conversation_id FROM conversation_ai_jobs
                                      WHERE tenant_id=$1 AND id=$2)
            AND status='BOT_ACTIVE'`,
        [tenantId, jobId],
      );
    });
    return { status: 'RETRY' as const };
  }

  async function handoff(
    input: { tenantId: string; conversationId: string; traceId: string; jobId: string },
    reasonCode: string,
    priority: 'HIGH' | 'URGENT' = 'HIGH',
  ) {
    await options.customerService.requestHumanBySystem({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      reasonCode,
      priority,
      traceId: input.traceId,
    });
    await finishJob(input.tenantId, input.jobId, 'HANDOFF', reasonCode);
    return { status: 'HANDOFF' as const };
  }

  async function persistAnswer(input: {
    tenantId: string;
    jobId: string;
    conversationId: string;
    customerMessageId: string;
    answer: string;
    citations: CustomerServiceCitation[];
    usedCitationIds: string[];
    toolCallIds: string[];
    modelRoute: string;
    modelCode: string;
    provider: string;
    modelTraceRef: string;
    confidence: number;
    grounded: boolean;
    riskLabels: string[];
    inputUnits: number;
    outputUnits: number;
    costMinorUnits: number;
    traceId: string;
  }) {
    const contentHash = digest(input.answer);
    const objectKey = `${input.tenantId}/customer-service/${input.conversationId}/ai/${input.jobId}.txt`;
    await options.objectStore.putText({ objectKey, content: input.answer, sha256: contentHash });
    return transaction(input.tenantId, async (client) => {
      const claim = await client.query(
        `SELECT 1 FROM conversation_ai_jobs job
          JOIN conversations conversation
            ON conversation.tenant_id=job.tenant_id AND conversation.id=job.conversation_id
         WHERE job.tenant_id=$1 AND job.id=$2 AND job.status='RUNNING'
           AND conversation.status='BOT_ACTIVE' AND conversation.assigned_user_id IS NULL
         FOR UPDATE OF job,conversation`,
        [input.tenantId, input.jobId],
      );
      if (claim.rowCount !== 1) return undefined;
      const message = await client.query<{ id: string }>(
        `INSERT INTO conversation_messages(
           tenant_id,conversation_id,sender_type,content_object_key,content_preview_redacted,
           message_type,model_trace_ref,risk_labels
         ) VALUES ($1,$2,'AI',$3,$4,'TEXT',$5,$6::text[]) RETURNING id`,
        [
          input.tenantId,
          input.conversationId,
          objectKey,
          input.answer.replace(/(?<!\d)1[3-9]\d{9}(?!\d)/gu, '1**********').slice(0, 80),
          input.modelTraceRef,
          input.riskLabels,
        ],
      );
      const messageId = message.rows[0]!.id;
      const used = new Set(input.usedCitationIds);
      const evidenceCitations = input.citations
        .filter((citation) => used.has(citation.id))
        .map((citation) => ({
          citation_id: citation.id,
          publication_id: citation.publicationId,
          document_id: citation.documentId,
          document_version: citation.documentVersion,
          title: citation.title,
          source_type: citation.sourceType,
        }));
      await client.query(
        `INSERT INTO conversation_answer_evidence(
           tenant_id,conversation_id,answer_message_id,source_message_id,citations,tool_call_ids,
           model_route,prompt_version,confidence,grounded,risk_labels,model_trace_ref,
           input_units,output_units,cost_minor_units
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::uuid[],$7,$8,$9,$10,$11::text[],$12,$13,$14,$15)`,
        [
          input.tenantId,
          input.conversationId,
          messageId,
          input.customerMessageId,
          JSON.stringify(evidenceCitations),
          input.toolCallIds,
          input.modelRoute,
          promptVersion,
          input.confidence,
          input.grounded,
          input.riskLabels,
          input.modelTraceRef,
          input.inputUnits,
          input.outputUnits,
          input.costMinorUnits,
        ],
      );
      const quantity = input.inputUnits + input.outputUnits;
      if (quantity > 0) {
        await client.query(
          `INSERT INTO ai_usage_ledger_entries(
             tenant_id,meter_code,source_type,source_id,provider,model_code,quantity,cost_cents,
             occurred_at,metadata,trace_id
           ) VALUES ($1,'CUSTOMER_SERVICE_UNITS','MODEL',$2,$3,$4,$5,$6,now(),$7::jsonb,$8)
           ON CONFLICT (tenant_id,source_type,source_id,meter_code) DO NOTHING`,
          [
            input.tenantId,
            input.jobId,
            input.provider,
            input.modelCode,
            quantity,
            input.costMinorUnits,
            JSON.stringify({ conversation_id: input.conversationId, answer_message_id: messageId }),
            input.traceId,
          ],
        );
      }
      await client.query(
        `UPDATE conversation_ai_jobs SET status='SUCCEEDED',locked_by=NULL,locked_at=NULL,
                completed_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND status='RUNNING'`,
        [input.tenantId, input.jobId],
      );
      await client.query(
        `UPDATE conversations SET ai_processing_state='IDLE',last_message_at=now(),version=version+1
          WHERE tenant_id=$1 AND id=$2 AND status='BOT_ACTIVE'`,
        [input.tenantId, input.conversationId],
      );
      await client.query(
        `INSERT INTO outbox_events(
           tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
           payload,pii_classification,trace_id,occurred_at
         ) SELECT $1,'customer_service.message_received.v1','conversation',$2,version,
                  'conversation:'||($2::uuid)::text,$3::jsonb,'PERSONAL',$4,now()
             FROM conversations WHERE tenant_id=$1 AND id=$2`,
        [
          input.tenantId,
          input.conversationId,
          JSON.stringify({
            conversation_id: input.conversationId,
            message_id: messageId,
            sender_type: 'AI',
            message_type: 'TEXT',
            content_ref: objectKey,
          }),
          input.traceId,
        ],
      );
      return messageId;
    });
  }

  return {
    async process(input) {
      const ids = z
        .object({
          tenantId: UuidSchema,
          jobId: UuidSchema,
          workerId: z.string().min(1),
          traceId: z.string().min(1),
        })
        .parse(input);
      const claim = await transaction(ids.tenantId, async (client) => {
        const result = await client.query<{
          id: string;
          conversation_id: string;
          customer_message_id: string;
          attempt_count: number;
        }>(
          `UPDATE conversation_ai_jobs SET status='RUNNING',attempt_count=attempt_count+1,
                  locked_by=$3,locked_at=now(),last_error_code=NULL,updated_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='QUEUED'
          RETURNING id,conversation_id,customer_message_id,attempt_count`,
          [ids.tenantId, ids.jobId, ids.workerId],
        );
        return result.rows[0];
      });
      if (!claim) return { status: 'CANCELLED' };

      const context = await transaction(ids.tenantId, async (client) => {
        const result = await client.query<{
          conversation_id: string;
          store_id: string;
          customer_id: string;
          status: string;
          context_type: string | null;
          context_id: string | null;
          auth_level: string;
          content_object_key: string;
          sender_type: string;
        }>(
          `SELECT conversation.id AS conversation_id,conversation.store_id,
                  conversation.customer_id,conversation.status,conversation.context_type,
                  conversation.context_id,consumer.auth_level,message.content_object_key,
                  message.sender_type
             FROM conversation_ai_jobs job
             JOIN conversations conversation
               ON conversation.tenant_id=job.tenant_id AND conversation.id=job.conversation_id
             JOIN consumer_sessions consumer
               ON consumer.tenant_id=conversation.tenant_id
              AND consumer.session_id=conversation.consumer_session_id
             JOIN conversation_messages message
               ON message.tenant_id=job.tenant_id AND message.id=job.customer_message_id
            WHERE job.tenant_id=$1 AND job.id=$2 AND job.status='RUNNING'`,
          [ids.tenantId, ids.jobId],
        );
        return result.rows[0];
      });
      if (!context || context.status !== 'BOT_ACTIVE' || context.sender_type !== 'CUSTOMER') {
        await finishJob(ids.tenantId, ids.jobId, 'CANCELLED', 'CONVERSATION_NOT_BOT_ACTIVE');
        return { status: 'CANCELLED' };
      }

      let query: string;
      try {
        query = await options.objectStore.getText({
          objectKey: context.content_object_key,
          maxBytes: 16_384,
        });
      } catch {
        return retryOrFail(
          ids.tenantId,
          ids.jobId,
          'MESSAGE_CONTENT_UNAVAILABLE',
          claim.attempt_count,
        );
      }
      const risk = classifyCustomerServiceRisk(query);
      if (risk.requiresHuman) {
        return handoff(
          {
            tenantId: ids.tenantId,
            conversationId: claim.conversation_id,
            traceId: ids.traceId,
            jobId: ids.jobId,
          },
          risk.labels[0] ?? 'HIGH_RISK_REQUEST',
          risk.priority === 'URGENT' ? 'URGENT' : 'HIGH',
        );
      }

      const toolCode = requiredTool(query);
      let toolResult: z.infer<typeof ToolResultSchema> | undefined;
      const toolCallIds: string[] = [];
      if (
        toolCode &&
        ['ORDER', 'REFUND_STATUS'].includes(toolCode) &&
        context.auth_level !== 'PHONE_BOUND'
      ) {
        const messageId = await persistAnswer({
          tenantId: ids.tenantId,
          jobId: ids.jobId,
          conversationId: claim.conversation_id,
          customerMessageId: claim.customer_message_id,
          answer: '为保护订单隐私，请先完成手机号身份验证后再查询本人订单。',
          citations: [],
          usedCitationIds: [],
          toolCallIds: [],
          modelRoute: 'POLICY_IDENTITY_GATE',
          modelCode: 'NONE',
          provider: 'LEQUBAO_POLICY',
          modelTraceRef: `policy://${ids.traceId}`,
          confidence: 1,
          grounded: false,
          riskLabels: ['IDENTITY_VERIFICATION_REQUIRED'],
          inputUnits: 0,
          outputUnits: 0,
          costMinorUnits: 0,
          traceId: ids.traceId,
        });
        return messageId ? { status: 'SUCCEEDED', messageId } : { status: 'CANCELLED' };
      }
      if (toolCode) {
        const requestDigest = digest(
          JSON.stringify({
            tenantId: ids.tenantId,
            storeId: context.store_id,
            customerId: context.customer_id,
            toolCode,
            query: digest(query),
          }),
        );
        try {
          toolResult = ToolResultSchema.parse(
            await options.tools.query({
              tenantId: ids.tenantId,
              storeId: context.store_id,
              customerId: context.customer_id,
              toolCode,
              query,
              contextType: context.context_type,
              contextId: context.context_id,
              traceId: ids.traceId,
            }),
          );
          const resultContent = JSON.stringify(toolResult.data);
          const resultDigest = digest(resultContent);
          const resultObjectRef = `${ids.tenantId}/customer-service/${claim.conversation_id}/tools/${ids.jobId}-${toolCode}.json`;
          await options.objectStore.putText({
            objectKey: resultObjectRef,
            content: resultContent,
            sha256: resultDigest,
          });
          const toolCallId = await transaction(ids.tenantId, async (client) => {
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO conversation_tool_calls(
                 tenant_id,conversation_id,message_id,tool_code,customer_id,request_digest,
                 result_object_ref,result_digest,status,trace_ref,completed_at
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SUCCEEDED',$9,now()) RETURNING id`,
              [
                ids.tenantId,
                claim.conversation_id,
                claim.customer_message_id,
                toolCode,
                context.customer_id,
                requestDigest,
                resultObjectRef,
                resultDigest,
                ids.traceId,
              ],
            );
            return inserted.rows[0]!.id;
          });
          toolCallIds.push(toolCallId);
        } catch {
          await transaction(ids.tenantId, async (client) => {
            await client.query(
              `INSERT INTO conversation_tool_calls(
                 tenant_id,conversation_id,message_id,tool_code,customer_id,request_digest,
                 status,error_code,trace_ref,completed_at
               ) VALUES ($1,$2,$3,$4,$5,$6,'FAILED','REALTIME_TOOL_UNAVAILABLE',$7,now())`,
              [
                ids.tenantId,
                claim.conversation_id,
                claim.customer_message_id,
                toolCode,
                context.customer_id,
                requestDigest,
                ids.traceId,
              ],
            );
          });
          const messageId = await persistAnswer({
            tenantId: ids.tenantId,
            jobId: ids.jobId,
            conversationId: claim.conversation_id,
            customerMessageId: claim.customer_message_id,
            answer: '实时业务信息暂时无法确认，我不会根据旧对话猜测。请稍后重试或转人工处理。',
            citations: [],
            usedCitationIds: [],
            toolCallIds: [],
            modelRoute: 'POLICY_TOOL_FAILURE',
            modelCode: 'NONE',
            provider: 'LEQUBAO_POLICY',
            modelTraceRef: `policy://${ids.traceId}`,
            confidence: 1,
            grounded: false,
            riskLabels: ['REALTIME_TOOL_UNAVAILABLE'],
            inputUnits: 0,
            outputUnits: 0,
            costMinorUnits: 0,
            traceId: ids.traceId,
          });
          return messageId ? { status: 'SUCCEEDED', messageId } : { status: 'CANCELLED' };
        }
      }

      let citations: CustomerServiceCitation[];
      try {
        citations = z
          .array(CitationSchema)
          .parse(
            await options.knowledge.search({
              tenantId: ids.tenantId,
              storeId: context.store_id,
              query,
              limit: 8,
              traceId: ids.traceId,
            }),
          )
          .filter(
            (citation) =>
              !citation.expiresAt || new Date(citation.expiresAt).getTime() > Date.now(),
          );
      } catch {
        return retryOrFail(ids.tenantId, ids.jobId, 'KNOWLEDGE_UNAVAILABLE', claim.attempt_count);
      }
      if (
        citations.some(
          (citation) => citation.tenantId !== ids.tenantId || citation.storeId !== context.store_id,
        )
      ) {
        await handoff(
          {
            tenantId: ids.tenantId,
            conversationId: claim.conversation_id,
            traceId: ids.traceId,
            jobId: ids.jobId,
          },
          'KNOWLEDGE_SCOPE_VIOLATION',
          'URGENT',
        );
        throw new CustomerServiceAiSecurityError('knowledge result escaped tenant/store scope');
      }
      if (!toolResult && citations.length === 0) {
        return handoff(
          {
            tenantId: ids.tenantId,
            conversationId: claim.conversation_id,
            traceId: ids.traceId,
            jobId: ids.jobId,
          },
          'NO_RELIABLE_SOURCE',
        );
      }

      let model: z.infer<typeof ModelAnswerSchema>;
      try {
        model = ModelAnswerSchema.parse(
          await options.model.answer({
            tenantId: ids.tenantId,
            storeId: context.store_id,
            query,
            citations,
            ...(toolResult
              ? {
                  toolResult: {
                    toolCode: toolCode!,
                    data: toolResult.data,
                    observedAt: toolResult.observedAt,
                  },
                }
              : {}),
            promptVersion,
            traceId: ids.traceId,
          }),
        );
      } catch {
        return retryOrFail(ids.tenantId, ids.jobId, 'MODEL_UNAVAILABLE', claim.attempt_count);
      }
      const citationIds = new Set(citations.map((citation) => citation.id));
      if (model.usedCitationIds.some((citationId) => !citationIds.has(citationId))) {
        return handoff(
          {
            tenantId: ids.tenantId,
            conversationId: claim.conversation_id,
            traceId: ids.traceId,
            jobId: ids.jobId,
          },
          'UNVERIFIED_MODEL_CITATION',
        );
      }
      if (
        model.requiresHuman ||
        model.confidence < 0.65 ||
        (!toolResult && model.usedCitationIds.length === 0)
      ) {
        return handoff(
          {
            tenantId: ids.tenantId,
            conversationId: claim.conversation_id,
            traceId: ids.traceId,
            jobId: ids.jobId,
          },
          model.riskLabels[0] ?? 'LOW_CONFIDENCE_OR_UNGROUNDED',
        );
      }
      const messageId = await persistAnswer({
        tenantId: ids.tenantId,
        jobId: ids.jobId,
        conversationId: claim.conversation_id,
        customerMessageId: claim.customer_message_id,
        answer: model.answer,
        citations,
        usedCitationIds: model.usedCitationIds,
        toolCallIds,
        modelRoute: model.modelRoute,
        modelCode: model.modelCode,
        provider: model.provider,
        modelTraceRef: model.modelTraceRef,
        confidence: model.confidence,
        grounded: Boolean(toolResult || model.usedCitationIds.length > 0),
        riskLabels: model.riskLabels,
        inputUnits: model.inputUnits,
        outputUnits: model.outputUnits,
        costMinorUnits: model.costMinorUnits,
        traceId: ids.traceId,
      });
      return messageId ? { status: 'SUCCEEDED', messageId } : { status: 'CANCELLED' };
    },
  };
}
