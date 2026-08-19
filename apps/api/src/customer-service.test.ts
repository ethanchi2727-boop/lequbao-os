import { describe, expect, it, vi } from 'vitest';
import {
  createCustomerService,
  CustomerServiceConcurrencyError,
  CustomerServiceNotificationError,
} from './customer-service.js';

const tenantId = '46000000-0000-4000-8000-000000000001';
const customerId = '46000000-0000-4000-8000-000000000002';
const storeId = '46000000-0000-4000-8000-000000000003';
const conversationId = '46000000-0000-4000-8000-000000000004';
const messageId = '46000000-0000-4000-8000-000000000005';
const ticketId = '46000000-0000-4000-8000-000000000006';
const userId = '46000000-0000-4000-8000-000000000007';
const privacyRequestId = '46000000-0000-4000-8000-000000000008';
const consentId = '46000000-0000-4000-8000-000000000009';
const notificationId = '46000000-0000-4000-8000-000000000010';
const factId = '46000000-0000-4000-8000-000000000011';
const knowledgeBaseId = '46000000-0000-4000-8000-000000000012';
const knowledgeDocumentId = '46000000-0000-4000-8000-000000000013';
const knowledgePublicationId = '46000000-0000-4000-8000-000000000014';

const consumer = {
  tenantId,
  customerId,
  storeId,
  sessionId: 'consumer-session-1',
  authLevel: 'PHONE_BOUND' as const,
};
const staff = {
  tenantId,
  userId,
  roleCodes: ['CUSTOMER_SERVICE'],
  storeIds: [storeId],
  sessionId: 'employee-session-1',
  authLevel: 'MFA' as const,
  accessScopes: ['STORE'],
  assignedStoreIds: [storeId],
};

type QueryResult = { rows: unknown[]; rowCount: number };
const result = (rows: unknown[] = [], rowCount = rows.length): QueryResult => ({ rows, rowCount });

function conversationRow(status = 'BOT_ACTIVE', assignedUserId: string | null = null) {
  return {
    id: conversationId,
    store_id: storeId,
    customer_id: customerId,
    channel: 'MERCHANT_MINI_PROGRAM',
    status,
    risk_level: status === 'BOT_ACTIVE' ? 'NORMAL' : 'ELEVATED',
    assigned_user_id: assignedUserId,
    context_type: 'NONE',
    context_id: null,
    version: 3,
    created_at: '2026-08-18T04:00:00.000Z',
    updated_at: '2026-08-18T04:01:00.000Z',
    ticket_id: status === 'BOT_ACTIVE' ? null : ticketId,
    reason_code: status === 'BOT_ACTIVE' ? null : 'CUSTOMER_REQUESTED_HUMAN',
    priority: status === 'BOT_ACTIVE' ? null : 'NORMAL',
    ticket_status: status === 'HUMAN_ACTIVE' ? 'ASSIGNED' : 'OPEN',
    due_at: status === 'BOT_ACTIVE' ? null : '2026-08-18T04:30:00.000Z',
    ticket_assigned_user_id: assignedUserId,
  };
}

function messageRow(senderType = 'CUSTOMER', senderUserId: string | null = null) {
  return {
    id: messageId,
    conversation_id: conversationId,
    sender_type: senderType,
    sender_user_id: senderUserId,
    display_name: senderUserId ? '真实客服小李' : null,
    message_type: 'TEXT',
    content_object_key: `${tenantId}/customer-service/message.txt`,
    content_preview_redacted: '营业时间是几点？',
    risk_labels: [],
    created_at: '2026-08-18T04:02:00.000Z',
  };
}

function knowledgePublicationRow(status = 'ACTIVE') {
  return {
    id: knowledgePublicationId,
    store_id: storeId,
    knowledge_base_id: knowledgeBaseId,
    document_id: knowledgeDocumentId,
    document_version: 2,
    source_type: 'MERCHANT_RULE',
    trust_level: 'AUTHORITATIVE',
    title: '门店营业时间',
    status,
    valid_from: '2026-08-18T00:00:00.000Z',
    expires_at: '2027-08-18T00:00:00.000Z',
    published_by: userId,
    published_at: '2026-08-18T04:00:00.000Z',
  };
}

