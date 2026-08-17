<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  cancelConsumerReservation,
  confirmConsumerImageDescription,
  confirmConsumerVoiceTranscript,
  confirmConsumerReservation,
  fetchConsumerAssistant,
  fetchConsumerHome,
  prepareConsumerReservationPayment,
  requestConsumerReservationRefund,
  sendConsumerAssistantMessage,
  uploadConsumerVoiceInput,
  uploadConsumerImageInput,
  updateConsumerReservationDraft,
  type ConsumerAssistantOverview,
  type ConsumerHomeOverview,
} from '../../services/consumer'

const home = ref<ConsumerHomeOverview | null>(null)
const assistant = ref<ConsumerAssistantOverview | null>(null)
const prompt = ref('')
const loading = ref(true)
const sending = ref(false)
const recording = ref(false)
const voiceBusy = ref(false)
const transcriptDraft = ref('')
const imageBusy = ref(false)
const imageDescriptionDraft = ref('')
const confirming = ref(false)
const editing = ref(false)
const saving = ref(false)
const cancelling = ref(false)
const cancelMode = ref(false)
const preparingPayment = ref(false)
const refundMode = ref(false)
const requestingRefund = ref(false)
const editPartySize = ref(2)
const editDate = ref('')
const editClock = ref('18:30')
const cancelReason = ref('家庭行程发生变化')
const refundReason = ref('家庭行程发生变化，申请全额退款')
const errorMessage = ref('')
const scrollIntoView = ref('')
let recorderManager: ReturnType<typeof uni.getRecorderManager> | null = null

const draft = computed(() => assistant.value?.reservationDraft ?? null)
const voiceInput = computed(() => assistant.value?.voiceInput ?? null)
const imageInput = computed(() => assistant.value?.imageInput ?? null)
const canConfirm = computed(() =>
  draft.value?.status === 'WAITING_CONFIRMATION'
  && draft.value.canEdit
  && !confirming.value
  && !editing.value)

function goBack(): void {
  uni.navigateBack()
}

function syncTranscriptDraft(): void {
  transcriptDraft.value = assistant.value?.voiceInput?.transcript ?? ''
  imageDescriptionDraft.value = assistant.value?.imageInput?.description ?? ''
}

function imageMimeType(fileName: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function readSelectedFile(path: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    try {
      uni.getFileSystemManager().readFile({
        filePath: path,
        success: ({ data }) => {
          if (data instanceof ArrayBuffer) resolve(data)
          else reject(new Error('当前图片格式无法读取'))
        },
        fail: () => reject(new Error('未能读取所选图片')),
      })
    } catch {
      reject(new Error('当前环境不支持读取所选图片'))
    }
  })
}

async function chooseAndUploadImage(): Promise<void> {
  if (!home.value || imageBusy.value) return
  imageBusy.value = true
  try {
    const selection = await new Promise<{ path: string; name: string }>((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['camera', 'album'],
        success: (result) => {
          const path = result.tempFilePaths[0]
          if (!path) return reject(new Error('未选择图片'))
          const files = result.tempFiles as unknown as Array<{ name?: string }>
          resolve({
            path,
            name: files[0]?.name ?? path.split('/').pop() ?? `乐趣生活图片-${Date.now()}.jpg`,
          })
        },
        fail: () => reject(new Error('已取消选择图片')),
      })
    })
    const content = await readSelectedFile(selection.path)
    if (content.byteLength > 8 * 1024 * 1024) throw new Error('单张图片不能超过 8MB')
    await uploadConsumerImageInput({
      fileName: selection.name,
      mimeType: imageMimeType(selection.name),
      cityId: home.value.city.id,
      householdMemberId: home.value.household.activeMember.id,
      content,
    })
    assistant.value = await fetchConsumerAssistant()
    syncTranscriptDraft()
    uni.showToast({ title: '已上传，等待识别', icon: 'success' })
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '图片上传失败',
      icon: 'none',
    })
  } finally {
    imageBusy.value = false
  }
}

async function refreshImageInput(): Promise<void> {
  try {
    assistant.value = await fetchConsumerAssistant()
    syncTranscriptDraft()
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '刷新识别状态失败',
      icon: 'none',
    })
  }
}

async function confirmAndSendImage(): Promise<void> {
  const image = imageInput.value
  const description = imageDescriptionDraft.value.trim()
  if (!image || image.status !== 'READY_FOR_CONFIRMATION' || imageBusy.value || !home.value) return
  if (!description) {
    uni.showToast({ title: '请先核对图片识别描述', icon: 'none' })
    return
  }
  imageBusy.value = true
  try {
    const confirmed = await confirmConsumerImageDescription({
      imageInputId: image.id,
      expectedVersion: image.version,
      description,
      confirmed: true,
    })
    if (assistant.value) assistant.value.imageInput = confirmed
    assistant.value = await sendConsumerAssistantMessage({
      prompt: description,
      cityId: home.value.city.id,
      householdMemberId: home.value.household.activeMember.id,
      ...(assistant.value?.session?.id ? { sessionId: assistant.value.session.id } : {}),
      sourceImageInputId: image.id,
    })
    syncTranscriptDraft()
    uni.showToast({ title: '已确认并发送', icon: 'success' })
    await scrollToBottom()
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '图片确认发送失败',
      icon: 'none',
    })
    await refreshImageInput()
  } finally {
    imageBusy.value = false
  }
}

async function refreshVoiceInput(): Promise<void> {
  try {
    assistant.value = await fetchConsumerAssistant()
    syncTranscriptDraft()
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '刷新转写状态失败',
      icon: 'none',
    })
  }
}

