import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { AuthorizationContext } from './access-control.js';
import type { SessionIdentity } from './session-identity.js';

type OperationsIdentity = SessionIdentity & Partial<AuthorizationContext>;
const StatusQuerySchema = z.object({
  storeId: UuidSchema.optional(),
  status: z.string().trim().min(1).max(40).optional(),
});
const CreateShiftSchema = z
  .object({
    storeId: UuidSchema,
    assigneeUserId: UuidSchema,
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .superRefine((value, context) => {
    const start = new Date(value.startsAt).getTime();
    const end = new Date(value.endsAt).getTime();
    if (end <= start || end - start > 24 * 60 * 60 * 1000)
      context.addIssue({ code: 'custom', path: ['endsAt'], message: 'shift must be within 24h' });
  });
const CreateTaskSchema = z
  .object({
    storeId: UuidSchema,
    customerId: UuidSchema.optional(),
    conversationId: UuidSchema.optional(),
    taskType: z.enum(['FOLLOW_UP', 'RETENTION', 'COMPLAINT', 'KNOWLEDGE_GAP', 'SERVICE_RECOVERY']),
    priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
    assignedUserId: UuidSchema.optional(),
    dueAt: z.string().datetime({ offset: true }),
    summaryRedacted: z.record(z.string(), z.unknown()),
  })
  .refine((value) => Boolean(value.customerId || value.conversationId), {
    message: 'task resource required',
  });
const CompleteTaskSchema = z.object({
  expectedVersion: z.number().int().positive(),
  resolutionCode: z.string().trim().min(1).max(120),
});
const DecideQualitySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    decision: z.enum(['REVIEWED', 'REMEDIATION_REQUIRED']),
    accuracyScore: z.number().int().min(0).max(100),
    safetyScore: z.number().int().min(0).max(100),
    policyScore: z.number().int().min(0).max(100),
    findingsRedacted: z.record(z.string(), z.unknown()),
    remediationDueAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((value) => value.decision !== 'REMEDIATION_REQUIRED' || value.remediationDueAt, {
    path: ['remediationDueAt'],
    message: 'remediation due date required',
  });

export class CustomerServiceOperationsAuthorizationError extends Error {}
export class CustomerServiceOperationsConflictError extends Error {}
export class CustomerServiceOperationsStateError extends Error {}

export interface CustomerServiceOperationsService {
  listShifts(identity: OperationsIdentity, query: unknown): Promise<unknown[]>;
  createShift(
    identity: OperationsIdentity,
    key: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
  listTasks(identity: OperationsIdentity, query: unknown): Promise<unknown[]>;
  createTask(
    identity: OperationsIdentity,
    key: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
  completeTask(
    identity: OperationsIdentity,
    taskId: string,
    key: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
  listQualityReviews(identity: OperationsIdentity, query: unknown): Promise<unknown[]>;
  decideQualityReview(
    identity: OperationsIdentity,
    reviewId: string,
    key: string,
    traceId: string,
    body: unknown,
  ): Promise<unknown>;
}

function storeScope(identity: OperationsIdentity, requestedStoreId?: string): string[] | null {
  if (!identity.accessScopes || !identity.assignedStoreIds)
    throw new CustomerServiceOperationsAuthorizationError();
  if (identity.accessScopes.some((scope) => ['TENANT', 'ALL'].includes(scope)))
    return requestedStoreId ? [requestedStoreId] : null;
  const assigned = [...new Set(identity.assignedStoreIds)];
  if (requestedStoreId) {
    if (!assigned.includes(requestedStoreId))
      throw new CustomerServiceOperationsAuthorizationError();
    return [requestedStoreId];
  }
  if (assigned.length === 0) throw new CustomerServiceOperationsAuthorizationError();
  return assigned;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

export function createCustomerServiceOperationsService(
  pool: Pick<pg.Pool, 'connect'>,
): CustomerServiceOperationsService {
  async function tx<T>(identity: OperationsIdentity, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [identity.tenantId]);
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

  async function lockKey(client: pg.PoolClient, identity: OperationsIdentity, key: string) {
    if (!key || key.length > 255) throw new CustomerServiceOperationsConflictError();
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `${identity.tenantId}:${key}`,
    ]);
  }

  async function assertAssignee(
    client: pg.PoolClient,
    identity: OperationsIdentity,
    storeId: string,
    userId: string,
  ) {
    const result = await client.query(
      `SELECT 1 FROM tenant_memberships membership JOIN member_role_assignments assignment
         ON assignment.tenant_id=membership.tenant_id AND assignment.user_id=membership.user_id
       WHERE membership.tenant_id=$1 AND membership.user_id=$2 AND membership.membership_status='ACTIVE'
         AND (assignment.valid_until IS NULL OR assignment.valid_until>now())
         AND assignment.role_code IN ('MERCHANT_OWNER','STORE_MANAGER','CUSTOMER_SERVICE')
         AND (assignment.store_id IS NULL OR assignment.store_id=$3) LIMIT 1`,
      [identity.tenantId, userId, storeId],
    );
    if (result.rowCount !== 1) throw new CustomerServiceOperationsAuthorizationError();
  }

  function audit(
    client: pg.PoolClient,
    identity: OperationsIdentity,
    action: string,
    resourceType: string,
    resourceId: string,
    permission: string,
    after: unknown,
    traceId: string,
  ) {
    return client.query(
      `INSERT INTO audit_logs(tenant_id,actor_type,actor_id,action,resource_type,resource_id,
         permission_code,result_code,after_redacted,trace_id)
       VALUES($1,'USER',$2,$3,$4,$5,$6,'SUCCESS',$7::jsonb,$8)`,
      [
        identity.tenantId,
        identity.userId,
        action,
        resourceType,
        resourceId,
        permission,
        JSON.stringify(after),
        traceId,
      ],
    );
  }

  return {
    async listShifts(identity, rawQuery) {
      const query = StatusQuerySchema.parse(rawQuery);
      const scope = storeScope(identity, query.storeId);
      return tx(identity, async (client) => {
        const rows = await client.query<Record<string, unknown>>(
          `SELECT shift.id,shift.store_id,store.store_name,shift.assignee_user_id,
                  shift.starts_at,shift.ends_at,shift.status,shift.version,shift.created_at,shift.updated_at
             FROM customer_service_shifts shift JOIN stores store
               ON store.tenant_id=shift.tenant_id AND store.id=shift.store_id
            WHERE shift.tenant_id=$1 AND ($2::uuid[] IS NULL OR shift.store_id=ANY($2))
              AND ($3::text IS NULL OR shift.status=$3)
            ORDER BY shift.starts_at,shift.id LIMIT 200`,
          [identity.tenantId, scope, query.status ?? null],
        );
        return rows.rows.map((row) => ({
          id: row.id,
          storeId: row.store_id,
          storeName: row.store_name,
          assigneeUserId: row.assignee_user_id,
          startsAt: iso(row.starts_at as Date | string),
          endsAt: iso(row.ends_at as Date | string),
          status: row.status,
          version: Number(row.version),
          createdAt: iso(row.created_at as Date | string),
          updatedAt: iso(row.updated_at as Date | string),
        }));
      });
    },
    async createShift(identity, key, traceId, rawBody) {
      const body = CreateShiftSchema.parse(rawBody);
      storeScope(identity, body.storeId);
      const requestHash = hash(body);
      return tx(identity, async (client) => {
        await lockKey(client, identity, key);
        const replay = await client.query<Record<string, unknown>>(
          `SELECT * FROM customer_service_shifts WHERE tenant_id=$1 AND idempotency_key=$2`,
          [identity.tenantId, key],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].request_hash !== requestHash)
            throw new CustomerServiceOperationsConflictError();
          return replay.rows[0];
        }
        await assertAssignee(client, identity, body.storeId, body.assigneeUserId);
        const overlap = await client.query(
          `SELECT 1 FROM customer_service_shifts WHERE tenant_id=$1 AND store_id=$2
             AND assignee_user_id=$3 AND status IN ('SCHEDULED','ACTIVE')
             AND tstzrange(starts_at,ends_at,'[)') && tstzrange($4::timestamptz,$5::timestamptz,'[)')
           LIMIT 1 FOR UPDATE`,
          [identity.tenantId, body.storeId, body.assigneeUserId, body.startsAt, body.endsAt],
        );
        if (overlap.rowCount) throw new CustomerServiceOperationsStateError();
        const id = randomUUID();
        const created = await client.query<Record<string, unknown>>(
          `INSERT INTO customer_service_shifts(id,tenant_id,store_id,assignee_user_id,
             starts_at,ends_at,created_by,idempotency_key,request_hash)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            id,
            identity.tenantId,
            body.storeId,
            body.assigneeUserId,
            body.startsAt,
            body.endsAt,
            identity.userId,
            key,
            requestHash,
          ],
        );
        await audit(
          client,
          identity,
          'customer_service.shift.create',
          'customer_service_shift',
          id,
          'merchant_profile.manage',
          {
            storeId: body.storeId,
            assigneeUserId: body.assigneeUserId,
            startsAt: body.startsAt,
            endsAt: body.endsAt,
          },
          traceId,
        );
        return created.rows[0]!;
      });
    },
    async listTasks(identity, rawQuery) {
      const query = StatusQuerySchema.parse(rawQuery);
      const scope = storeScope(identity, query.storeId);
      return tx(identity, async (client) => {
        const rows = await client.query<Record<string, unknown>>(
          `SELECT id,store_id,customer_id,conversation_id,task_type,priority,status,
                  assigned_user_id,due_at,summary_redacted,resolution_code,version,created_at,completed_at
             FROM customer_service_tasks WHERE tenant_id=$1
              AND ($2::uuid[] IS NULL OR store_id=ANY($2)) AND ($3::text IS NULL OR status=$3)
            ORDER BY due_at,id LIMIT 200`,
          [identity.tenantId, scope, query.status ?? null],
        );
        return rows.rows.map((row) => ({
          id: row.id,
          storeId: row.store_id,
          customerId: row.customer_id,
          conversationId: row.conversation_id,
          taskType: row.task_type,
          priority: row.priority,
          status: row.status,
          assignedUserId: row.assigned_user_id,
          dueAt: iso(row.due_at as Date | string),
          summaryRedacted: row.summary_redacted,
          resolutionCode: row.resolution_code,
          version: Number(row.version),
          createdAt: iso(row.created_at as Date | string),
          completedAt: iso(row.completed_at as Date | string | null),
        }));
      });
    },
    async createTask(identity, key, traceId, rawBody) {
      const body = CreateTaskSchema.parse(rawBody);
      storeScope(identity, body.storeId);
      const requestHash = hash(body);
      return tx(identity, async (client) => {
        await lockKey(client, identity, key);
        const replay = await client.query<Record<string, unknown>>(
          `SELECT * FROM customer_service_tasks WHERE tenant_id=$1 AND idempotency_key=$2`,
          [identity.tenantId, key],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].request_hash !== requestHash)
            throw new CustomerServiceOperationsConflictError();
          return replay.rows[0];
        }
        const resource = await client.query(
          `SELECT 1 FROM customer_profiles customer
            WHERE customer.tenant_id=$1
              AND customer.id=COALESCE($3::uuid,(
                SELECT conversation.customer_id FROM conversations conversation
                 WHERE conversation.tenant_id=$1 AND conversation.id=$4 AND conversation.store_id=$2
              ))
              AND (($4::uuid IS NOT NULL AND EXISTS(
                    SELECT 1 FROM conversations conversation WHERE conversation.tenant_id=$1
                      AND conversation.id=$4 AND conversation.customer_id=customer.id
                      AND conversation.store_id=$2
                  )) OR ($4::uuid IS NULL AND (EXISTS(
                    SELECT 1 FROM orders scoped_order WHERE scoped_order.tenant_id=$1
                      AND scoped_order.customer_id=customer.id AND scoped_order.store_id=$2
                  ) OR EXISTS(
                    SELECT 1 FROM conversations scoped_conversation WHERE scoped_conversation.tenant_id=$1
                      AND scoped_conversation.customer_id=customer.id AND scoped_conversation.store_id=$2
                  )))) LIMIT 1`,
          [identity.tenantId, body.storeId, body.customerId ?? null, body.conversationId ?? null],
        );
        if (resource.rowCount !== 1) throw new CustomerServiceOperationsAuthorizationError();
        if (body.assignedUserId)
          await assertAssignee(client, identity, body.storeId, body.assignedUserId);
        const id = randomUUID();
        const created = await client.query<Record<string, unknown>>(
          `INSERT INTO customer_service_tasks(id,tenant_id,store_id,customer_id,conversation_id,
             task_type,priority,status,assigned_user_id,due_at,summary_redacted,created_by,
             idempotency_key,request_hash)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14) RETURNING *`,
          [
            id,
            identity.tenantId,
            body.storeId,
            body.customerId ?? null,
            body.conversationId ?? null,
            body.taskType,
            body.priority,
            body.assignedUserId ? 'ASSIGNED' : 'OPEN',
            body.assignedUserId ?? null,
            body.dueAt,
            JSON.stringify(body.summaryRedacted),
            identity.userId,
            key,
            requestHash,
          ],
        );
        await audit(
          client,
          identity,
          'customer_service.task.create',
          'customer_service_task',
          id,
          'customer_service.send',
          {
            storeId: body.storeId,
            taskType: body.taskType,
            priority: body.priority,
            dueAt: body.dueAt,
          },
          traceId,
        );
        return created.rows[0]!;
      });
    },
    async completeTask(identity, taskId, key, traceId, rawBody) {
      UuidSchema.parse(taskId);
      const body = CompleteTaskSchema.parse(rawBody);
      const scope = storeScope(identity);
      const completionHash = hash({ taskId, ...body });
      return tx(identity, async (client) => {
        await lockKey(client, identity, key);
        const current = await client.query<Record<string, unknown>>(
          `SELECT * FROM customer_service_tasks WHERE tenant_id=$1 AND id=$2
             AND ($3::uuid[] IS NULL OR store_id=ANY($3)) FOR UPDATE`,
          [identity.tenantId, taskId, scope],
        );
        const row = current.rows[0];
        if (!row) throw new CustomerServiceOperationsAuthorizationError();
        if (row.completion_idempotency_key) {
          if (row.completion_idempotency_key !== key || row.completion_hash !== completionHash)
            throw new CustomerServiceOperationsConflictError();
          return row;
        }
        if (
          !['OPEN', 'ASSIGNED'].includes(String(row.status)) ||
          Number(row.version) !== body.expectedVersion
        )
          throw new CustomerServiceOperationsStateError();
        const updated = await client.query<Record<string, unknown>>(
          `UPDATE customer_service_tasks SET status='DONE',resolution_code=$4,
             completion_idempotency_key=$5,completion_hash=$6,completed_by=$7,
             completed_at=now(),version=version+1
           WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING *`,
          [
            identity.tenantId,
            taskId,
            body.expectedVersion,
            body.resolutionCode,
            key,
            completionHash,
            identity.userId,
          ],
        );
        if (updated.rowCount !== 1) throw new CustomerServiceOperationsConflictError();
        await audit(
          client,
          identity,
          'customer_service.task.complete',
          'customer_service_task',
          taskId,
          'customer_service.close',
          { status: 'DONE', resolutionCode: body.resolutionCode },
          traceId,
        );
        return updated.rows[0]!;
      });
    },
    async listQualityReviews(identity, rawQuery) {
      const query = StatusQuerySchema.parse(rawQuery);
      const scope = storeScope(identity, query.storeId);
      return tx(identity, async (client) => {
        const rows = await client.query<Record<string, unknown>>(
          `SELECT id,store_id,conversation_id,trigger_type,status,reviewer_user_id,
                  accuracy_score,safety_score,policy_score,findings_redacted,
                  remediation_task_id,reviewed_at,version,created_at
             FROM customer_service_quality_reviews WHERE tenant_id=$1
              AND ($2::uuid[] IS NULL OR store_id=ANY($2)) AND ($3::text IS NULL OR status=$3)
            ORDER BY created_at DESC,id LIMIT 200`,
          [identity.tenantId, scope, query.status ?? null],
        );
        return rows.rows.map((row) => ({
          id: row.id,
          storeId: row.store_id,
          conversationId: row.conversation_id,
          triggerType: row.trigger_type,
          status: row.status,
          reviewerUserId: row.reviewer_user_id,
          accuracyScore: row.accuracy_score,
          safetyScore: row.safety_score,
          policyScore: row.policy_score,
          findingsRedacted: row.findings_redacted,
          remediationTaskId: row.remediation_task_id,
          reviewedAt: iso(row.reviewed_at as Date | string | null),
          version: Number(row.version),
          createdAt: iso(row.created_at as Date | string),
        }));
      });
    },
    async decideQualityReview(identity, reviewId, key, traceId, rawBody) {
      UuidSchema.parse(reviewId);
      const body = DecideQualitySchema.parse(rawBody);
      const scope = storeScope(identity);
      const decisionHash = hash({ reviewId, ...body });
      return tx(identity, async (client) => {
        await lockKey(client, identity, key);
        const current = await client.query<Record<string, unknown>>(
          `SELECT review.*,conversation.customer_id FROM customer_service_quality_reviews review
             JOIN conversations conversation ON conversation.tenant_id=review.tenant_id
               AND conversation.id=review.conversation_id
            WHERE review.tenant_id=$1 AND review.id=$2
              AND ($3::uuid[] IS NULL OR review.store_id=ANY($3)) FOR UPDATE OF review`,
          [identity.tenantId, reviewId, scope],
        );
        const row = current.rows[0];
        if (!row) throw new CustomerServiceOperationsAuthorizationError();
        if (row.decision_idempotency_key) {
          if (row.decision_idempotency_key !== key || row.decision_hash !== decisionHash)
            throw new CustomerServiceOperationsConflictError();
          return row;
        }
        if (row.status !== 'PENDING' || Number(row.version) !== body.expectedVersion)
          throw new CustomerServiceOperationsStateError();
        let remediationTaskId: string | null = null;
        if (body.decision === 'REMEDIATION_REQUIRED') {
          remediationTaskId = randomUUID();
          const taskKey = `${key}:remediation`;
          await client.query(
            `INSERT INTO customer_service_tasks(id,tenant_id,store_id,customer_id,conversation_id,
               task_type,priority,status,due_at,summary_redacted,created_by,idempotency_key,request_hash)
             VALUES($1,$2,$3,$4,$5,'KNOWLEDGE_GAP','HIGH','OPEN',$6,$7::jsonb,$8,$9,$10)`,
            [
              remediationTaskId,
              identity.tenantId,
              row.store_id,
              row.customer_id,
              row.conversation_id,
              body.remediationDueAt,
              JSON.stringify({ qualityReviewId: reviewId, findings: body.findingsRedacted }),
              identity.userId,
              taskKey,
              hash({ reviewId, taskKey }),
            ],
          );
        }
        const updated = await client.query<Record<string, unknown>>(
          `UPDATE customer_service_quality_reviews SET status=$4,reviewer_user_id=$5,
             accuracy_score=$6,safety_score=$7,policy_score=$8,findings_redacted=$9::jsonb,
             remediation_task_id=$10,decision_idempotency_key=$11,decision_hash=$12,
             reviewed_at=now(),version=version+1
           WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING *`,
          [
            identity.tenantId,
            reviewId,
            body.expectedVersion,
            body.decision,
            identity.userId,
            body.accuracyScore,
            body.safetyScore,
            body.policyScore,
            JSON.stringify(body.findingsRedacted),
            remediationTaskId,
            key,
            decisionHash,
          ],
        );
        if (updated.rowCount !== 1) throw new CustomerServiceOperationsConflictError();
        await audit(
          client,
          identity,
          'customer_service.quality.decide',
          'customer_service_quality_review',
          reviewId,
          'customer_service.close',
          {
            status: body.decision,
            remediationTaskId,
            scores: {
              accuracy: body.accuracyScore,
              safety: body.safetyScore,
              policy: body.policyScore,
            },
          },
          traceId,
        );
        return updated.rows[0]!;
      });
    },
  };
}
