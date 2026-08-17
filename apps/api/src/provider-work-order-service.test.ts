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

describe('E7 城市服务商交付工单、附件与商家确认', () => {
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

  async function signYunheli(): Promise<string> {
    const diagnosis = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/diagnosis',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'work-orders:diagnosis',
      },
      payload: { expectedVersion: 1 },
    })
    expect(diagnosis.statusCode, diagnosis.body).toBe(200)
    const drafted = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/contracts',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'work-orders:contract',
      },
      payload: { expectedVersion: 2, packageCode: 'PRO', discountBps: 300 },
    })
    expect(drafted.statusCode, drafted.body).toBe(200)
    const signed = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/contracts/${drafted.json().contract.id}/sign`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'work-orders:sign',
      },
      payload: { leadId: 'lead-yunheli', expectedVersion: 1 },
    })
    expect(signed.statusCode, signed.body).toBe(200)
    return (database.prepare(
      `SELECT id FROM provider_delivery_cases WHERE lead_id = 'lead-yunheli'`,
    ).get() as { id: string }).id
  }

  async function createWorkOrder(
    caseId: string,
    overrides: Record<string, unknown> = {},
    key = 'work-orders:create',
  ) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/provider/delivery-work-orders',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': key,
      },
      payload: {
        caseId,
        type: 'ASSET_COLLECTION',
        title: '采集并核验三类经营资料',
        description: '完成营业执照、门头照片和菜单原件采集，并核对识别结果。',
        priority: 'HIGH',
        ownerId: 'user-demo-delivery',
        dueAt: new Date(Date.now() + 12 * 3_600_000).toISOString(),
        ...overrides,
      },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  async function startAndUpload(caseId: string) {
    let overview = await createWorkOrder(caseId)
    const workOrderId = overview.focusWorkOrder.id as string
    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/start`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'work-orders:start',
      },
      payload: { expectedVersion: 1 },
    })
    expect(started.statusCode, started.body).toBe(200)
    overview = started.json()

    const content = Buffer.from('云和里三类资料现场核验记录 v1', 'utf8')
    const uploaded = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/attachments`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'work-orders:upload',
        'content-type': 'application/octet-stream',
        'x-file-name': encodeURIComponent('现场核验记录.txt'),
        'x-mime-type': 'text/plain',
        'x-attachment-category': 'EVIDENCE',
        'x-expected-version': String(overview.focusWorkOrder.version),
      },
      payload: content,
    })
    expect(uploaded.statusCode, uploaded.body).toBe(200)
    return {
      overview: uploaded.json(),
      workOrderId,
      content,
    }
  }

  it('返回城市工单目录、在岗负责人、SLA 与细粒度权限', async () => {
    const caseId = await signYunheli()
    const created = await createWorkOrder(caseId)
    expect(created).toMatchObject({
      city: { id: 'city-shanghai', name: '上海城市中心' },
      metrics: {
        total: 1,
        open: 1,
        inProgress: 0,
        waitingMerchant: 0,
        overdue: 0,
        completed: 0,
      },
      focusWorkOrder: {
        caseId,
        leadId: 'lead-yunheli',
        merchantName: '云和里·时令餐厅',
        type: 'ASSET_COLLECTION',
        typeLabel: '资料采集',
        stage: 'WAITING_CAPTURE',
        status: 'OPEN',
        priority: 'HIGH',
        owner: {
          userId: 'user-demo-delivery',
          displayName: '上海交付顾问·周澄',
        },
        confirmationRequired: true,
        attachmentCount: 0,
        version: 1,
      },
      policy: {
        ruleVersion: 'provider-work-order-policy-v1',
        maxAttachmentBytes: 8 * 1024 * 1024,
        merchantConfirmationSnapshot: true,
        appendOnlyEvidence: true,
      },
      permissions: {
        canManage: true,
        canConfirm: true,
        canUpload: true,
      },
    })
    expect(created.typeCatalog).toHaveLength(8)
    expect(created.operators).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: 'user-demo-delivery',
        role: 'CITY_DELIVERY',
        activeWorkOrderCount: 1,
      }),
      expect.objectContaining({
        userId: 'user-demo-provider',
        role: 'CITY_PROVIDER_ADMIN',
      }),
    ]))
    expect(created.events).toEqual([
      expect.objectContaining({ sequence: 1, type: 'CREATED' }),
    ])
  })

  it('完成开始、原件上传、强确认提交、商家确认和附件下载闭环', async () => {
    const caseId = await signYunheli()
    const { overview: uploaded, workOrderId, content } = await startAndUpload(caseId)
    expect(uploaded.focusWorkOrder).toMatchObject({
      status: 'IN_PROGRESS',
      attachmentCount: 1,
      version: 3,
    })
    expect(uploaded.attachments[0]).toMatchObject({
      category: 'EVIDENCE',
      fileName: '现场核验记录.txt',
      mimeType: 'text/plain',
      byteSize: content.byteLength,
      uploadedBy: '上海交付顾问·周澄',
    })
    expect(uploaded.attachments[0].sha256).toMatch(/^[a-f0-9]{64}$/)

    const noConfirmation = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/submit`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'work-orders:submit:no-confirm',
      },
      payload: {
        expectedVersion: 3,
        handoffNote: '三类原件已完成现场核验，请商家确认。',
        confirmed: false,
      },
    })
    expect(noConfirmation.statusCode).toBe(422)

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/submit`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'work-orders:submit',
      },
      payload: {
        expectedVersion: 3,
        handoffNote: '三类原件已完成现场核验，请商家确认。',
        confirmed: true,
      },
    })
    expect(submitted.statusCode, submitted.body).toBe(200)
    expect(submitted.json().focusWorkOrder).toMatchObject({
      status: 'WAITING_MERCHANT',
      version: 4,
    })

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/merchant-confirmation`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'work-orders:merchant-approve',
      },
      payload: {
        expectedVersion: 4,
        decision: 'APPROVED',
        confirmerName: '周云岚',
        confirmerRole: '商户主理人',
        comment: '资料原件与门店实际经营信息一致，同意进入下一交付环节。',
        confirmed: true,
      },
    })
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    const result = confirmed.json()
    expect(result.focusWorkOrder).toMatchObject({
      status: 'COMPLETED',
      slaStatus: 'COMPLETED',
      version: 5,
      latestConfirmation: {
        decision: 'APPROVED',
        confirmerName: '周云岚',
        confirmerRole: '商户主理人',
        actorName: '上海城市服务商管理员',
        workOrderVersion: 5,
      },
    })
    expect(result.metrics).toMatchObject({ total: 1, completed: 1 })
    expect(result.events.map((event: { type: string }) => event.type)).toEqual([
      'MERCHANT_APPROVED',
      'SUBMITTED',
      'ATTACHMENT_ADDED',
      'STARTED',
      'CREATED',
    ])

    const attachment = result.attachments[0]
    const downloaded = await app.inject({
      method: 'GET',
      url: `/api/v1/provider/delivery-work-order-attachments/${attachment.id}`,
      headers: { authorization: authorization.delivery },
    })
    expect(downloaded.statusCode).toBe(200)
    expect(downloaded.headers['content-type']).toContain('text/plain')
    expect(downloaded.rawPayload).toEqual(content)
    expect(downloaded.headers['content-disposition']).toContain(encodeURIComponent('现场核验记录.txt'))

    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events
       WHERE run_id = 'provider-work-order-e7'`,
    ).get()).toEqual({ count: 5 })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE run_id = 'provider-work-order-e7'`,
    ).get()).toEqual({ count: 5 })
  })

  it('商家可要求修改并保留确认快照，交付人员恢复处理后继续留痕', async () => {
    const caseId = await signYunheli()
    const { overview: uploaded, workOrderId } = await startAndUpload(caseId)
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/submit`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'work-orders:submit',
      },
      payload: {
        expectedVersion: uploaded.focusWorkOrder.version,
        handoffNote: '请核对三类资料是否清晰完整。',
        confirmed: true,
      },
    })
    expect(submitted.statusCode, submitted.body).toBe(200)
    const changes = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/merchant-confirmation`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'work-orders:merchant-changes',
      },
      payload: {
        expectedVersion: 4,
        decision: 'CHANGES_REQUESTED',
        confirmerName: '周云岚',
        confirmerRole: '商户主理人',
        comment: '菜单照片反光，请补充一份无反光原图。',
        confirmed: true,
      },
    })
    expect(changes.statusCode, changes.body).toBe(200)
    expect(changes.json().focusWorkOrder).toMatchObject({
      status: 'CHANGES_REQUESTED',
      latestConfirmation: {
        decision: 'CHANGES_REQUESTED',
        comment: '菜单照片反光，请补充一份无反光原图。',
      },
      version: 5,
    })

    const resumed = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/start`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'work-orders:resume',
      },
      payload: { expectedVersion: 5 },
    })
    expect(resumed.statusCode, resumed.body).toBe(200)
    expect(resumed.json().focusWorkOrder).toMatchObject({
      status: 'IN_PROGRESS',
      version: 6,
    })
    expect(resumed.json().events[0]).toMatchObject({ type: 'RESUMED' })
    expect(resumed.json().confirmations).toHaveLength(1)
  })

  it('执行乐观锁、强确认、角色分离、同城负责人和数据范围边界', async () => {
    const caseId = await signYunheli()
    const created = await createWorkOrder(caseId)
    const workOrderId = created.focusWorkOrder.id as string

    const invalidOwner = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/assign`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'work-orders:assign:invalid-owner',
      },
      payload: {
        expectedVersion: 1,
        targetOwnerId: 'user-demo-sales',
        reason: '销售人员不属于交付角色，应被拒绝',
        confirmed: true,
      },
    })
    expect(invalidOwner.statusCode).toBe(422)
    expect(invalidOwner.json().title).toBe('work_order_owner_invalid')

    const noConfirm = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/assign`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'work-orders:assign:no-confirm',
      },
      payload: {
        expectedVersion: 1,
        targetOwnerId: 'user-demo-provider',
        reason: '交由管理员负责现场确认',
        confirmed: false,
      },
    })
    expect(noConfirm.statusCode).toBe(422)

    const assigned = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/assign`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'work-orders:assign',
      },
      payload: {
        expectedVersion: 1,
        targetOwnerId: 'user-demo-provider',
        reason: '交由管理员负责现场确认',
        confirmed: true,
      },
    })
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/assign`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'work-orders:assign',
      },
      payload: {
        expectedVersion: 1,
        targetOwnerId: 'user-demo-provider',
        reason: '交由管理员负责现场确认',
        confirmed: true,
      },
    })
    expect(assigned.statusCode, assigned.body).toBe(200)
    expect(replay.body).toBe(assigned.body)
    expect(assigned.json().focusWorkOrder).toMatchObject({
      owner: { userId: 'user-demo-provider' },
      version: 2,
    })

    const stale = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/start`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'work-orders:start:stale',
      },
      payload: { expectedVersion: 1 },
    })
    expect(stale.statusCode).toBe(409)

    const deliveryOverview = await app.inject({
      method: 'GET',
      url: `/api/v1/provider/delivery-work-orders?focusWorkOrderId=${workOrderId}`,
      headers: { authorization: authorization.delivery },
    })
    expect(deliveryOverview.statusCode, deliveryOverview.body).toBe(200)
    expect(deliveryOverview.json().permissions).toEqual({
      canManage: true,
      canConfirm: false,
      canUpload: true,
    })

    const deliveryConfirmDenied = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/merchant-confirmation`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'work-orders:confirm:denied',
      },
      payload: {
        expectedVersion: 2,
        decision: 'APPROVED',
        confirmerName: '周云岚',
        confirmerRole: '商户主理人',
        comment: '确认交付结果',
        confirmed: true,
      },
    })
    expect(deliveryConfirmDenied.statusCode).toBe(403)

    const salesDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/provider/delivery-work-orders',
      headers: { authorization: authorization.sales },
    })
    expect(salesDenied.statusCode).toBe(403)

    database.prepare(
      `UPDATE memberships SET city_ids_json = '["city-hangzhou"]'
       WHERE user_id = 'user-demo-provider'`,
    ).run()
    const outOfScope = await app.inject({
      method: 'GET',
      url: `/api/v1/provider/delivery-work-orders?focusWorkOrderId=${workOrderId}`,
      headers: { authorization: authorization.provider },
    })
    expect(outOfScope.statusCode).toBe(404)
  })

  it('附件、商家确认与工单事件均由数据库禁止修改删除', async () => {
    const caseId = await signYunheli()
    const { overview: uploaded, workOrderId } = await startAndUpload(caseId)
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/submit`,
      headers: {
        authorization: authorization.delivery,
        'idempotency-key': 'work-orders:submit',
      },
      payload: {
        expectedVersion: uploaded.focusWorkOrder.version,
        handoffNote: '资料已完成核验，请商家确认。',
        confirmed: true,
      },
    })
    expect(submitted.statusCode, submitted.body).toBe(200)
    const confirmation = await app.inject({
      method: 'POST',
      url: `/api/v1/provider/delivery-work-orders/${workOrderId}/merchant-confirmation`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'work-orders:confirm',
      },
      payload: {
        expectedVersion: 4,
        decision: 'APPROVED',
        confirmerName: '周云岚',
        confirmerRole: '商户主理人',
        comment: '确认资料完整准确',
        confirmed: true,
      },
    })
    expect(confirmation.statusCode, confirmation.body).toBe(200)

    expect(() => database.prepare(
      `UPDATE provider_delivery_work_order_events SET summary = 'tampered'
       WHERE work_order_id = ?`,
    ).run(workOrderId)).toThrow(/append-only/)
    expect(() => database.prepare(
      `DELETE FROM provider_delivery_work_order_attachments
       WHERE work_order_id = ?`,
    ).run(workOrderId)).toThrow(/append-only/)
    expect(() => database.prepare(
      `UPDATE provider_delivery_work_order_confirmations SET comment = 'tampered'
       WHERE work_order_id = ?`,
    ).run(workOrderId)).toThrow(/append-only/)
  })
})
