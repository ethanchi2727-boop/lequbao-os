import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ConsumerAssistantOverview, ConsumerVoiceInputSummary } from '@lequ/contracts'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'
import {
  speechCallbackSignature,
  type SpeechTranscriptionCallbackInput,
} from './consumer-voice-service.js'

const consumerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`
const audio = Buffer.from('RIFF-demo-consumer-voice-audio')

describe('E8 第六批：语音上传、签名转写与明确确认', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>
  let context: { cityId: string; householdMemberId: string }

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })
    const overview = response.json<ConsumerAssistantOverview>()
    const profile = database.prepare(
      `SELECT preferred_city_id, active_household_member_id
       FROM consumer_profiles WHERE user_id = 'user-demo-consumer'`,
    ).get() as { preferred_city_id: string; active_household_member_id: string }
    context = {
      cityId: overview.session?.city.id ?? profile.preferred_city_id,
      householdMemberId: overview.session?.activeMember.id ?? profile.active_household_member_id,
    }
  })

  afterEach(async () => {
    await app.close()
  })

  function upload(key = 'consumer:voice:upload:001', overrides: Record<string, string> = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/consumer/assistant/voice-inputs',
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/octet-stream',
        'idempotency-key': key,
        'x-file-name': encodeURIComponent('晚餐需求.m4a'),
        'x-mime-type': 'audio/mp4',
        'x-duration-ms': '4200',
        'x-city-id': context.cityId,
        'x-household-member-id': context.householdMemberId,
        ...overrides,
      },
      payload: audio,
    })
  }

  function callback(input: SpeechTranscriptionCallbackInput, signature = speechCallbackSignature(input)) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/speech-connectors/transcription/callback',
      headers: {
        'content-type': 'application/json',
        'x-speech-signature': signature,
      },
      payload: input,
    })
  }

  it('助手声明语音可用但真实转写连接器尚未接通', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json<ConsumerAssistantOverview>()).toMatchObject({
      voiceInput: null,
      policy: {
        textOnly: false,
        voiceInputEnabled: true,
        liveTranscriptionConnectorAvailable: false,
        transcriptionCallbackSignatureRequired: true,
        explicitTranscriptConfirmationRequired: true,
        rawAudioDeletedAfterCallback: true,
      },
    })
  })

  it('上传只建立待转写输入，保存私有音频并投递连接器 Outbox，幂等不重复', async () => {
    const first = await upload()
    expect(first.statusCode, first.body).toBe(200)
    const voice = first.json<ConsumerVoiceInputSummary>()
    expect(voice).toMatchObject({
      status: 'PENDING_TRANSCRIPTION',
      byteSize: audio.byteLength,
      durationMs: 4200,
      transcript: null,
      liveConnectorAvailable: false,
    })
    expect(database.prepare(
      'SELECT length(content) AS bytes FROM consumer_voice_blobs WHERE voice_input_id = ?',
    ).get(voice.id)).toEqual({ bytes: audio.byteLength })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE aggregate_id = ? AND topic = 'consumer.voice.transcription.requested.v1'`,
    ).get(voice.id)).toEqual({ count: 1 })

    const replay = await upload()
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toEqual(voice)
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_voice_inputs',
    ).get()).toEqual({ count: 1 })
  })

  it('拒绝不支持的格式、越界时长和过期消费者上下文', async () => {
    const mime = await upload('consumer:voice:bad:mime', { 'x-mime-type': 'text/plain' })
    expect(mime.statusCode).toBe(415)
    const duration = await upload('consumer:voice:bad:duration', { 'x-duration-ms': '100' })
    expect(duration.statusCode).toBe(400)
    const stale = await upload('consumer:voice:bad:context', { 'x-city-id': 'city-hangzhou' })
    expect(stale.statusCode).toBe(409)
  })

  it('只有签名成功回调才生成待确认文本，并立即删除原始音频', async () => {
    const voice = (await upload()).json<ConsumerVoiceInputSummary>()
    const input: SpeechTranscriptionCallbackInput = {
      providerEventId: 'speech-event-success-001',
      voiceInputId: voice.id,
      status: 'SUCCEEDED',
      transcript: '明晚三个人吃晚餐，想要安静靠窗的位置',
      confidence: 0.96,
      language: 'zh-CN',
    }
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/speech-connectors/transcription/callback',
      payload: input,
    })
    expect(missing.statusCode).toBe(401)
    expect((await callback(input, 'bad-signature')).statusCode).toBe(401)
    const accepted = await callback(input)
    expect(accepted.statusCode, accepted.body).toBe(200)
    expect(accepted.json()).toMatchObject({
      accepted: true,
      replayed: false,
      status: 'READY_FOR_CONFIRMATION',
    })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_voice_blobs WHERE voice_input_id = ?',
    ).get(voice.id)).toEqual({ count: 0 })
    const overview = (await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })).json<ConsumerAssistantOverview>()
    expect(overview.voiceInput).toMatchObject({
      id: voice.id,
      status: 'READY_FOR_CONFIRMATION',
      transcript: input.transcript,
      confidence: 0.96,
      canConfirm: true,
    })
    expect(overview.messages).toHaveLength(0)
  })

  it('连接器事件可幂等重放，失败结果不能伪装为转写文本', async () => {
    const voice = (await upload()).json<ConsumerVoiceInputSummary>()
    const input: SpeechTranscriptionCallbackInput = {
      providerEventId: 'speech-event-failed-001',
      voiceInputId: voice.id,
      status: 'FAILED',
      failureCode: 'AUDIO_UNCLEAR',
    }
    expect((await callback(input)).json()).toMatchObject({
      replayed: false,
      status: 'FAILED',
    })
    expect((await callback(input)).json()).toMatchObject({
      replayed: true,
      status: 'FAILED',
    })
    const conflicting: SpeechTranscriptionCallbackInput = {
      providerEventId: input.providerEventId,
      voiceInputId: voice.id,
      status: 'FAILED',
      failureCode: 'DIFFERENT_RESULT',
    }
    expect((await callback(conflicting)).statusCode).toBe(409)
    const overview = (await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })).json<ConsumerAssistantOverview>()
    expect(overview.voiceInput).toMatchObject({
      status: 'FAILED',
      transcript: null,
      failureCode: 'AUDIO_UNCLEAR',
    })
  })

  it('明确确认后才允许复用文本助手，编辑后的确认文本成为唯一发送内容', async () => {
    const voice = (await upload()).json<ConsumerVoiceInputSummary>()
    const input: SpeechTranscriptionCallbackInput = {
      providerEventId: 'speech-event-confirm-001',
      voiceInputId: voice.id,
      status: 'SUCCEEDED',
      transcript: '明晚两个人吃晚餐',
      confidence: 0.91,
      language: 'zh-CN',
    }
    await callback(input)
    const ready = (await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })).json<ConsumerAssistantOverview>().voiceInput!
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/assistant/voice-inputs/${voice.id}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'consumer:voice:confirm:no',
      },
      payload: { expectedVersion: ready.version, transcript: input.transcript, confirmed: false },
    })
    expect(rejected.statusCode).toBe(409)

    const edited = '明晚三个人吃晚餐，想要安静靠窗的位置'
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/assistant/voice-inputs/${voice.id}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'consumer:voice:confirm:yes',
      },
      payload: { expectedVersion: ready.version, transcript: edited, confirmed: true },
    })
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect(confirmed.json<ConsumerVoiceInputSummary>()).toMatchObject({
      status: 'CONFIRMED',
      transcript: edited,
      canSend: true,
    })

    const sent = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/assistant/messages',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'consumer:voice:dispatch:001',
      },
      payload: {
        prompt: edited,
        cityId: context.cityId,
        householdMemberId: context.householdMemberId,
        sourceVoiceInputId: voice.id,
      },
    })
    expect(sent.statusCode, sent.body).toBe(200)
    expect(sent.json<ConsumerAssistantOverview>()).toMatchObject({
      voiceInput: { status: 'DISPATCHED', canSend: false },
    })
    expect(sent.json<ConsumerAssistantOverview>().messages[0]).toMatchObject({
      role: 'USER',
      content: edited,
    })
    const event = database.prepare(
      `SELECT payload_json FROM consumer_voice_events
       WHERE voice_input_id = ? AND type = 'TRANSCRIPT_DISPATCHED'`,
    ).get(voice.id) as { payload_json: string }
    expect(JSON.parse(event.payload_json)).toMatchObject({ reusedTextAssistant: true })
  })

  it('语音能力仅允许 SELF 消费者，事件证据不可修改删除', async () => {
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/assistant/voice-inputs',
      headers: {
        authorization: hqAuthorization,
        'content-type': 'application/octet-stream',
        'idempotency-key': 'consumer:voice:hq:forbidden',
        'x-file-name': 'voice.m4a',
        'x-mime-type': 'audio/mp4',
        'x-duration-ms': '1000',
        'x-city-id': context.cityId,
        'x-household-member-id': context.householdMemberId,
      },
      payload: audio,
    })
    expect(forbidden.statusCode).toBe(403)

    const voice = (await upload()).json<ConsumerVoiceInputSummary>()
    expect(() => database.prepare(
      'UPDATE consumer_voice_events SET summary = ? WHERE voice_input_id = ?',
    ).run('篡改', voice.id)).toThrow(/append-only/)
    expect(() => database.prepare(
      'DELETE FROM consumer_voice_events WHERE voice_input_id = ?',
    ).run(voice.id)).toThrow(/append-only/)
  })
})