async function uploadRecordedVoice(
  tempFilePath: string,
  durationMs: number,
): Promise<void> {
  if (!home.value) return
  voiceBusy.value = true
  try {
    const content = await new Promise<ArrayBuffer>((resolve, reject) => {
      uni.getFileSystemManager().readFile({
        filePath: tempFilePath,
        success: (result) => {
          if (result.data instanceof ArrayBuffer) {
            resolve(result.data)
          } else {
            reject(new Error('录音文件读取格式无效'))
          }
        },
        fail: () => reject(new Error('录音文件读取失败')),
      })
    })
    await uploadConsumerVoiceInput({
      fileName: `乐趣生活语音-${Date.now()}.mp3`,
      mimeType: 'audio/mpeg',
      durationMs: Math.max(500, Math.min(60_000, Math.round(durationMs))),
      cityId: home.value.city.id,
      householdMemberId: home.value.household.activeMember.id,
      content,
    })
    assistant.value = await fetchConsumerAssistant()
    syncTranscriptDraft()
    uni.showToast({ title: '已上传，等待转写', icon: 'success' })
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '语音上传失败',
      icon: 'none',
    })
  } finally {
    voiceBusy.value = false
  }
}

function toggleRecording(): void {
  if (voiceBusy.value) return
  if (!recorderManager) {
    try {
      recorderManager = uni.getRecorderManager()
      recorderManager.onStop((result) => {
        recording.value = false
        void uploadRecordedVoice(result.tempFilePath, result.duration)
      })
      recorderManager.onError(() => {
        recording.value = false
        uni.showToast({ title: '当前环境无法录音，请检查麦克风权限', icon: 'none' })
      })
    } catch {
      uni.showToast({ title: '当前环境不支持录音', icon: 'none' })
      return
    }
  }
  if (recording.value) {
    recorderManager.stop()
    return
  }
  transcriptDraft.value = ''
  recording.value = true
  recorderManager.start({ duration: 60_000, format: 'mp3' })
}

async function confirmAndSendVoice(): Promise<void> {
  const voice = voiceInput.value
  const transcript = transcriptDraft.value.trim()
  if (!voice || voice.status !== 'READY_FOR_CONFIRMATION' || voiceBusy.value) return
  if (!transcript) {
    uni.showToast({ title: '请先核对转写文本', icon: 'none' })
    return
  }
  if (!home.value) return
  voiceBusy.value = true
  try {
    const confirmed = await confirmConsumerVoiceTranscript({
      voiceInputId: voice.id,
      expectedVersion: voice.version,
      transcript,
      confirmed: true,
    })
    if (assistant.value) assistant.value.voiceInput = confirmed
    assistant.value = await sendConsumerAssistantMessage({
      prompt: transcript,
      cityId: home.value.city.id,
      householdMemberId: home.value.household.activeMember.id,
      ...(assistant.value?.session?.id ? { sessionId: assistant.value.session.id } : {}),
      sourceVoiceInputId: voice.id,
    })
    syncTranscriptDraft()
    uni.showToast({ title: '已确认并发送', icon: 'success' })
    await scrollToBottom()
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '语音确认发送失败',
      icon: 'none',
    })
    await refreshVoiceInput()
  } finally {
    voiceBusy.value = false
  }
}

function formatPrice(value: number | null): string {
  if (value === null) return '到店了解'
  return `¥${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}`
}

function formatDistance(value: number): string {
  return value < 1000 ? `${value}m` : `${(value / 1000).toFixed(1)}km`
}

function formatTime(value: string): string {
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function localDateParts(value: string): { date: string; clock: string } {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return { date: `${year}-${month}-${day}`, clock: `${hour}:${minute}` }
}

function draftKicker(): string {
  if (!draft.value) return ''
  if (draft.value.orderStatus === 'CANCELLED') return '订座已取消'
  if (draft.value.orderStatus === 'CONFIRMED') return '商家已确认'
  if (draft.value.orderStatus === 'PENDING_CONFIRMATION') return '等待商家确认'
  return '需要你的明确确认'
}

function startEdit(): void {
  if (!draft.value?.canEdit) return
  const parts = localDateParts(draft.value.reservationAt)
  editPartySize.value = draft.value.partySize
  editDate.value = parts.date
  editClock.value = parts.clock
  editing.value = true
}

function changePartySize(delta: number): void {
  editPartySize.value = Math.min(20, Math.max(1, editPartySize.value + delta))
}

function setEditDate(event: { detail: { value: string } }): void {
  editDate.value = event.detail.value
}

function setEditClock(event: { detail: { value: string } }): void {
  editClock.value = event.detail.value
}

function openTarget(target: string): void {
  if (target.startsWith('/pages/')) uni.navigateTo({ url: target })
}

function openSearch(): void {
  const suffix = prompt.value.trim()
    ? `?query=${encodeURIComponent(prompt.value.trim())}`
    : ''
  uni.navigateTo({ url: `/pages/search/index${suffix}` })
}

async function scrollToBottom(): Promise<void> {
  await nextTick()
  scrollIntoView.value = ''
  await nextTick()
  scrollIntoView.value = 'conversation-end'
}

async function initialize(initialPrompt: string): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const [homeResponse, assistantResponse] = await Promise.all([
      fetchConsumerHome(),
      fetchConsumerAssistant(),
    ])
    home.value = homeResponse
    assistant.value = assistantResponse
    syncTranscriptDraft()
    prompt.value = initialPrompt
    if (initialPrompt.trim()) {
      const messageCount = assistant.value.messages.length
      await send(initialPrompt)
      if ((assistant.value?.messages.length ?? 0) > messageCount) {
        uni.redirectTo({ url: '/pages/assistant/index' })
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'AI 助手加载失败'
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

async function send(value = prompt.value): Promise<void> {
  const normalized = value.trim()
  if (!normalized) {
    uni.showToast({ title: '先告诉我你想做什么', icon: 'none' })
    return
  }
  if (!home.value || sending.value) return
  sending.value = true
  errorMessage.value = ''
  prompt.value = ''
  try {
    assistant.value = await sendConsumerAssistantMessage({
      prompt: normalized,
      cityId: home.value.city.id,
      householdMemberId: home.value.household.activeMember.id,
      ...(assistant.value?.session?.id
        ? { sessionId: assistant.value.session.id }
        : {}),
    })
    await scrollToBottom()
  } catch (error) {
    prompt.value = normalized
    errorMessage.value = error instanceof Error ? error.message : '消息发送失败'
  } finally {
    sending.value = false
  }
}

async function confirmReservation(): Promise<void> {
  if (!draft.value || !canConfirm.value) return
  confirming.value = true
  try {
    assistant.value = await confirmConsumerReservation({
      draftId: draft.value.id,
      expectedVersion: draft.value.version,
      confirmed: true,
    })
    uni.showToast({ title: '已提交商家确认', icon: 'success' })
    await scrollToBottom()
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '提交失败',
      icon: 'none',
    })
    assistant.value = await fetchConsumerAssistant()
  } finally {
    confirming.value = false
  }
}

async function saveDraft(): Promise<void> {
  if (!draft.value?.canEdit || saving.value) return
  const reservationAt = new Date(
    `${editDate.value}T${editClock.value}:00+08:00`,
  ).toISOString()
  saving.value = true
  try {
    assistant.value = await updateConsumerReservationDraft({
      draftId: draft.value.id,
      expectedVersion: draft.value.version,
      partySize: editPartySize.value,
      reservationAt,
    })
    editing.value = false
    uni.showToast({ title: '订座信息已更新', icon: 'success' })
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '保存失败',
      icon: 'none',
    })
    assistant.value = await fetchConsumerAssistant()
  } finally {
    saving.value = false
  }
}

