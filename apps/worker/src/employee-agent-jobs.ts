import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';

export interface ClaimedAgentTask {
  id: string;
  tenantId: string;
  conversationId: string;
  planVersion: number;
  maxToolCalls: number;
  maxCostMicros: number;
}

export async function claimEmployeeAgentTask(
  pool: Pick<pg.Pool, 'connect'>,
  tenantId: string,
): Promise<ClaimedAgentTask | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    await client.query(
      `UPDATE employee_agent_tasks SET status='FAILED',failure_code='DEADLINE_EXCEEDED',
         completed_at=now(),updated_at=now()
       WHERE tenant_id=$1 AND status='READY' AND deadline_at<=now()`,
      [tenantId],
    );
    const claimed = await client.query<{
      id: string;
      conversation_id: string;
      plan_version: number;
      max_tool_calls: number;
      max_cost_micros: string;
    }>(
      `WITH candidate AS (
         SELECT id FROM employee_agent_tasks
          WHERE tenant_id=$1 AND status='READY' AND deadline_at>now()
          ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE employee_agent_tasks task SET status='RUNNING',started_at=COALESCE(started_at,now()),
         updated_at=now() FROM candidate WHERE task.tenant_id=$1 AND task.id=candidate.id
       RETURNING task.id,task.conversation_id,task.plan_version,task.max_tool_calls,task.max_cost_micros::text`,
      [tenantId],
    );
    await client.query('COMMIT');
    const row = claimed.rows[0];
    return row
      ? {
          id: row.id,
          tenantId,
          conversationId: row.conversation_id,
          planVersion: row.plan_version,
          maxToolCalls: row.max_tool_calls,
          maxCostMicros: Number(row.max_cost_micros),
        }
      : null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function claimEmployeeAgentStep(
  pool: Pick<pg.Pool, 'connect'>,
  tenantId: string,
  taskId: string,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const task = await client.query<{
      status: string;
      deadline_at: Date;
      actual_tool_calls: number;
      max_tool_calls: number;
      actual_cost_micros: string;
      max_cost_micros: string;
      plan_version: number;
    }>(
      `SELECT status,deadline_at,actual_tool_calls,max_tool_calls,actual_cost_micros::text,
              max_cost_micros::text,plan_version FROM employee_agent_tasks
        WHERE tenant_id=$1 AND id=$2 AND status IN ('RUNNING','WAITING_APPROVAL') FOR UPDATE`,
      [tenantId, taskId],
    );
    const current = task.rows[0];
    if (!current) throw new Error('AGENT_TASK_NOT_RUNNING');
    if (current.status === 'WAITING_APPROVAL') {
      const approved = await client.query<Record<string, unknown>>(
        `SELECT step.*,approval.id AS approval_id
           FROM employee_agent_task_steps step
           JOIN employee_agent_approvals approval
             ON approval.tenant_id=step.tenant_id AND approval.step_id=step.id
          WHERE step.tenant_id=$1 AND step.task_id=$2 AND step.plan_version=$3
            AND step.status='WAITING_APPROVAL' AND approval.status='APPROVED'
            AND approval.plan_version=$3 AND approval.expires_at>now()
          ORDER BY step.step_number FOR UPDATE OF step,approval LIMIT 1`,
        [tenantId, taskId, current.plan_version],
      );
      const approvedStep = approved.rows[0];
      if (!approvedStep) throw new Error('AGENT_APPROVAL_NOT_READY');
      await client.query(
        `UPDATE employee_agent_approvals SET status='CONSUMED',consumed_at=now()
          WHERE tenant_id=$1 AND id=$2 AND status='APPROVED'`,
        [tenantId, approvedStep.approval_id],
      );
      await client.query(
        `UPDATE employee_agent_task_steps SET status='RUNNING',updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND status='WAITING_APPROVAL'`,
        [tenantId, approvedStep.id],
      );
      await client.query(
        `UPDATE employee_agent_tasks SET status='RUNNING',updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND status='WAITING_APPROVAL'`,
        [tenantId, taskId],
      );
      await client.query('COMMIT');
      return approvedStep;
    }
    if (
      current.deadline_at.getTime() <= Date.now() ||
      current.actual_tool_calls >= current.max_tool_calls ||
      BigInt(current.actual_cost_micros) >= BigInt(current.max_cost_micros)
    ) {
      await client.query(
        `UPDATE employee_agent_tasks SET status='FAILED',failure_code='BUDGET_OR_DEADLINE_EXCEEDED',
           completed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [tenantId, taskId],
      );
      await client.query('COMMIT');
      return null;
    }
    const step = await client.query<Record<string, unknown>>(
      `SELECT * FROM employee_agent_task_steps WHERE tenant_id=$1 AND task_id=$2
         AND plan_version=$3 AND status='PENDING' ORDER BY step_number FOR UPDATE LIMIT 1`,
      [tenantId, taskId, current.plan_version],
    );
    const row = step.rows[0];
    if (!row) {
      await client.query(
        `UPDATE employee_agent_tasks SET status='SUCCEEDED',completed_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND id=$2`,
        [tenantId, taskId],
      );
      await client.query('COMMIT');
      return null;
    }
    const needsApproval = ['CONFIRM', 'DUAL_CONFIRM'].includes(String(row.risk_level));
    await client.query(
      `UPDATE employee_agent_task_steps SET status=$3,attempt_count=attempt_count+1,
         started_at=COALESCE(started_at,now()),updated_at=now() WHERE tenant_id=$1 AND id=$2`,
      [tenantId, row.id, needsApproval ? 'WAITING_APPROVAL' : 'RUNNING'],
    );
    if (needsApproval)
      await client.query(
        `UPDATE employee_agent_tasks SET status='WAITING_APPROVAL',updated_at=now()
          WHERE tenant_id=$1 AND id=$2`,
        [tenantId, taskId],
      );
    let approvalToken: string | undefined;
    if (needsApproval) {
      approvalToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(approvalToken).digest('hex');
      await client.query(
        `INSERT INTO employee_agent_approvals(tenant_id,task_id,step_id,plan_version,
           approval_level,impact_summary_redacted,token_hash,requested_by,expires_at)
         SELECT $1,$2,$3,$4,$5,$6::jsonb,$7,created_by,now()+interval '15 minutes'
           FROM employee_agent_tasks WHERE tenant_id=$1 AND id=$2`,
        [
          tenantId,
          taskId,
          row.id,
          current.plan_version,
          row.risk_level,
          JSON.stringify(row.input_summary_redacted ?? {}),
          tokenHash,
        ],
      );
    }
    await client.query('COMMIT');
    return needsApproval ? { waitingApproval: true, approvalToken, stepId: row.id } : row;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordEmployeeAgentStepResult(
  pool: Pick<pg.Pool, 'connect'>,
  input: {
    tenantId: string;
    taskId: string;
    stepId: string;
    outcome: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
    summaryRedacted: Record<string, unknown>;
    failureCode?: string;
    costMicros: number;
    toolCalled: boolean;
  },
) {
  if (!Number.isSafeInteger(input.costMicros) || input.costMicros < 0)
    throw new Error('INVALID_AGENT_COST');
  if (input.outcome !== 'SUCCEEDED' && !input.failureCode)
    throw new Error('AGENT_FAILURE_CODE_REQUIRED');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [input.tenantId]);
    const step = await client.query(
      `UPDATE employee_agent_task_steps SET status=$4,output_summary_redacted=$5::jsonb,
         failure_code=$6,completed_at=now(),updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND task_id=$3 AND status='RUNNING' RETURNING id`,
      [
        input.tenantId,
        input.stepId,
        input.taskId,
        input.outcome,
        JSON.stringify(input.summaryRedacted),
        input.failureCode ?? null,
      ],
    );
    if (step.rowCount !== 1) throw new Error('AGENT_STEP_NOT_RUNNING');
    const evidenceHash = createHash('sha256')
      .update(JSON.stringify({ outcome: input.outcome, summary: input.summaryRedacted }))
      .digest('hex');
    await client.query(
      `INSERT INTO employee_agent_evidence(tenant_id,task_id,step_id,evidence_type,label,
         reference_hash,summary_redacted) VALUES ($1,$2,$3,'TOOL_RESULT',$4,$5,$6::jsonb)`,
      [
        input.tenantId,
        input.taskId,
        input.stepId,
        `tool-result-${input.outcome.toLowerCase()}`,
        evidenceHash,
        JSON.stringify(input.summaryRedacted),
      ],
    );
    const task = await client.query(
      `UPDATE employee_agent_tasks SET
         actual_tool_calls=actual_tool_calls+CASE WHEN $3 THEN 1 ELSE 0 END,
         actual_cost_micros=actual_cost_micros+$4,
         status=CASE WHEN $5='SUCCEEDED' THEN 'RUNNING' ELSE 'FAILED' END,
         failure_code=CASE WHEN $5='SUCCEEDED' THEN NULL ELSE $6 END,
         unknown_result=($5='UNKNOWN'),
         completed_at=CASE WHEN $5='SUCCEEDED' THEN NULL ELSE now() END,updated_at=now()
       WHERE tenant_id=$1 AND id=$2
         AND actual_cost_micros+$4<=max_cost_micros
         AND actual_tool_calls+CASE WHEN $3 THEN 1 ELSE 0 END<=max_tool_calls`,
      [
        input.tenantId,
        input.taskId,
        input.toolCalled,
        input.costMicros,
        input.outcome,
        input.failureCode ?? null,
      ],
    );
    if (task.rowCount !== 1) throw new Error('AGENT_TASK_BUDGET_EXCEEDED');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
