import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type { ConsumerImageInputSummary } from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'consumer-image-e8g'
const CONNECTOR_SECRET = process.env.IMAGE_RECOGNITION_CONNECTOR_WEBHOOK_SECRET
  ?? 'development-image-recognition-webhook-secret'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_DIMENSION = 4096
const MAX_PIXELS = 12_000_000
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type ImageMimeType = typeof MIME_TYPES[number]
type ImageCategory = NonNullable<ConsumerImageInputSummary['category']>

interface ReplayRow { request_hash: string; response_json: string }
interface ImageRow {
  id: string
  tenant_id: string
  user_id: string
  city_id: string
  household_member_id: string
  session_id: string | null
  file_name: string
  mime_type: ImageMimeType
  byte_size: number
  width: number
  height: number
  sha256: string
  status: ConsumerImageInputSummary['status']
  provider_request_id: string
  provider_event_id: string | null
  category: ImageCategory | null
  raw_description: string | null
  confirmed_description: string | null
  confidence: number | null
  contains_sensitive_data: number | null
  failure_code: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface ImageRecognitionCallbackInput {
  providerEventId: string
  imageInputId: string
  status: 'SUCCEEDED' | 'FAILED'
  category?: ImageCategory | undefined
  description?: string | undefined
  confidence?: number | undefined
  containsSensitiveData?: boolean | undefined
  failureCode?: string | undefined
}

function now(): string { return new Date().toISOString() }
function hash(value: unknown): string {
  return createHash('sha256').update(
    Buffer.isBuffer(value) ? value : JSON.stringify(value),
  ).digest('hex')
}
function requireConsumer(principal: Principal): void {
  if (!principal.roles.includes('CONSUMER') || principal.dataScope !== 'SELF') {
    throw new DomainError(403, 'consumer_identity_required', '当前身份不是消费者本人')
  }
}
function safeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue)
  const right = Buffer.from(rightValue)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function imageRecognitionCallbackSignature(input: ImageRecognitionCallbackInput): string {
  return createHmac('sha256', CONNECTOR_SECRET)
    .update(JSON.stringify(input))
    .digest('hex')
}

function imageDimensions(content: Buffer, mimeType: ImageMimeType): { width: number; height: number } {
  if (mimeType === 'image/png') {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (
      content.length < 24
      || !content.subarray(0, 8).equals(signature)
      || content.toString('ascii', 12, 16) !== 'IHDR'
    ) {
      throw new DomainError(415, 'consumer_image_signature_mismatch', '图片内容与 PNG 格式不一致')
    }
    return { width: content.readUInt32BE(16), height: content.readUInt32BE(20) }
  }
  if (mimeType === 'image/webp') {
    if (
      content.length < 30
      || content.toString('ascii', 0, 4) !== 'RIFF'
      || content.toString('ascii', 8, 12) !== 'WEBP'
    ) {
      throw new DomainError(415, 'consumer_image_signature_mismatch', '图片内容与 WebP 格式不一致')
    }
    const kind = content.toString('ascii', 12, 16)
    if (kind === 'VP8X') {
      return {
        width: 1 + content.readUIntLE(24, 3),
        height: 1 + content.readUIntLE(27, 3),
      }
    }
    if (kind === 'VP8L' && content[20] === 0x2f) {
      const bits = content.readUInt32LE(21)
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff),
      }
    }
    throw new DomainError(415, 'consumer_image_webp_profile_unsupported', '当前 WebP 编码无法安全读取尺寸')
  }
  if (
    content.length < 12
    || content[0] !== 0xff
    || content[1] !== 0xd8
    || content[2] !== 0xff
  ) {
    throw new DomainError(415, 'consumer_image_signature_mismatch', '图片内容与 JPEG 格式不一致')
  }
  let offset = 2
  while (offset + 9 < content.length) {
    if (content[offset] !== 0xff) { offset += 1; continue }
    const marker = content[offset + 1]!
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue }
    const length = content.readUInt16BE(offset + 2)
    if (length < 2 || offset + 2 + length > content.length) break
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: content.readUInt16BE(offset + 5),
        width: content.readUInt16BE(offset + 7),
      }
    }
    offset += 2 + length
  }
  throw new DomainError(415, 'consumer_image_dimensions_unreadable', '无法安全读取 JPEG 尺寸')
}