async function cancelReservation(): Promise<void> {
  if (!draft.value?.canCancel || cancelling.value) return
  const reason = cancelReason.value.trim()
  if (reason.length < 3) {
    uni.showToast({ title: '请填写取消原因', icon: 'none' })
    return
  }
  cancelling.value = true
  try {
    assistant.value = await cancelConsumerReservation({
      draftId: draft.value.id,
      expectedVersion: draft.value.version,
      confirmed: true,
      reason,
    })
    cancelMode.value = false
    uni.showToast({ title: '订座已取消', icon: 'success' })
    await scrollToBottom()
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '取消失败',
      icon: 'none',
    })
    assistant.value = await fetchConsumerAssistant()
  } finally {
    cancelling.value = false
  }
}

async function preparePayment(): Promise<void> {
  if (!draft.value?.payment.canPrepare || preparingPayment.value) return
  preparingPayment.value = true
  try {
    assistant.value = await prepareConsumerReservationPayment({
      draftId: draft.value.id,
      expectedVersion: draft.value.version,
      confirmed: true,
    })
    uni.showToast({ title: '支付请求已生成', icon: 'success' })
    await scrollToBottom()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '生成失败', icon: 'none' })
    assistant.value = await fetchConsumerAssistant()
  } finally {
    preparingPayment.value = false
  }
}

async function requestRefund(): Promise<void> {
  if (!draft.value?.payment.canRequestRefund || requestingRefund.value) return
  const reason = refundReason.value.trim()
  if (reason.length < 3) {
    uni.showToast({ title: '请填写退款原因', icon: 'none' })
    return
  }
  requestingRefund.value = true
  try {
    assistant.value = await requestConsumerReservationRefund({
      draftId: draft.value.id,
      expectedVersion: draft.value.version,
      confirmed: true,
      reason,
    })
    refundMode.value = false
    uni.showToast({ title: '退款申请已提交', icon: 'success' })
    await scrollToBottom()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '申请失败', icon: 'none' })
    assistant.value = await fetchConsumerAssistant()
  } finally {
    requestingRefund.value = false
  }
}

onLoad((options) => {
  const initialPrompt = typeof options?.prompt === 'string'
    ? decodeURIComponent(options.prompt)
    : ''
  void initialize(initialPrompt)
})
</script>

