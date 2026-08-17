import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ConsumerAssistantOverview, ConsumerImageInputSummary } from '@lequ/contracts'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'
import {
  imageRecognitionCallbackSignature,
  type ImageRecognitionCallbackInput,
} from './consumer-image-service.js'

const consumerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.consumer}`
const hqAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

describe('E8 第七批：图片安全上传、签名识别与明确确认', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>
  let context: { cityId: string; householdMemberId: string }

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
    const profile = database.prepare(
      `SELECT preferred_city_id, active_household_member_id
       FROM consumer_profiles WHERE user_id = 'user-demo-consumer'`,
    ).get() as { preferred_city_id: string; active_household_member_id: string }
    context = {
      cityId: profile.preferred_city_id,
      householdMemberId: profile.active_household_member_id,
    }
  })

  afterEach(async () => {
    await app.close()
  })

  function upload(
    key = 'consumer:image:upload:001',
    overrides: Record<string, string> = {},
    content = png,
  ) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/consumer/assistant/image-inputs',
      headers: {
        authorization: consumerAuthorization,
        'content-type': 'application/octet-stream',
        'idempotency-key': key,
        'x-file-name': encodeURIComponent('晚餐菜单.png'),
        'x-mime-type': 'image/png',
        'x-city-id': context.cityId,
        'x-household-member-id': context.householdMemberId,
        ...overrides,
      },
      payload: content,
    })
  }

  function callback(
    input: ImageRecognitionCallbackInput,
    signature = imageRecognitionCallbackSignature(input),
  ) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/image-connectors/recognition/callback',
      headers: {
        'content-type': 'application/json',
        'x-image-signature': signature,
      },
      payload: input,
    })
  }

  it('助手声明图片输入可用但生产识别和完整恶意扫描尚未接通', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json<ConsumerAssistantOverview>()).toMatchObject({
      imageInput: null,
      policy: {
        imageInputEnabled: true,
        liveImageRecognitionConnectorAvailable: false,
        imageRecognitionCallbackSignatureRequired: true,
        explicitImageDescriptionConfirmationRequired: true,
        rawImageDeletedAfterCallback: true,
        imageMagicAndDimensionValidation: true,
      },
    })
  })

  it('上传校验真实格式与尺寸，只建立待识别输入、私有原图和 Outbox', async () => {
    const first = await upload()
    expect(first.statusCode, first.body).toBe(200)
    const image = first.json<ConsumerImageInputSummary>()
    expect(image).toMatchObject({
      status: 'PENDING_RECOGNITION',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      byteSize: png.byteLength,
      description: null,
      liveConnectorAvailable: false,
    })
    expect(database.prepare(
      'SELECT length(content) AS bytes FROM consumer_image_blobs WHERE image_input_id = ?',
    ).get(image.id)).toEqual({ bytes: png.byteLength })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE aggregate_id = ? AND topic = 'consumer.image.recognition.requested.v1'`,
    ).get(image.id)).toEqual({ count: 1 })
    expect((await upload()).json()).toEqual(image)
    expect(database.prepare('SELECT COUNT(*) AS count FROM consumer_image_inputs').get())
      .toEqual({ count: 1 })
  })

  it('拒绝 MIME、扩展名、魔数、超大尺寸和过期上下文', async () => {
    expect((await upload(
      'consumer:image:bad:mime',
      { 'x-mime-type': 'image/gif', 'x-file-name': 'menu.gif' },
    )).statusCode).toBe(415)
    expect((await upload(
      'consumer:image:bad:extension',
      { 'x-file-name': 'menu.jpg' },
    )).statusCode).toBe(415)
    expect((await upload(
      'consumer:image:bad:signature',
      {},
      Buffer.from('not-a-real-png-image-content'),
    )).statusCode).toBe(415)
    const huge = Buffer.alloc(24)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(huge)
    huge.write('IHDR', 12, 'ascii')
    huge.writeUInt32BE(5000, 16)
    huge.writeUInt32BE(5000, 20)
    expect((await upload('consumer:image:bad:dimensions', {}, huge)).statusCode).toBe(422)
    expect((await upload(
      'consumer:image:bad:context',
      { 'x-city-id': 'city-hangzhou' },
    )).statusCode).toBe(409)
  })

  it('只有签名成功回调才生成待确认描述，并立即删除原图', async () => {
    const image = (await upload()).json<ConsumerImageInputSummary>()
    const input: ImageRecognitionCallbackInput = {
      providerEventId: 'image-event-success-001',
      imageInputId: image.id,
      status: 'SUCCEEDED',
      category: 'MENU',
      description: '菜单上有时令双人晚餐，想了解适合三个人的安静座位',
      confidence: 0.93,
      containsSensitiveData: false,
    }
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/image-connectors/recognition/callback',
      payload: input,
    })
    expect(missing.statusCode).toBe(401)
    expect((await callback(input, 'bad-signature')).statusCode).toBe(401)
    expect((await callback(input)).json()).toMatchObject({
      accepted: true,
      replayed: false,
      status: 'READY_FOR_CONFIRMATION',
    })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM consumer_image_blobs WHERE image_input_id = ?',
    ).get(image.id)).toEqual({ count: 0 })
    const overview = (await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })).json<ConsumerAssistantOverview>()
    expect(overview.imageInput).toMatchObject({
      id: image.id,
      status: 'READY_FOR_CONFIRMATION',
      category: 'MENU',
      description: input.description,
      confidence: 0.93,
      containsSensitiveData: false,
      canConfirm: true,
    })
    expect(overview.messages).toHaveLength(0)
  })

  it('连接器事件支持一致重放，失败和冲突结果不会冒充识别成功', async () => {
    const image = (await upload()).json<ConsumerImageInputSummary>()
    const input: ImageRecognitionCallbackInput = {
      providerEventId: 'image-event-failed-001',
      imageInputId: image.id,
      status: 'FAILED',
      failureCode: 'IMAGE_UNCLEAR',
    }
    expect((await callback(input)).json()).toMatchObject({ replayed: false, status: 'FAILED' })
    expect((await callback(input)).json()).toMatchObject({ replayed: true, status: 'FAILED' })
    expect((await callback({ ...input, failureCode: 'DIFFERENT_RESULT' })).statusCode).toBe(409)
    const overview = (await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })).json<ConsumerAssistantOverview>()
    expect(overview.imageInput).toMatchObject({
      status: 'FAILED',
      description: null,
      failureCode: 'IMAGE_UNCLEAR',
    })
  })

  it('明确确认编辑后的描述才可复用文本助手并生成真实推荐', async () => {
    const image = (await upload()).json<ConsumerImageInputSummary>()
    const recognition: ImageRecognitionCallbackInput = {
      providerEventId: 'image-event-confirm-001',
      imageInputId: image.id,
      status: 'SUCCEEDED',
      category: 'MENU',
      description: '菜单上有双人晚餐',
      confidence: 0.9,
      containsSensitiveData: false,
    }
    await callback(recognition)
    const ready = (await app.inject({
      method: 'GET',
      url: '/api/v1/consumer/assistant',
      headers: { authorization: consumerAuthorization },
    })).json<ConsumerAssistantOverview>().imageInput!
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/assistant/image-inputs/${image.id}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'consumer:image:confirm:no',
      },
      payload: { expectedVersion: ready.version, description: recognition.description, confirmed: false },
    })
    expect(rejected.statusCode).toBe(409)
    const edited = '明晚三个人吃晚餐，想要安静靠窗的位置'
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/consumer/assistant/image-inputs/${image.id}/confirm`,
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'consumer:image:confirm:yes',
      },
      payload: { expectedVersion: ready.version, description: edited, confirmed: true },
    })
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect(confirmed.json<ConsumerImageInputSummary>()).toMatchObject({
      status: 'CONFIRMED',
      description: edited,
      canSend: true,
    })
    const sent = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/assistant/messages',
      headers: {
        authorization: consumerAuthorization,
        'idempotency-key': 'consumer:image:dispatch:001',
      },
      payload: {
        prompt: edited,
        cityId: context.cityId,
        householdMemberId: context.householdMemberId,
        sourceImageInputId: image.id,
      },
    })
    expect(sent.statusCode, sent.body).toBe(200)
    const overview = sent.json<ConsumerAssistantOverview>()
    expect(overview.imageInput).toMatchObject({ status: 'DISPATCHED', canSend: false })
    expect(overview.messages[0]).toMatchObject({ role: 'USER', content: edited })
    expect(overview.recommendations.length).toBeGreaterThan(0)
  })

  it('图片能力仅允许 SELF 消费者，事件证据不可修改删除', async () => {
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/consumer/assistant/image-inputs',
      headers: {
        authorization: hqAuthorization,
        'content-type': 'application/octet-stream',
        'idempotency-key': 'consumer:image:hq:forbidden',
        'x-file-name': 'menu.png',
        'x-mime-type': 'image/png',
        'x-city-id': context.cityId,
        'x-household-member-id': context.householdMemberId,
      },
      payload: png,
    })
    expect(forbidden.statusCode).toBe(403)
    const image = (await upload()).json<ConsumerImageInputSummary>()
    expect(() => database.prepare(
      'UPDATE consumer_image_events SET summary = ? WHERE image_input_id = ?',
    ).run('篡改', image.id)).toThrow(/append-only/)
    expect(() => database.prepare(
      'DELETE FROM consumer_image_events WHERE image_input_id = ?',
    ).run(image.id)).toThrow(/append-only/)
  })
})
