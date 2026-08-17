import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type { ConsumerVoiceInputSummary } from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'consumer-voice-e8f'
const CONNECTOR_SECRET = process.env.SPEECH_CONNECTOR_WEBHOOK_SECRET
  ?? 'development-speech-webhook-secret'
const SUPPORTED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
])
const MAX_AUDIO_BYTES = 8 * 1024 * 1024

interface ReplayRow { request_hash: string; response_json: string }
interface VoiceRow {
  id: string
  tenant_id: string
  user_id: string
  city_id: string
  household_member_id: string
  session_id: string | null
  file_name: string
  mime_type: string
  byte_size: number
  duration_ms: number
  sha256: string
  status: ConsumerVoiceInputSummary['status']
  provider_request_id: string
  provider_event_id: string | null
  raw_transcript: string | null
  confirmed_transcript: string | null
  confidence: number | null
  failure_code: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface SpeechTranscriptionCallbackInput {
  providerEventId: string
  voiceInputId: string
  status: 'SUCCEEDED' | 'FAILED'
  transcript?: string | undefined
  confidence?: number | undefined
  language?: 'zh-CN' | undefined
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
function safeEqual(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected)
  const right = Buffer.from(supplied)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function speechCallbackSignature(input: SpeechTranscriptionCallbackInput): string {
  return createHmac('sha256', CONNECTOR_SECRET)
    .update(JSON.stringify(input))
    .digest('hex')
}

function replay<T>(
  database: DatabaseSync,
  key: string,
  route: string,
  input: unknown,
): T | undefined {
  const requestHash = hash(input)
  const stored = database.prepare(
    'SELECT request_hash, response_json FROM idempotency_records WHERE key = ? AND route = ?',
  ).get(key, route) as unknown as ReplayRow | undefined
  if (!stored) return undefined
  if (stored.request_hash !== requestHash) {
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

function voiceRow(
  database: DatabaseSync,
  voiceInputId: string,
  principal?: Principal,
): VoiceRow {
  const row = database.prepare(
    `SELECT id, tenant_id, user_id, city_id, household_member_id, session_id,
            file_name, mime_type, byte_size, duration_ms, sha256, status,
            provider_request_id, provider_event_id, raw_transcript,
            confirmed_transcript, confidence, failure_code, version,
            created_at, updated_at
     FROM consumer_voice_inputs
     WHERE id = ?
       AND (? IS NULL OR tenant_id = ?)
       AND (? IS NULL OR user_id = ?)`,
  ).get(
    voiceInputId,
    principal?.tenantId ?? null,
    principal?.tenantId ?? null,
    principal?.subject ?? null,
    principal?.subject ?? null,
  ) as unknown as VoiceRow | undefined
  if (!row) {
    throw new DomainError(404, 'consumer_voice_input_not_found', '当前身份下没有这条语音输入')
  }
  return row
}

function summary(row: VoiceRow): ConsumerVoiceInputSummary {
  const transcript = row.confirmed_transcript ?? row.raw_transcript
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    durationMs: row.duration_ms,
    transcript: ['READY_FOR_CONFIRMATION', 'CONFIRMED', 'DISPATCHED'].includes(row.status)
      ? transcript
      : null,
    confidence: row.confidence,
    failureCode: row.failure_code,
    canConfirm: row.status === 'READY_FOR_CONFIRMATION',
    canSend: row.status === 'CONFIRMED',
    liveConnectorAvailable: false,
    disclosure: '语音上传不等于识别成功；签名转写回调后仍须由你核对并明确确认，确认前不会发送给助手。',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function appendEvent(
  database: DatabaseSync,
  row: Pick<VoiceRow, 'id' | 'tenant_id' | 'user_id'>,
  type: string,
  summaryText: string,
  payload: Record<string, unknown>,
  timestamp: string,
  providerEventId?: string,
): void {
  database.prepare(
    `INSERT INTO consumer_voice_events
     (id, tenant_id, user_id, voice_input_id, provider_event_id, type,
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
     VALUES (?, ?, ?, ?, ?, 'consumer_voice_input', ?, 'L1', 'SUCCESS', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, tenantId, actorRole, action, entityId,
    summaryText, payloadJson, timestamp,
  )
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

export function latestConsumerVoiceInput(
  database: DatabaseSync,
  principal: Principal,
  cityId: string,
  householdMemberId: string,
): ConsumerVoiceInputSummary | null {
  requireConsumer(principal)
  const row = database.prepare(
    `SELECT id, tenant_id, user_id, city_id, household_member_id, session_id,
            file_name, mime_type, byte_size, duration_ms, sha256, status,
            provider_request_id, provider_event_id, raw_transcript,
            confirmed_transcript, confidence, failure_code, version,
            created_at, updated_at
     FROM consumer_voice_inputs
     WHERE tenant_id = ? AND user_id = ? AND city_id = ?
       AND household_member_id = ?
     ORDER BY updated_at DESC, id DESC LIMIT 1`,
  ).get(
    principal.tenantId, principal.subject, cityId, householdMemberId,
  ) as unknown as VoiceRow | undefined
  return row ? summary(row) : null
}

export function uploadConsumerVoiceInput(
  database: DatabaseSync,
  principal: Principal,
  input: {
    fileName: string
    mimeType: string
    durationMs: number
    cityId: string
    householdMemberId: string
    content: Buffer
  },
  idempotencyKey: string,
): ConsumerVoiceInputSummary {
  const route = '/api/v1/consumer/assistant/voice-inputs'
  const requestInput = {
    fileName: input.fileName,
    mimeType: input.mimeType,
    durationMs: input.durationMs,
    cityId: input.cityId,
    householdMemberId: input.householdMemberId,
    byteSize: input.content.byteLength,
    sha256: hash(input.content),
  }
  const stored = replay<ConsumerVoiceInputSummary>(
    database, idempotencyKey, route, requestInput,
  )
  if (stored) return stored
  requireConsumer(principal)
  if (!SUPPORTED_MIME_TYPES.has(input.mimeType)) {
    throw new DomainError(415, 'consumer_voice_mime_type_unsupported', '仅支持常见音频格式')
  }
  if (input.content.byteLength === 0 || input.content.byteLength > MAX_AUDIO_BYTES) {
    throw new DomainError(413, 'consumer_voice_file_size_invalid', '语音文件必须大于 0 且不超过 8MB')
  }
  if (input.durationMs < 500 || input.durationMs > 60_000) {
    throw new DomainError(422, 'consumer_voice_duration_invalid', '单段语音时长必须在 0.5 至 60 秒之间')
  }

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
    ) {
      throw new DomainError(409, 'consumer_voice_context_stale', '城市或家庭身份已变化，请刷新后重试')
    }
    const timestamp = now()
    const voiceInputId = randomUUID()
    const providerRequestId = `LQASR-${randomUUID()}`
    database.prepare(
      `INSERT INTO consumer_voice_inputs
       (id, tenant_id, user_id, city_id, household_member_id, session_id,
        file_name, mime_type, byte_size, duration_ms, sha256, status,
        provider_request_id, provider_event_id, raw_transcript,
        confirmed_transcript, confidence, failure_code, version, created_at,
        updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'PENDING_TRANSCRIPTION',
               ?, NULL, NULL, NULL, NULL, NULL, 1, ?, ?)`,
    ).run(
      voiceInputId, principal.tenantId, principal.subject, input.cityId,
      input.householdMemberId, input.fileName, input.mimeType,
      input.content.byteLength, input.durationMs, requestInput.sha256,
      providerRequestId, timestamp, timestamp,
    )
    database.prepare(
      `INSERT INTO consumer_voice_blobs (voice_input_id, content, created_at)
       VALUES (?, ?, ?)`,
    ).run(voiceInputId, input.content, timestamp)
    const payload = {
      voiceInputId,
      providerRequestId,
      mimeType: input.mimeType,
      byteSize: input.content.byteLength,
      durationMs: input.durationMs,
      sha256: requestInput.sha256,
      connectorMode: 'OUTBOX_ONLY',
      rawAudioRetention: 'UNTIL_CALLBACK',
    }
    const row = voiceRow(database, voiceInputId, principal)
    appendEvent(database, row, 'VOICE_UPLOADED', '语音已上传并等待转写连接器', payload, timestamp)
    recordEvidence(
      database, principal.tenantId, 'CONSUMER', 'CONSUMER_VOICE_UPLOADED',
      voiceInputId, '消费者语音已进入待转写队列', payload, timestamp,
      'consumer.voice.transcription.requested.v1',
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

export function applySpeechTranscriptionCallback(
  database: DatabaseSync,
  input: SpeechTranscriptionCallbackInput,
  signature: string,
): { accepted: true; replayed: boolean; voiceInputId: string; status: string } {
  if (!safeEqual(speechCallbackSignature(input), signature)) {
    throw new DomainError(401, 'speech_callback_signature_invalid', '转写连接器回调签名无效')
  }
  const prior = database.prepare(
    `SELECT id, status, raw_transcript, confidence, failure_code
     FROM consumer_voice_inputs WHERE provider_event_id = ?`,
  ).get(input.providerEventId) as {
    id: string
    status: string
    raw_transcript: string | null
    confidence: number | null
    failure_code: string | null
  } | undefined
  if (prior) {
    if (prior.id !== input.voiceInputId) {
      throw new DomainError(409, 'speech_callback_event_conflict', '转写事件号已用于其他语音')
    }
    const sameResult = input.status === 'SUCCEEDED'
      ? prior.status === 'READY_FOR_CONFIRMATION'
        && prior.raw_transcript === input.transcript?.trim()
        && prior.confidence === input.confidence
      : prior.status === 'FAILED' && prior.failure_code === input.failureCode
    if (!sameResult) {
      throw new DomainError(409, 'speech_callback_event_conflict', '同一转写事件号不能用于不同结果')
    }
    return { accepted: true, replayed: true, voiceInputId: prior.id, status: prior.status }
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const row = voiceRow(database, input.voiceInputId)
    if (row.status !== 'PENDING_TRANSCRIPTION') {
      throw new DomainError(409, 'consumer_voice_state_invalid', '当前语音状态不接受转写回调')
    }
    if (input.status === 'SUCCEEDED') {
      const transcript = input.transcript?.trim()
      if (!transcript || transcript.length > 600) {
        throw new DomainError(422, 'speech_transcript_invalid', '转写文本必须为 1 至 600 个字符')
      }
      if (input.language !== 'zh-CN') {
        throw new DomainError(422, 'speech_language_invalid', '当前仅支持 zh-CN 转写结果')
      }
      if (input.confidence === undefined || input.confidence < 0 || input.confidence > 1) {
        throw new DomainError(422, 'speech_confidence_invalid', '转写置信度必须在 0 到 1 之间')
      }
    } else if (!input.failureCode?.trim()) {
      throw new DomainError(422, 'speech_failure_code_required', '转写失败必须提供失败代码')
    }
    const timestamp = now()
    const nextStatus = input.status === 'SUCCEEDED' ? 'READY_FOR_CONFIRMATION' : 'FAILED'
    database.prepare(
      `UPDATE consumer_voice_inputs
       SET status = ?, provider_event_id = ?, raw_transcript = ?,
           confidence = ?, failure_code = ?, version = version + 1,
           updated_at = ? WHERE id = ?`,
    ).run(
      nextStatus, input.providerEventId, input.transcript?.trim() ?? null,
      input.confidence ?? null, input.failureCode ?? null, timestamp, row.id,
    )
    database.prepare(
      'DELETE FROM consumer_voice_blobs WHERE voice_input_id = ?',
    ).run(row.id)
    const payload = {
      voiceInputId: row.id,
      providerEventId: input.providerEventId,
      status: nextStatus,
      transcriptHash: input.transcript ? hash(input.transcript.trim()) : null,
      confidence: input.confidence ?? null,
      language: input.language ?? null,
      failureCode: input.failureCode ?? null,
      rawAudioDeleted: true,
    }
    appendEvent(
      database, row,
      input.status === 'SUCCEEDED' ? 'TRANSCRIPTION_READY' : 'TRANSCRIPTION_FAILED',
      input.status === 'SUCCEEDED' ? '转写草稿已生成，等待消费者确认' : '转写连接器处理失败',
      payload, timestamp, input.providerEventId,
    )
    recordEvidence(
      database, row.tenant_id, 'SPEECH_CONNECTOR',
      input.status === 'SUCCEEDED' ? 'CONSUMER_TRANSCRIPTION_READY' : 'CONSUMER_TRANSCRIPTION_FAILED',
      row.id,
      input.status === 'SUCCEEDED' ? '签名转写回调已生成待确认草稿' : '签名转写回调记录失败结果',
      payload, timestamp,
    )
    database.exec('COMMIT;')
    return { accepted: true, replayed: false, voiceInputId: row.id, status: nextStatus }
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function confirmConsumerVoiceTranscript(
  database: DatabaseSync,
  principal: Principal,
  input: {
    voiceInputId: string
    expectedVersion: number
    transcript: string
    confirmed: boolean
  },
  idempotencyKey: string,
): ConsumerVoiceInputSummary {
  const route = `/api/v1/consumer/assistant/voice-inputs/${input.voiceInputId}/confirm`
  const stored = replay<ConsumerVoiceInputSummary>(
    database, idempotencyKey, route, input,
  )
  if (stored) return stored
  requireConsumer(principal)
  if (!input.confirmed) {
    throw new DomainError(409, 'explicit_transcript_confirmation_required', '发送前必须明确确认转写文本')
  }
  const transcript = input.transcript.trim()
  if (!transcript || transcript.length > 600) {
    throw new DomainError(422, 'consumer_voice_transcript_invalid', '确认文本必须为 1 至 600 个字符')
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const row = voiceRow(database, input.voiceInputId, principal)
    if (row.version !== input.expectedVersion) {
      throw new DomainError(409, 'stale_entity_version', '语音状态已更新，请刷新后重试')
    }
    if (row.status !== 'READY_FOR_CONFIRMATION') {
      throw new DomainError(409, 'consumer_voice_not_ready', '当前语音没有可确认的转写草稿')
    }
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
    ) {
      throw new DomainError(409, 'consumer_voice_context_stale', '城市或家庭身份已变化，请重新录音')
    }
    const timestamp = now()
    database.prepare(
      `UPDATE consumer_voice_inputs
       SET status = 'CONFIRMED', confirmed_transcript = ?,
           version = version + 1, updated_at = ? WHERE id = ?`,
    ).run(transcript, timestamp, row.id)
    const payload = {
      voiceInputId: row.id,
      transcriptHash: hash(transcript),
      transcriptEdited: transcript !== row.raw_transcript,
      explicitConfirmation: true,
    }
    appendEvent(database, row, 'TRANSCRIPT_CONFIRMED', '消费者已明确确认转写文本', payload, timestamp)
    recordEvidence(
      database, principal.tenantId, 'CONSUMER', 'CONSUMER_TRANSCRIPT_CONFIRMED',
      row.id, '消费者已核对并确认语音转写文本', payload, timestamp,
    )
    const response = summary(voiceRow(database, row.id, principal))
    persistReplay(database, idempotencyKey, route, input, response, timestamp)
    database.exec('COMMIT;')
    return response
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function consumeConfirmedVoiceInput(
  database: DatabaseSync,
  principal: Principal,
  input: {
    voiceInputId: string
    transcript: string
    sessionId: string
    cityId: string
    householdMemberId: string
    timestamp: string
  },
): void {
  const row = voiceRow(database, input.voiceInputId, principal)
  if (
    row.status !== 'CONFIRMED'
    || row.confirmed_transcript !== input.transcript
    || row.city_id !== input.cityId
    || row.household_member_id !== input.householdMemberId
  ) {
    throw new DomainError(409, 'consumer_voice_confirmation_invalid', '语音转写尚未确认或上下文已变化')
  }
  database.prepare(
    `UPDATE consumer_voice_inputs
     SET status = 'DISPATCHED', session_id = ?, version = version + 1,
         updated_at = ? WHERE id = ?`,
  ).run(input.sessionId, input.timestamp, row.id)
  const payload = {
    voiceInputId: row.id,
    sessionId: input.sessionId,
    transcriptHash: hash(input.transcript),
    reusedTextAssistant: true,
  }
  appendEvent(database, row, 'TRANSCRIPT_DISPATCHED', '已确认转写复用文本助手链路', payload, input.timestamp)
}