<template>
  <view class="assistant-page">
    <header class="assistant-header">
      <button class="back-button" hover-class="tap" @click="goBack">←</button>
      <view class="assistant-identity">
        <view class="ai-orb"><text>✦</text></view>
        <view>
          <text class="assistant-title">乐趣 AI</text>
          <text class="assistant-status"><text class="online-dot" />文本、语音与图片确认在线</text>
        </view>
      </view>
      <button class="search-button" hover-class="tap" @click="openSearch">⌕</button>
    </header>

    <view v-if="loading" class="state-page">
      <view class="loading-orb"><text>✦</text></view>
      <text class="state-title">正在接入你的生活上下文</text>
      <text class="state-copy">只会使用你当前选择的城市和家庭身份</text>
    </view>

    <view v-else-if="errorMessage && !assistant" class="state-page">
      <view class="error-symbol">!</view>
      <text class="state-title">暂时没有连接上</text>
      <text class="state-copy">{{ errorMessage }}</text>
      <button class="retry-button" @click="initialize('')">重新连接</button>
    </view>

    <template v-else>
      <scroll-view
        class="conversation"
        scroll-y
        :scroll-into-view="scrollIntoView"
        :show-scrollbar="false"
      >
        <view class="context-banner">
          <text>当前上下文</text>
          <text class="context-value">
            {{ assistant?.session?.city.name ?? home?.city.name }}
            ·
            {{ assistant?.session?.activeMember.name ?? home?.household.activeMember.name }}
          </text>
        </view>

        <view v-if="!assistant?.messages?.length" class="welcome-card">
          <view class="welcome-mark"><text>✦</text></view>
          <text class="welcome-title">一句话告诉我，剩下的我来整理</text>
          <text class="welcome-copy">
            已接通文本、语音与图片确认、真实商家推荐、订座确认和支付连接器边界。
          </text>
          <view class="example-list">
            <button @click="send('明晚两个人吃晚餐，想要安静靠窗的位置')">明晚两人安静晚餐</button>
            <button @click="send('帮安安找一家儿童友好的餐厅')">儿童友好餐厅</button>
          </view>
        </view>

        <section v-if="voiceInput" class="voice-card">
          <view class="voice-head">
            <view>
              <text class="voice-kicker">VOICE INPUT</text>
              <text class="voice-title">语音转写确认</text>
            </view>
            <text class="voice-status">{{ voiceInput.status }}</text>
          </view>
          <text class="voice-disclosure">{{ voiceInput.disclosure }}</text>
          <view class="voice-meta">
            <text>{{ (voiceInput.durationMs / 1000).toFixed(1) }} 秒</text>
            <text>{{ (voiceInput.byteSize / 1024).toFixed(1) }} KB</text>
            <text v-if="voiceInput.confidence !== null">
              置信度 {{ Math.round(voiceInput.confidence * 100) }}%
            </text>
          </view>
          <view v-if="voiceInput.status === 'PENDING_TRANSCRIPTION'" class="voice-pending">
            <text>音频已进入待连接器队列，上传成功不代表已经识别。</text>
            <button :disabled="voiceBusy" @click="refreshVoiceInput">刷新转写状态</button>
          </view>
          <view
            v-else-if="voiceInput.status === 'READY_FOR_CONFIRMATION'"
            class="transcript-panel"
          >
            <text class="transcript-label">请逐字核对，可直接修改</text>
            <textarea
              v-model="transcriptDraft"
              maxlength="600"
              auto-height
              class="transcript-input"
              placeholder="等待转写文本"
            />
            <button
              class="voice-confirm"
              :disabled="voiceBusy || !transcriptDraft.trim()"
              @click="confirmAndSendVoice"
            >
              {{ voiceBusy ? '正在确认…' : '我已核对，确认并发送给助手' }}
            </button>
          </view>
          <view v-else-if="voiceInput.status === 'FAILED'" class="voice-failed">
            <text>本次转写失败：{{ voiceInput.failureCode ?? '未知原因' }}</text>
            <button @click="toggleRecording">重新录音</button>
          </view>
          <text v-else-if="voiceInput.status === 'DISPATCHED'" class="voice-dispatched">
            已经由你明确确认，并复用现有文本助手链路完成发送。
          </text>
        </section>

        <section v-if="imageInput" class="image-card">
          <view class="image-head">
            <view>
              <text class="image-kicker">IMAGE INPUT</text>
              <text class="image-title">图片识别确认</text>
            </view>
            <text class="image-status">{{ imageInput.status }}</text>
          </view>
          <text class="image-disclosure">{{ imageInput.disclosure }}</text>
          <view class="image-meta">
            <text>{{ imageInput.width }}×{{ imageInput.height }}</text>
            <text>{{ (imageInput.byteSize / 1024).toFixed(1) }} KB</text>
            <text v-if="imageInput.category">{{ imageInput.category }}</text>
            <text v-if="imageInput.confidence !== null">
              置信度 {{ Math.round(imageInput.confidence * 100) }}%
            </text>
          </view>
          <text v-if="imageInput.containsSensitiveData" class="sensitive-warning">
            识别连接器提示图片可能包含敏感信息，请谨慎核对，不要发送不必要的个人信息。
          </text>
          <view v-if="imageInput.status === 'PENDING_RECOGNITION'" class="image-pending">
            <text>图片已通过格式签名和尺寸基础校验，正在等待识别连接器。</text>
            <button :disabled="imageBusy" @click="refreshImageInput">刷新识别状态</button>
          </view>
          <view
            v-else-if="imageInput.status === 'READY_FOR_CONFIRMATION'"
            class="image-description-panel"
          >
            <text class="image-description-label">请核对识别描述，可直接修改</text>
            <textarea
              v-model="imageDescriptionDraft"
              maxlength="600"
              auto-height
              class="image-description-input"
              placeholder="等待图片识别描述"
            />
            <button
              class="image-confirm"
              :disabled="imageBusy || !imageDescriptionDraft.trim()"
              @click="confirmAndSendImage"
            >
              {{ imageBusy ? '正在确认…' : '我已核对，确认并发送给助手' }}
            </button>
          </view>
          <view v-else-if="imageInput.status === 'FAILED'" class="image-failed">
            <text>本次识别失败：{{ imageInput.failureCode ?? '未知原因' }}</text>
            <button @click="chooseAndUploadImage">重新选择图片</button>
          </view>
          <text v-else-if="imageInput.status === 'DISPATCHED'" class="image-dispatched">
            已经由你明确确认，并复用现有文本助手链路完成发送。
          </text>
        </section>

        <view
          v-for="message in assistant?.messages ?? []"
          :key="message.id"
          class="message-row"
          :class="message.role === 'USER' ? 'message-user' : 'message-assistant'"
        >
          <view v-if="message.role === 'ASSISTANT'" class="message-avatar">✦</view>
          <view class="message-bubble">
            <text>{{ message.content }}</text>
          </view>
        </view>

        <section v-if="assistant?.recommendations?.length" class="recommendations">
          <view class="section-heading">
            <view>
              <text class="section-kicker">REAL OPTIONS</text>
              <text class="section-title">真实可选项</text>
            </view>
            <text class="section-note">最多 3 个 · 无竞价排名</text>
          </view>
          <button
            v-for="item in assistant.recommendations"
            :key="item.storeId"
            class="merchant-card"
            hover-class="card-tap"
            @click="openTarget(item.actionTarget)"
          >
            <view class="merchant-head">
              <view>
                <text class="merchant-name">{{ item.merchantName }}</text>
                <text class="merchant-meta">{{ formatDistance(item.distanceMeters) }} · {{ item.category }}</text>
              </view>
              <text class="merchant-price">{{ formatPrice(item.priceFen) }}<text>起</text></text>
            </view>
            <text class="merchant-reason">{{ item.reason }}</text>
            <view class="merchant-action">
              <text>{{ item.address }}</text>
              <text>查看 →</text>
            </view>
          </button>
        </section>

        <section
          v-if="draft"
          class="draft-card"
          :class="{
            confirmed: draft.status === 'CONFIRMED' && draft.orderStatus !== 'CANCELLED',
            cancelled: draft.orderStatus === 'CANCELLED',
          }"
        >
          <view class="draft-head">
            <view class="draft-icon">
              {{ draft.orderStatus === 'CANCELLED' ? '×' : draft.status === 'CONFIRMED' ? '✓' : '订' }}
            </view>
            <view>
              <text class="draft-kicker">{{ draftKicker() }}</text>
              <text class="draft-title">{{ draft.itemSummary }}</text>
            </view>
          </view>
          <view class="draft-grid">
            <view><text>门店</text><text>{{ draft.merchantName }}</text></view>
            <view><text>时间</text><text>{{ formatTime(draft.reservationAt) }}</text></view>
            <view><text>人数</text><text>{{ draft.partySize }} 人</text></view>
            <view><text>联系</text><text>{{ draft.customerPhoneMasked }}</text></view>
          </view>
          <view v-if="draft.merchantReply" class="merchant-reply">
            <text class="merchant-reply-label">商家回执</text>
            <text>{{ draft.merchantReply }}</text>
          </view>
          <view v-if="draft.canEdit && editing" class="draft-editor">
            <view class="editor-row">
              <text>用餐人数</text>
              <view class="party-stepper">
                <button
                  :disabled="editPartySize <= 1"
                  aria-label="减少人数"
                  @click="changePartySize(-1)"
                >−</button>
                <text>{{ editPartySize }} 人</text>
                <button
                  :disabled="editPartySize >= 20"
                  aria-label="增加人数"
                  @click="changePartySize(1)"
                >＋</button>
              </view>
            </view>
            <view class="picker-row">
              <picker mode="date" :value="editDate" @change="setEditDate">
                <view class="picker-field"><text>日期</text><text>{{ editDate }}</text></view>
              </picker>
              <picker mode="time" :value="editClock" @change="setEditClock">
                <view class="picker-field"><text>时间</text><text>{{ editClock }}</text></view>
              </picker>
            </view>
            <view class="editor-actions">
              <button class="editor-secondary" @click="editing = false">暂不修改</button>
              <button class="editor-primary" :disabled="saving" @click="saveDraft">
                {{ saving ? '保存中…' : '保存人数与时间' }}
              </button>
            </view>
          </view>
          <view class="payment-line">
            <text>{{ draft.payment.paidAmountFen > 0 ? '已支付' : '服务金额' }}</text>
            <text>{{ formatPrice(draft.payment.paidAmountFen > 0 ? draft.payment.paidAmountFen : draft.payment.totalAmountFen) }}</text>
          </view>
          <view class="payment-boundary">
            <view class="payment-status-row">
              <text>支付状态</text>
              <text>{{ draft.payment.status }}</text>
            </view>
            <text class="payment-disclosure">{{ draft.payment.disclosure }}</text>
            <button
              v-if="draft.payment.canPrepare"
              class="payment-button"
              :disabled="preparingPayment"
              @click="preparePayment"
            >
              {{ preparingPayment ? '正在生成…' : '我已核对，生成支付请求' }}
            </button>
            <text v-else-if="draft.payment.status === 'PENDING_PROVIDER'" class="connector-pending">
              已进入待连接器状态；未收到签名成功回调前不会显示已支付。
            </text>
          </view>
          <text class="confirmation-notice">{{ draft.confirmationNotice }}</text>
          <button
            v-if="draft.canEdit && !editing"
            class="edit-button"
            hover-class="tap"
            @click="startEdit"
          >
            编辑人数与时间
          </button>
          <button
            v-if="draft.status === 'WAITING_CONFIRMATION' && !editing"
            class="confirm-button"
            :disabled="!canConfirm"
            hover-class="tap"
            @click="confirmReservation"
          >
            {{ confirming ? '正在提交…' : '我已核对，确认提交订座' }}
          </button>
          <button
            v-if="draft.orderId && draft.orderStatus !== 'CANCELLED'"
            class="progress-button"
            hover-class="tap"
            @click="openTarget(`/pages/module/index?path=orders/all&orderId=${encodeURIComponent(draft.orderId ?? '')}`)"
          >
            查看订座进度
          </button>
          <button
            v-if="draft.canCancel && !cancelMode"
            class="cancel-button"
            hover-class="tap"
            @click="cancelMode = true"
          >
            取消本次订座
          </button>
          <view v-if="draft.canCancel && cancelMode" class="cancel-panel">
            <text class="cancel-title">确认取消这次订座？</text>
            <text class="cancel-copy">取消会立即同步给商家；当前支付为 ¥0，不产生退款。</text>
            <input
              v-model="cancelReason"
              class="cancel-input"
              maxlength="300"
              placeholder="请填写取消原因"
            />
            <view class="editor-actions">
              <button class="editor-secondary" @click="cancelMode = false">保留订座</button>
              <button class="cancel-confirm" :disabled="cancelling" @click="cancelReservation">
                {{ cancelling ? '取消中…' : '确认取消订座' }}
              </button>
            </view>
          </view>
          <button
            v-if="draft.payment.canRequestRefund && !refundMode"
            class="cancel-button"
            hover-class="tap"
            @click="refundMode = true"
          >
            申请退款
          </button>
          <view v-if="draft.payment.canRequestRefund && refundMode" class="cancel-panel">
            <text class="cancel-title">确认申请全额退款？</text>
            <text class="cancel-copy">退款金额 {{ formatPrice(draft.payment.paidAmountFen - draft.payment.refundAmountFen) }}；提交后仍需商家审核和支付连接器回调。</text>
            <input v-model="refundReason" class="cancel-input" maxlength="300" placeholder="请填写退款原因" />
            <view class="editor-actions">
              <button class="editor-secondary" @click="refundMode = false">暂不申请</button>
              <button class="cancel-confirm" :disabled="requestingRefund" @click="requestRefund">
                {{ requestingRefund ? '提交中…' : '确认申请退款' }}
              </button>
            </view>
          </view>
        </section>

        <view v-if="errorMessage" class="inline-error">{{ errorMessage }}</view>
        <view id="conversation-end" class="conversation-end" />
      </scroll-view>

      <footer class="composer">
        <view class="scope-note">
          <text>✦</text>
          <text>AI 建议仅供选择，订座必须由你确认</text>
        </view>
        <view class="composer-row">
          <button
            class="image-button"
            :disabled="imageBusy"
            aria-label="选择图片输入"
            @click="chooseAndUploadImage"
          >
            ▧
          </button>
          <button
            class="voice-button"
            :class="{ recording }"
            :disabled="voiceBusy"
            :aria-label="recording ? '停止录音' : '开始语音输入'"
            @click="toggleRecording"
          >
            {{ recording ? '■' : '◉' }}
          </button>
          <input
            v-model="prompt"
            class="prompt-input"
            :disabled="sending"
            confirm-type="send"
            placeholder="继续说说你的需要…"
            placeholder-class="prompt-placeholder"
            @confirm="send()"
          />
          <button
            class="send-button"
            :class="{ active: prompt.trim() }"
            :disabled="sending"
            hover-class="tap"
            @click="send()"
          >
            {{ sending ? '…' : '↑' }}
          </button>
        </view>
        <text v-if="recording" class="recording-note">正在录音，再次点击停止；最长 60 秒</text>
      </footer>
    </template>
  </view>
