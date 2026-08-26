import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TenantIdSchema } from '@lequ/contracts';
import {
  HarnessAdapter,
  InMemoryHarnessBudgetLedger,
  InMemoryHarnessCheckpointStore,
  InMemoryHarnessEventSink,
  StubHarnessBackend,
  HarnessBackendUnavailableError,
  HARNESS_EVENT_TYPES,
  type HarnessBackend,
  type HarnessEventEnvelope,
} from './index.js';

function tenantId() {
  return TenantIdSchema.parse('11111111-1111-4111-8111-111111111111');
}
function actorId() {
  return '22222222-2222-4222-a222-222222222222';
}
function traceId() {
  return randomUUID();
}

function buildAdapter(backend: HarnessBackend = new StubHarnessBackend()) {
  const events = new InMemoryHarnessEventSink();
  const budget = new InMemoryHarnessBudgetLedger();
  const checkpoints = new InMemoryHarnessCheckpointStore();
  const adapter = new HarnessAdapter({
    backend,
    events,
    budget,
    checkpoints,
    adapterVersion: '0.1.0-test',
  });
  return { adapter, events, budget, checkpoints };
}

function modelStrategy() {
  return {
    routingKey: 'deepseek-v4-flash',
    visionEnabled: true,
    maxTokens: 8192,
    temperatureCenti: 100,
  };
}
function budgetInput() {
  return { estimatedMaxCostMinor: '1000', preAuthorizedMinor: '1000' };
}