function validateImage(
  content: Buffer,
  mimeType: string,
  fileName: string,
): { mimeType: ImageMimeType; width: number; height: number } {
  if (!MIME_TYPES.includes(mimeType as ImageMimeType)) {
    throw new DomainError(415, 'consumer_image_mime_type_unsupported', '仅支持 JPEG、PNG 和 WebP 图片')
  }
  if (content.byteLength < 24 || content.byteLength > MAX_IMAGE_BYTES) {
    throw new DomainError(413, 'consumer_image_file_size_invalid', '图片必须包含有效内容且不超过 8MB')
  }
  const normalizedMime = mimeType as ImageMimeType
  const extension = fileName.split('.').pop()?.toLowerCase()
  const extensionMatches = normalizedMime === 'image/jpeg'
    ? ['jpg', 'jpeg'].includes(extension ?? '')
    : extension === normalizedMime.split('/')[1]
  if (!extensionMatches) {
    throw new DomainError(415, 'consumer_image_extension_mismatch', '图片扩展名与声明格式不一致')
  }
  const dimensions = imageDimensions(content, normalizedMime)
  if (
    dimensions.width < 1
    || dimensions.height < 1
    || dimensions.width > MAX_DIMENSION
    || dimensions.height > MAX_DIMENSION
    || dimensions.width * dimensions.height > MAX_PIXELS
  ) {
    throw new DomainError(422, 'consumer_image_dimensions_invalid', '图片尺寸必须不超过 4096×4096 和 1200 万像素')
  }
  return { mimeType: normalizedMime, ...dimensions }
}