function fixture(
  custom: (sql: string, values: readonly unknown[] | undefined) => QueryResult | undefined = () =>
    undefined,
  notifier?: Parameters<typeof createCustomerService>[2],
) {
  let status = 'BOT_ACTIVE';
  let assigned: string | null = null;
  const query = vi.fn(async (rawSql: string, values?: readonly unknown[]) => {
    const sql = rawSql.replace(/\s+/gu, ' ').trim();
    const overridden = custom(sql, values);
    if (overridden) return overridden;
    if (sql.startsWith('SELECT 1 FROM consumer_sessions')) return result([{ ok: true }]);
    if (sql.startsWith('INSERT INTO idempotency_keys')) return result([{ id: 'idempotency' }]);
    if (sql.startsWith('SELECT store_id,customer_id,status,repeat_question_fingerprint'))
      return result([
        {
          store_id: storeId,
          customer_id: customerId,
          status,
          repeat_question_fingerprint: null,
          repeat_question_count: 0,
        },
      ]);
    if (sql.startsWith('SELECT conversation.id,conversation.store_id'))
      return result([conversationRow(status, assigned)]);
    if (sql.startsWith('SELECT message.id,message.conversation_id'))
      return result([messageRow(assigned ? 'EMPLOYEE' : 'CUSTOMER', assigned)]);
    if (sql.startsWith('SELECT id FROM handoff_tickets')) return result();
    if (sql.startsWith('INSERT INTO handoff_tickets')) {
      status = 'HUMAN_QUEUED';
      return result([{ id: ticketId }]);
    }
    if (sql.startsWith("UPDATE handoff_tickets SET status='ASSIGNED'")) {
      assigned = userId;
      return result([{ id: ticketId }]);
    }
    if (sql.startsWith("UPDATE conversations SET status='HUMAN_ACTIVE'")) {
      status = 'HUMAN_ACTIVE';
      assigned = userId;
      return result([], 1);
    }
    if (sql.startsWith("UPDATE conversations SET status='HUMAN_REQUESTED'")) {
      status = 'HUMAN_REQUESTED';
      return result([], 1);
    }
    if (sql.startsWith("UPDATE conversations SET status='HUMAN_QUEUED'")) {
      status = 'HUMAN_QUEUED';
      return result([], 1);
    }
    if (sql.startsWith('INSERT INTO conversation_messages')) return result([{ id: messageId }]);
    if (sql.startsWith('INSERT INTO customer_consents')) return result([{ id: consentId }]);
    if (sql.startsWith('INSERT INTO customer_privacy_requests'))
      return result([{ id: privacyRequestId }]);
    if (sql.startsWith('SELECT notification.id,notification.conversation_id'))
      return result([
        {
          id: notificationId,
          conversation_id: conversationId,
          ticket_id: ticketId,
          store_id: storeId,
        },
      ]);
    return result();
  });
  const client = { query, release: vi.fn() };
  const putText = vi.fn().mockResolvedValue(undefined);
  const getText = vi.fn().mockResolvedValue('stored content');
  return {
    query,
    putText,
    getText,
    service: createCustomerService(
      { connect: vi.fn(async () => client) } as never,
      { putText, getText },
      notifier,
    ),
  };
}

const consumerCommand = (body: unknown, idempotencyKey = 'consumer-command-1') => ({
  identity: consumer,
  idempotencyKey,
  traceId: 'trace-1',
  body,
});
const staffCommand = (body: unknown, idempotencyKey = 'staff-command-1') => ({
  identity: staff,
  idempotencyKey,
  traceId: 'trace-1',
  body,
});

