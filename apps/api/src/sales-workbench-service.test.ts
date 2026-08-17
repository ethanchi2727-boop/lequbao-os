import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const salesAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`
const merchantAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.merchant}`

describe('E6 销售宝今日任务与 AI 下一步建议', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
  })

  afterEach(async () => {
    await app.close()
  })

  async function getWorkbench() {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/sales/workbench',
      headers: { authorization: salesAuthorization },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  it('把每条有效线索投影为有截止时间的销售任务与可解释建议', async () => {
    const workbench = await getWorkbench()
    expect(workbench).toMatchObject({
      metrics: { activeLeads: 3, protectedLeads: 3, overdue: 1 },
      taskRuleVersion: 'sales-task-projection-v1',
      recommendationPolicyVersion: 'sales-next-best-action-v1',
      recommendationModelVersion: 'sales-assist-local-v1',
    })
    expect(workbench.tasks).toHaveLength(3)
    expect(workbench.focusOpportunities).toHaveLength(3)
    expect(workbench.nextBestActions).toHaveLength(3)
    expect(workbench.nextBestActions.every((item: {
      rationale: string[]
      guardrail: string
      recommendationScore: number
    }) => (
      item.rationale.length === 3
      && item.guardrail.includes('不自动联系商家')
      && item.recommendationScore > 0
    ))).toBe(true)
  })

  it('完成任务时要求乐观版本并同步任务事件、CRM 时间线、审计与 Outbox', async () => {
    const workbench = await getWorkbench()
    const task = workbench.tasks.find((item: { id: string }) =>
      item.id === 'sales-task-e6-yunheli',
    )
    expect(task).toBeTruthy()
    const request = {
      method: 'POST' as const,
      url: `/api/v1/sales/tasks/${task.id}/complete`,
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-task:complete-yunheli',
      },
      payload: {
        expectedVersion: task.version,
        completionNote: '已与周主理人确认体检范围和下午三点演示时间',
      },
    }
    const completed = await app.inject(request)
    const replay = await app.inject(request)
    expect(completed.statusCode, completed.body).toBe(200)
    expect(replay.statusCode, replay.body).toBe(200)
    expect(replay.body).toBe(completed.body)
    expect(completed.json().tasks.find((item: { id: string }) =>
      item.id === task.id,
    )).toMatchObject({
      status: 'DONE',
      completionNote: '已与周主理人确认体检范围和下午三点演示时间',
      version: 2,
    })
    expect(completed.json().metrics.completedToday).toBe(1)

    const evidence = {
      events: database.prepare(
        `SELECT COUNT(*) AS count FROM sales_task_events
         WHERE task_id = ? AND type = 'COMPLETED'`,
      ).get(task.id) as { count: number },
      activities: database.prepare(
        `SELECT COUNT(*) AS count FROM lead_activities
         WHERE lead_id = 'lead-yunheli' AND type = 'SALES_TASK_COMPLETED'`,
      ).get() as { count: number },
      audits: database.prepare(
        `SELECT COUNT(*) AS count FROM audit_events WHERE run_id = 'sales-workbench-e6'`,
      ).get() as { count: number },
      outbox: database.prepare(
        `SELECT COUNT(*) AS count FROM outbox_events WHERE run_id = 'sales-workbench-e6'`,
      ).get() as { count: number },
    }
    expect(evidence.events.count).toBe(1)
    expect(evidence.activities.count).toBe(1)
    expect(evidence.audits.count).toBe(1)
    expect(evidence.outbox.count).toBe(1)
  })

  it('稍后提醒必须在未来 30 天内并保留提醒原因', async () => {
    const workbench = await getWorkbench()
    const task = workbench.tasks.find((item: { id: string }) =>
      item.id === 'sales-task-e6-muyun',
    )
    const snoozeUntil = new Date(Date.now() + 2 * 86400000).toISOString()
    const snoozed = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/tasks/${task.id}/snooze`,
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-task:snooze-muyun',
      },
      payload: {
        expectedVersion: task.version,
        snoozeUntil,
        reason: '商家合伙人后天返沪，届时共同确认提案',
      },
    })
    expect(snoozed.statusCode, snoozed.body).toBe(200)
    expect(snoozed.json().tasks.find((item: { id: string }) =>
      item.id === task.id,
    )).toMatchObject({
      status: 'SNOOZED',
      dueAt: snoozeUntil,
      version: 2,
    })

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/sales/tasks/sales-task-e6-luming/snooze',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-task:snooze-invalid',
      },
      payload: {
        expectedVersion: 1,
        snoozeUntil: new Date(Date.now() - 3600000).toISOString(),
        reason: '错误的过去时间',
      },
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().title).toBe('invalid_snooze_time')
  })

  it('线索下一步动作更新后旧任务归档且只生成一个新版本任务', async () => {
    const original = await getWorkbench()
    const lead = original.focusOpportunities.find((item: {
      lead: { id: string }
    }) => item.lead.id === 'lead-yunheli').lead
    const nextActionAt = new Date(Date.now() + 3 * 86400000).toISOString()
    const followedUp = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/followups',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-task:lead-follow-up',
      },
      payload: {
        expectedVersion: lead.version,
        channel: 'VISIT',
        summary: '已完成首次体检需求访谈',
        nextAction: '邀请决策人参加体检报告会',
        nextActionAt,
      },
    })
    expect(followedUp.statusCode, followedUp.body).toBe(200)

    const refreshed = await getWorkbench()
    expect(refreshed.tasks.filter((item: { leadId: string; status: string }) =>
      item.leadId === 'lead-yunheli' && ['PENDING', 'SNOOZED'].includes(item.status),
    )).toHaveLength(1)
    expect(refreshed.tasks.find((item: { leadId: string; status: string }) =>
      item.leadId === 'lead-yunheli' && item.status === 'PENDING',
    )).toMatchObject({
      title: '邀请决策人参加体检报告会',
      dueAt: nextActionAt,
    })
    const superseded = database.prepare(
      `SELECT COUNT(*) AS count FROM sales_task_events
       WHERE lead_id = 'lead-yunheli' AND type = 'SUPERSEDED'`,
    ).get() as { count: number }
    expect(superseded.count).toBe(1)
  })

  it('销售任务严格继承线索数据范围，商户角色无权读取', async () => {
    for (const [leadId, key] of [
      ['lead-yunheli', 'e6-scope:transfer-one'],
      ['lead-muyun', 'e6-scope:transfer-two'],
    ] as const) {
      const transferred = await app.inject({
        method: 'POST',
        url: `/api/v1/onboarding/leads/${leadId}/transfer`,
        headers: { authorization: hqAuthorization, 'idempotency-key': key },
        payload: {
          expectedVersion: 1,
          targetOwnerId: 'user-demo-provider',
          reason: '城市经理调整线索负责人用于数据范围验收',
        },
      })
      expect(transferred.statusCode, transferred.body).toBe(200)
    }
    const scoped = await getWorkbench()
    expect(scoped.focusOpportunities.map((item: { lead: { id: string } }) =>
      item.lead.id,
    )).toEqual(['lead-luming'])

    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/sales/workbench',
      headers: { authorization: merchantAuthorization },
    })
    expect(denied.statusCode).toBe(403)
  })

  it('销售任务事件禁止更新和删除', async () => {
    await getWorkbench()
    expect(() => database.exec("UPDATE sales_task_events SET summary = 'tampered'"))
      .toThrowError(/append-only/)
    expect(() => database.exec('DELETE FROM sales_task_events')).toThrowError(/append-only/)
  })
})
