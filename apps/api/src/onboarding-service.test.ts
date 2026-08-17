import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const salesAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`
const providerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`

describe('E1 商家入网领域', () => {
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

  it('销售只能看到自己名下的保护期线索', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/overview',
      headers: { authorization: salesAuthorization },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      counts: { total: 3, protected: 3, pendingAction: 3, readyForDelivery: 0 },
      focusLead: { id: 'lead-yunheli', stage: 'NEW', version: 1 },
    })
  })

  it('完成体检、合同、六层授权和三类资产确认闭环', async () => {
    const post = async (url: string, key: string, payload: object) => {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: salesAuthorization, 'idempotency-key': key },
        payload,
      })
      expect(response.statusCode, response.body).toBe(200)
      return response.json()
    }

    let overview = await post(
      '/api/v1/onboarding/leads/lead-yunheli/diagnosis',
      'e1-complete:diagnosis',
      { expectedVersion: 1 },
    )
    expect(overview.focusLead.stage).toBe('DIAGNOSED')
    expect(overview.diagnosis).toMatchObject({ score: 82, grade: 'B+' })
    expect(overview.diagnosis.findings).toHaveLength(4)

    overview = await post(
      '/api/v1/onboarding/leads/lead-yunheli/contracts',
      'e1-complete:contract',
      { expectedVersion: 2, packageCode: 'PRO', discountBps: 300 },
    )
    expect(overview.contract).toMatchObject({
      status: 'DRAFT', discountStatus: 'AUTO_APPROVED', finalPriceFen: 96806,
    })

    overview = await post(
      `/api/v1/onboarding/contracts/${overview.contract.id}/sign`,
      'e1-complete:sign',
      { leadId: 'lead-yunheli', expectedVersion: 1 },
    )
    expect(overview.focusLead.stage).toBe('SIGNED')
    expect(overview.contract).toMatchObject({ status: 'SIGNED', authorizationCount: 6 })

    overview = await post(
      '/api/v1/onboarding/leads/lead-yunheli/assets/capture',
      'e1-complete:capture',
      { expectedVersion: 4 },
    )
    expect(overview.assets).toHaveLength(3)
    expect(overview.assets.every((asset: { status: string }) => asset.status === 'NEEDS_REVIEW')).toBe(true)

    for (const asset of overview.assets as Array<{
      id: string
      version: number
      extracted: Record<string, unknown>
    }>) {
      overview = await post(
        `/api/v1/onboarding/assets/${asset.id}/confirm`,
        `e1-complete:asset:${asset.id}`,
        { leadId: 'lead-yunheli', expectedVersion: asset.version, corrected: asset.extracted },
      )
    }
    expect(overview.focusLead.stage).toBe('READY_FOR_DELIVERY')
    expect(overview.assets.every((asset: { status: string }) => asset.status === 'CONFIRMED')).toBe(true)
    expect(overview.activities).toHaveLength(8)

    const auditCount = database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events WHERE run_id = 'onboarding-e1'`,
    ).get() as { count: number }
    const outboxCount = database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events WHERE run_id = 'onboarding-e1'`,
    ).get() as { count: number }
    expect(auditCount.count).toBe(7)
    expect(outboxCount.count).toBe(7)
  })

  it('体检写请求可安全重放且拒绝过期版本', async () => {
    const request = {
      method: 'POST' as const,
      url: '/api/v1/onboarding/leads/lead-yunheli/diagnosis',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e1-idempotent:diagnosis',
      },
      payload: { expectedVersion: 1 },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(first.body).toBe(replay.body)

    const stale = await app.inject({
      ...request,
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e1-stale:diagnosis',
      },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('stale_entity_version')
  })

  it('折扣超过自动权限时禁止直接签约，并支持总部审批后继续', async () => {
    const contractResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-muyun/contracts',
      headers: { authorization: hqAuthorization, 'idempotency-key': 'e1-discount:draft' },
      payload: { expectedVersion: 1, packageCode: 'AGENT', discountBps: 600 },
    })
    expect(contractResponse.statusCode).toBe(200)
    const contract = contractResponse.json().contract
    expect(contract.discountStatus).toBe('PENDING')

    const signResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/contracts/${contract.id}/sign`,
      headers: { authorization: hqAuthorization, 'idempotency-key': 'e1-discount:sign' },
      payload: { leadId: 'lead-muyun', expectedVersion: contract.version },
    })
    expect(signResponse.statusCode).toBe(409)
    expect(signResponse.json().title).toBe('discount_approval_required')

    const approvalResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/contracts/${contract.id}/discount-decision`,
      headers: { authorization: hqAuthorization, 'idempotency-key': 'e1-discount:approve' },
      payload: {
        leadId: 'lead-muyun', expectedVersion: 1, decision: 'APPROVE',
        note: '城市经理确认连锁示范商家专项折扣',
      },
    })
    expect(approvalResponse.statusCode).toBe(200)
    expect(approvalResponse.json().contract).toMatchObject({
      discountStatus: 'APPROVED', version: 2,
    })

    const approvedSign = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/contracts/${contract.id}/sign`,
      headers: { authorization: hqAuthorization, 'idempotency-key': 'e1-discount:sign-approved' },
      payload: { leadId: 'lead-muyun', expectedVersion: 2 },
    })
    expect(approvedSign.statusCode).toBe(200)
    expect(approvedSign.json().contract).toMatchObject({
      status: 'SIGNED', authorizationCount: 6,
    })
  })

  it('销售不能转移线索，申诉与时间线保持只追加', async () => {
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/transfer',
      headers: { authorization: salesAuthorization, 'idempotency-key': 'e1-transfer:denied' },
      payload: { targetOwnerId: 'user-demo-provider', reason: '测试越权转移申请', expectedVersion: 1 },
    })
    expect(denied.statusCode).toBe(403)

    const appeal = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/appeals',
      headers: { authorization: salesAuthorization, 'idempotency-key': 'e1-appeal:create' },
      payload: { reason: '首次有效拜访记录早于重复线索', evidence: ['拜访签到 2026-07-20'] },
    })
    expect(appeal.statusCode).toBe(200)
    expect(appeal.json().focusLead.disputeStatus).toBe('PENDING')
    expect(() => database.exec("UPDATE lead_activities SET summary = 'tampered'"))
      .toThrowError(/append-only/)
    expect(() => database.exec('DELETE FROM lead_activities')).toThrowError(/append-only/)
  })

  it('创建线索后可记录跟进、下一动作和结构化失单原因', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads',
      headers: { authorization: salesAuthorization, 'idempotency-key': 'e1-crm:create-lead' },
      payload: {
        name: '青岚小院', category: '本帮创意菜', source: '商圈地推',
        contactName: '沈青', contactPhoneMasked: '137****9082',
        address: '上海市静安区铜仁路 88 号', cityId: 'city-shanghai',
      },
    })
    expect(created.statusCode).toBe(200)
    const lead = created.json().focusLead
    expect(lead).toMatchObject({ name: '青岚小院', stage: 'NEW', version: 1 })

    const nextActionAt = '2026-07-28T02:30:00.000Z'
    const followUp = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/leads/${lead.id}/followups`,
      headers: { authorization: salesAuthorization, 'idempotency-key': 'e1-crm:follow-up' },
      payload: {
        expectedVersion: 1, channel: 'VISIT', summary: '主理人认可专业版方案',
        nextAction: '邀请合伙人参加方案会', nextActionAt,
      },
    })
    expect(followUp.statusCode).toBe(200)
    expect(followUp.json().focusLead).toMatchObject({
      nextAction: '邀请合伙人参加方案会', nextActionAt, version: 2,
    })

    const lost = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/leads/${lead.id}/lost`,
      headers: { authorization: salesAuthorization, 'idempotency-key': 'e1-crm:mark-lost' },
      payload: { expectedVersion: 2, reason: 'TIMING', note: '计划在下一财季重新评估' },
    })
    expect(lost.statusCode).toBe(200)
    expect(lost.json()).toMatchObject({
      counts: { lost: 1 },
      focusLead: { stage: 'LOST', lossReason: 'TIMING', version: 3 },
    })
  })

  it('真实上传三类资料并保留不可变原件和人工校对版本', async () => {
    const post = async (url: string, key: string, payload: object) => {
      const response = await app.inject({
        method: 'POST', url,
        headers: { authorization: salesAuthorization, 'idempotency-key': key }, payload,
      })
      expect(response.statusCode, response.body).toBe(200)
      return response.json()
    }
    let overview = await post(
      '/api/v1/onboarding/leads/lead-yunheli/diagnosis', 'e1-upload:diagnosis',
      { expectedVersion: 1 },
    )
    overview = await post(
      '/api/v1/onboarding/leads/lead-yunheli/contracts', 'e1-upload:contract',
      { expectedVersion: 2, packageCode: 'PRO', discountBps: 300 },
    )
    overview = await post(
      `/api/v1/onboarding/contracts/${overview.contract.id}/sign`, 'e1-upload:sign',
      { leadId: 'lead-yunheli', expectedVersion: 1 },
    )

    const uploads = [
      ['BUSINESS_LICENSE', 'license.jpg', 'image/jpeg'],
      ['STOREFRONT', 'storefront.jpg', 'image/jpeg'],
      ['MENU', 'menu.png', 'image/png'],
    ] as const
    let leadVersion = 4
    for (const [assetType, fileName, mimeType] of uploads) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/onboarding/leads/lead-yunheli/assets/upload',
        headers: {
          authorization: salesAuthorization,
          'idempotency-key': `e1-upload:${assetType.toLowerCase()}`,
          'content-type': 'application/octet-stream',
          'x-asset-type': assetType,
          'x-file-name': encodeURIComponent(fileName),
          'x-mime-type': mimeType,
          'x-expected-version': String(leadVersion),
        },
        payload: Buffer.from(`real-${assetType}-image-content`),
      })
      expect(response.statusCode, response.body).toBe(200)
      overview = response.json()
      leadVersion += 1
    }
    expect(overview.assets).toHaveLength(3)
    expect(overview.assets.every((asset: { source: string; sha256: string }) =>
      asset.source === 'USER_UPLOAD' && asset.sha256.length === 64,
    )).toBe(true)

    for (const asset of overview.assets as Array<{
      id: string
      version: number
      extracted: Record<string, unknown>
    }>) {
      overview = await post(
        `/api/v1/onboarding/assets/${asset.id}/confirm`,
        `e1-upload:confirm:${asset.id}`,
        { leadId: 'lead-yunheli', expectedVersion: asset.version, corrected: asset.extracted },
      )
    }
    expect(overview.focusLead.stage).toBe('READY_FOR_DELIVERY')
    expect(overview.activities).toHaveLength(10)
    const blobs = database.prepare(
      'SELECT COUNT(*) AS count FROM onboarding_asset_blobs',
    ).get() as { count: number }
    expect(blobs.count).toBe(3)
    expect(() => database.exec('DELETE FROM onboarding_asset_blobs')).toThrowError(/append-only/)
  })

  it('总部可添加协作人和转移归属，销售列表由 SQL 数据范围收窄', async () => {
    const collaborator = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/collaborators',
      headers: { authorization: hqAuthorization, 'idempotency-key': 'e1-collab:add' },
      payload: { expectedVersion: 1, userId: 'user-demo-provider', role: 'DELIVERY_PARTNER' },
    })
    expect(collaborator.statusCode).toBe(200)
    expect(collaborator.json().collaborators).toMatchObject([
      { userId: 'user-demo-provider', displayName: '上海城市服务商管理员', role: 'DELIVERY_PARTNER' },
    ])

    const transferred = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/transfer',
      headers: { authorization: hqAuthorization, 'idempotency-key': 'e1-collab:transfer' },
      payload: {
        expectedVersion: 2, targetOwnerId: 'user-demo-provider',
        reason: '签约完成后移交城市交付负责人',
      },
    })
    expect(transferred.statusCode).toBe(200)

    const transferredWithoutCollaboration = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-muyun/transfer',
      headers: { authorization: hqAuthorization, 'idempotency-key': 'e1-collab:transfer-second' },
      payload: {
        expectedVersion: 1, targetOwnerId: 'user-demo-provider',
        reason: '城市经理重新分配未签约线索',
      },
    })
    expect(transferredWithoutCollaboration.statusCode).toBe(200)

    const salesView = await app.inject({
      method: 'GET', url: '/api/v1/onboarding/overview',
      headers: { authorization: salesAuthorization },
    })
    expect(salesView.statusCode).toBe(200)
    expect(salesView.json().counts.total).toBe(1)
    expect(salesView.json().leads.map((item: { id: string }) => item.id)).not.toContain('lead-yunheli')
    expect(salesView.json().leads.map((item: { id: string }) => item.id)).not.toContain('lead-muyun')

    const providerView = await app.inject({
      method: 'GET', url: '/api/v1/onboarding/overview?focusLeadId=lead-yunheli',
      headers: { authorization: providerAuthorization },
    })
    expect(providerView.statusCode).toBe(200)
    expect(providerView.json()).toMatchObject({
      focusLead: { ownerId: 'user-demo-provider' },
      collaborators: [{ userId: 'user-demo-provider' }],
    })
  })
})