function replay<T>(database: DatabaseSync, key: string, route: string, input: unknown): T | undefined {
  const stored = database.prepare(
    'SELECT request_hash, response_json FROM idempotency_records WHERE key = ? AND route = ?',
  ).get(key, route) as unknown as ReplayRow | undefined
  if (!stored) return undefined
  if (stored.request_hash !== hash(input)) {
    throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
  }
  database.prepare(
    'UPDATE idempotency_records SET replay_count = replay_count + 1 WHERE key = ? AND route = ?',
  ).run(key, route)
  return JSON.parse(stored.response_json) as T
}
function persistReplay(
  database: DatabaseSync,
  key: string,
  route: string,
  input: unknown,
  response: unknown,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO idempotency_records
     (key, route, run_id, request_hash, response_json, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, 200, ?)`,
  ).run(key, route, RUN_ID, hash(input), JSON.stringify(response), timestamp)
}

function imageRow(database: DatabaseSync, imageInputId: string, principal?: Principal): ImageRow {
  const row = database.prepare(
    `SELECT id, tenant_id, user_id, city_id, household_member_id, session_id,
            file_name, mime_type, byte_size, width, height, sha256, status,
            provider_request_id, provider_event_id, category, raw_description,
            confirmed_description, confidence, contains_sensitive_data,
            failure_code, version, created_at, updated_at
     FROM consumer_image_inputs WHERE id = ?
       AND (? IS NULL OR tenant_id = ?)
       AND (? IS NULL OR user_id = ?)`,
  ).get(
    imageInputId,
    principal?.tenantId ?? null, principal?.tenantId ?? null,
    principal?.subject ?? null, principal?.subject ?? null,
  ) as unknown as ImageRow | undefined
  if (!row) throw new DomainError(404, 'consumer_image_input_not_found', '当前身份下没有这条图片输入')
  return row
}
function summary(row: ImageRow): ConsumerImageInputSummary {
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    category: row.category,
    description: ['READY_FOR_CONFIRMATION', 'CONFIRMED', 'DISPATCHED'].includes(row.status)
      ? row.confirmed_description ?? row.raw_description
      : null,
    confidence: row.confidence,
    containsSensitiveData: row.contains_sensitive_data === null
      ? null
      : row.contains_sensitive_data === 1,
    failureCode: row.failure_code,
    canConfirm: row.status === 'READY_FOR_CONFIRMATION',
    canSend: row.status === 'CONFIRMED',
    liveConnectorAvailable: false,
    disclosure: '图片上传不等于识别成功；平台只完成格式签名与尺寸基础校验，不等同于完整恶意内容扫描。识别回调后仍须由你核对确认。',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
function appendEvent(
  database: DatabaseSync,
  row: Pick<ImageRow, 'id' | 'tenant_id' | 'user_id'>,
  type: string,
  summaryText: string,
  payload: Record<string, unknown>,
  timestamp: string,
  providerEventId?: string,
): void {
  database.prepare(
    `INSERT INTO consumer_image_events
     (id, tenant_id, user_id, image_input_id, provider_event_id, type,
      summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), row.tenant_id, row.user_id, row.id, providerEventId ?? null,
    type, summaryText, JSON.stringify(payload), timestamp,
  )
}
function recordEvidence(
  database: DatabaseSync,
  tenantId: string,
  actorRole: string,
  action: string,
  entityId: string,
  summaryText: string,
  payload: Record<string, unknown>,
  timestamp: string,
  outboxTopic?: string,
): void {
  const payloadJson = JSON.stringify(payload)
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'consumer_image_input', ?, 'L1', 'SUCCESS', ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, tenantId, actorRole, action, entityId, summaryText, payloadJson, timestamp)
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), RUN_ID, tenantId, action.toLowerCase(), payloadJson, timestamp)
  if (outboxTopic) {
    database.prepare(
      `INSERT INTO outbox_events
       (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), RUN_ID, tenantId, outboxTopic, entityId, payloadJson, timestamp)
  }
}

export function latestConsumerImageInput(
  database: DatabaseSync,
  principal: Principal,
  cityId: string,
  householdMemberId: string,
): ConsumerImageInputSummary | null {
  requireConsumer(principal)
  const row = database.prepare(
    `SELECT id, tenant_id, user_id, city_id, household_member_id, session_id,
            file_name, mime_type, byte_size, width, height, sha256, status,
            provider_request_id, provider_event_id, category, raw_description,
            confirmed_description, confidence, contains_sensitive_data,
            failure_code, version, created_at, updated_at
     FROM consumer_image_inputs
     WHERE tenant_id = ? AND user_id = ? AND city_id = ? AND household_member_id = ?
     ORDER BY updated_at DESC, id DESC LIMIT 1`,
  ).get(principal.tenantId, principal.subject, cityId, householdMemberId) as unknown as ImageRow | undefined
  return row ? summary(row) : null
}

export function uploadConsumerImageInput(
  database: DatabaseSync,
  principal: Principal,
  input: {
    fileName: string
    mimeType: string
    cityId: string
    householdMemberId: string
    content: Buffer
  },
  idempotencyKey: string,
): ConsumerImageInputSummary {
  const route = '/api/v1/consumer/assistant/image-inputs'
  const validated = validateImage(input.content, input.mimeType, input.fileName)
  const requestInput = {
    fileName: input.fileName, mimeType: validated.mimeType,
    cityId: input.cityId, householdMemberId: input.householdMemberId,
    byteSize: input.content.byteLength, sha256: hash(input.content),
    width: validated.width, height: validated.height,
  }
  const stored = replay<ConsumerImageInputSummary>(database, idempotencyKey, route, requestInput)
  if (stored) return stored
  requireConsumer(principal)
  database.exec('BEGIN IMMEDIATE;')
  try {
    const profile = database.prepare(
      `SELECT preferred_city_id, active_household_member_id
       FROM consumer_profiles WHERE tenant_id = ? AND user_id = ?`,
    ).get(principal.tenantId, principal.subject) as {
      preferred_city_id: string
      active_household_member_id: string
    } | undefined
    if (
      !profile
      || profile.preferred_city_id !== input.cityId
      || profile.active_household_member_id !== input.householdMemberId
    ) throw new DomainError(409, 'consumer_image_context_stale', '城市或家庭身份已变化，请刷新后重试')
    const timestamp = now()
    const imageInputId = randomUUID()
    const providerRequestId = `LQIMG-${randomUUID()}`
    database.prepare(
      `INSERT INTO consumer_image_inputs
       (id, tenant_id, user_id, city_id, household_member_id, session_id,
        file_name, mime_type, byte_size, width, height, sha256, status,
        provider_request_id, provider_event_id, category, raw_description,
        confirmed_description, confidence, contains_sensitive_data,
        failure_code, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'PENDING_RECOGNITION',
               ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, ?, ?)`,
    ).run(
      imageInputId, principal.tenantId, principal.subject, input.cityId,
      input.householdMemberId, input.fileName, validated.mimeType,
      input.content.byteLength, validated.width, validated.height,
      requestInput.sha256, providerRequestId, timestamp, timestamp,
    )
    database.prepare(
      `INSERT INTO consumer_image_blobs (image_input_id, content, created_at)
       VALUES (?, ?, ?)`,
    ).run(imageInputId, input.content, timestamp)
    const payload = {
      imageInputId, providerRequestId, mimeType: validated.mimeType,
      byteSize: input.content.byteLength, width: validated.width,
      height: validated.height, sha256: requestInput.sha256,
      connectorMode: 'OUTBOX_ONLY', rawImageRetention: 'UNTIL_CALLBACK',
      validation: 'MAGIC_BYTES_AND_DIMENSIONS',
      fullMalwareScanAvailable: false,
    }
    const row = imageRow(database, imageInputId, principal)
    appendEvent(database, row, 'IMAGE_UPLOADED', '图片已通过基础校验并等待识别连接器', payload, timestamp)
    recordEvidence(
      database, principal.tenantId, 'CONSUMER', 'CONSUMER_IMAGE_UPLOADED',
      imageInputId, '消费者图片已进入待识别队列', payload, timestamp,
      'consumer.image.recognition.requested.v1',
    )
    const response = summary(row)
    persistReplay(database, idempotencyKey, route, requestInput, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function applyImageRecognitionCallback(
  database: DatabaseSync,
  input: ImageRecognitionCallbackInput,
  signature: string,
): { accepted: true; replayed: boolean; imageInputId: string; status: string } {
  if (!safeEqual(imageRecognitionCallbackSignature(input), signature)) {
    throw new DomainError(401, 'image_callback_signature_invalid', '图片识别连接器回调签名无效')
  }
  const prior = database.prepare(
    `SELECT id, status, category, raw_description, confidence,
            contains_sensitive_data, failure_code
     FROM consumer_image_inputs WHERE provider_event_id = ?`,
  ).get(input.providerEventId) as {
    id: string
    status: string
    category: string | null
    raw_description: string | null
    confidence: number | null
    contains_sensitive_data: number | null
    failure_code: string | null
  } | undefined
  if (prior) {
    const same = prior.id === input.imageInputId && (
      input.status === 'SUCCEEDED'
        ? prior.status === 'READY_FOR_CONFIRMATION'
          && prior.category === input.category
          && prior.raw_description === input.description?.trim()
          && prior.confidence === input.confidence
          && prior.contains_sensitive_data === Number(input.containsSensitiveData)
        : prior.status === 'FAILED' && prior.failure_code === input.failureCode
    )
    if (!same) throw new DomainError(409, 'image_callback_event_conflict', '同一图片识别事件号不能用于不同结果')
    return { accepted: true, replayed: true, imageInputId: prior.id, status: prior.status }
  }
  database.exec('BEGIN IMMEDIATE;')
  try {
    const row = imageRow(database, input.imageInputId)
    if (row.status !== 'PENDING_RECOGNITION') {
      throw new DomainError(409, 'consumer_image_state_invalid', '当前图片状态不接受识别回调')
    }
    if (input.status === 'SUCCEEDED') {
      const description = input.description?.trim()
      if (!description || description.length > 600 || !input.category) {
        throw new DomainError(422, 'image_recognition_result_invalid', '图片识别结果缺少有效分类或描述')
      }
      if (input.confidence === undefined || input.confidence < 0 || input.confidence > 1) {
        throw new DomainError(422, 'image_confidence_invalid', '图片识别置信度必须在 0 到 1 之间')
      }
      if (input.containsSensitiveData === undefined) {
        throw new DomainError(422, 'image_sensitive_flag_required', '图片识别结果必须声明是否包含敏感信息')
      }
    } else if (!input.failureCode?.trim()) {
      throw new DomainError(422, 'image_failure_code_required', '图片识别失败必须提供失败代码')
    }
    const timestamp = now()
    const nextStatus = input.status === 'SUCCEEDED' ? 'READY_FOR_CONFIRMATION' : 'FAILED'
    database.prepare(
      `UPDATE consumer_image_inputs
       SET status = ?, provider_event_id = ?, category = ?, raw_description = ?,
           confidence = ?, contains_sensitive_data = ?, failure_code = ?,
           version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(
      nextStatus, input.providerEventId, input.category ?? null,
      input.description?.trim() ?? null, input.confidence ?? null,
      input.containsSensitiveData === undefined ? null : Number(input.containsSensitiveData),
      input.failureCode ?? null, timestamp, row.id,
    )
    database.prepare('DELETE FROM consumer_image_blobs WHERE image_input_id = ?').run(row.id)
    const payload = {
      imageInputId: row.id, providerEventId: input.providerEventId,
      status: nextStatus, category: input.category ?? null,
      descriptionHash: input.description ? hash(input.description.trim()) : null,
      confidence: input.confidence ?? null,
      containsSensitiveData: input.containsSensitiveData ?? null,
      failureCode: input.failureCode ?? null, rawImageDeleted: true,
    }
    appendEvent(
      database, row,
      input.status === 'SUCCEEDED' ? 'RECOGNITION_READY' : 'RECOGNITION_FAILED',
      input.status === 'SUCCEEDED' ? '图片识别草稿已生成，等待消费者确认' : '图片识别连接器处理失败',
      payload, timestamp, input.providerEventId,
    )
    recordEvidence(
      database, row.tenant_id, 'IMAGE_CONNECTOR',
      input.status === 'SUCCEEDED' ? 'CONSUMER_IMAGE_RECOGNITION_READY' : 'CONSUMER_IMAGE_RECOGNITION_FAILED',
      row.id,
      input.status === 'SUCCEEDED' ? '签名图片回调已生成待确认草稿' : '签名图片回调记录失败结果',
      payload, timestamp,
    )
    database.exec('COMMIT;')
    return { accepted: true, replayed: false, imageInputId: row.id, status: nextStatus }
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function confirmConsumerImageDescription(
  database: DatabaseSync,
  principal: Principal,
  input: {
    imageInputId: string
    expectedVersion: number
    description: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ConsumerImageInputSummary {
  const route = `/api/v1/consumer/assistant/image-inputs/${input.imageInputId}/confirm`
  const stored = replay<ConsumerImageInputSummary>(database, idempotencyKey, route, input)
  if (stored) return stored
  requireConsumer(principal)
  if (!input.confirmed) throw new DomainError(409, 'explicit_image_confirmation_required', '发送前必须明确确认图片识别描述')
  const description = input.description.trim()
  if (!description || description.length > 600) {
    throw new DomainError(422, 'consumer_image_description_invalid', '确认描述必须为 1 至 600 个字符')
  }
  database.exec('BEGIN IMMEDIATE;')
  try {
    const row = imageRow(database, input.imageInputId, principal)
    if (row.version !== input.expectedVersion) throw new DomainError(409, 'stale_entity_version', '图片状态已更新，请刷新后重试')
    if (row.status !== 'READY_FOR_CONFIRMATION') throw new DomainError(409, 'consumer_image_not_ready', '当前图片没有可确认的识别草稿')
    const profile = database.prepare(
      `SELECT preferred_city_id, active_household_member_id
       FROM consumer_profiles WHERE tenant_id = ? AND user_id = ?`,
    ).get(principal.tenantId, principal.subject) as {
      preferred_city_id: string
      active_household_member_id: string
    }
    if (
      row.city_id !== profile.preferred_city_id
      || row.household_member_id !== profile.active_household_member_id
    ) throw new DomainError(409, 'consumer_image_context_stale', '城市或家庭身份已变化，请重新选择图片')
    const timestamp = now()
    database.prepare(
      `UPDATE consumer_image_inputs SET status = 'CONFIRMED',
       confirmed_description = ?, version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(description, timestamp, row.id)
    const payload = {
      imageInputId: row.id, descriptionHash: hash(description),
      descriptionEdited: description !== row.raw_description,
      explicitConfirmation: true,
      containsSensitiveData: row.contains_sensitive_data === 1,
    }
    appendEvent(database, row, 'DESCRIPTION_CONFIRMED', '消费者已明确确认图片识别描述', payload, timestamp)
    recordEvidence(
      database, principal.tenantId, 'CONSUMER', 'CONSUMER_IMAGE_DESCRIPTION_CONFIRMED',
      row.id, '消费者已核对并确认图片识别描述', payload, timestamp,
    )
    const response = summary(imageRow(database, row.id, principal))
    persistReplay(database, idempotencyKey, route, input, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function consumeConfirmedImageInput(
  database: DatabaseSync,
  principal: Principal,
  input: {
    imageInputId: string
    description: string
    sessionId: string
    cityId: string
    householdMemberId: string
    timestamp: string
  },
): void {
  const row = imageRow(database, input.imageInputId, principal)
  if (
    row.status !== 'CONFIRMED'
    || row.confirmed_description !== input.description
    || row.city_id !== input.cityId
    || row.household_member_id !== input.householdMemberId
  ) throw new DomainError(409, 'consumer_image_confirmation_invalid', '图片识别描述尚未确认或上下文已变化')
  database.prepare(
    `UPDATE consumer_image_inputs SET status = 'DISPATCHED', session_id = ?,
     version = version + 1, updated_at = ? WHERE id = ?`,
  ).run(input.sessionId, input.timestamp, row.id)
  appendEvent(
    database, row, 'DESCRIPTION_DISPATCHED', '已确认图片描述复用文本助手链路',
    {
      imageInputId: row.id, sessionId: input.sessionId,
      descriptionHash: hash(input.description), reusedTextAssistant: true,
    },
    input.timestamp,
  )
}
