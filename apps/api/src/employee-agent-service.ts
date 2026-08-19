import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { IntakeObjectStore } from './intake-object-store.js';
import type { SessionIdentity } from './session-identity.js';
import {
  type AgentTaskAction,
  canApproveAgentStep,
  EmployeeAgentConversationRequestSchema,
  EmployeeAgentPlanSchema,
  EmployeeAgentTaskRequestSchema,
  nextAgentTaskStatus,
} from './employee-agent-policy.js';

export class EmployeeAgentAuthorizationError extends Error {}
export class EmployeeAgentConflictError extends Error {}

export interface EmployeeAgentService {
  createConversation(identity: SessionIdentity, body: unknown): Promise<unknown>;
  listConversations(identity: SessionIdentity): Promise<unknown[]>;
  getConversation(identity: SessionIdentity, conversationId: string): Promise<unknown>;
  createTask(identity: SessionIdentity, idempotencyKey: string, body: unknown): Promise<unknown>;
  listTasks(identity: SessionIdentity, status?: string): Promise<unknown[]>;
  getTask(identity: SessionIdentity, taskId: string): Promise<unknown>;
  actTask(identity: SessionIdentity, taskId: string, action: AgentTaskAction): Promise<unknown>;
  setPlan(identity: SessionIdentity, taskId: string, plan: unknown): Promise<unknown>;
  decideApproval(
    identity: SessionIdentity,
    token: string,
    decision: 'APPROVE' | 'REJECT',
  ): Promise<unknown>;
}

const mapConversation = (row: Record<string, unknown>) => ({
  id: row.id,
  storeId: row.store_id,
  mode: row.mode,
  title: row.title,
  status: row.status,
  version: Number(row.version),
  createdAt: new Date(row.created_at as string | Date).toISOString(),
  updatedAt: new Date(row.updated_at as string | Date).toISOString(),
});