</template>

<style lang="scss" scoped>
page {
  background: #f4f7f5;
}

button {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  line-height: 1;
}

button::after {
  border: 0;
}

.assistant-page {
  min-height: 100vh;
  color: #13251d;
  background:
    radial-gradient(circle at 95% 8%, rgba(126, 230, 183, 0.22), transparent 28%),
    #f4f7f5;
}

.assistant-header {
  position: fixed;
  z-index: 20;
  top: 0;
  left: 0;
  right: 0;
  height: calc(64px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 18px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(249, 252, 250, 0.92);
  border-bottom: 1px solid rgba(26, 75, 55, 0.08);
  backdrop-filter: blur(18px);
  box-sizing: border-box;
}

.back-button,
.search-button {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #254638;
  font-size: 24px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(29, 61, 47, 0.08);
}

.assistant-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ai-orb,
.loading-orb,
.welcome-mark {
  display: grid;
  place-items: center;
  color: #083b2a;
  background: linear-gradient(145deg, #b8f4d5, #69dba6);
  box-shadow: 0 8px 24px rgba(50, 173, 113, 0.22);
}

.ai-orb {
  width: 38px;
  height: 38px;
  border-radius: 14px;
}

.assistant-title,
.assistant-status {
  display: block;
}

.assistant-title {
  font-size: 17px;
  font-weight: 800;
}

.assistant-status {
  margin-top: 4px;
  color: #6d8178;
  font-size: 11px;
}

.online-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 5px;
  border-radius: 50%;
  background: #29bd79;
}

.conversation {
  height: calc(100vh - 116px - env(safe-area-inset-bottom));
  padding: calc(82px + env(safe-area-inset-top)) 18px 28px;
  box-sizing: border-box;
}

.context-banner {
  margin: 0 auto 20px;
  padding: 9px 14px;
  width: fit-content;
  display: flex;
  gap: 8px;
  border-radius: 999px;
  color: #76887f;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.78);
}

.context-value {
  color: #315444;
  font-weight: 700;
}

.welcome-card {
  padding: 28px 22px;
  text-align: center;
  border: 1px solid rgba(50, 131, 94, 0.12);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 20px 55px rgba(30, 73, 53, 0.08);
}

.welcome-mark {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  border-radius: 20px;
  font-size: 22px;
}

.welcome-title,
.welcome-copy {
  display: block;
}

.welcome-title {
  font-size: 21px;
  font-weight: 800;
  line-height: 1.35;
}

.welcome-copy {
  margin-top: 10px;
  color: #667b71;
  font-size: 15px;
  line-height: 1.65;
}

.example-list {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 9px;
}

.example-list button {
  padding: 11px 14px;
  color: #236348;
  border-radius: 14px;
  font-size: 14px;
  background: #eaf8f0;
}

.message-row {
  margin-top: 18px;
  display: flex;
  align-items: flex-end;
  gap: 9px;
}

.message-user {
  justify-content: flex-end;
}

.message-avatar {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  color: #0f5136;
  border-radius: 11px;
  background: #baf1d2;
}

.message-bubble {
  max-width: 78%;
  padding: 14px 16px;
  border-radius: 19px;
  font-size: 17px;
  line-height: 1.58;
  background: #fff;
  box-shadow: 0 10px 32px rgba(33, 69, 52, 0.07);
}

.message-user .message-bubble {
  color: #fff;
  border-bottom-right-radius: 6px;
  background: #173d2e;
}

.message-assistant .message-bubble {
  border-bottom-left-radius: 6px;
}

.recommendations,
.draft-card,
.voice-card,
.image-card {
  margin-top: 24px;
}

.image-card {
  padding: 19px;
  border: 1px solid rgba(132, 91, 173, 0.18);
  border-radius: 24px;
  background: linear-gradient(145deg, #fff, #f5effb);
  box-shadow: 0 15px 40px rgba(91, 55, 122, 0.08);
}

.image-head,
.image-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.image-kicker,
.image-title,
.image-disclosure,
.image-description-label,
.image-dispatched,
.sensitive-warning {
  display: block;
}

.image-kicker {
  color: #7952a1;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.4px;
}

.image-title {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 800;
}

.image-status {
  padding: 7px 9px;
  color: #704596;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 800;
  background: #eee1f8;
}

.image-disclosure {
  margin-top: 13px;
  color: #6d6178;
  font-size: 13px;
  line-height: 1.55;
}

.image-meta {
  margin-top: 12px;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  color: #807589;
  font-size: 11px;
}

.sensitive-warning {
  margin-top: 12px;
  padding: 10px 12px;
  color: #8b4b3c;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.5;
  background: #fff0eb;
}

.image-pending,
.image-failed,
.image-description-panel {
  margin-top: 14px;
  padding: 13px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.84);
}

.image-pending text,
.image-failed text {
  color: #6f6479;
  font-size: 13px;
  line-height: 1.5;
}

.image-pending button,
.image-failed button {
  margin-top: 10px;
  padding: 9px 11px;
  color: #704596;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 800;
  background: #f0e5f8;
}

.image-description-label {
  color: #5c456f;
  font-size: 12px;
  font-weight: 800;
}

.image-description-input {
  width: 100%;
  min-height: 76px;
  margin-top: 9px;
  padding: 12px;
  color: #173b2d;
  border: 1px solid rgba(119, 75, 154, 0.14);
  border-radius: 13px;
  font-size: 15px;
  line-height: 1.55;
  background: #fff;
  box-sizing: border-box;
}

.image-confirm {
  width: 100%;
  margin-top: 11px;
  padding: 13px;
  color: #fff;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 800;
  background: #704596;
}

.image-dispatched {
  margin-top: 13px;
  color: #5f4c70;
  font-size: 13px;
  line-height: 1.5;
}

.voice-card {
  padding: 19px;
  border: 1px solid rgba(61, 128, 168, 0.18);
  border-radius: 24px;
  background: linear-gradient(145deg, #fbfdff, #eef7fb);
  box-shadow: 0 15px 40px rgba(35, 83, 111, 0.08);
}

.voice-head,
.voice-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.voice-kicker,
.voice-title,
.voice-disclosure,
.transcript-label,
.voice-dispatched {
  display: block;
}

.voice-kicker {
  color: #317da6;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.4px;
}

.voice-title {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 800;
}

.voice-status {
  padding: 7px 9px;
  color: #236c91;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 800;
  background: #dceff8;
}

.voice-disclosure {
  margin-top: 13px;
  color: #56717f;
  font-size: 13px;
  line-height: 1.55;
}

.voice-meta {
  margin-top: 12px;
  justify-content: flex-start;
  gap: 12px;
  color: #6d818b;
  font-size: 11px;
}

.voice-pending,
.voice-failed,
.transcript-panel {
  margin-top: 14px;
  padding: 13px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
}

.voice-pending text,
.voice-failed text {
  color: #5d717b;
  font-size: 13px;
  line-height: 1.5;
}

.voice-pending button,
.voice-failed button {
  margin-top: 10px;
  padding: 9px 11px;
  color: #256f95;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 800;
  background: #e2f2f9;
}

.transcript-label {
  color: #315565;
  font-size: 12px;
  font-weight: 800;
}

.transcript-input {
  width: 100%;
  min-height: 76px;
  margin-top: 9px;
  padding: 12px;
  color: #173b2d;
  border: 1px solid rgba(47, 110, 140, 0.14);
  border-radius: 13px;
  font-size: 15px;
  line-height: 1.55;
  background: #fff;
  box-sizing: border-box;
}

.voice-confirm {
  width: 100%;
  margin-top: 11px;
  padding: 13px;
  color: #fff;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 800;
  background: #1e6d91;
}

.voice-dispatched {
  margin-top: 13px;
  color: #247252;
  font-size: 13px;
  line-height: 1.5;
}

.section-heading,
.merchant-head,
.merchant-action,
.draft-head,
.payment-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-kicker,
.section-title {
  display: block;
}

.section-kicker,
.draft-kicker {
  color: #33a873;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.5px;
}

.section-title {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 800;
}

.section-note {
  color: #778980;
  font-size: 11px;
}

.merchant-card {
  width: 100%;
  margin-top: 12px;
  padding: 18px;
  text-align: left;
  border: 1px solid rgba(38, 102, 73, 0.09);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 14px 38px rgba(28, 68, 48, 0.07);
}

.merchant-name,
.merchant-meta,
.merchant-reason {
  display: block;
}

.merchant-name {
  font-size: 18px;
  font-weight: 800;
}

.merchant-meta {
  margin-top: 7px;
  color: #778a80;
  font-size: 12px;
}

.merchant-price {
  color: #13734b;
  font-size: 19px;
  font-weight: 900;
}

.merchant-price text {
  margin-left: 2px;
  font-size: 11px;
  font-weight: 600;
}

.merchant-reason {
  margin-top: 14px;
  color: #52675d;
  font-size: 15px;
  line-height: 1.55;
}

.merchant-action {
  margin-top: 15px;
  padding-top: 13px;
  color: #73877d;
  border-top: 1px solid #edf2ef;
  font-size: 12px;
}

.merchant-action text:last-child {
  color: #176d4a;
  font-weight: 800;
}

.draft-card {
  padding: 20px;
  border: 1px solid rgba(240, 173, 71, 0.32);
  border-radius: 25px;
  background: linear-gradient(145deg, #fffdf7, #fff8e8);
  box-shadow: 0 18px 48px rgba(126, 88, 24, 0.09);
}

.draft-card.confirmed {
  border-color: rgba(61, 171, 116, 0.28);
  background: linear-gradient(145deg, #fafffc, #ecfbf3);
}

.draft-card.cancelled {
  border-color: rgba(116, 132, 123, 0.22);
  background: linear-gradient(145deg, #fafcfb, #eef2f0);
}

.draft-head {
  justify-content: flex-start;
  gap: 12px;
}

.draft-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  color: #8b5a09;
  border-radius: 14px;
  font-weight: 900;
  background: #ffe9bb;
}

.confirmed .draft-icon {
  color: #176c49;
  background: #c9f1db;
}

.cancelled .draft-icon {
  color: #66766e;
  background: #dfe7e3;
}

.draft-title {
  display: block;
  margin-top: 5px;
  font-size: 18px;
  font-weight: 800;
}

.draft-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.draft-grid view {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.draft-grid text {
  display: block;
}

.draft-grid text:first-child {
  color: #8a897f;
  font-size: 11px;
}

.draft-grid text:last-child {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 700;
}

.merchant-reply {
  margin-top: 14px;
  padding: 13px 14px;
  display: flex;
  gap: 8px;
  color: #285d45;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.5;
  background: rgba(214, 246, 228, 0.78);
}

.merchant-reply-label {
  flex: 0 0 auto;
  font-weight: 800;
}

.draft-editor,
.cancel-panel {
  margin-top: 16px;
  padding: 15px;
  border: 1px solid rgba(37, 102, 73, 0.1);
  border-radius: 17px;
  background: rgba(255, 255, 255, 0.78);
}

.editor-row,
.editor-actions,
.party-stepper,
.picker-row {
  display: flex;
  align-items: center;
}

.editor-row {
  justify-content: space-between;
  color: #50665b;
  font-size: 14px;
}

.party-stepper {
  gap: 12px;
}

.party-stepper button {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #185d40;
  border-radius: 11px;
  font-size: 20px;
  background: #e8f5ee;
}

.party-stepper button[disabled] {
  color: #a9b5af;
  background: #eff2f0;
}

.party-stepper text {
  min-width: 38px;
  text-align: center;
  color: #173b2d;
  font-weight: 800;
}

.picker-row {
  margin-top: 13px;
  gap: 9px;
}

.picker-row picker {
  flex: 1;
}

.picker-field {
  padding: 11px 12px;
  border-radius: 12px;
  background: #f1f6f3;
}

.picker-field text {
  display: block;
}

.picker-field text:first-child {
  color: #829087;
  font-size: 10px;
}

.picker-field text:last-child {
  margin-top: 5px;
  font-size: 13px;
  font-weight: 700;
}

.editor-actions {
  margin-top: 14px;
  gap: 9px;
}

.editor-actions button {
  flex: 1;
  height: 42px;
  border-radius: 13px;
  font-size: 13px;
  font-weight: 800;
}

.editor-secondary {
  color: #5f7168;
  background: #edf2ef;
}

.editor-primary {
  color: #fff;
  background: #1c6e4c;
}

.payment-line {
  margin-top: 16px;
  padding: 15px 2px 12px;
  border-top: 1px solid rgba(111, 89, 49, 0.1);
  font-size: 14px;
}

.payment-line text:last-child {
  color: #13734b;
  font-size: 22px;
  font-weight: 900;
}

.payment-boundary {
  margin-bottom: 12px;
  padding: 13px 14px;
  border: 1px solid rgba(28, 110, 76, 0.12);
  border-radius: 15px;
  background: rgba(235, 248, 241, 0.84);
}

.payment-status-row {
  display: flex;
  justify-content: space-between;
  color: #235940;
  font-size: 12px;
  font-weight: 800;
}

.payment-disclosure,
.connector-pending {
  display: block;
  margin-top: 8px;
  color: #64766d;
  font-size: 11px;
  line-height: 1.55;
}

.payment-button {
  width: 100%;
  height: 44px;
  margin-top: 12px;
  border-radius: 13px;
  color: #fff;
  font-size: 13px;
  font-weight: 850;
  background: #176f4d;
}

.confirmation-notice {
  display: block;
  color: #786d59;
  font-size: 12px;
  line-height: 1.55;
}

.confirm-button,
.progress-button,
.edit-button {
  width: 100%;
  height: 50px;
  margin-top: 16px;
  border-radius: 16px;
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  background: #173d2e;
}

.edit-button {
  color: #225d43;
  border: 1px solid rgba(30, 105, 73, 0.16);
  background: rgba(255, 255, 255, 0.72);
}

.progress-button {
  background: #1f8058;
}

.cancel-button {
  width: 100%;
  margin-top: 12px;
  padding: 12px;
  color: #9a4a3b;
  font-size: 13px;
  font-weight: 700;
}

.cancel-title,
.cancel-copy {
  display: block;
}

.cancel-title {
  color: #75382d;
  font-size: 15px;
  font-weight: 800;
}

.cancel-copy {
  margin-top: 7px;
  color: #806b65;
  font-size: 12px;
  line-height: 1.5;
}

.cancel-input {
  height: 42px;
  margin-top: 12px;
  padding: 0 12px;
  border: 1px solid rgba(147, 70, 55, 0.12);
  border-radius: 12px;
  font-size: 14px;
  background: #fff;
  box-sizing: border-box;
}

.cancel-confirm {
  color: #fff;
  background: #9a4a3b;
}

.inline-error {
  margin-top: 16px;
  padding: 12px 14px;
  color: #a54536;
  border-radius: 14px;
  font-size: 13px;
  background: #fff0ed;
}

.conversation-end {
  height: 2px;
}

.composer {
  position: fixed;
  z-index: 20;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 9px 16px calc(10px + env(safe-area-inset-bottom));
  background: rgba(249, 252, 250, 0.96);
  border-top: 1px solid rgba(26, 75, 55, 0.08);
  backdrop-filter: blur(18px);
  box-sizing: border-box;
}

.scope-note {
  margin-bottom: 7px;
  display: flex;
  justify-content: center;
  gap: 5px;
  color: #819087;
  font-size: 10px;
}

.composer-row {
  display: flex;
  align-items: center;
  gap: 9px;
}

.voice-button {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  color: #216c4c;
  border-radius: 17px;
  font-size: 19px;
  background: #e5f4eb;
}

.image-button {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  color: #704596;
  border-radius: 17px;
  font-size: 20px;
  background: #f0e7f7;
}

.voice-button.recording {
  color: #fff;
  background: #bd4f42;
  animation: recording-pulse 1.2s ease-in-out infinite;
}

.recording-note {
  display: block;
  margin-top: 7px;
  color: #a04b40;
  font-size: 11px;
  text-align: center;
}

@keyframes recording-pulse {
  50% { opacity: 0.68; }
}

.prompt-input {
  flex: 1;
  height: 48px;
  padding: 0 16px;
  color: #173b2d;
  border: 1px solid rgba(35, 93, 67, 0.1);
  border-radius: 17px;
  font-size: 16px;
  background: #fff;
  box-sizing: border-box;
}

.prompt-placeholder {
  color: #9aaaa2;
}

.send-button {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  border-radius: 17px;
  color: #9ba9a2;
  font-size: 22px;
  background: #e8eeeb;
}

.send-button.active {
  color: #fff;
  background: #173d2e;
}

.state-page {
  min-height: 100vh;
  padding: 0 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.loading-orb {
  width: 62px;
  height: 62px;
  border-radius: 22px;
  font-size: 24px;
}

.error-symbol {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  color: #a13f32;
  border-radius: 18px;
  font-size: 25px;
  font-weight: 900;
  background: #ffe3dd;
}

.state-title {
  margin-top: 20px;
  font-size: 21px;
  font-weight: 800;
}

.state-copy {
  margin-top: 10px;
  color: #71847a;
  font-size: 14px;
  line-height: 1.6;
}

.retry-button {
  margin-top: 22px;
  padding: 14px 22px;
  color: #fff;
  border-radius: 15px;
  background: #173d2e;
}

.tap,
.card-tap {
  opacity: 0.78;
  transform: scale(0.985);
}

@media (min-width: 768px) {
  .assistant-header,
  .composer {
    left: 50%;
    width: 640px;
    transform: translateX(-50%);
  }

  .conversation {
    width: 640px;
    margin: 0 auto;
  }
}
</style>