describe('customer-service conversation and human takeover', () => {
  it('lists only the authenticated consumer current-store conversations', async () => {
    const fx = fixture((sql, values) => {
      if (sql.startsWith('SELECT id FROM conversations')) {
        expect(values).toEqual([tenantId, customerId, storeId]);
        return result([{ id: conversationId }]);
      }
      return undefined;
    });
    await expect(fx.service.listConsumerConversations(consumer)).resolves.toEqual([
      expect.objectContaining({ id: conversationId, customerId, storeId }),
    ]);
  });

  it('CS-001 persists customer content before returning the message id and queues AI asynchronously', async () => {
    const order: string[] = [];
    const fx = fixture((sql) => {
      if (sql.startsWith('INSERT INTO conversation_messages')) order.push('database-message');
      return undefined;
    });
    fx.putText.mockImplementation(async () => {
      order.push('object-content');
    });
    const response = await fx.service.sendCustomerMessage(
      consumerCommand({ conversationId, content: '营业时间是几点？' }),
    );
    expect(response.id).toBe(messageId);
    expect(order.slice(0, 2)).toEqual(['object-content', 'database-message']);
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO conversation_ai_jobs'),
      expect.arrayContaining([tenantId, conversationId, messageId]),
    );
  });

  it('CS-004 routes refund or compensation requests to a durable human queue without an AI job', async () => {
    const fx = fixture();
    await fx.service.sendCustomerMessage(
      consumerCommand({ conversationId, content: '我要退款并要求赔偿' }),
    );
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO handoff_tickets')),
    ).toBe(true);
    expect(
      fx.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO conversation_ai_jobs')),
    ).toBe(false);
    const outboxValues = fx.query.mock.calls
      .filter(([sql]) => String(sql).includes('customer_service.human_requested.v1'))
      .flatMap(([, values]) => values ?? []);
    expect(JSON.stringify(outboxValues)).not.toContain('我要退款并要求赔偿');
  });

  it('CS-005 allows an authorized store employee to claim and atomically blocks queued AI work', async () => {
    const fx = fixture();
    const response = await fx.service.accept(staffCommand({ conversationId }));
    expect(response.status).toBe('HUMAN_ACTIVE');
    expect(response.assignedUserId).toBe(userId);
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE conversation_ai_jobs SET status='CANCELLED'"),
      [tenantId, conversationId],
    );
  });

  it('CS-006 returns a concurrency conflict when another employee already claimed the ticket', async () => {
    const fx = fixture((sql) =>
      sql.startsWith("UPDATE handoff_tickets SET status='ASSIGNED'") ? result() : undefined,
    );
    await expect(fx.service.accept(staffCommand({ conversationId }))).rejects.toBeInstanceOf(
      CustomerServiceConcurrencyError,
    );
  });

  it('CS-007 retains the delivered in-app queue when optional WeCom notification fails', async () => {
    const notifier: NonNullable<Parameters<typeof createCustomerService>[2]> = {
      sendWeComInternal: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    const fx = fixture(() => undefined, notifier);
    await expect(
      fx.service.dispatchNotification(tenantId, notificationId, 'trace-notification'),
    ).rejects.toBeInstanceOf(CustomerServiceNotificationError);
    expect(
      fx.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes("SET status='FAILED'") &&
          (values as unknown[] | undefined)?.includes(notificationId),
      ),
    ).toBe(true);
    expect(fx.query.mock.calls.some(([sql]) => String(sql).includes("channel='IN_APP'"))).toBe(
      false,
    );
  });

  it('CS-008 persists the authenticated assigned employee identity and ignores spoofed sender fields', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT conversation.id,conversation.store_id'))
        return result([conversationRow('HUMAN_ACTIVE', userId)]);
      if (sql.startsWith('SELECT message.id,message.conversation_id'))
        return result([messageRow('EMPLOYEE', userId)]);
      return undefined;
    });
    const response = await fx.service.sendEmployeeMessage(
      staffCommand({
        conversationId,
        content: '您好，我是本店客服小李。',
        senderUserId: '46000000-0000-4000-8000-999999999999',
      }),
    );
    expect(response.senderUserId).toBe(userId);
    const insert = fx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO conversation_messages'),
    );
    expect(insert?.[1]).toContain(userId);
    expect(insert?.[1]).not.toContain('46000000-0000-4000-8000-999999999999');
  });

  it('CS-009 appends withdrawal evidence, stops new personalization and queues existing facts', async () => {
    const fx = fixture();
    const response = await fx.service.changeConsent(
      consumerCommand({
        consentType: 'PROFILE_MEMORY',
        status: 'WITHDRAWN',
        policyVersion: 'privacy-6.1',
        evidenceRef: 'ui://privacy-center/confirm-1',
        purpose: 'CONTINUOUS_CUSTOMER_SERVICE',
      }),
    );
    expect(response).toEqual({ requestId: privacyRequestId, status: 'WITHDRAWN' });
    expect(
      fx.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO customer_privacy_requests'),
      ),
    ).toBe(true);
    expect(
      fx.query.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE customer_profile_facts SET status='DELETION_PENDING'"),
      ),
    ).toBe(true);
  });

  it('CS-010 keeps full chat content only in the object-store call, not event or trace payloads', async () => {
    const content = '我的手机号是13812345678，请问明天营业吗？';
    const fx = fixture();
    await fx.service.sendCustomerMessage(consumerCommand({ conversationId, content }));
    expect(fx.putText).toHaveBeenCalledWith(expect.objectContaining({ content }));
    const durablePayloads = fx.query.mock.calls
      .filter(([sql]) => String(sql).includes('outbox_events'))
      .flatMap(([, values]) => values ?? []);
    expect(JSON.stringify(durablePayloads)).not.toContain(content);
    expect(JSON.stringify(fx.query.mock.calls)).not.toContain('13812345678');
  });

  it('reads full message content only after consumer ownership is revalidated', async () => {
    const objectKey = `${tenantId}/customer-service/message.txt`;
    const fx = fixture((sql) =>
      sql.startsWith('SELECT message.content_object_key')
        ? result([{ content_object_key: objectKey }])
        : undefined,
    );
    fx.getText.mockResolvedValue('完整会话正文');
    await expect(
      fx.service.getConsumerMessageContent(consumer, conversationId, messageId),
    ).resolves.toEqual({ content: '完整会话正文' });
    expect(fx.query).toHaveBeenCalledWith(expect.stringContaining('conversation.customer_id=$4'), [
      tenantId,
      messageId,
      conversationId,
      customerId,
      storeId,
    ]);
  });

  it('audits every authorized employee read of full message content', async () => {
    const objectKey = `${tenantId}/customer-service/message.txt`;
    const fx = fixture((sql) =>
      sql.startsWith('SELECT content_object_key FROM conversation_messages')
        ? result([{ content_object_key: objectKey }])
        : undefined,
    );
    await fx.service.getStaffMessageContent(staff, conversationId, messageId, 'trace-content-read');
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining("'customer_service.content.read'"),
      expect.arrayContaining([tenantId, userId, messageId, 'trace-content-read']),
    );
  });
});

