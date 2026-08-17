import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  JOURNEY_STEPS,
  type AppRole,
  type AuditSummary,
  type ConsentSummary,
  type ExperienceSnapshot,
  type MerchantState,
  type MiniAppSummary,
  type ReservationSummary,
  type RiskLevel,
  type SkillSummary,
} from '@lequ/contracts'
import { createFreshRun, getCurrentRunId } from './database.js'
import { DomainError } from './errors.js'

const TENANT_ID = 'tenant-yunhe-restaurant'
const ROUTE_ADVANCE = '/api/v1/experience/advance'
const ROUTE_RESET = '/api/v1/experience/reset'

interface RunRow {
  run_id: string
  completed_steps: number
  merchant_id: string | null
  updated_at: string
}

interface MerchantRow {
  id: string
  name: string
  category: string
  city: string
  address: string
  contact_name: string
  state: MerchantState
  health_score: number | null
  geo_score: number | null
  profile_completion: number
}

interface MiniAppRow {
  version: string
  status: 'PREVIEW' | 'LIVE'
  template: string
  preview_path: string
  approved_at: string | null
}

interface SkillRow {
  id: string
  name: SkillSummary['name']
  version: string
  status: SkillSummary['status']
  success_rate: number
  risk_level: RiskLevel
}

interface ReservationRow {
  id: string
  status: ReservationSummary['status']
  store_name: string
  party_size: number
  reservation_at: string
  customer_name: string
  note: string
  merchant_seen_at: string | null
}

interface ConsentRow {
  scope: string
  label: string
  granted_at: string
}

interface AuditRow {
  id: string
  sequence: number
  actor_role: AuditSummary['actorRole']
  action: string
  entity_type: string
  risk_level: RiskLevel
  result: AuditSummary['result']
  summary: string
  created_at: string
}

interface StoredIdempotencyRow {
  request_hash: string
  response_json: string
}

const consentScopes = [
  ['DIGITAL_PROFILE', '数字建档与小程序'],
  ['GEO_DISTRIBUTION', 'GEO 分发'],
  ['SKILL_RUNTIME', 'Skill 生成与调用'],
  ['PLATFORM_DISPLAY', '乐趣生活展示'],
  ['TRANSACTION', '交易、支付与会员'],
  ['VOUCHER_ALLIANCE', '代金券抽佣联盟'],
] as const