export function createEmployeeAgentService(
  pool: Pick<pg.Pool, 'connect'>,
  objectStore: Pick<IntakeObjectStore, 'putText'>,
): EmployeeAgentService {
  async function transaction<T>(
    identity: SessionIdentity,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
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

  return {
    createConversation(identity, rawBody) {
      const body = EmployeeAgentConversationRequestSchema.parse(rawBody);
      return transaction(identity, async (client) => {
        if (body.storeId) {
          const store = await client.query(
            `SELECT 1 FROM stores WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE' LIMIT 1`,
            [identity.tenantId, body.storeId],
          );
          if (store.rowCount !== 1) throw new EmployeeAgentAuthorizationError();
        }
        const created = await client.query<Record<string, unknown>>(
          `INSERT INTO employee_agent_conversations(tenant_id,store_id,created_by,mode,title)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [identity.tenantId, body.storeId ?? null, identity.userId, body.mode, body.title],
        );
        return mapConversation(created.rows[0]!);
      });
    },
    listConversations(identity) {
      return transaction(identity, async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `SELECT * FROM employee_agent_conversations
           WHERE tenant_id=$1 AND created_by=$2 ORDER BY updated_at DESC,id LIMIT 100`,
          [identity.tenantId, identity.userId],
        );
        return result.rows.map(mapConversation);
      });
    },
    getConversation(identity, conversationId) {
      return transaction(identity, async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `SELECT * FROM employee_agent_conversations
           WHERE tenant_id=$1 AND id=$2 AND created_by=$3`,
          [identity.tenantId, conversationId, identity.userId],
        );
        if (!result.rows[0]) throw new EmployeeAgentAuthorizationError();
        return mapConversation(result.rows[0]);
      });
    },
    async createTask(identity, idempotencyKey, rawBody) {
      const body = EmployeeAgentTaskRequestSchema.parse(rawBody);
      const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      const promptHash = createHash('sha256').update(body.prompt).digest('hex');
      const objectKey = `${identity.tenantId}/employee-agent/${body.conversationId}/${createHash('sha256').update(`${identity.userId}:${idempotencyKey}:${requestHash}`).digest('hex')}.txt`;
      await objectStore.putText({ objectKey, content: body.prompt, sha256: promptHash });
      return transaction(identity, async (client) => {
        const conversation = await client.query(
          `SELECT 1 FROM employee_agent_conversations WHERE tenant_id=$1 AND id=$2
           AND created_by=$3 AND status='ACTIVE' FOR UPDATE`,
          [identity.tenantId, body.conversationId, identity.userId],
        );
        if (conversation.rowCount !== 1) throw new EmployeeAgentAuthorizationError();
        const existing = await client.query<Record<string, unknown>>(
          `SELECT * FROM employee_agent_tasks WHERE tenant_id=$1 AND created_by=$2
           AND idempotency_key=$3 FOR UPDATE`,
          [identity.tenantId, identity.userId, idempotencyKey],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].request_hash !== requestHash) throw new EmployeeAgentConflictError();
          return existing.rows[0];
        }
        const result = await client.query<Record<string, unknown>>(
          `INSERT INTO employee_agent_tasks(id,tenant_id,conversation_id,created_by,
             prompt_object_key,mode,max_steps,max_tool_calls,max_cost_micros,deadline_at,
             idempotency_key,request_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            randomUUID(),
            identity.tenantId,
            body.conversationId,
            identity.userId,
            objectKey,
            body.mode,
            body.maxSteps,
            body.maxToolCalls,
            body.maxCostMicros,
            body.deadlineAt,
            idempotencyKey,
            requestHash,
          ],
        );
        return result.rows[0]!;
      });
    },
    listTasks(identity, status) {
      return transaction(identity, async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `SELECT id,conversation_id,mode,status,plan_version,planned_steps,max_steps,
                  max_tool_calls,max_cost_micros,actual_tool_calls,actual_cost_micros,
                  retry_count,deadline_at,result_summary_redacted,failure_code,unknown_result,
                  created_at,started_at,completed_at,updated_at
             FROM employee_agent_tasks
            WHERE tenant_id=$1 AND created_by=$2 AND ($3::text IS NULL OR status=$3)
            ORDER BY updated_at DESC,id LIMIT 100`,
          [identity.tenantId, identity.userId, status ?? null],
        );
        return result.rows;
      });
    },
    getTask(identity, taskId) {
      return transaction(identity, async (client) => {
        const task = await client.query<Record<string, unknown>>(
          `SELECT id,conversation_id,mode,status,plan_version,planned_steps,max_steps,
                  max_tool_calls,max_cost_micros,actual_tool_calls,actual_cost_micros,
                  retry_count,deadline_at,result_summary_redacted,failure_code,unknown_result,
                  created_at,started_at,completed_at,updated_at
             FROM employee_agent_tasks WHERE tenant_id=$1 AND id=$2 AND created_by=$3`,
          [identity.tenantId, taskId, identity.userId],
        );
        if (!task.rows[0]) throw new EmployeeAgentAuthorizationError();
        const [steps, artifacts, evidence] = await Promise.all([
          client.query(
            `SELECT id,step_number,action_code,tool_code,risk_level,status,
            attempt_count,output_summary_redacted,failure_code FROM employee_agent_task_steps
            WHERE tenant_id=$1 AND task_id=$2 ORDER BY plan_version,step_number`,
            [identity.tenantId, taskId],
          ),
          client.query(
            `SELECT id,name,content_type,sha256,size_bytes,status,created_at
            FROM employee_agent_artifacts WHERE tenant_id=$1 AND task_id=$2 ORDER BY created_at,id`,
            [identity.tenantId, taskId],
          ),
          client.query(
            `SELECT id,step_id,evidence_type,label,reference_hash,summary_redacted,created_at
            FROM employee_agent_evidence WHERE tenant_id=$1 AND task_id=$2 ORDER BY created_at,id`,
            [identity.tenantId, taskId],
          ),
        ]);
        return {
          ...task.rows[0],
          steps: steps.rows,
          artifacts: artifacts.rows,
          evidence: evidence.rows,
        };
      });
    },
    actTask(identity, taskId, action) {
      return transaction(identity, async (client) => {
        const current = await client.query<{
          status: string;
          retry_count: number;
          unknown_result: boolean;
          high_risk: boolean;
        }>(
          `SELECT task.status,task.retry_count,task.unknown_result,
             EXISTS(SELECT 1 FROM employee_agent_task_steps step WHERE step.tenant_id=task.tenant_id
               AND step.task_id=task.id AND step.risk_level IN ('CONFIRM','DUAL_CONFIRM')) AS high_risk
           FROM employee_agent_tasks task WHERE task.tenant_id=$1 AND task.id=$2
             AND task.created_by=$3 FOR UPDATE`,
          [identity.tenantId, taskId, identity.userId],
        );
        const row = current.rows[0];
        if (!row) throw new EmployeeAgentAuthorizationError();
        let status: string;
        try {
          status = nextAgentTaskStatus(
            {
              status: row.status,
              retryCount: row.retry_count,
              unknownResult: row.unknown_result,
              highRisk: row.high_risk,
            },
            action,
          );
        } catch {
          throw new EmployeeAgentConflictError();
        }
        const updated = await client.query<Record<string, unknown>>(
          `UPDATE employee_agent_tasks SET status=$4,
             retry_count=retry_count+CASE WHEN $5='RETRY' THEN 1 ELSE 0 END,
             failure_code=CASE WHEN $5='RETRY' THEN NULL ELSE failure_code END,
             completed_at=CASE WHEN $4='CANCELLED' THEN now() ELSE NULL END
           WHERE tenant_id=$1 AND id=$2 AND created_by=$3 RETURNING *`,
          [identity.tenantId, taskId, identity.userId, status, action],
        );
        return updated.rows[0]!;
      });
    },
    setPlan(identity, taskId, rawPlan) {
      const plan = EmployeeAgentPlanSchema.parse(rawPlan);
      return transaction(identity, async (client) => {
        const task = await client.query<{ plan_version: number; max_steps: number }>(
          `SELECT plan_version,max_steps FROM employee_agent_tasks
           WHERE tenant_id=$1 AND id=$2 AND created_by=$3 AND status='PLANNING' FOR UPDATE`,
          [identity.tenantId, taskId, identity.userId],
        );
        const row = task.rows[0];
        if (!row) throw new EmployeeAgentAuthorizationError();
        if (plan.length > row.max_steps) throw new EmployeeAgentConflictError();
        for (const [index, step] of plan.entries()) {
          await client.query(
            `INSERT INTO employee_agent_task_steps(tenant_id,task_id,plan_version,step_number,
               action_code,tool_code,risk_level,input_summary_redacted)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
            [
              identity.tenantId,
              taskId,
              row.plan_version,
              index + 1,
              step.actionCode,
              step.toolCode ?? null,
              step.riskLevel,
              JSON.stringify(step.inputSummaryRedacted),
            ],
          );
        }
        const updated = await client.query<Record<string, unknown>>(
          `UPDATE employee_agent_tasks SET status='READY',planned_steps=$4
           WHERE tenant_id=$1 AND id=$2 AND created_by=$3 RETURNING *`,
          [identity.tenantId, taskId, identity.userId, plan.length],
        );
        return updated.rows[0]!;
      });
    },
    decideApproval(identity, token, decision) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      return transaction(identity, async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `SELECT approval.*,task.plan_version AS current_plan_version,task.status AS task_status
             FROM employee_agent_approvals approval JOIN employee_agent_tasks task
               ON task.tenant_id=approval.tenant_id AND task.id=approval.task_id
            WHERE approval.tenant_id=$1 AND approval.token_hash=$2 FOR UPDATE OF approval,task`,
          [identity.tenantId, tokenHash],
        );
        const row = result.rows[0];
        if (!row || row.task_status !== 'WAITING_APPROVAL')
          throw new EmployeeAgentAuthorizationError();
        const allowed = canApproveAgentStep({
          status: String(row.status),
          expiresAt: new Date(row.expires_at as string | Date).toISOString(),
          approvalPlanVersion: Number(row.plan_version),
          currentPlanVersion: Number(row.current_plan_version),
          approvalLevel: row.approval_level as 'CONFIRM' | 'DUAL_CONFIRM',
          requestedBy: String(row.requested_by),
          approvingUserId: identity.userId,
        });
        if (!allowed || (row.approval_level === 'CONFIRM' && row.requested_by !== identity.userId))
          throw new EmployeeAgentAuthorizationError();
        const approved = decision === 'APPROVE';
        await client.query(
          `UPDATE employee_agent_approvals SET status=$3,approved_by=$4,decided_at=now()
            WHERE tenant_id=$1 AND id=$2`,
          [identity.tenantId, row.id, approved ? 'APPROVED' : 'REJECTED', identity.userId],
        );
        await client.query(
          `UPDATE employee_agent_task_steps SET status=$3,
             failure_code=CASE WHEN $3='FAILED' THEN 'APPROVAL_REJECTED' ELSE NULL END,updated_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='WAITING_APPROVAL'`,
          [identity.tenantId, row.step_id, approved ? 'WAITING_APPROVAL' : 'FAILED'],
        );
        const task = await client.query<Record<string, unknown>>(
          `UPDATE employee_agent_tasks SET status=$3,
             failure_code=CASE WHEN $3='FAILED' THEN 'APPROVAL_REJECTED' ELSE NULL END,
             completed_at=CASE WHEN $3='FAILED' THEN now() ELSE NULL END,updated_at=now()
            WHERE tenant_id=$1 AND id=$2 RETURNING *`,
          [identity.tenantId, row.task_id, approved ? 'WAITING_APPROVAL' : 'FAILED'],
        );
        return task.rows[0]!;
      });
    },
  };
}