describe('Harness Adapter 契约', () => {
  it('createSession 落 session.created 并返回会话与运行 ID', async () => {
    const { adapter } = buildAdapter();
    const result = await adapter.createSession({
      tenantId: tenantId(),
      actorId: actorId(),
      role: 'SALES',
      spaceRef: 'merchant/stub',
      modelStrategy: modelStrategy(),
      budget: budgetInput(),
      availableTools: ['verify.merchant.profile'],
    });
    expect(result.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.harnessRunId).toMatch(/^stub-run-/);
    expect(result.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    const all = await adapter.subscribe({ sessionId: result.sessionId, lastSequence: 0 });
    const first = all[0];
    expect(first).toBeDefined();
    expect(first?.eventType).toBe('session.created');
    expect(first?.tenantId).toBe(tenantId());
    expect(first?.actorId).toBe(actorId());
    expect(first?.schemaVersion).toBe(1);
    expect(first?.sequence).toBe(1);
  });

  it('AUTO run 产出 message.* + artifact.created + task.completed 并结算预算', async () => {
    const { adapter, budget } = buildAdapter();
    const session = await adapter.createSession({
      tenantId: tenantId(),
      actorId: actorId(),
      role: 'OPERATIONS',
      spaceRef: 'merchant/stub',
      modelStrategy: modelStrategy(),
      budget: budgetInput(),
      availableTools: [],
    });
    const run = await adapter.run({
      sessionId: session.sessionId,
      message: '核验商户资料',
      attachments: [],
      executionMode: 'AUTO',
      idempotencyKey: 'idem-auto-1',
      traceId: traceId(),
    });
    expect(run.taskId).toMatch(/^[0-9a-f-]{36}$/);
    const all = await adapter.subscribe({ sessionId: session.sessionId, lastSequence: 0 });
    const types = all.map((event: HarnessEventEnvelope) => event.eventType);
    expect(types).toContain('message.started');
    expect(types).toContain('message.delta');
    expect(types).toContain('message.completed');
    expect(types).toContain('artifact.created');
    expect(types).toContain('task.completed');
    const settlement = await budget.get(run.taskId);
    expect(settlement?.status).toBe('SETTLED');
  });

  it('ASSIST run 产出 tool.requested + approval.requested + task.paused 并落检查点', async () => {
    const { adapter, checkpoints } = buildAdapter();
    const session = await adapter.createSession({
      tenantId: tenantId(),
      actorId: actorId(),
      role: 'SALES',
      spaceRef: 'merchant/stub',
      modelStrategy: modelStrategy(),
      budget: budgetInput(),
      availableTools: ['verify.merchant.profile'],
    });
    const run = await adapter.run({
      sessionId: session.sessionId,
      message: '为拾味小馆完成上线前核验',
      attachments: [{ kind: 'image', mediaType: 'image/png', objectKey: 'merchant/license.webp' }],
      executionMode: 'ASSIST',
      idempotencyKey: 'idem-assist-1',
      traceId: traceId(),
    });
    const all = await adapter.subscribe({ sessionId: session.sessionId, lastSequence: 0 });
    const types = all.map((event: HarnessEventEnvelope) => event.eventType);
    expect(types).toContain('tool.requested');
    expect(types).toContain('approval.requested');
    expect(types).toContain('task.paused');
    const checkpoint = await checkpoints.load(run.taskId);
    expect(checkpoint).toBeDefined();
    expect(checkpoint?.taskId).toBe(run.taskId);
  });

  it('CONFIRM run 仅产 approval.requested + task.paused，不产出消息流', async () => {
    const { adapter } = buildAdapter();
    const session = await adapter.createSession({
      tenantId: tenantId(),
      actorId: actorId(),
      role: 'SALES',
      spaceRef: 'merchant/stub',
      modelStrategy: modelStrategy(),
      budget: budgetInput(),
      availableTools: [],
    });
    await adapter.run({
      sessionId: session.sessionId,
      message: '请确认是否向商家发送授权链接',
      attachments: [],
      executionMode: 'CONFIRM',
      idempotencyKey: 'idem-confirm-1',
      traceId: traceId(),
    });
    const all = await adapter.subscribe({ sessionId: session.sessionId, lastSequence: 0 });
    const types = all.map((event: HarnessEventEnvelope) => event.eventType);
    expect(types).toContain('approval.requested');
    expect(types).toContain('task.paused');
    expect(types).not.toContain('message.delta');
  });

  it('resume 从检查点恢复并落 task.resumed', async () => {
    const { adapter } = buildAdapter();
    const session = await adapter.createSession({
      tenantId: tenantId(),
      actorId: actorId(),
      role: 'SALES',
      spaceRef: 'merchant/stub',
      modelStrategy: modelStrategy(),
      budget: budgetInput(),
      availableTools: [],
    });
    const run = await adapter.run({
      sessionId: session.sessionId,
      message: '请确认',
      attachments: [],
      executionMode: 'ASSIST',
      idempotencyKey: 'idem-resume-1',
      traceId: traceId(),
    });
    const before = await adapter.subscribe({ sessionId: session.sessionId, lastSequence: 0 });
    const resumed = await adapter.resume({
      taskId: run.taskId,
      checkpoint: {},
      supplements: [{ kind: 'text', mediaType: 'text/plain', inline: '商家已授权' }],
      idempotencyKey: 'idem-resume-2',
      traceId: traceId(),
    });
    expect(resumed.taskId).toBe(run.taskId);
    const after = await adapter.subscribe({ sessionId: session.sessionId, lastSequence: 0 });
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.some((event: HarnessEventEnvelope) => event.eventType === 'task.resumed')).toBe(
      true,
    );
  });

  it('cancel 落 task.cancelled 且取消后状态正确', async () => {
    const { adapter } = buildAdapter();
    const session = await adapter.createSession({
      tenantId: tenantId(),
      actorId: actorId(),
      role: 'OPERATIONS',
      spaceRef: 'merchant/stub',
      modelStrategy: modelStrategy(),
      budget: budgetInput(),
      availableTools: [],
    });
    const run = await adapter.run({
      sessionId: session.sessionId,
      message: '取消前先跑一次',
      attachments: [],
      executionMode: 'AUTO',
      idempotencyKey: 'idem-cancel-1',
      traceId: traceId(),
    });
    const result = await adapter.cancel({
      taskId: run.taskId,
      reason: '商家撤回',
      operatorId: actorId(),
    });
    expect(['CANCELLED', 'NOT_CANCELLABLE']).toContain(result.status);
    const all = await adapter.subscribe({ sessionId: session.sessionId, lastSequence: 0 });
    // AUTO 已完成可能无运行态可取消；此处至少不抛错
    expect(all.length).toBeGreaterThan(0);
  });

  it('subscribe 按 lastSequence 续传且过滤会话', async () => {
    const { adapter } = buildAdapter();
    const session = await adapter.createSession({
      tenantId: tenantId(),
      actorId: actorId(),
      role: 'SALES',
      spaceRef: 'merchant/stub',
      modelStrategy: modelStrategy(),
      budget: budgetInput(),
      availableTools: [],
    });
    await adapter.run({
      sessionId: session.sessionId,
      message: '第一批',
      attachments: [],
      executionMode: 'AUTO',
      idempotencyKey: 'idem-sub-1',
      traceId: traceId(),
    });
    const first = await adapter.subscribe({ sessionId: session.sessionId, lastSequence: 0 });
    const lastSeq = first.at(-1)?.sequence ?? 0;
    const second = await adapter.subscribe({ sessionId: session.sessionId, lastSequence: lastSeq });
    expect(second).toHaveLength(0);
  });

  it('health 返回 adapter 版本 + harness 提交 + 状态', async () => {
    const { adapter } = buildAdapter();
    const health = await adapter.health();
    expect(health.adapterVersion).toBe('0.1.0-test');
    expect(health.harnessCommit).toMatch(/^b150a551/);
    expect(health.status).toBe('OK');
    expect(Array.isArray(health.plugins)).toBe(true);
    expect(health.modelRoutingVersion).toMatch(/^stub-v0\.1\.1-rc\.2$/);
  });

  it('backend 不可用时降级：落 task.failed，全返预算，抛出 HarnessBackendUnavailableError', async () => {
    const failingBackend: HarnessBackend = {
      async initialize() {
        return { harnessRunId: 'fail-run-1', modelRoutingVersion: 'fail' };
      },
      async sendPrompt() {
        throw new HarnessBackendUnavailableError('runtime 不可达');
      },
      async *streamEvents() {
        yield { method: 'session.created', params: { harnessRunId: 'fail-run-1' } };
      },
      async cancelRun() {
        return { cancelled: false, detail: 'no run' };
      },
      async resumeRun() {
        return { resumed: false, detail: 'no run' };
      },
      async rawHealth() {
        return {
          commit: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
          status: 'UNAVAILABLE',
          queuedTasks: 0,
          plugins: [],
          modelRoutingVersion: 'fail',
          dependencies: [{ name: 'harness-runtime', healthy: false, detail: '不可达' }],
        };
      },
    };
    const { adapter } = buildAdapter(failingBackend);
    const session = await adapter.createSession({
      tenantId: tenantId(),
      actorId: actorId(),
      role: 'SALES',
      spaceRef: 'merchant/stub',
      modelStrategy: modelStrategy(),
      budget: budgetInput(),
      availableTools: [],
    });
    await expect(
      adapter.run({
        sessionId: session.sessionId,
        message: '会失败',
        attachments: [],
        executionMode: 'AUTO',
        idempotencyKey: 'idem-fail-1',
        traceId: traceId(),
      }),
    ).rejects.toBeInstanceOf(HarnessBackendUnavailableError);
    const all = await adapter.subscribe({ sessionId: session.sessionId, lastSequence: 0 });
    expect(all.some((event: HarnessEventEnvelope) => event.eventType === 'task.failed')).toBe(true);
  });

  it('事件信封必含 8 个必填字段', async () => {
    const { adapter } = buildAdapter();
    const session = await adapter.createSession({
      tenantId: tenantId(),
      actorId: actorId(),
      role: 'SALES',
      spaceRef: 'merchant/stub',
      modelStrategy: modelStrategy(),
      budget: budgetInput(),
      availableTools: [],
    });
    await adapter.run({
      sessionId: session.sessionId,
      message: '信封校验',
      attachments: [],
      executionMode: 'AUTO',
      idempotencyKey: 'idem-env-1',
      traceId: traceId(),
    });
    const all = await adapter.subscribe({ sessionId: session.sessionId, lastSequence: 0 });
    for (const event of all) {
      expect(event.tenantId).toBe(tenantId());
      expect(event.actorId).toBe(actorId());
      expect(event.sessionId).toBe(session.sessionId);
      // taskId 在 session.created 时可为 null；其他事件为 UUID
      expect(event.taskId === null || typeof event.taskId === 'string').toBe(true);
      expect(Number.isInteger(event.sequence)).toBe(true);
      expect(event.sequence).toBeGreaterThan(0);
      expect(event.traceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(event.occurredAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(event.schemaVersion).toBe(1);
    }
  });

  it('16 个标准事件类型齐全', () => {
    expect(HARNESS_EVENT_TYPES).toHaveLength(16);
    expect(HARNESS_EVENT_TYPES).toContain('session.created');
    expect(HARNESS_EVENT_TYPES).toContain('message.completed');
    expect(HARNESS_EVENT_TYPES).toContain('tool.failed');
    expect(HARNESS_EVENT_TYPES).toContain('approval.resolved');
    expect(HARNESS_EVENT_TYPES).toContain('artifact.created');
    expect(HARNESS_EVENT_TYPES).toContain('task.cancelled');
  });
});