function now(): string {
  return new Date().toISOString()
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function getRun(database: DatabaseSync, runId = getCurrentRunId(database)): RunRow {
  const run = database
    .prepare(
      'SELECT run_id, completed_steps, merchant_id, updated_at FROM demo_runs WHERE run_id = ?',
    )
    .get(runId) as unknown as RunRow | undefined

  if (!run) {
    throw new DomainError(404, 'run_not_found', '演示运行批次不存在')
  }

  return run
}

function reservationTime(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(18, 30, 0, 0)
  return date.toISOString()
}

function merchantIdFor(runId: string): string {
  return `merchant-${runId}`
}

function entityIdFor(run: RunRow): string {
  return run.merchant_id ?? merchantIdFor(run.run_id)
}

function updateMerchantState(
  database: DatabaseSync,
  merchantId: string,
  state: MerchantState,
  timestamp: string,
): void {
  database
    .prepare(
      `UPDATE merchants
       SET state = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
    )
    .run(state, timestamp, merchantId)
}

function recordEvidence(
  database: DatabaseSync,
  input: {
    runId: string
    actorRole: AppRole | 'system' | 'merchant-owner'
    action: string
    entityType: string
    entityId: string
    riskLevel: RiskLevel
    result: AuditSummary['result']
    summary: string
    topic: string
    payload: Record<string, unknown>
    timestamp: string
  },
): void {
  const payloadJson = JSON.stringify(input.payload)
  database
    .prepare(
      `INSERT INTO audit_events
       (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
        risk_level, result, summary, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.runId,
      TENANT_ID,
      input.actorRole,
      input.action,
      input.entityType,
      input.entityId,
      input.riskLevel,
      input.result,
      input.summary,
      payloadJson,
      input.timestamp,
    )
  database
    .prepare(
      `INSERT INTO tracking_events
       (id, run_id, tenant_id, name, properties_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.runId,
      TENANT_ID,
      input.action,
      payloadJson,
      input.timestamp,
    )
  database
    .prepare(
      `INSERT INTO outbox_events
       (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.runId,
      TENANT_ID,
      input.topic,
      input.entityId,
      payloadJson,
      input.timestamp,
    )
}

function performStep(database: DatabaseSync, run: RunRow, stepIndex: number): void {
  const timestamp = now()
  const merchantId = entityIdFor(run)
  let topic = 'workflow.task.created.v1'
  let entityType = 'merchant'
  let entityId = merchantId
  let summary = JOURNEY_STEPS[stepIndex - 1]?.description ?? '流程已推进'
  let actorRole: AppRole | 'system' | 'merchant-owner' =
    JOURNEY_STEPS[stepIndex - 1]?.role ?? 'system'
  const currentRisk = JOURNEY_STEPS[stepIndex - 1]?.riskLevel ?? 'L0'
  let result: AuditSummary['result'] =
    currentRisk === 'L2' || currentRisk === 'L3' ? 'APPROVED' : 'SUCCESS'
  const payload: Record<string, unknown> = { stepIndex, ruleVersion: 'v5.0' }

  switch (stepIndex) {
    case 1: {
      database
        .prepare(
          `INSERT INTO merchants
           (id, run_id, tenant_id, name, category, city, address, contact_name,
            state, profile_completion, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'LEAD', 24, ?, ?)`,
        )
        .run(
          merchantId,
          run.run_id,
          TENANT_ID,
          '云和里·时令餐厅',
          '江浙融合菜',
          '上海',
          '静安区愚园路 1088 号',
          '周云岚',
          timestamp,
          timestamp,
        )
      database
        .prepare(
          'UPDATE demo_runs SET merchant_id = ?, updated_at = ? WHERE run_id = ?',
        )
        .run(merchantId, timestamp, run.run_id)
      topic = 'merchant.created.v1'
      payload.leadSource = '销售外拓'
      payload.owner = '林一凡'
      break
    }
    case 2: {
      database
        .prepare(
          `UPDATE merchants
           SET state = 'DIAGNOSED', health_score = 82, profile_completion = 46,
               version = version + 1, updated_at = ?
           WHERE id = ?`,
        )
        .run(timestamp, merchantId)
      topic = 'merchant.profile.updated.v1'
      payload.healthScore = 82
      payload.findings = 6
      summary = 'AI 体检完成：数字健康分 82，识别 6 项可执行优化'
      break
    }
    case 3: {
      for (const [scope, label] of consentScopes) {
        database
          .prepare(
            `INSERT INTO consents
             (id, run_id, tenant_id, merchant_id, scope, label, granted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(randomUUID(), run.run_id, TENANT_ID, merchantId, scope, label, timestamp)
      }
      updateMerchantState(database, merchantId, 'AUTHORIZED', timestamp)
      topic = 'merchant.authorized.v1'
      payload.consentCount = consentScopes.length
      payload.contractVersion = 'merchant-agent-pro-2026.07'
      summary = '电子签约完成，六类业务授权已分别记录并可独立撤回'
      break
    }
    case 4: {
      database
        .prepare(
          `UPDATE merchants
           SET state = 'ONBOARDING', profile_completion = 98,
               version = version + 1, updated_at = ?
           WHERE id = ?`,
        )
        .run(timestamp, merchantId)
      topic = 'merchant.profile.updated.v1'
      payload.assets = ['营业执照', '门头照片', '菜单 36 项', '营业时间']
      payload.confidence = 0.97
      summary = 'OCR 与视觉识别完成，36 道菜品和主体资质进入待确认资产'
      break
    }
    case 5: {
      database
        .prepare(
          `INSERT INTO miniapp_releases
           (id, run_id, tenant_id, merchant_id, version, status, template,
            preview_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, '1.0.0', 'PREVIEW', 'Dining / Seasonal',
                   '/preview/yunheli-v1', ?, ?)`,
        )
        .run(randomUUID(), run.run_id, TENANT_ID, merchantId, timestamp, timestamp)
      updateMerchantState(database, merchantId, 'MINIAPP_PREVIEW', timestamp)
      topic = 'miniapp.preview.generated.v1'
      entityType = 'miniapp_release'
      payload.version = '1.0.0'
      summary = '基于白名单区块生成品牌小程序预览 v1.0.0'
      break
    }
    case 6: {
      database
        .prepare(
          `UPDATE miniapp_releases
           SET status = 'LIVE', approved_at = ?, updated_at = ?
           WHERE run_id = ?`,
        )
        .run(timestamp, timestamp, run.run_id)
      updateMerchantState(database, merchantId, 'MINIAPP_LIVE', timestamp)
      topic = 'miniapp.release.published.v1'
      entityType = 'miniapp_release'
      actorRole = 'merchant-owner'
      result = 'APPROVED'
      payload.approvedBy = '周云岚'
      summary = '商家确认内容快照，小程序版本进入正式可用状态'
      break
    }
    case 7: {
      database
        .prepare(
          `UPDATE merchants
           SET state = 'GEO_ACTIVE', geo_score = 94,
               version = version + 1, updated_at = ?
           WHERE id = ?`,
        )
        .run(timestamp, merchantId)
      topic = 'geo.scan.completed.v1'
      entityType = 'geo_workspace'
      payload.score = 94
      payload.dimensions = {
        identity: 15,
        profile: 15,
        consistency: 14,
        catalog: 15,
        faq: 9,
        evidence: 8,
        transactional: 9,
        freshness: 4,
        compliance: 5,
      }
      summary = 'GEO 健康分 94，身份、商品结构和授权合规均通过扫描'
      break
    }
    case 8: {
      const skills = [
        ['get_menu', 'L0', 99.8],
        ['find_table', 'L1', 99.4],
        ['reserve_table', 'L2', 98.9],
      ] as const
      for (const [name, riskLevel, successRate] of skills) {
        database
          .prepare(
            `INSERT INTO skills
             (id, run_id, tenant_id, merchant_id, name, version, status,
              success_rate, risk_level, schema_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, '1.0.0', 'ONLINE', ?, ?, ?, ?, ?)`,
          )
          .run(
            randomUUID(),
            run.run_id,
            TENANT_ID,
            merchantId,
            name,
            successRate,
            riskLevel,
            JSON.stringify({ input: { type: 'object' }, output: { type: 'object' } }),
            timestamp,
            timestamp,
          )
      }
      updateMerchantState(database, merchantId, 'SKILL_ACTIVE', timestamp)
      topic = 'skill.certified.v1'
      entityType = 'skill_version'
      payload.skills = skills.map(([name]) => name)
      summary = '三项商家 Skill 完成 Schema 校验、沙盒测试与风险分级'
      break
    }
    case 9: {
      const orderId = `reservation-${run.run_id}`
      database
        .prepare(
          `INSERT INTO orders
           (id, run_id, tenant_id, merchant_id, status, store_name, party_size,
            reservation_at, customer_name, customer_phone_masked, note,
            price_snapshot_json, rule_snapshot_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'WAITING_CONFIRM', ?, 4, ?, '陈知夏',
                   '138****2068', '临窗安静座位；一位不食花生', ?, ?, ?, ?)`,
        )
        .run(
          orderId,
          run.run_id,
          TENANT_ID,
          merchantId,
          '云和里·静安店',
          reservationTime(),
          JSON.stringify({ depositFen: 0, currency: 'CNY' }),
          JSON.stringify({ version: 'reservation-v5.0', voucherAppliedFen: 0 }),
          timestamp,
          timestamp,
        )
      topic = 'order.created.v1'
      entityType = 'order'
      entityId = orderId
      payload.status = 'WAITING_CONFIRM'
      payload.approvalRequired = true
      result = 'APPROVED'
      summary = 'AI 已创建订座草稿，未代替用户确认或支付'
      break
    }
    case 10: {
      database
        .prepare(
          `UPDATE orders
           SET status = 'FULFILLING', version = version + 1, updated_at = ?
           WHERE run_id = ?`,
        )
        .run(timestamp, run.run_id)
      updateMerchantState(database, merchantId, 'TRANSACTION_ACTIVE', timestamp)
      topic = 'order.confirmed.v1'
      entityType = 'order'
      entityId = `reservation-${run.run_id}`
      payload.confirmedBy = '陈知夏'
      result = 'APPROVED'
      summary = '用户核对门店、时间、人数与联系人后确认订座'
      break
    }
    case 11: {
      database
        .prepare(
          `UPDATE orders
           SET status = 'MERCHANT_RECEIVED', merchant_seen_at = ?,
               version = version + 1, updated_at = ?
           WHERE run_id = ?`,
        )
        .run(timestamp, timestamp, run.run_id)
      topic = 'workflow.task.created.v1'
      entityType = 'order'
      entityId = `reservation-${run.run_id}`
      payload.queue = 'merchant-today'
      summary = '预约已进入经营宝今日待办，商家确认收到履约信息'
      break
    }
    case 12: {
      topic = 'audit.reviewed.v1'
      entityType = 'audit_bundle'
      entityId = run.run_id
      payload.coverage = 100
      payload.findings = 0
      summary = 'HQ 完成全链路复核：授权、状态、风险、事件证据均完整'
      break
    }
    default:
      throw new DomainError(409, 'workflow_complete', '首个垂直切片已全部完成')
  }

  const step = JOURNEY_STEPS[stepIndex - 1]
  if (!step) {
    throw new DomainError(409, 'invalid_step', '流程步骤不存在')
  }

  recordEvidence(database, {
    runId: run.run_id,
    actorRole,
    action: step.key,
    entityType,
    entityId,
    riskLevel: step.riskLevel,
    result,
    summary,
    topic,
    payload,
    timestamp,
  })

  database
    .prepare(
      'UPDATE demo_runs SET completed_steps = ?, updated_at = ? WHERE run_id = ?',
    )
    .run(stepIndex, timestamp, run.run_id)
}

export function getSnapshot(
  database: DatabaseSync,
  runId = getCurrentRunId(database),
): ExperienceSnapshot {
  const run = getRun(database, runId)
  const merchant = database
    .prepare(
      `SELECT id, name, category, city, address, contact_name, state,
              health_score, geo_score, profile_completion
       FROM merchants WHERE run_id = ?`,
    )
    .get(runId) as unknown as MerchantRow | undefined
  const miniApp = database
    .prepare(
      `SELECT version, status, template, preview_path, approved_at
       FROM miniapp_releases WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(runId) as unknown as MiniAppRow | undefined
  const skills = database
    .prepare(
      `SELECT id, name, version, status, success_rate, risk_level
       FROM skills WHERE run_id = ? ORDER BY name`,
    )
    .all(runId) as unknown as SkillRow[]
  const reservation = database
    .prepare(
      `SELECT id, status, store_name, party_size, reservation_at,
              customer_name, note, merchant_seen_at
       FROM orders WHERE run_id = ? LIMIT 1`,
    )
    .get(runId) as unknown as ReservationRow | undefined
  const consents = database
    .prepare(
      `SELECT scope, label, granted_at FROM consents
       WHERE run_id = ? ORDER BY granted_at, scope`,
    )
    .all(runId) as unknown as ConsentRow[]
  const audits = database
    .prepare(
      `SELECT id, sequence, actor_role, action, entity_type, risk_level,
              result, summary, created_at
       FROM audit_events WHERE run_id = ? ORDER BY sequence DESC LIMIT 18`,
    )
    .all(runId) as unknown as AuditRow[]
  const eventCountRow = database
    .prepare('SELECT COUNT(*) AS count FROM outbox_events WHERE run_id = ?')
    .get(runId) as unknown as { count: number }
  const replayRow = database
    .prepare(
      `SELECT COALESCE(SUM(replay_count), 0) AS count
       FROM idempotency_records WHERE run_id = ?`,
    )
    .get(runId) as unknown as { count: number }

  const auditCoverage =
    run.completed_steps === 0
      ? 100
      : Math.min(100, Math.round((audits.length / run.completed_steps) * 100))

  return {
    runId,
    completedSteps: run.completed_steps,
    totalSteps: JOURNEY_STEPS.length,
    completionRate: Math.round((run.completed_steps / JOURNEY_STEPS.length) * 100),
    nextStep: JOURNEY_STEPS[run.completed_steps] ?? null,
    merchant: merchant
      ? {
          id: merchant.id,
          name: merchant.name,
          category: merchant.category,
          city: merchant.city,
          address: merchant.address,
          contactName: merchant.contact_name,
          state: merchant.state,
          healthScore: merchant.health_score,
          geoScore: merchant.geo_score,
          profileCompletion: merchant.profile_completion,
        }
      : null,
    miniApp: miniApp
      ? {
          version: miniApp.version,
          status: miniApp.status,
          template: miniApp.template,
          previewPath: miniApp.preview_path,
          approvedAt: miniApp.approved_at,
        }
      : null,
    skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      version: skill.version,
      status: skill.status,
      successRate: skill.success_rate,
      riskLevel: skill.risk_level,
    })),
    reservation: reservation
      ? {
          id: reservation.id,
          status: reservation.status,
          storeName: reservation.store_name,
          partySize: reservation.party_size,
          reservationAt: reservation.reservation_at,
          customerName: reservation.customer_name,
          note: reservation.note,
          merchantSeenAt: reservation.merchant_seen_at,
        }
      : null,
    consents: consents.map((consent) => ({
      scope: consent.scope,
      label: consent.label,
      grantedAt: consent.granted_at,
    } satisfies ConsentSummary)),
    audits: audits.map((audit) => ({
      id: audit.id,
      sequence: audit.sequence,
      actorRole: audit.actor_role,
      action: audit.action,
      entityType: audit.entity_type,
      riskLevel: audit.risk_level,
      result: audit.result,
      summary: audit.summary,
      createdAt: audit.created_at,
    })),
    metrics: {
      auditCoverage,
      eventCount: eventCountRow.count,
      idempotencyReplays: replayRow.count,
    },
    updatedAt: run.updated_at,
  }
}

export function advanceExperience(
  database: DatabaseSync,
  input: { expectedStep: number },
  idempotencyKey: string,
): ExperienceSnapshot {
  const hash = requestHash(input)
  const stored = database
    .prepare(
      'SELECT request_hash, response_json FROM idempotency_records WHERE key = ? AND route = ?',
    )
    .get(idempotencyKey, ROUTE_ADVANCE) as unknown as StoredIdempotencyRow | undefined

  if (stored) {
    if (stored.request_hash !== hash) {
      throw new DomainError(
        409,
        'idempotency_conflict',
        '同一个 Idempotency-Key 不能用于不同请求',
      )
    }
    database
      .prepare(
        `UPDATE idempotency_records SET replay_count = replay_count + 1
         WHERE key = ? AND route = ?`,
      )
      .run(idempotencyKey, ROUTE_ADVANCE)
    return JSON.parse(stored.response_json) as ExperienceSnapshot
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const run = getRun(database)
    const nextStep = run.completed_steps + 1
    if (input.expectedStep !== nextStep) {
      throw new DomainError(
        409,
        'stale_workflow_state',
        `当前应执行第 ${nextStep} 步，请刷新后重试`,
      )
    }
    performStep(database, run, nextStep)
    const snapshot = getSnapshot(database, run.run_id)
    database
      .prepare(
        `INSERT INTO idempotency_records
         (key, route, run_id, request_hash, response_json, status_code, created_at)
         VALUES (?, ?, ?, ?, ?, 200, ?)`,
      )
      .run(idempotencyKey, ROUTE_ADVANCE, run.run_id, hash, JSON.stringify(snapshot), now())
    database.exec('COMMIT;')
    return snapshot
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function resetExperience(
  database: DatabaseSync,
  idempotencyKey: string,
): ExperienceSnapshot {
  const stored = database
    .prepare(
      'SELECT request_hash, response_json FROM idempotency_records WHERE key = ? AND route = ?',
    )
    .get(idempotencyKey, ROUTE_RESET) as unknown as StoredIdempotencyRow | undefined

  if (stored) {
    database
      .prepare(
        `UPDATE idempotency_records SET replay_count = replay_count + 1
         WHERE key = ? AND route = ?`,
      )
      .run(idempotencyKey, ROUTE_RESET)
    return JSON.parse(stored.response_json) as ExperienceSnapshot
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const runId = createFreshRun(database, true)
    const snapshot = getSnapshot(database, runId)
    database
      .prepare(
        `INSERT INTO idempotency_records
         (key, route, run_id, request_hash, response_json, status_code, created_at)
         VALUES (?, ?, ?, ?, ?, 200, ?)`,
      )
      .run(
        idempotencyKey,
        ROUTE_RESET,
        runId,
        requestHash({}),
        JSON.stringify(snapshot),
        now(),
      )
    database.exec('COMMIT;')
    return snapshot
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}
