import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const authorization = {
  provider: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`,
  delivery: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.delivery}`,
  sales: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`,
}

describe('E7 SLA 超时扫描、自动升级与处置', () => {
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

  async function caseId(): Promise<string> {
    const existing = database.prepare(
      `SELECT id FROM provider_delivery_cases
       WHERE lead_id = 'lead-yunheli'`,
    ).get() as { id: string } | undefined
    if (existing) return existing.id
    const diagnosis = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/diagnosis',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'sla:setup:diagnosis',
      },
      payload: { expectedVersion: 1 },
    })
    expect(diagnosis.statusCode, diagnosis.body).toBe(200)
    const drafted = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/contracts',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'sla:setup:contract',
      },
      payload: { expectedVersion: 2, packageCode: 'PRO', discountBps: 300 },
    })
    expect(drafted.statusCode, drafted.body).toBe(200)
    const signed = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/contracts/${drafted.json().contract.id}/sign`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'sla:setup:sign',
      },
      payload: { leadId: 'lead-yunheli', expectedVersion: 1 },
    })
    expect(signed.statusCode, signed.body).toBe(200)
    return (database.prepare(
      `SELECT id FROM provider_delivery_cases
       WHERE lead_id = 'lead-yunheli'`,
    ).get() as { id: string }).id
  }

  async function createWorkOrder(
    key: string,
    ownerId = 'user-demo-delivery',
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/provider/delivery-work-orders',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': key,
      },
      payload: {
        caseId: await caseId(),
        type: 'PLATFORM_REVIEW',
        title: '平台审核材料补齐与跟进',
        description: '补齐平台审核材料，跟进灰度和发布门禁并回填处理结论。',
        priority: 'CRITICAL',
        ownerId,
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
        confirmationRequired: false,
      },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json().focusWorkOrder.id as string
  }

  function makeOverdue(workOrderId: string, hours: number): void {
    database.prepare(
      `UPDATE provider_delivery_work_orders
       SET due_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      new Date(Date.now() - hours * 3_600_000).toISOString(),
      new Date().toISOString(),
      workOrderId,
    )
  }

  async function scan(key: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/provider/delivery-sla/scan',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': key,
      },
    })
  }

  it('按 0/4/12 小时阶梯自动建立 L1、升级 L2/L3 并投递 Outbox', async () => {
    const workOrderId = await createWorkOrder('sla:create:l3')
    makeOverdue(workOrderId, 13)
    const response = await scan('sla:scan:l3:first')
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json()).toMatchObject({
      metrics: {
        active: 1,
        unacknowledged: 1,
        level2OrAbove: 1,
        level3: 1,
        maxOverdueHours: 14,
      },
      focusIncident: {
        workOrder: { id: workOrderId, status: 'OPEN' },
        level: 3,
        status: 'OPEN',
        escalationTarget: '总部运营',
        policyVersion: 'provider-delivery-sla-policy-v1',
      },
      policy: {
        scanIntervalSeconds: 60,
        notificationDelivery: 'OUTBOX_PENDING_CONNECTOR',
        appendOnlyEvidence: true,
      },
    })
    expect(response.json().events.map((item: { level: number }) => item.level))
      .toEqual([3, 2, 1])
    expect((database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE aggregate_id = ? AND topic LIKE 'provider.delivery.sla.%'`,
    ).get(response.json().focusIncident.id) as { count: number }).count).toBe(3)

    const repeated = await scan('sla:scan:l3:repeat')
    expect(repeated.statusCode, repeated.body).toBe(200)
    expect((database.prepare(
      'SELECT COUNT(*) AS count FROM provider_delivery_sla_events',
    ).get() as { count: number }).count).toBe(3)
  })

  it('负责人强确认恢复计划，持续超时后重新打开并升级到下一层', async () => {
    const workOrderId = await createWorkOrder('sla:create:progressive')
    makeOverdue(workOrderId, 1)
    const firstScan = await scan('sla:scan:l1')
    const incident = firstScan.json().focusIncident
    expect(incident).toMatchObject({ level: 1, status: 'OPEN', version: 1 })

    const acknowledged = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-sla/incidents/${incident.id}/acknowledge`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'sla:ack:l1',
      },
      payload: {
        expectedVersion: 1,
        responsePlan: '已安排交付顾问补齐审核截图，两小时内回填平台审核结果。',
        confirmed: true,
      },
    })
    expect(acknowledged.statusCode, acknowledged.body).toBe(200)
    expect(acknowledged.json().focusIncident).toMatchObject({
      status: 'ACKNOWLEDGED',
      acknowledgedBy: '上海交付顾问·周澄',
      version: 2,
    })

    makeOverdue(workOrderId, 5)
    const escalated = await scan('sla:scan:l2')
    expect(escalated.statusCode, escalated.body).toBe(200)
    expect(escalated.json().focusIncident).toMatchObject({
      level: 2,
      status: 'OPEN',
      version: 3,
      escalationTarget: '城市服务商管理员',
    })
    expect(escalated.json().events.map((item: { type: string; level: number }) => [
      item.type,
      item.level,
    ])).toEqual([
      ['ESCALATED', 2],
      ['ACKNOWLEDGED', 1],
      ['DETECTED', 1],
    ])
  })

  it('销售无权读取，交付不能扫描且只能确认本人负责的异常', async () => {
    const workOrderId = await createWorkOrder('sla:create:provider-owner', 'user-demo-provider')
    makeOverdue(workOrderId, 1)
    const scanned = await scan('sla:scan:provider-owner')
    const incidentId = scanned.json().focusIncident.id as string

    const deniedRead = await app.inject({
      method: 'GET',
      url: '/api/v1/provider/delivery-sla',
      headers: { authorization: authorization.sales },
    })
    expect(deniedRead.statusCode).toBe(403)

    const deniedScan = await app.inject({
      method: 'POST',
      url: '/api/v1/provider/delivery-sla/scan',
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'sla:delivery:scan',
      },
    })
    expect(deniedScan.statusCode).toBe(403)

    const deniedAck = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-sla/incidents/${incidentId}/acknowledge`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'sla:delivery:foreign-ack',
      },
      payload: {
        expectedVersion: 1,
        responsePlan: '尝试处理不属于本人负责的 SLA 异常，服务端必须拒绝。',
        confirmed: true,
      },
    })
    expect(deniedAck.statusCode).toBe(403)
  })

  it('工单完成后扫描器自动关闭异常并保留完整证据', async () => {
    const workOrderId = await createWorkOrder('sla:create:auto-resolve')
    makeOverdue(workOrderId, 5)
    const scanned = await scan('sla:scan:auto-resolve')
    const incidentId = scanned.json().focusIncident.id as string
    database.prepare(
      `UPDATE provider_delivery_work_orders
       SET status = 'COMPLETED', completed_at = ?, version = version + 1
       WHERE id = ?`,
    ).run(new Date().toISOString(), workOrderId)

    const resolved = await scan('sla:scan:resolved')
    expect(resolved.statusCode, resolved.body).toBe(200)
    expect(resolved.json().focusIncident).toMatchObject({
      id: incidentId,
      status: 'RESOLVED',
      resolutionNote: '工单已完成，系统自动关闭 SLA 异常',
    })
    expect(resolved.json().events[0]).toMatchObject({
      type: 'RESOLVED',
      summary: '工单已完成，SLA 异常由系统自动关闭',
    })
  })

  it('升级事件禁止更新和删除', async () => {
    const workOrderId = await createWorkOrder('sla:create:append-only')
    makeOverdue(workOrderId, 13)
    await scan('sla:scan:append-only')
    expect(() => database.exec(
      `UPDATE provider_delivery_sla_events SET summary = 'tampered'`,
    )).toThrow(/append-only/)
    expect(() => database.exec(
      'DELETE FROM provider_delivery_sla_events',
    )).toThrow(/append-only/)
  })
})
