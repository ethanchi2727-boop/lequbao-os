import { createHash, randomUUID } from 'node:crypto';
import type { HarnessAdapter } from '@lequ/harness-adapter';
import type { ToolGateway } from '@lequ/tool-gateway';
import type { CustomerServiceBusinessToolGateway, CustomerServiceModelGateway } from './customer-service-ai.js';
import type { CustomerServiceCitation } from './customer-service-ai.js';

/**
 * 把业务层任意 traceId（如 "trace-ai-1"）映射为确定性 UUID v5。
 *
 * Adapter 契约要求 traceId 为 UUID 格式（便于跨事件统一追溯与 sink 索引），
 * 而客服编排器对外接受任意非空 traceId 字符串。在 gateway 边界做格式转换：
 * - 同一业务 traceId 永远映射到同一 UUID（事后可按业务 trace 反查）；
 * - 不同业务 traceId 永远映射到不同 UUID；
 * - 输出始终满足 RFC 4122 v5 字面格式，通过 UuidSchema 校验。
 */
function traceIdToUuid(traceId: string): string {
  const hash = createHash('sha1').update(`lequ-cs-ai-harness:${traceId}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * 把 customer-service-ai 编排器从直接调模型/工具网关，改为通过 Harness Adapter。
 *
 * 上游升级、回滚不影响现有编排器契约（同样的 input、同样的 ModelAnswer 返回）；
 * Adapter 不可用时编排器捕获 HarnessBackendUnavailableError 并降级
 * （已有 retry/handoff 路径），普通客服后台、支付、核销仍可运行。
 *
 * 真实部署用 RemoteHarnessBackend；测试与本地开发用 StubHarnessBackend。
 */

export interface HarnessCustomerServiceModelOptions {
  adapter: HarnessAdapter;
  promptVersion?: string;
}

const MODEL_ROUTE = 'CUSTOMER_SERVICE_GROUNDED';
const MODEL_CODE = 'deepseek-v4-flash';
const PROVIDER = 'DEEPSEEK_HARNESS';

/**
 * Harness-backed model 网关：通过 Adapter.run 发送 prompt，按事件流聚合 ModelAnswer。
 *
 * 不直接调上游模型 API；上游升级、回滚只改 Adapter，不改本类。
 */
export function createHarnessCustomerServiceModelGateway(
  options: HarnessCustomerServiceModelOptions,
): CustomerServiceModelGateway {
  const promptVersion = options.promptVersion ?? 'customer-service-grounded-v1';

  return {
    async answer(input) {
      const session = await options.adapter.createSession({
        tenantId: input.tenantId as never,
        actorId: randomUUID(),
        role: 'CUSTOMER_SERVICE',
        spaceRef: `store/${input.storeId}`,
        modelStrategy: {
          routingKey: MODEL_ROUTE,
          visionEnabled: false,
          maxTokens: 4096,
          temperatureCenti: 70,
        },
        budget: { estimatedMaxCostMinor: '500', preAuthorizedMinor: '500' },
        availableTools: ['verify.merchant.profile', 'issue.refund', 'send.payout.authorization.link'],
      });
      const prompt = buildPrompt(input.query, input.citations, input.toolResult, promptVersion);
      const run = await options.adapter.run({
        sessionId: session.sessionId,
        message: prompt,
        attachments: [],
        executionMode: 'AUTO',
        idempotencyKey: randomUUID(),
        traceId: traceIdToUuid(input.traceId),
      });
      const events = await options.adapter.subscribe({
        sessionId: session.sessionId,
        lastSequence: 0,
      });
      const completed = events.find((event) => event.eventType === 'message.completed');
      const deltas = events.filter((event) => event.eventType === 'message.delta');
      const text = deltas
        .map((event) => (event.payload as { delta?: string }).delta ?? '')
        .join('');
      // 完整答案优先以 message.completed 携带；缺失则用 delta 拼接
      const answerText =
        completed && (completed.payload as { finalText?: string }).finalText
          ? String((completed.payload as { finalText?: string }).finalText)
          : text;
      // 用于追溯上游 run/task；不在编排器契约字段内时拼入 modelTraceRef
      const modelTraceRef = `${MODEL_ROUTE}/${run.taskId}`;
      const citationIds = input.citations.map((citation) => citation.id);
      // 多模态/Files API 不在客服编排流程；保持已接地答案
      const grounded = input.citations.length > 0 || Boolean(input.toolResult);
      return {
        answer: answerText || '抱歉，我暂时无法生成回复，请稍后重试或转人工处理。',
        usedCitationIds: citationIds,
        confidence: grounded ? 0.85 : 0.5,
        requiresHuman: !grounded,
        riskLabels: grounded ? [] : ['LOW_CONFIDENCE_OR_UNGROUNDED'],
        modelRoute: MODEL_ROUTE,
        modelCode: MODEL_CODE,
        provider: PROVIDER,
        modelTraceRef,
        inputUnits: 0,
        outputUnits: 0,
        costMinorUnits: 0,
      };
    },
  };
}

function buildPrompt(
  query: string,
  citations: readonly CustomerServiceCitation[],
  toolResult:
    | { toolCode: string; data: Record<string, unknown>; observedAt: string }
    | undefined,
  promptVersion: string,
): string {
  const citationBlock = citations
    .map((citation, index) =>
      `[${index + 1}] ${citation.title}\n来源：${citation.sourceType}\n摘要：${citation.excerpt}`,
    )
    .join('\n\n');
  const toolBlock = toolResult
    ? `实时业务事实（${toolResult.toolCode} @ ${toolResult.observedAt}）：${JSON.stringify(toolResult.data)}` +
      '\n仅基于此事实回答；不得引用旧对话或猜测。'
    : '本问题不依赖实时业务事实；仅基于知识与人工确认规则回答。';
  return [
    `提示词版本：${promptVersion}`,
    '你是乐趣宝客服 AI。回答必须接地——只引用下方知识与实时业务事实，禁止编造。',
    '若不可靠，明确告知顾客将转人工；不要假装确定。',
    '回答控制在 300 字以内，使用普通话，避免承诺未在事实中出现的退款、改价或赔偿。',
    '引用知识时按 [n] 标注；事实不足时回复：抱歉，我暂时无法确认，将为您转人工。',
    '',
    '== 顾客问题 ==',
    query,
    '',
    '== 知识引用 ==',
    citationBlock || '（无可用知识）',
    '',
    '== 实时业务事实 ==',
    toolBlock,
  ].join('\n');
}

/**
 * Tool Gateway-backed business tool gateway。
 *
 * 把客服编排器的 STORE_STATUS/PRICE/INVENTORY/ORDER/REFUND_STATUS 工具码映射到
 * Tool Gateway 中已注册的 descriptor 名称。Tool Gateway 按服务端身份复验租户/
 * 角色/对象状态/金额/审批，不直连业务库。
 */
export interface HarnessCustomerServiceToolOptions {
  gateway: ToolGateway;
  tenantId: string;
  actorId: string;
  spaceRef: string;
  // 工具码 → Tool Gateway descriptor 名称
  toolCodeMap?: Partial<Record<
    'STORE_STATUS' | 'PRICE' | 'INVENTORY' | 'ORDER' | 'REFUND_STATUS',
    string
  >>;
}

const DEFAULT_TOOL_CODE_MAP: Record<
  'STORE_STATUS' | 'PRICE' | 'INVENTORY' | 'ORDER' | 'REFUND_STATUS',
  string
> = {
  STORE_STATUS: 'verify.merchant.profile',
  PRICE: 'verify.merchant.profile',
  INVENTORY: 'verify.merchant.profile',
  ORDER: 'verify.merchant.profile',
  REFUND_STATUS: 'verify.merchant.profile',
};

export function createHarnessCustomerServiceToolGateway(
  options: HarnessCustomerServiceToolOptions,
): CustomerServiceBusinessToolGateway {
  const map = { ...DEFAULT_TOOL_CODE_MAP, ...options.toolCodeMap };
  return {
    async query(input) {
      const toolName = map[input.toolCode] ?? map.STORE_STATUS;
      const result = await options.gateway.invoke(
        {
          sessionId: randomUUID(),
          taskId: randomUUID(),
          traceId: input.traceId,
          toolName,
          arguments: {
            storeId: input.storeId,
            customerId: input.customerId,
            contextType: input.contextType,
            contextId: input.contextId,
            query: input.query,
          },
          requestedAt: new Date().toISOString(),
        },
        {
          tenantId: options.tenantId as never,
          actorId: options.actorId,
          role: 'CUSTOMER_SERVICE',
          spaceRef: options.spaceRef,
          availableTools: Object.values(map),
        },
      );
      return {
        data: result.result,
        sourceVersion: 'tool-gateway:0.1.0',
        observedAt: new Date().toISOString(),
      };
    },
  };
}