describe('customer-service knowledge and privacy controls', () => {
  it('queues a scoped correction without writing replacement content to database parameters', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT 1 FROM customer_profile_facts')) return result([{ ok: true }]);
      return undefined;
    });
    const replacementValue = '我偏好无糖饮品';
    const response = await fx.service.requestPrivacy(
      consumerCommand({
        requestType: 'CORRECT',
        scope: ['PREFERENCE'],
        correction: { factId, replacementValue, reason: '原记录不准确' },
      }),
    );
    expect(response).toEqual({ requestId: privacyRequestId, status: 'QUEUED' });
    expect(fx.putText).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining(replacementValue) }),
    );
    expect(JSON.stringify(fx.query.mock.calls)).not.toContain(replacementValue);
  });

  it('immediately restricts current profile facts while the privacy worker handles retention', async () => {
    const fx = fixture();
    await fx.service.requestPrivacy(
      consumerCommand({ requestType: 'RESTRICT', scope: ['PROFILE_FACTS'] }),
    );
    expect(fx.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status='RETAINED_RESTRICTED'"),
      [tenantId, customerId],
    );
  });

  it('publishes only a ready non-sensitive document in the authenticated employee store scope', async () => {
    const fx = fixture((sql) => {
      if (sql.startsWith('SELECT document.id,document.knowledge_base_id'))
        return result([
          {
            id: knowledgeDocumentId,
            knowledge_base_id: knowledgeBaseId,
            title: '门店营业时间',
            content_object_key: `${tenantId}/knowledge/opening-hours.txt`,
            content_hash: 'a'.repeat(64),
            version: 2,
            store_id: storeId,
          },
        ]);
      if (sql.startsWith('INSERT INTO knowledge_publications'))
        return result([{ id: knowledgePublicationId }]);
      if (sql.startsWith('SELECT id,store_id,knowledge_base_id'))
        return result([knowledgePublicationRow()]);
      return undefined;
    });
    const response = await fx.service.publishKnowledge(
      staffCommand({
        documentId: knowledgeDocumentId,
        storeId,
        sourceType: 'MERCHANT_RULE',
        trustLevel: 'AUTHORITATIVE',
        validFrom: '2026-08-18T00:00:00.000Z',
        expiresAt: '2027-08-18T00:00:00.000Z',
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({ id: knowledgePublicationId, status: 'ACTIVE' }),
    );
    expect(fx.query).toHaveBeenCalledWith(expect.stringContaining("document.status='READY'"), [
      tenantId,
      knowledgeDocumentId,
    ]);
  });

  it('rejects publishing into a store outside the employee assignment before touching the database', async () => {
    const fx = fixture();
    await expect(
      fx.service.publishKnowledge(
        staffCommand({
          documentId: knowledgeDocumentId,
          storeId: '46000000-0000-4000-8000-000000000099',
          sourceType: 'MERCHANT_RULE',
          trustLevel: 'VERIFIED',
          validFrom: '2026-08-18T00:00:00.000Z',
        }),
      ),
    ).rejects.toThrow();
    expect(fx.query).not.toHaveBeenCalled();
  });
});
