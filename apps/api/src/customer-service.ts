import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { ConsumerSessionIdentity } from './consumer-session-identity.js';
import type { IntakeObjectStore } from './intake-object-store.js';
import { IdempotencyConflictError } from './revenue-right-service.js';
import type { SessionIdentity } from './session-identity.js';

const ChannelSchema = z.enum(['MERCHANT_MINI_PROGRAM', 'LEQU_LIFE', 'WEB']);
const ConversationStatusSchema = z.enum([
  'BOT_ACTIVE',
  'HUMAN_REQUESTED',
  'HUMAN_QUEUED',
  'HUMAN_ACTIVE',
  'WAITING_CUSTOMER',
  'CLOSED',
]);
const RiskLevelSchema = z.enum(['NORMAL', 'ELEVATED', 'HIGH']);

const ConversationSchema = z.object({
  id: UuidSchema,
  storeId: UuidSchema,
  customerId: UuidSchema,
  channel: ChannelSchema,
  status: ConversationStatusSchema,
  riskLevel: RiskLevelSchema,
  assignedUserId: UuidSchema.nullable(),
  contextType: z.enum(['NONE', 'PRODUCT', 'GROUP_BUY', 'ORDER']).nullable(),
  contextId: UuidSchema.nullable(),
  ticket: z
    .object({
      id: UuidSchema,
      reasonCode: z.string(),
      priority: z.enum(['NORMAL', 'HIGH', 'URGENT']),
      status: z.enum(['OPEN', 'ASSIGNED', 'RESOLVED', 'CANCELLED', 'EXPIRED']),
      dueAt: z.string().nullable(),
      assignedUserId: UuidSchema.nullable(),
    })
    .nullable(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const MessageSchema = z.object({
  id: UuidSchema,
  conversationId: UuidSchema,
  senderType: z.enum(['CUSTOMER', 'AI', 'EMPLOYEE', 'SYSTEM']),
  senderUserId: UuidSchema.nullable(),
  senderDisplayName: z.string().nullable(),
  messageType: z.enum(['TEXT', 'IMAGE', 'FILE', 'ORDER_CARD', 'PRODUCT_CARD', 'SYSTEM_EVENT']),
  contentObjectRef: z.string(),
  contentPreviewRedacted: z.string().nullable(),
  riskLabels: z.array(z.string()),
  createdAt: z.string(),
});

const CreateConversationSchema = z.object({
  channel: ChannelSchema,
  privacyPolicyVersion: z.string().min(1).max(80),
  profileMemoryConsent: z.boolean().default(false),
  consentEvidenceRef: z.string().min(1).max(500),
  contextType: z.enum(['NONE', 'PRODUCT', 'GROUP_BUY', 'ORDER']).default('NONE'),
  contextId: UuidSchema.nullable().optional(),
});
const CustomerMessageInputSchema = z.object({
  conversationId: UuidSchema,
  content: z.string().trim().min(1).max(4000),
  messageType: z.literal('TEXT').default('TEXT'),
});
const RequestHumanSchema = z.object({
  conversationId: UuidSchema,
  reasonCode: z.string().min(1).max(120),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
});
const StaffConversationSchema = z.object({ conversationId: UuidSchema });
const StaffMessageSchema = z.object({
  conversationId: UuidSchema,
  content: z.string().trim().min(1).max(4000),
});
const CloseSchema = z.object({
  conversationId: UuidSchema,
  resolutionCode: z.string().min(1).max(120),
  internalNote: z.string().max(2000).optional(),
});
const ConsentChangeSchema = z.object({
  consentType: z.enum(['PROFILE_MEMORY', 'MARKETING', 'SUBSCRIPTION_MESSAGE', 'LOCATION']),
  status: z.enum(['GRANTED', 'WITHDRAWN']),
  policyVersion: z.string().min(1).max(80),
  evidenceRef: z.string().min(1).max(500),
  purpose: z.string().min(1).max(255),
});
const PrivacyRequestSchema = z
  .object({
    requestType: z.enum(['VIEW', 'CORRECT', 'DELETE', 'RESTRICT']),
    scope: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    correction: z
      .object({
        factId: UuidSchema,
        replacementValue: z.string().trim().min(1).max(2000),
        reason: z.string().trim().min(1).max(500),
      })
      .optional(),
  })
  .superRefine((input, context) => {
    if ((input.requestType === 'CORRECT') !== Boolean(input.correction))
      context.addIssue({
        code: 'custom',
        message: 'correction is required only for CORRECT requests',
      });
  });
const PublishKnowledgeSchema = z.object({
  documentId: UuidSchema,
  storeId: UuidSchema,
  sourceType: z.enum([
    'MERCHANT_RULE',
    'MERCHANT_FILE',
    'EMPLOYEE_CONFIRMED_QA',
    'PUBLIC_REFERENCE',
  ]),
  trustLevel: z.enum(['AUTHORITATIVE', 'VERIFIED', 'REFERENCE']),
  validFrom: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});
const RevokeKnowledgeSchema = z.object({
  publicationId: UuidSchema,
  reason: z.string().trim().min(1).max(500),
});
const KnowledgePublicationSchema = z.object({
  id: UuidSchema,
  storeId: UuidSchema,
  knowledgeBaseId: UuidSchema,
  documentId: UuidSchema,
  documentVersion: z.number().int().positive(),
  sourceType: z.string(),
  trustLevel: z.string(),
  title: z.string(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']),
  validFrom: z.string(),
  expiresAt: z.string().nullable(),
  publishedBy: UuidSchema,
  publishedAt: z.string(),
});

type StaffIdentity = SessionIdentity & {
  accessScopes?: string[];
  assignedStoreIds?: string[];
};
type ConsumerCommand = {
  identity: ConsumerSessionIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
};
type StaffCommand = {
  identity: StaffIdentity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
};

export type CustomerServiceConversation = z.infer<typeof ConversationSchema>;
export type CustomerServiceMessage = z.infer<typeof MessageSchema>;

export interface CustomerServiceNotificationDispatcher {
  sendWeComInternal(input: {
    tenantId: string;
    storeId: string;
    conversationId: string;
    ticketId: string;
    notificationId: string;
    traceId: string;
  }): Promise<void>;
}

export interface CustomerService {
  createConversation(command: ConsumerCommand): Promise<CustomerServiceConversation>;
  sendCustomerMessage(command: ConsumerCommand): Promise<CustomerServiceMessage>;
  requestHuman(command: ConsumerCommand): Promise<CustomerServiceConversation>;
  getConsumerConversation(
    identity: ConsumerSessionIdentity,
    conversationId: string,
  ): Promise<CustomerServiceConversation>;
  listConsumerConversations(
    identity: ConsumerSessionIdentity,
  ): Promise<CustomerServiceConversation[]>;
  listConsumerMessages(
    identity: ConsumerSessionIdentity,
    conversationId: string,
  ): Promise<CustomerServiceMessage[]>;
  getConsumerMessageContent(
    identity: ConsumerSessionIdentity,
    conversationId: string,
    messageId: string,
  ): Promise<{ content: string }>;
  changeConsent(command: ConsumerCommand): Promise<{ requestId: string | null; status: string }>;
  requestPrivacy(command: ConsumerCommand): Promise<{ requestId: string; status: string }>;
  getProfile(identity: ConsumerSessionIdentity): Promise<unknown>;
  listKnowledge(identity: StaffIdentity, storeId?: string): Promise<unknown[]>;
  publishKnowledge(command: StaffCommand): Promise<unknown>;
  revokeKnowledge(command: StaffCommand): Promise<unknown>;
  listQueue(identity: StaffIdentity, status?: string): Promise<CustomerServiceConversation[]>;
  getConversation(
    identity: StaffIdentity,
    conversationId: string,
  ): Promise<CustomerServiceConversation>;
  listMessages(identity: StaffIdentity, conversationId: string): Promise<CustomerServiceMessage[]>;
  getStaffMessageContent(
    identity: StaffIdentity,
    conversationId: string,
    messageId: string,
    traceId: string,
  ): Promise<{ content: string }>;
  accept(command: StaffCommand): Promise<CustomerServiceConversation>;
  sendEmployeeMessage(command: StaffCommand): Promise<CustomerServiceMessage>;
  returnToAi(command: StaffCommand): Promise<CustomerServiceConversation>;
  close(command: StaffCommand): Promise<CustomerServiceConversation>;
  dispatchNotification(tenantId: string, notificationId: string, traceId: string): Promise<void>;
  requestHumanBySystem(input: {
    tenantId: string;
    conversationId: string;
    reasonCode: string;
    priority: 'NORMAL' | 'HIGH' | 'URGENT';
    traceId: string;
  }): Promise<CustomerServiceConversation>;
}

export class CustomerServiceAuthenticationError extends Error {}
export class CustomerServiceAuthorizationError extends Error {}
export class CustomerServiceStateError extends Error {}
export class CustomerServiceConcurrencyError extends Error {}
export class CustomerServiceNotificationError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(',')}}`;
};

export function classifyCustomerServiceRisk(content: string): {
  labels: string[];
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  requiresHuman: boolean;
} {
  const rules: Array<[RegExp, string, 'NORMAL' | 'HIGH' | 'URGENT']> = [
    [/退款|退钱|赔偿|赔付|补偿/u, 'FINANCIAL_REMEDY', 'HIGH'],
    [/投诉|举报|曝光|律师|法律|起诉/u, 'COMPLAINT_OR_LEGAL', 'HIGH'],
    [/食品安全|吃坏|中毒|过敏|医疗|药物/u, 'HEALTH_OR_SAFETY', 'URGENT'],
    [/自杀|自残|不想活|威胁/u, 'IMMEDIATE_SAFETY', 'URGENT'],
    [/人工|真人|客服人员/u, 'CUSTOMER_REQUESTED_HUMAN', 'NORMAL'],
  ];
  const matched = rules.filter(([pattern]) => pattern.test(content));
  return {
    labels: matched.map(([, label]) => label),
    priority: matched.some(([, , priority]) => priority === 'URGENT')
      ? 'URGENT'
      : matched.some(([, , priority]) => priority === 'HIGH')
        ? 'HIGH'
        : 'NORMAL',
    requiresHuman: matched.length > 0,
  };
}

const redactPreview = (content: string) =>
  content
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/gu, '1**********')
    .replace(/\b\d{15,18}[0-9Xx]\b/gu, '[证件已隐藏]')
    .slice(0, 80);

export function createCustomerService(
  pool: Pick<pg.Pool, 'connect'>,
  objectStore: Pick<IntakeObjectStore, 'putText' | 'getText'>,
  notifications?: CustomerServiceNotificationDispatcher,
): CustomerService {
  async function transaction<T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await pool.connect();
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

  async function reserve(
    client: pg.PoolClient,
    tenantId: string,
    scope: string,
    key: string,
    request: unknown,
  ): Promise<unknown | undefined> {
    const hash = digest(canonical(request));
    const inserted = await client.query(
      `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,expires_at)
       VALUES ($1,$2,$3,$4,now()+interval '24 hours')
       ON CONFLICT (tenant_id,scope,idempotency_key) DO NOTHING RETURNING id`,
      [tenantId, scope, key, hash],
    );
    if (inserted.rowCount === 1) return undefined;
    const existing = await client.query<{ request_hash: string; response_body: unknown }>(
      `SELECT request_hash,response_body FROM idempotency_keys
        WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE`,
      [tenantId, scope, key],
    );
    const row = existing.rows[0];
    if (!row || row.request_hash !== hash) throw new IdempotencyConflictError();
    if (row.response_body === null) throw new CustomerServiceStateError('command pending');
    return row.response_body;
  }

  async function complete(
    client: pg.PoolClient,
    tenantId: string,
    scope: string,
    key: string,
    response: unknown,
    resourceId: string,
  ) {
    await client.query(
      `UPDATE idempotency_keys SET response_status=200,response_body=$4::jsonb,
              resource_type='customer_service',resource_id=$5
        WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3`,
      [tenantId, scope, key, JSON.stringify(response), resourceId],
    );
  }

  async function validateConsumer(client: pg.PoolClient, identity: ConsumerSessionIdentity) {
    const current = await client.query(
      `SELECT 1 FROM consumer_sessions
        WHERE tenant_id=$1 AND session_id=$2 AND customer_id=$3 AND store_id=$4
          AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`,
      [identity.tenantId, identity.sessionId, identity.customerId, identity.storeId],
    );
    if (current.rowCount !== 1) throw new CustomerServiceAuthenticationError();
    await client.query(
      `UPDATE consumer_sessions SET last_seen_at=now()
        WHERE tenant_id=$1 AND session_id=$2 AND last_seen_at<now()-interval '5 minutes'`,
      [identity.tenantId, identity.sessionId],
    );
  }

  function assertStaffStore(identity: StaffIdentity, storeId: string) {
    const scopes = identity.accessScopes ?? [];
    if (scopes.some((scope) => ['TENANT', 'ALL'].includes(scope))) return;
    if (
      scopes.includes('STORE') &&
      (identity.assignedStoreIds ?? identity.storeIds).includes(storeId)
    )
      return;
    throw new CustomerServiceAuthorizationError();
  }

  async function loadConversation(client: pg.PoolClient, tenantId: string, conversationId: string) {
    const result = await client.query<{
      id: string;
      store_id: string;
      customer_id: string;
      channel: string;
      status: string;
      risk_level: string;
      assigned_user_id: string | null;
      context_type: string | null;
      context_id: string | null;
      version: number;
      created_at: Date | string;
      updated_at: Date | string;
      ticket_id: string | null;
      reason_code: string | null;
      priority: string | null;
      ticket_status: string | null;
      due_at: Date | string | null;
      ticket_assigned_user_id: string | null;
    }>(
      `SELECT conversation.id,conversation.store_id,conversation.customer_id,conversation.channel,
              conversation.status,conversation.risk_level,conversation.assigned_user_id,
              conversation.context_type,conversation.context_id,conversation.version,
              conversation.created_at,conversation.updated_at,ticket.id AS ticket_id,
              ticket.reason_code,ticket.priority,ticket.status AS ticket_status,ticket.due_at,
              ticket.assigned_user_id AS ticket_assigned_user_id
         FROM conversations conversation
         LEFT JOIN LATERAL (
           SELECT * FROM handoff_tickets candidate
            WHERE candidate.tenant_id=conversation.tenant_id
              AND candidate.conversation_id=conversation.id
            ORDER BY candidate.created_at DESC LIMIT 1
         ) ticket ON true
        WHERE conversation.tenant_id=$1 AND conversation.id=$2`,
      [tenantId, conversationId],
    );
    const row = result.rows[0];
    if (!row?.store_id) throw new CustomerServiceAuthorizationError();
    return ConversationSchema.parse({
      id: row.id,
      storeId: row.store_id,
      customerId: row.customer_id,
      channel: row.channel,
      status: row.status,
      riskLevel: row.risk_level,
      assignedUserId: row.assigned_user_id,
      contextType: row.context_type,
      contextId: row.context_id,
      ticket: row.ticket_id
        ? {
            id: row.ticket_id,
            reasonCode: row.reason_code,
            priority: row.priority,
            status: row.ticket_status,
            dueAt: row.due_at ? new Date(row.due_at).toISOString() : null,
            assignedUserId: row.ticket_assigned_user_id,
          }
        : null,
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
  }

  async function loadMessage(client: pg.PoolClient, tenantId: string, messageId: string) {
    const result = await client.query<{
      id: string;
      conversation_id: string;
      sender_type: string;
      sender_user_id: string | null;
      display_name: string | null;
      message_type: string;
      content_object_key: string;
      content_preview_redacted: string | null;
      risk_labels: string[];
      created_at: Date | string;
    }>(
      `SELECT message.id,message.conversation_id,message.sender_type,message.sender_user_id,
              actor.display_name,message.message_type,message.content_object_key,
              message.content_preview_redacted,message.risk_labels,message.created_at
         FROM conversation_messages message
         LEFT JOIN users actor ON actor.id=message.sender_user_id
        WHERE message.tenant_id=$1 AND message.id=$2`,
      [tenantId, messageId],
    );
    const row = result.rows[0];
    if (!row) throw new CustomerServiceStateError('message missing');
    return MessageSchema.parse({
      id: row.id,
      conversationId: row.conversation_id,
      senderType: row.sender_type,
      senderUserId: row.sender_user_id,
      senderDisplayName: row.display_name,
      messageType: row.message_type,
      contentObjectRef: row.content_object_key,
      contentPreviewRedacted: row.content_preview_redacted,
      riskLabels: row.risk_labels,
      createdAt: new Date(row.created_at).toISOString(),
    });
  }

  async function loadKnowledgePublication(
    client: pg.PoolClient,
    tenantId: string,
    publicationId: string,
  ) {
    const result = await client.query<{
      id: string;
      store_id: string;
      knowledge_base_id: string;
      document_id: string;
      document_version: number;
      source_type: string;
      trust_level: string;
      title: string;
      status: string;
      valid_from: Date | string;
      expires_at: Date | string | null;
      published_by: string;
      published_at: Date | string;
    }>(
      `SELECT id,store_id,knowledge_base_id,document_id,document_version,source_type,
              trust_level,title,status,valid_from,expires_at,published_by,published_at
         FROM knowledge_publications WHERE tenant_id=$1 AND id=$2`,
      [tenantId, publicationId],
    );
    const row = result.rows[0];
    if (!row) throw new CustomerServiceStateError('knowledge publication missing');
    return KnowledgePublicationSchema.parse({
      id: row.id,
      storeId: row.store_id,
      knowledgeBaseId: row.knowledge_base_id,
      documentId: row.document_id,
      documentVersion: row.document_version,
      sourceType: row.source_type,
      trustLevel: row.trust_level,
      title: row.title,
      status: row.status,
      validFrom: new Date(row.valid_from).toISOString(),
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      publishedBy: row.published_by,
      publishedAt: new Date(row.published_at).toISOString(),
    });
  }

  async function enqueueHandoff(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      conversationId: string;
      storeId: string;
      reasonCode: string;
      priority: 'NORMAL' | 'HIGH' | 'URGENT';
      requestedByType: 'CUSTOMER' | 'RULE' | 'AI' | 'EMPLOYEE';
      traceId: string;
    },
  ) {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM handoff_tickets
        WHERE tenant_id=$1 AND conversation_id=$2 AND status IN ('OPEN','ASSIGNED')
        FOR UPDATE`,
      [input.tenantId, input.conversationId],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    await client.query(
      `UPDATE conversations SET status='HUMAN_REQUESTED',risk_level=$3,ai_processing_state='BLOCKED',
              version=version+1
        WHERE tenant_id=$1 AND id=$2 AND status='BOT_ACTIVE'`,
      [input.tenantId, input.conversationId, input.priority === 'URGENT' ? 'HIGH' : 'ELEVATED'],
    );
    const ticket = await client.query<{ id: string }>(
      `INSERT INTO handoff_tickets(
         tenant_id,conversation_id,reason_code,priority,status,due_at,requested_by_type
       ) VALUES ($1,$2,$3,$4,'OPEN',now()+CASE $4
           WHEN 'URGENT' THEN interval '5 minutes'
           WHEN 'HIGH' THEN interval '15 minutes'
           ELSE interval '30 minutes' END,$5) RETURNING id`,
      [
        input.tenantId,
        input.conversationId,
        input.reasonCode,
        input.priority,
        input.requestedByType,
      ],
    );
    const ticketId = ticket.rows[0]!.id;
    await client.query(
      `UPDATE conversations SET status='HUMAN_QUEUED',version=version+1
        WHERE tenant_id=$1 AND id=$2 AND status='HUMAN_REQUESTED'`,
      [input.tenantId, input.conversationId],
    );
    await client.query(
      `INSERT INTO customer_service_notifications(
         tenant_id,conversation_id,ticket_id,channel,recipient_scope,payload_summary,status,
         attempt_count,delivered_at
       ) VALUES
         ($1,$2,$3,'IN_APP',$4::jsonb,$5::jsonb,'DELIVERED',1,now()),
         ($1,$2,$3,'WECOM_INTERNAL',$4::jsonb,$5::jsonb,'PENDING',0,NULL)`,
      [
        input.tenantId,
        input.conversationId,
        ticketId,
        JSON.stringify({ store_id: input.storeId, roles: ['STORE_MANAGER', 'CUSTOMER_SERVICE'] }),
        JSON.stringify({ reason_code: input.reasonCode, priority: input.priority }),
      ],
    );
    await client.query(
      `INSERT INTO outbox_events(
         tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
         payload,pii_classification,trace_id,occurred_at
       ) SELECT $1,'customer_service.human_requested.v1','conversation',$2,version,
                'conversation:'||($2::uuid)::text,$3::jsonb,'PERSONAL',$4,now()
           FROM conversations WHERE tenant_id=$1 AND id=$2`,
      [
        input.tenantId,
        input.conversationId,
        JSON.stringify({
          conversation_id: input.conversationId,
          ticket_id: ticketId,
          store_id: input.storeId,
          reason_code: input.reasonCode,
          priority: input.priority,
        }),
        input.traceId,
      ],
    );
    return ticketId;
  }

  return {
    async createConversation(command) {
      const input = CreateConversationSchema.parse(command.body);
      if ((input.contextType === 'NONE') !== !input.contextId)
        throw new CustomerServiceStateError('context type and id must match');
      const scope = 'customer-service.conversation.create';
      return transaction(command.identity.tenantId, async (client) => {
        await validateConsumer(client, command.identity);
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          input,
        );
        if (replay) return ConversationSchema.parse(replay);
        await client.query(
          `INSERT INTO customer_consents(
             tenant_id,customer_id,consent_type,policy_version,status,evidence_ref,occurred_at,
             purpose,interface_ref
           ) VALUES ($1,$2,'SERVICE',$3,'GRANTED',$4,now(),'ONLINE_CUSTOMER_SERVICE','ASK_THE_CLERK')`,
          [
            command.identity.tenantId,
            command.identity.customerId,
            input.privacyPolicyVersion,
            input.consentEvidenceRef,
          ],
        );
        if (input.profileMemoryConsent) {
          await client.query(
            `INSERT INTO customer_consents(
               tenant_id,customer_id,consent_type,policy_version,status,evidence_ref,occurred_at,
               purpose,interface_ref,valid_until
             ) VALUES ($1,$2,'PROFILE_MEMORY',$3,'GRANTED',$4,now(),
                       'CONTINUOUS_CUSTOMER_SERVICE','ASK_THE_CLERK',now()+interval '365 days')`,
            [
              command.identity.tenantId,
              command.identity.customerId,
              input.privacyPolicyVersion,
              input.consentEvidenceRef,
            ],
          );
        }
        const created = await client.query<{ id: string }>(
          `INSERT INTO conversations(
             tenant_id,store_id,customer_id,channel,status,risk_level,consumer_session_id,
             privacy_policy_version,context_type,context_id
           ) VALUES ($1,$2,$3,$4,'BOT_ACTIVE','NORMAL',$5,$6,$7,$8) RETURNING id`,
          [
            command.identity.tenantId,
            command.identity.storeId,
            command.identity.customerId,
            input.channel,
            command.identity.sessionId,
            input.privacyPolicyVersion,
            input.contextType,
            input.contextId ?? null,
          ],
        );
        const conversationId = created.rows[0]!.id;
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) VALUES ($1,'customer_service.conversation_started.v1','conversation',$2,1,
                     'conversation:'||($2::uuid)::text,$3::jsonb,'PERSONAL',$4,now())`,
          [
            command.identity.tenantId,
            conversationId,
            JSON.stringify({
              conversation_id: conversationId,
              store_id: command.identity.storeId,
              customer_id_hash: digest(command.identity.customerId),
              channel: input.channel,
              risk_level: 'NORMAL',
            }),
            command.traceId,
          ],
        );
        const response = await loadConversation(client, command.identity.tenantId, conversationId);
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          conversationId,
        );
        return response;
      });
    },

    async sendCustomerMessage(command) {
      const input = CustomerMessageInputSchema.parse(command.body);
      const contentHash = digest(input.content);
      const objectKey = `${command.identity.tenantId}/customer-service/${input.conversationId}/messages/${digest(command.idempotencyKey)}.txt`;
      await objectStore.putText({ objectKey, content: input.content, sha256: contentHash });
      const scope = `customer-service.message.customer:${input.conversationId}`;
      return transaction(command.identity.tenantId, async (client) => {
        await validateConsumer(client, command.identity);
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          { ...input, content: contentHash },
        );
        if (replay) return MessageSchema.parse(replay);
        const conversation = await client.query<{
          store_id: string;
          customer_id: string;
          status: string;
          repeat_question_fingerprint: string | null;
          repeat_question_count: number;
        }>(
          `SELECT store_id,customer_id,status,repeat_question_fingerprint,repeat_question_count
             FROM conversations WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [command.identity.tenantId, input.conversationId],
        );
        const current = conversation.rows[0];
        if (
          !current ||
          current.customer_id !== command.identity.customerId ||
          current.store_id !== command.identity.storeId ||
          current.status === 'CLOSED'
        )
          throw new CustomerServiceAuthorizationError();
        if (current.status === 'WAITING_CUSTOMER') {
          await client.query(
            `UPDATE conversations SET status='HUMAN_ACTIVE',version=version+1
              WHERE tenant_id=$1 AND id=$2 AND status='WAITING_CUSTOMER'`,
            [command.identity.tenantId, input.conversationId],
          );
        }
        const risk = classifyCustomerServiceRisk(input.content);
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO conversation_messages(
             tenant_id,conversation_id,sender_type,content_object_key,content_preview_redacted,
             message_type,risk_labels
           ) VALUES ($1,$2,'CUSTOMER',$3,$4,$5,$6::text[]) RETURNING id`,
          [
            command.identity.tenantId,
            input.conversationId,
            objectKey,
            redactPreview(input.content),
            input.messageType,
            risk.labels,
          ],
        );
        const messageId = inserted.rows[0]!.id;
        const fingerprint = digest(input.content.toLocaleLowerCase().replace(/\s+/gu, ''));
        const repeatCount =
          current.repeat_question_fingerprint === fingerprint
            ? current.repeat_question_count + 1
            : 1;
        await client.query(
          `UPDATE conversations SET last_message_at=now(),version=version+1,
                  repeat_question_fingerprint=$3,repeat_question_count=$4,
                  ai_processing_state=CASE WHEN status='BOT_ACTIVE' THEN 'QUEUED' ELSE 'BLOCKED' END
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.conversationId, fingerprint, repeatCount],
        );
        if (risk.requiresHuman || repeatCount >= 2) {
          await enqueueHandoff(client, {
            tenantId: command.identity.tenantId,
            conversationId: input.conversationId,
            storeId: current.store_id,
            reasonCode: risk.labels[0] ?? 'REPEATED_UNRESOLVED',
            priority: risk.priority,
            requestedByType: risk.labels.includes('CUSTOMER_REQUESTED_HUMAN') ? 'CUSTOMER' : 'RULE',
            traceId: command.traceId,
          });
        } else {
          await client.query(
            `INSERT INTO conversation_ai_jobs(tenant_id,conversation_id,customer_message_id)
             VALUES ($1,$2,$3)`,
            [command.identity.tenantId, input.conversationId, messageId],
          );
          await client.query(
            `INSERT INTO outbox_events(
               tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
               payload,pii_classification,trace_id,occurred_at
             ) SELECT $1,'customer_service.message_received.v1','conversation',$2,version,
                      'conversation:'||($2::uuid)::text,$3::jsonb,'PERSONAL',$4,now()
                 FROM conversations WHERE tenant_id=$1 AND id=$2`,
            [
              command.identity.tenantId,
              input.conversationId,
              JSON.stringify({
                conversation_id: input.conversationId,
                message_id: messageId,
                sender_type: 'CUSTOMER',
                message_type: input.messageType,
                content_ref: objectKey,
              }),
              command.traceId,
            ],
          );
        }
        const response = await loadMessage(client, command.identity.tenantId, messageId);
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          messageId,
        );
        return response;
      });
    },

    async requestHuman(command) {
      const input = RequestHumanSchema.parse(command.body);
      const scope = `customer-service.handoff.request:${input.conversationId}`;
      return transaction(command.identity.tenantId, async (client) => {
        await validateConsumer(client, command.identity);
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          input,
        );
        if (replay) return ConversationSchema.parse(replay);
        const conversation = await client.query<{ store_id: string; customer_id: string }>(
          `SELECT store_id,customer_id FROM conversations
            WHERE tenant_id=$1 AND id=$2 AND status='BOT_ACTIVE' FOR UPDATE`,
          [command.identity.tenantId, input.conversationId],
        );
        const current = conversation.rows[0];
        if (
          !current ||
          current.customer_id !== command.identity.customerId ||
          current.store_id !== command.identity.storeId
        )
          throw new CustomerServiceAuthorizationError();
        await enqueueHandoff(client, {
          tenantId: command.identity.tenantId,
          conversationId: input.conversationId,
          storeId: current.store_id,
          reasonCode: input.reasonCode,
          priority: input.priority,
          requestedByType: 'CUSTOMER',
          traceId: command.traceId,
        });
        const response = await loadConversation(
          client,
          command.identity.tenantId,
          input.conversationId,
        );
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          input.conversationId,
        );
        return response;
      });
    },

    async getConsumerConversation(identity, rawConversationId) {
      const conversationId = UuidSchema.parse(rawConversationId);
      return transaction(identity.tenantId, async (client) => {
        await validateConsumer(client, identity);
        const conversation = await loadConversation(client, identity.tenantId, conversationId);
        if (
          conversation.customerId !== identity.customerId ||
          conversation.storeId !== identity.storeId
        )
          throw new CustomerServiceAuthorizationError();
        return conversation;
      });
    },

    async listConsumerConversations(identity) {
      return transaction(identity.tenantId, async (client) => {
        await validateConsumer(client, identity);
        const conversations = await client.query<{ id: string }>(
          `SELECT id FROM conversations
            WHERE tenant_id=$1 AND customer_id=$2 AND store_id=$3
            ORDER BY updated_at DESC,id DESC LIMIT 100`,
          [identity.tenantId, identity.customerId, identity.storeId],
        );
        return Promise.all(
          conversations.rows.map((row) => loadConversation(client, identity.tenantId, row.id)),
        );
      });
    },

    async listConsumerMessages(identity, rawConversationId) {
      const conversationId = UuidSchema.parse(rawConversationId);
      return transaction(identity.tenantId, async (client) => {
        await validateConsumer(client, identity);
        const conversation = await loadConversation(client, identity.tenantId, conversationId);
        if (
          conversation.customerId !== identity.customerId ||
          conversation.storeId !== identity.storeId
        )
          throw new CustomerServiceAuthorizationError();
        const messages = await client.query<{ id: string }>(
          `SELECT id FROM conversation_messages
            WHERE tenant_id=$1 AND conversation_id=$2 ORDER BY created_at,id`,
          [identity.tenantId, conversationId],
        );
        return Promise.all(
          messages.rows.map((row) => loadMessage(client, identity.tenantId, row.id)),
        );
      });
    },

    async getConsumerMessageContent(identity, rawConversationId, rawMessageId) {
      const conversationId = UuidSchema.parse(rawConversationId);
      const messageId = UuidSchema.parse(rawMessageId);
      const objectKey = await transaction(identity.tenantId, async (client) => {
        await validateConsumer(client, identity);
        const message = await client.query<{ content_object_key: string }>(
          `SELECT message.content_object_key
             FROM conversation_messages message
             JOIN conversations conversation
               ON conversation.tenant_id=message.tenant_id
              AND conversation.id=message.conversation_id
            WHERE message.tenant_id=$1 AND message.id=$2 AND message.conversation_id=$3
              AND conversation.customer_id=$4 AND conversation.store_id=$5`,
          [identity.tenantId, messageId, conversationId, identity.customerId, identity.storeId],
        );
        if (!message.rows[0]) throw new CustomerServiceAuthorizationError();
        return message.rows[0].content_object_key;
      });
      return { content: await objectStore.getText({ objectKey, maxBytes: 16_384 }) };
    },

    async changeConsent(command) {
      const input = ConsentChangeSchema.parse(command.body);
      const scope = `privacy.consent:${input.consentType}`;
      return transaction(command.identity.tenantId, async (client) => {
        await validateConsumer(client, command.identity);
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          input,
        );
        if (replay)
          return z.object({ requestId: UuidSchema.nullable(), status: z.string() }).parse(replay);
        const consent = await client.query<{ id: string }>(
          `INSERT INTO customer_consents(
             tenant_id,customer_id,consent_type,policy_version,status,evidence_ref,occurred_at,
             purpose,interface_ref,valid_until
           ) VALUES ($1,$2,$3,$4,$5,$6,now(),$7,'CUSTOMER_PRIVACY_CENTER',
                     CASE WHEN $5='GRANTED' THEN now()+interval '365 days' ELSE NULL END)
           RETURNING id`,
          [
            command.identity.tenantId,
            command.identity.customerId,
            input.consentType,
            input.policyVersion,
            input.status,
            input.evidenceRef,
            input.purpose,
          ],
        );
        let requestId: string | null = null;
        if (input.status === 'WITHDRAWN' && input.consentType === 'PROFILE_MEMORY') {
          const hash = digest(
            canonical({
              type: 'WITHDRAW_CONSENT',
              customerId: command.identity.customerId,
              consentType: input.consentType,
              idempotencyKey: command.idempotencyKey,
            }),
          );
          const request = await client.query<{ id: string }>(
            `INSERT INTO customer_privacy_requests(
               tenant_id,customer_id,request_type,scope,status,requested_by_session_id,request_hash
             ) VALUES ($1,$2,'WITHDRAW_CONSENT',ARRAY['PROFILE_FACTS'],'QUEUED',$3,$4)
             RETURNING id`,
            [
              command.identity.tenantId,
              command.identity.customerId,
              command.identity.sessionId,
              hash,
            ],
          );
          requestId = request.rows[0]!.id;
          await client.query(
            `UPDATE customer_profile_facts SET status='DELETION_PENDING',updated_at=now()
              WHERE tenant_id=$1 AND customer_id=$2 AND status='CURRENT'`,
            [command.identity.tenantId, command.identity.customerId],
          );
          await client.query(
            `INSERT INTO outbox_events(
               tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
               payload,pii_classification,trace_id,occurred_at
             ) VALUES ($1,'privacy.customer_deletion_requested.v1','customer_profile',$2,1,
                       'customer:'||($3::uuid)::text,$4::jsonb,'PERSONAL',$5,now())`,
            [
              command.identity.tenantId,
              requestId,
              digest(command.identity.customerId),
              JSON.stringify({
                customer_id_hash: digest(command.identity.customerId),
                request_id: requestId,
                requested_at: new Date().toISOString(),
                legal_hold: false,
              }),
              command.traceId,
            ],
          );
        }
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) VALUES ($1,'privacy.consent_changed.v1','customer_consent',$2,1,
                     'customer:'||($3::uuid)::text,$4::jsonb,'PERSONAL',$5,now())`,
          [
            command.identity.tenantId,
            consent.rows[0]!.id,
            digest(command.identity.customerId),
            JSON.stringify({
              customer_id_hash: digest(command.identity.customerId),
              consent_type: input.consentType,
              status: input.status,
              policy_version: input.policyVersion,
              occurred_at: new Date().toISOString(),
            }),
            command.traceId,
          ],
        );
        const response = { requestId, status: input.status };
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          command.identity.customerId,
        );
        return response;
      });
    },

    async requestPrivacy(command) {
      const input = PrivacyRequestSchema.parse(command.body);
      const replacementDigest = input.correction ? digest(input.correction.replacementValue) : null;
      const requestMaterial = {
        ...input,
        correction: input.correction
          ? {
              factId: input.correction.factId,
              replacementDigest,
              reasonDigest: digest(input.correction.reason),
            }
          : undefined,
      };
      const requestHash = digest(
        canonical({
          customerId: command.identity.customerId,
          idempotencyKey: command.idempotencyKey,
          request: requestMaterial,
        }),
      );
      const correctionObjectKey = input.correction
        ? `${command.identity.tenantId}/privacy/${command.identity.customerId}/${requestHash}.json`
        : null;
      if (input.correction && correctionObjectKey) {
        const content = JSON.stringify({
          factId: input.correction.factId,
          replacementValue: input.correction.replacementValue,
          reason: input.correction.reason,
        });
        await objectStore.putText({
          objectKey: correctionObjectKey,
          content,
          sha256: digest(content),
        });
      }
      const scope = `privacy.request:${input.requestType}`;
      return transaction(command.identity.tenantId, async (client) => {
        await validateConsumer(client, command.identity);
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          requestMaterial,
        );
        if (replay) return z.object({ requestId: UuidSchema, status: z.string() }).parse(replay);
        if (input.correction) {
          const target = await client.query(
            `SELECT 1 FROM customer_profile_facts
              WHERE tenant_id=$1 AND customer_id=$2 AND id=$3 AND status='CURRENT'`,
            [command.identity.tenantId, command.identity.customerId, input.correction.factId],
          );
          if (target.rowCount !== 1)
            throw new CustomerServiceAuthorizationError('profile fact is not correctable');
        }
        const created = await client.query<{ id: string }>(
          `INSERT INTO customer_privacy_requests(
             tenant_id,customer_id,request_type,scope,status,requested_by_session_id,
             request_hash,result_summary
           ) VALUES ($1,$2,$3,$4::text[],'QUEUED',$5,$6,$7::jsonb) RETURNING id`,
          [
            command.identity.tenantId,
            command.identity.customerId,
            input.requestType,
            input.scope,
            command.identity.sessionId,
            requestHash,
            JSON.stringify(
              input.correction
                ? {
                    correction_object_ref: correctionObjectKey,
                    target_fact_id: input.correction.factId,
                    replacement_digest: replacementDigest,
                  }
                : {},
            ),
          ],
        );
        const requestId = created.rows[0]!.id;
        if (input.requestType === 'DELETE') {
          await client.query(
            `UPDATE customer_profiles SET status='DELETION_PENDING',version=version+1
              WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'`,
            [command.identity.tenantId, command.identity.customerId],
          );
          await client.query(
            `UPDATE customer_profile_facts SET status='DELETION_PENDING',updated_at=now()
              WHERE tenant_id=$1 AND customer_id=$2 AND status='CURRENT'`,
            [command.identity.tenantId, command.identity.customerId],
          );
          await client.query(
            `INSERT INTO outbox_events(
               tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
               payload,pii_classification,trace_id,occurred_at
             ) VALUES ($1,'privacy.customer_deletion_requested.v1','customer_profile',$2,1,
                       'customer:'||($3::uuid)::text,$4::jsonb,'PERSONAL',$5,now())`,
            [
              command.identity.tenantId,
              requestId,
              digest(command.identity.customerId),
              JSON.stringify({
                customer_id_hash: digest(command.identity.customerId),
                request_id: requestId,
                requested_at: new Date().toISOString(),
                legal_hold: false,
              }),
              command.traceId,
            ],
          );
        } else if (input.requestType === 'RESTRICT') {
          await client.query(
            `UPDATE customer_profile_facts SET status='RETAINED_RESTRICTED',updated_at=now()
              WHERE tenant_id=$1 AND customer_id=$2 AND status='CURRENT'`,
            [command.identity.tenantId, command.identity.customerId],
          );
        }
        const response = { requestId, status: 'QUEUED' };
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          requestId,
        );
        return response;
      });
    },

    async getProfile(identity) {
      const snapshot = await transaction(identity.tenantId, async (client) => {
        await validateConsumer(client, identity);
        const profile = await client.query<{
          id: string;
          status: string;
          profile_summary: unknown;
          consent_status: string | null;
        }>(
          `SELECT profile.id,profile.status,profile.profile_summary,
                  (SELECT consent.status FROM customer_consents consent
                    WHERE consent.tenant_id=profile.tenant_id AND consent.customer_id=profile.id
                      AND consent.consent_type='PROFILE_MEMORY'
                    ORDER BY consent.occurred_at DESC,consent.id DESC LIMIT 1) AS consent_status
             FROM customer_profiles profile WHERE profile.tenant_id=$1 AND profile.id=$2`,
          [identity.tenantId, identity.customerId],
        );
        const current = profile.rows[0];
        if (!current) throw new CustomerServiceAuthenticationError();
        const facts = await client.query<{
          id: string;
          fact_type: string;
          value_object_ref: string;
          value_digest: string;
          source_type: string;
          source_ref: string;
          purpose: string;
          generation_method: string;
          confidence: string | number | null;
          status: string;
          confirmed_at: Date | string;
          expires_at: Date | string;
        }>(
          `SELECT id,fact_type,source_type,source_ref,purpose,generation_method,confidence,status,
                  confirmed_at,expires_at,value_object_ref,value_digest
             FROM customer_profile_facts
            WHERE tenant_id=$1 AND customer_id=$2 AND status<>'DELETED'
            ORDER BY confirmed_at DESC`,
          [identity.tenantId, identity.customerId],
        );
        const consents = await client.query<{
          consent_type: string;
          status: string;
          policy_version: string;
          purpose: string;
          occurred_at: Date | string;
          valid_until: Date | string | null;
        }>(
          `SELECT DISTINCT ON (consent_type)
                  consent_type,status,policy_version,purpose,occurred_at,valid_until
             FROM customer_consents
            WHERE tenant_id=$1 AND customer_id=$2
              AND consent_type IN ('PROFILE_MEMORY','MARKETING','SUBSCRIPTION_MESSAGE','LOCATION')
            ORDER BY consent_type,occurred_at DESC,id DESC`,
          [identity.tenantId, identity.customerId],
        );
        return {
          id: current.id,
          status: current.status,
          summary: current.profile_summary,
          profileMemoryConsent: current.consent_status ?? 'NOT_GRANTED',
          consents: consents.rows.map((consent) => ({
            consentType: consent.consent_type,
            status: consent.status,
            policyVersion: consent.policy_version,
            purpose: consent.purpose,
            occurredAt: new Date(consent.occurred_at).toISOString(),
            validUntil: consent.valid_until ? new Date(consent.valid_until).toISOString() : null,
          })),
          facts: facts.rows,
        };
      });
      const hydratedFacts = await Promise.all(
        snapshot.facts.map(async (fact) => {
          const value = await objectStore.getText({
            objectKey: fact.value_object_ref,
            maxBytes: 16_384,
          });
          if (digest(value) !== fact.value_digest)
            throw new CustomerServiceStateError('profile fact evidence mismatch');
          return {
            id: fact.id,
            factType: fact.fact_type,
            value,
            sourceType: fact.source_type,
            sourceRef: fact.source_ref,
            purpose: fact.purpose,
            generationMethod: fact.generation_method,
            confidence: fact.confidence,
            status: fact.status,
            confirmedAt: new Date(fact.confirmed_at).toISOString(),
            expiresAt: new Date(fact.expires_at).toISOString(),
          };
        }),
      );
      return { ...snapshot, facts: hydratedFacts };
    },

    async listKnowledge(identity, rawStoreId) {
      const storeId = rawStoreId ? UuidSchema.parse(rawStoreId) : null;
      if (storeId) assertStaffStore(identity, storeId);
      return transaction(identity.tenantId, async (client) => {
        await client.query(
          `UPDATE knowledge_publications SET status='EXPIRED'
            WHERE tenant_id=$1 AND status='ACTIVE' AND expires_at<=now()`,
          [identity.tenantId],
        );
        const publications = await client.query<{ id: string; store_id: string }>(
          `SELECT id,store_id FROM knowledge_publications
            WHERE tenant_id=$1 AND ($2::uuid IS NULL OR store_id=$2)
            ORDER BY published_at DESC,id`,
          [identity.tenantId, storeId],
        );
        const visible = [];
        for (const publication of publications.rows) {
          try {
            assertStaffStore(identity, publication.store_id);
            visible.push(await loadKnowledgePublication(client, identity.tenantId, publication.id));
          } catch (error) {
            if (!(error instanceof CustomerServiceAuthorizationError)) throw error;
          }
        }
        return visible;
      });
    },

    async publishKnowledge(command) {
      const input = PublishKnowledgeSchema.parse(command.body);
      assertStaffStore(command.identity, input.storeId);
      const validFrom = new Date(input.validFrom);
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      if (expiresAt && expiresAt <= validFrom)
        throw new CustomerServiceStateError('knowledge expiry must follow activation');
      if (input.sourceType === 'PUBLIC_REFERENCE' && input.trustLevel === 'AUTHORITATIVE')
        throw new CustomerServiceStateError('public references cannot be authoritative');
      const scope = `customer-service.knowledge.publish:${input.documentId}`;
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          input,
        );
        if (replay) return KnowledgePublicationSchema.parse(replay);
        const document = await client.query<{
          id: string;
          knowledge_base_id: string;
          title: string;
          content_object_key: string | null;
          content_hash: string;
          version: number;
          store_id: string | null;
        }>(
          `SELECT document.id,document.knowledge_base_id,document.title,
                  document.content_object_key,document.content_hash,document.version,base.store_id
             FROM knowledge_documents document
             JOIN knowledge_bases base
               ON base.tenant_id=document.tenant_id AND base.id=document.knowledge_base_id
            WHERE document.tenant_id=$1 AND document.id=$2 AND document.status='READY'
              AND document.pii_classification IN ('PUBLIC','INTERNAL')
            FOR UPDATE`,
          [command.identity.tenantId, input.documentId],
        );
        const current = document.rows[0];
        if (!current || current.store_id !== input.storeId || !current.content_object_key)
          throw new CustomerServiceAuthorizationError('knowledge document is not publishable');
        const created = await client.query<{ id: string }>(
          `INSERT INTO knowledge_publications(
             tenant_id,store_id,knowledge_base_id,document_id,document_version,source_type,
             trust_level,title,citation_object_ref,content_hash,valid_from,expires_at,published_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [
            command.identity.tenantId,
            input.storeId,
            current.knowledge_base_id,
            current.id,
            current.version,
            input.sourceType,
            input.trustLevel,
            current.title,
            current.content_object_key,
            current.content_hash,
            input.validFrom,
            input.expiresAt ?? null,
            command.identity.userId,
          ],
        );
        await client.query(
          `UPDATE knowledge_documents SET valid_from=$3,expires_at=$4,published_at=now(),
                  published_by=$5,updated_at=now()
            WHERE tenant_id=$1 AND id=$2`,
          [
            command.identity.tenantId,
            current.id,
            input.validFrom,
            input.expiresAt ?? null,
            command.identity.userId,
          ],
        );
        const response = await loadKnowledgePublication(
          client,
          command.identity.tenantId,
          created.rows[0]!.id,
        );
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          response.id,
        );
        return response;
      });
    },

    async revokeKnowledge(command) {
      const input = RevokeKnowledgeSchema.parse(command.body);
      const scope = `customer-service.knowledge.revoke:${input.publicationId}`;
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          input,
        );
        if (replay) return KnowledgePublicationSchema.parse(replay);
        const current = await loadKnowledgePublication(
          client,
          command.identity.tenantId,
          input.publicationId,
        );
        assertStaffStore(command.identity, current.storeId);
        const revoked = await client.query(
          `UPDATE knowledge_publications SET status='REVOKED'
            WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'`,
          [command.identity.tenantId, input.publicationId],
        );
        if (revoked.rowCount !== 1)
          throw new CustomerServiceStateError('knowledge publication is not active');
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id,actor_type,actor_id,action,resource_type,resource_id,permission_code,
             result_code,after_redacted,trace_id
           ) VALUES ($1,'USER',$2,'knowledge.revoke','knowledge_publication',$3,
                     'merchant_profile.manage','SUCCESS',$4::jsonb,$5)`,
          [
            command.identity.tenantId,
            command.identity.userId,
            input.publicationId,
            JSON.stringify({ reason_digest: digest(input.reason) }),
            command.traceId,
          ],
        );
        const response = await loadKnowledgePublication(
          client,
          command.identity.tenantId,
          input.publicationId,
        );
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          response.id,
        );
        return response;
      });
    },

    async listQueue(identity, rawStatus) {
      const status = rawStatus
        ? z.enum(['HUMAN_QUEUED', 'HUMAN_ACTIVE', 'WAITING_CUSTOMER', 'CLOSED']).parse(rawStatus)
        : 'HUMAN_QUEUED';
      return transaction(identity.tenantId, async (client) => {
        const rows = await client.query<{ id: string; store_id: string }>(
          `SELECT id,store_id FROM conversations
            WHERE tenant_id=$1 AND status=$2 ORDER BY last_message_at NULLS LAST,created_at`,
          [identity.tenantId, status],
        );
        const visible = [];
        for (const row of rows.rows) {
          try {
            assertStaffStore(identity, row.store_id);
            visible.push(await loadConversation(client, identity.tenantId, row.id));
          } catch (error) {
            if (!(error instanceof CustomerServiceAuthorizationError)) throw error;
          }
        }
        return visible;
      });
    },

    async getConversation(identity, rawConversationId) {
      const conversationId = UuidSchema.parse(rawConversationId);
      return transaction(identity.tenantId, async (client) => {
        const response = await loadConversation(client, identity.tenantId, conversationId);
        assertStaffStore(identity, response.storeId);
        return response;
      });
    },

    async listMessages(identity, rawConversationId) {
      const conversationId = UuidSchema.parse(rawConversationId);
      return transaction(identity.tenantId, async (client) => {
        const conversation = await loadConversation(client, identity.tenantId, conversationId);
        assertStaffStore(identity, conversation.storeId);
        const messages = await client.query<{ id: string }>(
          `SELECT id FROM conversation_messages
            WHERE tenant_id=$1 AND conversation_id=$2 ORDER BY created_at,id`,
          [identity.tenantId, conversationId],
        );
        return Promise.all(
          messages.rows.map((row) => loadMessage(client, identity.tenantId, row.id)),
        );
      });
    },

    async getStaffMessageContent(identity, rawConversationId, rawMessageId, traceId) {
      const conversationId = UuidSchema.parse(rawConversationId);
      const messageId = UuidSchema.parse(rawMessageId);
      const objectKey = await transaction(identity.tenantId, async (client) => {
        const conversation = await loadConversation(client, identity.tenantId, conversationId);
        assertStaffStore(identity, conversation.storeId);
        const message = await client.query<{ content_object_key: string }>(
          `SELECT content_object_key FROM conversation_messages
            WHERE tenant_id=$1 AND id=$2 AND conversation_id=$3`,
          [identity.tenantId, messageId, conversationId],
        );
        if (!message.rows[0]) throw new CustomerServiceAuthorizationError();
        await client.query(
          `INSERT INTO audit_logs(
             tenant_id,actor_type,actor_id,action,resource_type,resource_id,permission_code,
             result_code,after_redacted,trace_id
           ) VALUES ($1,'USER',$2,'customer_service.content.read','conversation_message',$3,
                     'customer_service.read','SUCCESS',$4::jsonb,$5)`,
          [
            identity.tenantId,
            identity.userId,
            messageId,
            JSON.stringify({ conversation_id: conversationId, store_id: conversation.storeId }),
            traceId,
          ],
        );
        return message.rows[0].content_object_key;
      });
      return { content: await objectStore.getText({ objectKey, maxBytes: 16_384 }) };
    },

    async accept(command) {
      const input = StaffConversationSchema.parse(command.body);
      const scope = `customer-service.handoff.accept:${input.conversationId}`;
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          input,
        );
        if (replay) return ConversationSchema.parse(replay);
        const current = await loadConversation(
          client,
          command.identity.tenantId,
          input.conversationId,
        );
        assertStaffStore(command.identity, current.storeId);
        const claimed = await client.query<{ id: string }>(
          `UPDATE handoff_tickets SET status='ASSIGNED',assigned_user_id=$3,accepted_at=now(),
                  version=version+1
            WHERE tenant_id=$1 AND conversation_id=$2 AND status='OPEN'
          RETURNING id`,
          [command.identity.tenantId, input.conversationId, command.identity.userId],
        );
        if (claimed.rowCount !== 1) throw new CustomerServiceConcurrencyError();
        const transitioned = await client.query(
          `UPDATE conversations SET status='HUMAN_ACTIVE',assigned_user_id=$3,
                  ai_processing_state='BLOCKED',version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status='HUMAN_QUEUED'`,
          [command.identity.tenantId, input.conversationId, command.identity.userId],
        );
        if (transitioned.rowCount !== 1) throw new CustomerServiceConcurrencyError();
        await client.query(
          `UPDATE conversation_ai_jobs SET status='CANCELLED',locked_by=NULL,locked_at=NULL,
                  completed_at=now()
            WHERE tenant_id=$1 AND conversation_id=$2 AND status IN ('QUEUED','RUNNING')`,
          [command.identity.tenantId, input.conversationId],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) SELECT $1,'customer_service.human_accepted.v1','conversation',$2,version,
                    'conversation:'||($2::uuid)::text,$3::jsonb,'PERSONAL',$4,now()
               FROM conversations WHERE tenant_id=$1 AND id=$2`,
          [
            command.identity.tenantId,
            input.conversationId,
            JSON.stringify({
              conversation_id: input.conversationId,
              ticket_id: claimed.rows[0]!.id,
              assigned_user_id: command.identity.userId,
              accepted_at: new Date().toISOString(),
            }),
            command.traceId,
          ],
        );
        const response = await loadConversation(
          client,
          command.identity.tenantId,
          input.conversationId,
        );
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          input.conversationId,
        );
        return response;
      });
    },

    async sendEmployeeMessage(command) {
      const input = StaffMessageSchema.parse(command.body);
      const contentHash = digest(input.content);
      const objectKey = `${command.identity.tenantId}/customer-service/${input.conversationId}/employee/${digest(command.idempotencyKey)}.txt`;
      await objectStore.putText({ objectKey, content: input.content, sha256: contentHash });
      const scope = `customer-service.message.employee:${input.conversationId}`;
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          { ...input, content: contentHash },
        );
        if (replay) return MessageSchema.parse(replay);
        const conversation = await loadConversation(
          client,
          command.identity.tenantId,
          input.conversationId,
        );
        assertStaffStore(command.identity, conversation.storeId);
        if (
          conversation.status !== 'HUMAN_ACTIVE' ||
          conversation.assignedUserId !== command.identity.userId
        )
          throw new CustomerServiceAuthorizationError();
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO conversation_messages(
             tenant_id,conversation_id,sender_type,sender_user_id,content_object_key,
             content_preview_redacted,message_type
           ) VALUES ($1,$2,'EMPLOYEE',$3,$4,$5,'TEXT') RETURNING id`,
          [
            command.identity.tenantId,
            input.conversationId,
            command.identity.userId,
            objectKey,
            redactPreview(input.content),
          ],
        );
        const messageId = inserted.rows[0]!.id;
        await client.query(
          `UPDATE conversations SET last_message_at=now(),version=version+1
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, input.conversationId],
        );
        const response = await loadMessage(client, command.identity.tenantId, messageId);
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          messageId,
        );
        return response;
      });
    },

    async returnToAi(command) {
      const input = StaffConversationSchema.parse(command.body);
      const scope = `customer-service.return-ai:${input.conversationId}`;
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          input,
        );
        if (replay) return ConversationSchema.parse(replay);
        const current = await loadConversation(
          client,
          command.identity.tenantId,
          input.conversationId,
        );
        assertStaffStore(command.identity, current.storeId);
        if (current.assignedUserId !== command.identity.userId || current.status !== 'HUMAN_ACTIVE')
          throw new CustomerServiceAuthorizationError();
        await client.query(
          `UPDATE handoff_tickets SET status='RESOLVED',resolution_code='RETURNED_TO_AI',
                  resolved_at=now(),version=version+1
            WHERE tenant_id=$1 AND conversation_id=$2 AND status='ASSIGNED'`,
          [command.identity.tenantId, input.conversationId],
        );
        await client.query(
          `UPDATE conversations SET status='BOT_ACTIVE',assigned_user_id=NULL,
                  ai_processing_state='IDLE',version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status='HUMAN_ACTIVE' AND assigned_user_id=$3`,
          [command.identity.tenantId, input.conversationId, command.identity.userId],
        );
        const response = await loadConversation(
          client,
          command.identity.tenantId,
          input.conversationId,
        );
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          input.conversationId,
        );
        return response;
      });
    },

    async close(command) {
      const input = CloseSchema.parse(command.body);
      const scope = `customer-service.close:${input.conversationId}`;
      const summaryObjectKey = input.internalNote
        ? `${command.identity.tenantId}/customer-service/${input.conversationId}/summaries/${digest(command.idempotencyKey)}.txt`
        : null;
      if (input.internalNote && summaryObjectKey)
        await objectStore.putText({
          objectKey: summaryObjectKey,
          content: input.internalNote,
          sha256: digest(input.internalNote),
        });
      return transaction(command.identity.tenantId, async (client) => {
        const replay = await reserve(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          input,
        );
        if (replay) return ConversationSchema.parse(replay);
        const current = await loadConversation(
          client,
          command.identity.tenantId,
          input.conversationId,
        );
        assertStaffStore(command.identity, current.storeId);
        if (
          !['HUMAN_ACTIVE', 'WAITING_CUSTOMER'].includes(current.status) ||
          current.assignedUserId !== command.identity.userId
        )
          throw new CustomerServiceAuthorizationError();
        await client.query(
          `UPDATE handoff_tickets SET status='RESOLVED',resolution_code=$3,resolved_at=now(),
                  version=version+1
            WHERE tenant_id=$1 AND conversation_id=$2 AND status='ASSIGNED'`,
          [command.identity.tenantId, input.conversationId, input.resolutionCode],
        );
        await client.query(
          `UPDATE conversations SET status='CLOSED',closed_at=now(),ai_processing_state='IDLE',
                  summary_object_key=COALESCE(summary_object_key,$4),version=version+1
            WHERE tenant_id=$1 AND id=$2 AND assigned_user_id=$3
              AND status IN ('HUMAN_ACTIVE','WAITING_CUSTOMER')`,
          [
            command.identity.tenantId,
            input.conversationId,
            command.identity.userId,
            summaryObjectKey,
          ],
        );
        await client.query(
          `INSERT INTO outbox_events(
             tenant_id,event_name,aggregate_type,aggregate_id,aggregate_version,partition_key,
             payload,pii_classification,trace_id,occurred_at
           ) SELECT $1,'customer_service.conversation_closed.v1','conversation',$2,version,
                    'conversation:'||($2::uuid)::text,$3::jsonb,'PERSONAL',$4,now()
               FROM conversations WHERE tenant_id=$1 AND id=$2`,
          [
            command.identity.tenantId,
            input.conversationId,
            JSON.stringify({
              conversation_id: input.conversationId,
              resolution_code: input.resolutionCode,
              handled_by: command.identity.userId,
            }),
            command.traceId,
          ],
        );
        const response = await loadConversation(
          client,
          command.identity.tenantId,
          input.conversationId,
        );
        await complete(
          client,
          command.identity.tenantId,
          scope,
          command.idempotencyKey,
          response,
          input.conversationId,
        );
        return response;
      });
    },

    async dispatchNotification(tenantId, notificationId, traceId) {
      const claim = await transaction(tenantId, async (client) => {
        const selected = await client.query<{
          id: string;
          conversation_id: string;
          ticket_id: string;
          store_id: string;
        }>(
          `SELECT notification.id,notification.conversation_id,notification.ticket_id,
                  conversation.store_id
             FROM customer_service_notifications notification
             JOIN conversations conversation
               ON conversation.tenant_id=notification.tenant_id
              AND conversation.id=notification.conversation_id
            WHERE notification.tenant_id=$1 AND notification.id=$2
              AND notification.channel='WECOM_INTERNAL' AND notification.status='PENDING'
            FOR UPDATE OF notification`,
          [tenantId, notificationId],
        );
        const current = selected.rows[0];
        if (!current) return undefined;
        await client.query(
          `UPDATE customer_service_notifications SET attempt_count=attempt_count+1
            WHERE tenant_id=$1 AND id=$2`,
          [tenantId, notificationId],
        );
        return current;
      });
      if (!claim) return;
      if (!notifications) {
        await transaction(tenantId, (client) =>
          client.query(
            `UPDATE customer_service_notifications
                SET status='SKIPPED',last_error_code='WECOM_NOT_CONFIGURED'
              WHERE tenant_id=$1 AND id=$2 AND status='PENDING'`,
            [tenantId, notificationId],
          ),
        );
        return;
      }
      try {
        await notifications.sendWeComInternal({
          tenantId,
          storeId: claim.store_id,
          conversationId: claim.conversation_id,
          ticketId: claim.ticket_id,
          notificationId,
          traceId,
        });
        await transaction(tenantId, (client) =>
          client.query(
            `UPDATE customer_service_notifications SET status='DELIVERED',delivered_at=now()
              WHERE tenant_id=$1 AND id=$2 AND status='PENDING'`,
            [tenantId, notificationId],
          ),
        );
      } catch {
        await transaction(tenantId, (client) =>
          client.query(
            `UPDATE customer_service_notifications
                SET status='FAILED',last_error_code='WECOM_DELIVERY_FAILED'
              WHERE tenant_id=$1 AND id=$2 AND status='PENDING'`,
            [tenantId, notificationId],
          ),
        );
        throw new CustomerServiceNotificationError();
      }
    },

    async requestHumanBySystem(input) {
      return transaction(input.tenantId, async (client) => {
        const current = await client.query<{ store_id: string }>(
          `SELECT store_id FROM conversations
            WHERE tenant_id=$1 AND id=$2 AND status='BOT_ACTIVE' FOR UPDATE`,
          [input.tenantId, input.conversationId],
        );
        if (current.rows[0]) {
          await enqueueHandoff(client, {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            storeId: current.rows[0].store_id,
            reasonCode: input.reasonCode,
            priority: input.priority,
            requestedByType: 'AI',
            traceId: input.traceId,
          });
        }
        return loadConversation(client, input.tenantId, input.conversationId);
      });
    },
  };
}
