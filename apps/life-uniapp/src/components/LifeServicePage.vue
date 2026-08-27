<script setup>
import { computed, reactive, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LifeSurface from './LifeSurface.vue';
import { lifeSession } from '../services/life-session.js';
import { lifeSurfaceState } from '../surface-contract.js';

const props = defineProps({ pageId: { type: String, required: true } });
const pageMeta = Object.freeze({
  219: ['门店地图', '只使用门店主档中的真实坐标', 'blue'],
  242: ['待使用券', '仅展示服务端签发且仍可使用的凭证', 'orange'],
  243: ['核销结果', '核销次数与有效期以服务端为准', 'orange'],
  245: ['申请售后', '按剩余可退数量提交真实退款申请', 'red'],
  246: ['售后详情', '审批、渠道和退款进度同源展示', 'orange'],
  248: ['地址管理', '敏感地址仅在鉴权后解密展示', 'green'],
  250: ['发票与抬头', '个人与企业抬头加密保存', 'blue'],
  252: ['奖励明细', '原额、兑付、冲正与可用额分开记账', 'orange'],
  254: ['隐私与授权', '商户档案授权必须在对应商户会话内操作', 'green'],
  255: ['订阅消息', '系统订阅和商户授权均需明确同意', 'blue'],
  258: ['小满生活助手', '只在有商户上下文时读取受控知识并提供建议', 'green'],
  259: ['订单与售后工具', '从真实订单进入详情或售后流程', 'green'],
  262: ['乐趣生活客服', '人工与 AI 身份、权限和接管状态清晰可见', 'blue'],
  264: ['我的工单', '工单严格限定在对应商户消费者会话', 'orange'],
});
const merchantBoundaryPages = new Set(['254', '255', '258', '262', '264']);
const meta = computed(() => pageMeta[props.pageId]);
const loading = ref(false);
const busy = ref(false);
const error = ref(null);
const records = ref([]);
const detail = ref(null);
const merchantContext = ref(null);
const notice = ref('');
const selectedConversation = ref(null);
const messages = ref([]);
const messageContents = reactive({});
const messageDraft = ref('');
const conversationFilter = ref('ALL');
const showGuide = ref(false);
let conversationRequestSequence = 0;
const conversationFilters = Object.freeze([
  ['ALL', '全部'],
  ['BOT_ACTIVE', '助手处理中'],
  ['HUMAN_REQUESTED', '正在转人工'],
  ['HUMAN_QUEUED', '人工排队'],
  ['HUMAN_ACTIVE', '人工处理中'],
  ['WAITING_CUSTOMER', '等待我回复'],
  ['CLOSED', '已结束'],
]);
const addressDraft = reactive({
  recipientName: '',
  mobile: '',
  provinceCode: '',
  cityCode: '',
  districtCode: '',
  addressLine: '',
  isDefault: false,
});
const invoiceDraft = reactive({
  profileType: 'PERSONAL',
  title: '',
  taxIdentifier: '',
  email: '',
  isDefault: false,
});
const refundDraft = reactive({
  requestType: 'UNSHIPPED_REFUND',
  reasonCode: 'CUSTOMER_UNSHIPPED_REFUND',
  description: '',
});
const query = () => getCurrentPages().at(-1)?.options ?? {};
const state = computed(() =>
  merchantBoundaryPages.has(props.pageId) &&
  !merchantContext.value &&
  !loading.value &&
  !error.value
    ? 'boundary'
    : lifeSurfaceState({
        loading: loading.value,
        error: error.value,
        records: detail.value ? [detail.value] : records.value,
      }),
);
const consentByType = (consentType) =>
  detail.value?.consents?.find((consent) => consent.consentType === consentType) ?? null;
const profileConsent = computed(() => consentByType('PROFILE_MEMORY'));
const subscriptionConsent = computed(() => consentByType('SUBSCRIPTION_MESSAGE'));
const visibleConversations = computed(() =>
  conversationFilter.value === 'ALL'
    ? records.value
    : records.value.filter((conversation) => conversation.status === conversationFilter.value),
);
const credentialSummary = computed(() => ({
  count: records.value.length,
  remaining: records.value.reduce((sum, item) => sum + Number(item.remainingUses || 0), 0),
  available: records.value.filter((item) => Number(item.remainingUses || 0) > 0).length,
}));
const rewardSummary = computed(() =>
  records.value.reduce(
    (summary, item) => ({
      original: summary.original + Number(item.originalAmountCents || 0),
      redeemed: summary.redeemed + Number(item.redeemedAmountCents || 0),
      reversed: summary.reversed + Number(item.reversedAmountCents || 0),
      available: summary.available + Number(item.availableAmountCents || 0),
    }),
    { original: 0, redeemed: 0, reversed: 0, available: 0 },
  ),
);
const money = (cents) => `¥${(Number(cents || 0) / 100).toFixed(2)}`;
const senderLabel = (message) =>
  ({
    CUSTOMER: '我',
    EMPLOYEE: message.senderDisplayName || '人工客服',
    AI: '小满助手',
    SYSTEM: '系统',
  })[message.senderType] || message.senderType;
const conversationStatusLabel = (status) =>
  ({
    BOT_ACTIVE: '助手处理中',
    HUMAN_REQUESTED: '正在转人工',
    HUMAN_QUEUED: '人工排队',
    HUMAN_ACTIVE: '人工处理中',
    WAITING_CUSTOMER: '等待我回复',
    CLOSED: '已结束',
  })[status] || status;
const ticketStatusLabel = (status) =>
  ({
    OPEN: '待分配',
    ASSIGNED: '处理中',
    RESOLVED: '已解决',
    CANCELLED: '已取消',
    EXPIRED: '已超时',
  })[status] || status;
const clearMessageContents = () => {
  for (const messageId of Object.keys(messageContents)) delete messageContents[messageId];
};
const key = (scope) => `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const go = (id, parameters = {}) => {
  const suffix = Object.entries(parameters)
    .filter(([, value]) => value)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');
  uni.navigateTo({ url: `/pages/page-${id}/index${suffix ? `?${suffix}` : ''}` });
};
const confirm = (content) =>
  new Promise((resolve) =>
    uni.showModal({
      title: '请确认',
      content,
      confirmColor: 'var(--life-coral-ink)',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }),
  );

async function load() {
  conversationRequestSequence += 1;
  loading.value = true;
  busy.value = false;
  error.value = null;
  notice.value = '';
  records.value = [];
  detail.value = null;
  merchantContext.value = null;
  selectedConversation.value = null;
  messages.value = [];
  messageDraft.value = '';
  conversationFilter.value = 'ALL';
  clearMessageContents();
  try {
    const params = query();
    if (merchantBoundaryPages.has(props.pageId)) {
      if (!params.merchantTenantId || !params.storeId) return;
      merchantContext.value = {
        merchantTenantId: params.merchantTenantId,
        storeId: params.storeId,
      };
      if (['254', '255'].includes(props.pageId)) {
        detail.value = await lifeSession.requestMerchant(
          merchantContext.value,
          '/api/v1/customer-profile',
        );
        records.value = detail.value.facts || [];
      } else {
        const conversations = await lifeSession.requestMerchant(
          merchantContext.value,
          '/api/v1/customer-service/conversations',
        );
        records.value =
          props.pageId === '264'
            ? conversations.filter((conversation) => conversation.ticket)
            : conversations;
        const requestedConversation = records.value.find(
          (conversation) => conversation.id === params.conversationId,
        );
        if (requestedConversation) await openConversation(requestedConversation);
      }
      return;
    }
    if (props.pageId === '219')
      records.value = await lifeSession.request('/api/v1/life/discovery/stores?limit=50');
    if (props.pageId === '242')
      records.value = await lifeSession.request('/api/v1/life/verification-entitlements');
    if (props.pageId === '243' && params.orderId)
      records.value = await lifeSession.request(
        `/api/v1/life/orders/${encodeURIComponent(params.orderId)}/verification-entitlements`,
      );
    if (['245', '246'].includes(props.pageId) && params.orderId) {
      detail.value = await lifeSession.request(
        `/api/v1/life/orders/${encodeURIComponent(params.orderId)}${props.pageId === '246' ? '/aftercare' : ''}`,
      );
      records.value = props.pageId === '246' ? detail.value.refunds || [] : [detail.value];
    }
    if (props.pageId === '248') records.value = await lifeSession.request('/api/v1/life/addresses');
    if (props.pageId === '250')
      records.value = await lifeSession.request('/api/v1/life/invoice-profiles');
    if (props.pageId === '252')
      records.value = await lifeSession.request('/api/v1/life/rewards?limit=50');
    if (props.pageId === '259')
      records.value = await lifeSession.request('/api/v1/life/orders?limit=50');
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

function openStore(store) {
  if (
    store.latitude === null ||
    store.latitude === undefined ||
    store.longitude === null ||
    store.longitude === undefined ||
    !Number.isFinite(Number(store.latitude)) ||
    !Number.isFinite(Number(store.longitude))
  ) {
    notice.value = '该门店尚未维护可验证坐标，已停止打开地图；可先进入商家详情。';
    return;
  }
  uni.openLocation({
    latitude: Number(store.latitude),
    longitude: Number(store.longitude),
    name: store.name,
    fail: () => {
      notice.value = '地图未能打开，请检查系统位置服务权限。';
    },
  });
}
function copyToken(token) {
  if (Number(token.remainingUses) < 1 || !token.verificationToken) return;
  uni.setClipboardData({
    data: token.verificationToken,
    success: () => uni.showToast({ title: '核销凭证已复制', icon: 'none' }),
  });
}
async function submitRefund() {
  const order = detail.value;
  const items = (order?.items || [])
    .map((item) => ({
      orderItemId: item.id,
      quantity: Number(item.quantity) - Number(item.refundedQuantity || 0),
    }))
    .filter((item) => item.quantity > 0);
  if (!order || !items.length) return uni.showToast({ title: '没有可申请的项目', icon: 'none' });
  if (!(await confirm('将按订单中全部剩余可退数量提交申请，提交后由服务端判断是否需要审批。')))
    return;
  busy.value = true;
  try {
    await lifeSession.request(`/api/v1/life/orders/${order.id}/refunds`, {
      method: 'POST',
      header: { 'Idempotency-Key': key(`life-refund-${order.id}`) },
      data: {
        requestType: refundDraft.requestType,
        reasonCode: refundDraft.reasonCode.trim(),
        ...(refundDraft.description.trim() ? { description: refundDraft.description.trim() } : {}),
        items,
      },
    });
    go('246', { orderId: order.id });
  } catch {
    notice.value = '售后申请未提交成功；请刷新订单状态后安全重试。';
  } finally {
    busy.value = false;
  }
}
async function saveAddress() {
  if (
    !addressDraft.recipientName.trim() ||
    !/^1[3-9][0-9]{9}$/u.test(addressDraft.mobile) ||
    !addressDraft.provinceCode.trim() ||
    !addressDraft.cityCode.trim() ||
    !addressDraft.districtCode.trim() ||
    !addressDraft.addressLine.trim()
  )
    return uni.showToast({ title: '请完整填写有效地址', icon: 'none' });
  busy.value = true;
  try {
    await lifeSession.request('/api/v1/life/addresses', {
      method: 'PUT',
      data: { ...addressDraft },
    });
    await load();
  } catch {
    notice.value = '地址未保存；请检查字段或稍后重试。';
  } finally {
    busy.value = false;
  }
}
async function archiveAddress(id) {
  if (!(await confirm('归档后不会删除历史订单中的地址快照，确认归档当前地址？'))) return;
  busy.value = true;
  try {
    await lifeSession.request(`/api/v1/life/addresses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await load();
  } catch {
    notice.value = '地址归档失败，请重试。';
  } finally {
    busy.value = false;
  }
}
async function saveInvoice() {
  if (
    !invoiceDraft.title.trim() ||
    (invoiceDraft.profileType === 'ENTERPRISE' && invoiceDraft.taxIdentifier.trim().length < 5)
  )
    return uni.showToast({ title: '请完整填写有效抬头', icon: 'none' });
  busy.value = true;
  try {
    await lifeSession.request('/api/v1/life/invoice-profiles', {
      method: 'PUT',
      data: {
        profileType: invoiceDraft.profileType,
        title: invoiceDraft.title.trim(),
        ...(invoiceDraft.taxIdentifier.trim()
          ? { taxIdentifier: invoiceDraft.taxIdentifier.trim() }
          : {}),
        ...(invoiceDraft.email.trim() ? { email: invoiceDraft.email.trim() } : {}),
        isDefault: invoiceDraft.isDefault,
      },
    });
    await load();
  } catch {
    notice.value = '发票抬头未保存；请检查税号或邮箱。';
  } finally {
    busy.value = false;
  }
}
async function archiveInvoice(id) {
  if (!(await confirm('归档不会删除历史开票引用，确认归档当前抬头？'))) return;
  busy.value = true;
  try {
    await lifeSession.request(`/api/v1/life/invoice-profiles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      header: { 'Idempotency-Key': key(`life-invoice-${id}`) },
    });
    await load();
  } catch {
    notice.value = '发票抬头归档失败，请重试。';
  } finally {
    busy.value = false;
  }
}
async function withdrawConsent(consent) {
  if (!merchantContext.value || consent?.status !== 'GRANTED' || !consent.policyVersion) return;
  if (!(await confirm('撤回后将停止该商户后续使用此项授权；历史记录仍按法定留存规则处理。')))
    return;
  busy.value = true;
  try {
    await lifeSession.requestMerchant(merchantContext.value, '/api/v1/customer-profile/consents', {
      method: 'POST',
      header: { 'Idempotency-Key': key(`life-consent-${consent.consentType}`) },
      data: {
        consentType: consent.consentType,
        status: 'WITHDRAWN',
        policyVersion: consent.policyVersion,
        evidenceRef: `LEQU_LIFE_PRIVACY_CENTER:${new Date().toISOString()}`,
        purpose: consent.purpose,
      },
    });
    await load();
    notice.value = '撤回请求已持久化，页面已读取服务端最新状态。';
  } catch {
    notice.value = '撤回请求未成功持久化，请刷新状态后安全重试。';
  } finally {
    busy.value = false;
  }
}
async function requestProfileCopy() {
  if (!merchantContext.value) return;
  busy.value = true;
  try {
    await lifeSession.requestMerchant(
      merchantContext.value,
      '/api/v1/customer-profile/privacy-requests',
      {
        method: 'POST',
        header: { 'Idempotency-Key': key('life-profile-copy') },
        data: { requestType: 'VIEW', scope: ['PROFILE_FACTS'] },
      },
    );
    notice.value = '档案副本申请已进入服务端持久化队列。';
  } catch {
    notice.value = '档案副本申请未成功提交，请稍后安全重试。';
  } finally {
    busy.value = false;
  }
}
async function openConversation(conversation) {
  if (!merchantContext.value) return;
  const requestSequence = ++conversationRequestSequence;
  busy.value = true;
  notice.value = '';
  selectedConversation.value = null;
  messages.value = [];
  clearMessageContents();
  try {
    const conversationId = encodeURIComponent(conversation.id);
    const [latest, persistedMessages] = await Promise.all([
      lifeSession.requestMerchant(
        merchantContext.value,
        `/api/v1/customer-service/conversations/${conversationId}`,
      ),
      lifeSession.requestMerchant(
        merchantContext.value,
        `/api/v1/customer-service/conversations/${conversationId}/messages`,
      ),
    ]);
    if (requestSequence !== conversationRequestSequence) return;
    selectedConversation.value = latest;
    messages.value = persistedMessages;
  } catch {
    if (requestSequence === conversationRequestSequence)
      notice.value = '会话详情读取失败；未展示任何未经服务端确认的消息。';
  } finally {
    if (requestSequence === conversationRequestSequence) busy.value = false;
  }
}
async function readMessageContent(message) {
  if (!merchantContext.value || !selectedConversation.value || messageContents[message.id]) return;
  const conversationId = selectedConversation.value.id;
  const requestSequence = conversationRequestSequence;
  busy.value = true;
  try {
    const encodedConversationId = encodeURIComponent(conversationId);
    const messageId = encodeURIComponent(message.id);
    const response = await lifeSession.requestMerchant(
      merchantContext.value,
      `/api/v1/customer-service/conversations/${encodedConversationId}/messages/${messageId}/content`,
    );
    if (
      requestSequence === conversationRequestSequence &&
      selectedConversation.value?.id === conversationId
    )
      messageContents[message.id] = response.content;
  } catch {
    notice.value = '消息正文未能通过归属校验，已保留脱敏预览。';
  } finally {
    busy.value = false;
  }
}
async function sendConversationMessage() {
  const content = messageDraft.value.trim();
  if (!merchantContext.value || !selectedConversation.value || !content)
    return uni.showToast({ title: '请输入消息内容', icon: 'none' });
  busy.value = true;
  try {
    const conversationId = encodeURIComponent(selectedConversation.value.id);
    await lifeSession.requestMerchant(
      merchantContext.value,
      `/api/v1/customer-service/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        header: { 'Idempotency-Key': key(`life-message-${selectedConversation.value.id}`) },
        data: { content, messageType: 'TEXT' },
      },
    );
    messageDraft.value = '';
    await openConversation(selectedConversation.value);
    notice.value = '消息正文已先写入持久化对象存储，当前会话已刷新。';
  } catch {
    notice.value = '消息未确认持久化，请保留原文并刷新后重试。';
  } finally {
    busy.value = false;
  }
}
async function requestConversationHuman() {
  if (
    !merchantContext.value ||
    !selectedConversation.value ||
    selectedConversation.value.status !== 'BOT_ACTIVE' ||
    !(await confirm('将创建当前商户门店的人工客服工单，确认进入人工队列？'))
  )
    return;
  busy.value = true;
  try {
    const conversationId = encodeURIComponent(selectedConversation.value.id);
    const updated = await lifeSession.requestMerchant(
      merchantContext.value,
      `/api/v1/customer-service/conversations/${conversationId}/actions/request-human`,
      {
        method: 'POST',
        header: { 'Idempotency-Key': key(`life-human-${selectedConversation.value.id}`) },
        data: { reasonCode: 'CUSTOMER_REQUESTED_HUMAN', priority: 'NORMAL' },
      },
    );
    selectedConversation.value = updated;
    try {
      await loadConversationsWithoutClosingDetail();
      notice.value = '人工工单已由服务端持久化，当前接管状态已更新。';
    } catch {
      notice.value = '人工工单已持久化，但会话列表刷新失败；当前详情仍显示服务端返回状态。';
    }
  } catch {
    notice.value = '人工请求未确认入队，请刷新会话状态后重试。';
  } finally {
    busy.value = false;
  }
}
async function loadConversationsWithoutClosingDetail() {
  if (!merchantContext.value) return;
  const conversations = await lifeSession.requestMerchant(
    merchantContext.value,
    '/api/v1/customer-service/conversations',
  );
  records.value =
    props.pageId === '264'
      ? conversations.filter((conversation) => conversation.ticket)
      : conversations;
}
onShow(load);
</script>

<template>
  <LifeSurface
    :compact="
      [
        '219',
        '242',
        '243',
        '245',
        '246',
        '248',
        '250',
        '252',
        '254',
        '255',
        '258',
        '259',
        '262',
        '264',
      ].includes(pageId)
    "
    :show-assurance="
      ![
        '219',
        '242',
        '243',
        '245',
        '246',
        '248',
        '250',
        '252',
        '254',
        '255',
        '258',
        '259',
        '262',
        '264',
      ].includes(pageId)
    "
    :eyebrow="`PAGE-${pageId}`"
    :title="meta[0]"
    :detail="meta[1]"
    :theme-color="meta[2] === 'orange' || meta[2] === 'red' ? 'coral' : meta[2]"
  >
    <view v-if="state === 'loading'" class="section empty-safe">正在读取服务端真实状态…</view>
    <view
      v-else-if="state === 'unauthenticated'"
      class="section empty-safe"
      @click="uni.switchTab({ url: '/pages/me/index' })"
      >登录后继续，点此前往“我的”</view
    >
    <view v-else-if="state === 'forbidden'" class="section empty-safe">当前账户无权访问该记录</view>
    <view v-else-if="state === 'recoverable-error'" class="section empty-safe" @click="load"
      >加载失败，点此重试</view
    >
    <view
      v-else-if="
        state === 'empty' && !['242', '248', '250', '252', '258', '262', '264'].includes(pageId)
      "
      class="section empty-safe"
      >当前没有可展示的数据</view
    >
    <view v-else-if="state === 'boundary'" class="section boundary">
      <view class="section-head"><text>需要具体商户会话</text><text>安全关闭</text></view>
      <text
        >Life
        平台令牌不能替代某一商户的消费者令牌。请从订单或商家详情进入对应商户上下文后，再管理授权、订阅、助手会话或客服工单。</text
      >
      <view class="boundary-facts"
        ><text>当前：平台消费者会话</text><text>需要：具体商户消费者会话</text
        ><text>结果：不发送越权请求</text></view
      >
      <button
        class="secondary"
        @click="
          pageId === '254' || pageId === '255'
            ? uni.switchTab({ url: '/pages/me/index' })
            : go('259')
        "
      >
        {{ pageId === '254' || pageId === '255' ? '返回账户中心' : '从订单选择商户' }}
      </button>
    </view>

    <view
      v-if="merchantContext && ['254', '255'].includes(pageId) && state === 'ready'"
      class="consent-surface"
      ><view class="privacy-summary" :class="{ subscription: pageId === '255' }"
        ><view class="privacy-shield"><view></view></view
        ><view
          ><text>{{ pageId === '254' ? '商户隐私档案' : '商户消息授权' }}</text
          ><text>商户与门店上下文已验证</text></view
        ><text>{{ detail.status }}</text></view
      ><view class="consent-trust-grid"
        ><view><text>已验证</text><text>商户上下文</text></view
        ><view><text>已确认</text><text>门店范围</text></view
        ><view
          ><text>{{ detail.profileMemoryConsent }}</text
          ><text>持续档案</text></view
        ></view
      ><text class="context-note privacy-context-note"
        >当前内容由短期商户消费者会话读取；平台令牌未发送到商户档案接口。</text
      >
      <view v-if="pageId === '254'" class="privacy-fact-list"
        ><view class="privacy-note"
          >最新持续档案授权：{{ profileConsent?.status || '暂无记录'
          }}<text v-if="profileConsent">
            · {{ profileConsent.policyVersion }} · {{ profileConsent.occurredAt }}</text
          ></view
        ><view v-for="fact in records" :key="fact.id" class="privacy-fact-card"
          ><view class="privacy-fact-mark"></view
          ><view
            ><text>{{ fact.factType }}</text
            ><text>{{ fact.value }}</text
            ><text>{{ fact.purpose }}</text></view
          ><text>{{ fact.status }}</text></view
        ><view class="consent-actions"
          ><button class="secondary" :loading="busy" @click="requestProfileCopy">
            申请查看档案副本</button
          ><button
            v-if="profileConsent?.status === 'GRANTED'"
            class="danger"
            :loading="busy"
            @click="withdrawConsent(profileConsent)"
          >
            撤回持续档案授权
          </button></view
        ></view
      ><view v-else class="subscription-state"
        ><view v-if="subscriptionConsent" class="subscription-record"
          ><view
            ><text>最新订阅授权</text><text>{{ subscriptionConsent.status }}</text></view
          ><text>政策版本 {{ subscriptionConsent.policyVersion }}</text
          ><text>记录时间 {{ subscriptionConsent.occurredAt }}</text></view
        ><view v-else class="subscription-empty"
          ><view class="subscription-bell"><view></view></view><text>暂无服务端订阅授权记录</text
          ><text
            >首次授权必须绑定已发布政策版本与微信侧订阅结果，因此此处不提供伪造开关。</text
          ></view
        ><button
          v-if="subscriptionConsent?.status === 'GRANTED'"
          class="danger"
          :loading="busy"
          @click="withdrawConsent(subscriptionConsent)"
        >
          撤回订阅消息授权
        </button></view
      ></view
    >

    <view
      v-if="
        merchantContext &&
        ['258', '262', '264'].includes(pageId) &&
        ['ready', 'empty'].includes(state)
      "
      class="support-surface"
      ><view class="support-summary"
        ><view class="support-mark"><view></view></view
        ><view
          ><text>{{
            pageId === '258' ? '生活助手会话' : pageId === '264' ? '我的人工工单' : '商户客服会话'
          }}</text
          ><text>当前商户与门店范围已验证</text></view
        ><text>{{ records.length }} 条</text></view
      ><view class="context-note support-context-note"
        >仅展示当前商户和门店下由服务端授权的会话；人工接管与工单状态保持同源。</view
      ><scroll-view v-if="records.length" class="conversation-filters" scroll-x
        ><button
          v-for="filter in conversationFilters"
          :key="filter[0]"
          size="mini"
          :class="{ active: conversationFilter === filter[0] }"
          @click="conversationFilter = filter[0]"
        >
          {{ filter[1] }}
        </button></scroll-view
      ><view v-if="!records.length" class="privacy-note blue">{{
        pageId === '264' ? '当前商户暂无人工工单。' : '当前商户暂无可查看的历史会话。'
      }}</view
      ><view v-else-if="!visibleConversations.length" class="privacy-note blue"
        >当前筛选条件下没有会话。</view
      ><view
        v-for="conversation in visibleConversations"
        :key="conversation.id"
        class="support-conversation-card"
        ><view class="support-conversation-copy" @click="openConversation(conversation)"
          ><view
            ><text>{{ conversation.ticket?.id || conversation.id }}</text
            ><text>{{ conversationStatusLabel(conversation.status) }}</text></view
          ><text
            >{{ conversation.riskLevel }} ·
            {{
              conversation.ticket ? ticketStatusLabel(conversation.ticket.status) : '暂无人工工单'
            }}</text
          ><text>更新于 {{ conversation.updatedAt }}</text
          ><text v-if="conversation.ticket?.dueAt"
            >处理时限 {{ conversation.ticket.dueAt }}</text
          ></view
        ><button
          class="support-open-button"
          size="mini"
          :loading="busy"
          @click="openConversation(conversation)"
        >
          查看
        </button></view
      ><view v-if="selectedConversation" class="conversation-detail"
        ><view class="section-head"
          ><text>会话 {{ selectedConversation.id }}</text
          ><text>{{ conversationStatusLabel(selectedConversation.status) }}</text></view
        ><view v-if="selectedConversation.ticket" class="ticket-facts"
          ><text>工单 {{ selectedConversation.ticket.id }}</text
          ><text>{{ ticketStatusLabel(selectedConversation.ticket.status) }}</text
          ><text>{{ selectedConversation.ticket.priority }}</text></view
        ><view class="message-list"
          ><view v-for="message in messages" :key="message.id" class="message-card"
            ><view class="message-meta"
              ><text>{{ senderLabel(message) }}</text
              ><text>{{ message.createdAt }}</text></view
            ><text>{{
              messageContents[message.id] || message.contentPreviewRedacted || '正文已受保护'
            }}</text
            ><button
              v-if="!messageContents[message.id]"
              size="mini"
              :loading="busy"
              @click="readMessageContent(message)"
            >
              读取正文
            </button></view
          ></view
        ><view v-if="selectedConversation.status !== 'CLOSED'" class="message-composer">
          <textarea
            v-model="messageDraft"
            class="field textarea"
            maxlength="1000"
            placeholder="输入要发送给当前商户客服的消息"
          /><view class="conversation-actions"
            ><button class="primary" :loading="busy" @click="sendConversationMessage">
              发送消息</button
            ><button
              v-if="selectedConversation.status === 'BOT_ACTIVE'"
              class="secondary"
              :loading="busy"
              @click="requestConversationHuman"
            >
              转人工
            </button></view
          ></view
        ></view
      ></view
    >

    <view v-if="pageId === '219' && state === 'ready'" class="map-surface">
      <view class="map-summary">
        <view class="map-pin"><view></view></view>
        <view
          ><text>附近服务门店</text><text>{{ records.length }} 家门店已接入实时主档</text></view
        >
        <text>地图导航</text>
      </view>
      <view class="map-grid">
        <view v-for="store in records" :key="store.id" class="map-card">
          <view class="map-photo"><view class="map-photo-pin"></view></view>
          <view class="map-card-copy">
            <view
              ><text>{{ store.name }}</text
              ><text>{{ store.productCount }} 件在售</text></view
            >
            <text>{{ store.cityCode || '城市未标注' }} · 门店服务范围</text>
            <text>{{
              store.latitude === null || store.longitude === null
                ? '坐标尚未核验'
                : '坐标来自门店主档，可直接导航'
            }}</text>
          </view>
          <button size="mini" @click="openStore(store)">去这里</button>
        </view>
      </view>
    </view>
    <view v-if="pageId === '242' && ['ready', 'empty'].includes(state)" class="voucher-surface">
      <view class="voucher-summary">
        <text>我的待使用券</text>
        <text>{{ credentialSummary.remaining }}<text> 次可核销</text></text>
        <view>
          <text>{{ credentialSummary.count }} 张券</text>
          <text>{{ credentialSummary.available }} 张可用</text>
          <text>状态实时同步</text>
        </view>
      </view>
      <view class="voucher-guide">
        <view
          ><text>使用说明</text><text>适用门店、有效期和剩余次数均以服务端签发结果为准</text></view
        >
        <button size="mini" @click="showGuide = true">查看规则</button>
      </view>
      <view v-if="records.length" class="credential-grid"
        ><view v-for="token in records" :key="token.entitlementId" class="credential-card"
          ><view
            ><view class="voucher-state"
              ><text>{{ token.remainingUses > 0 ? '可使用' : '已用完' }}</text
              ><text>{{ token.status }}</text></view
            ><text>订单 {{ token.orderId }}</text
            ><text
              >剩余 {{ token.remainingUses }} 次 · {{ token.validUntil || '有效期未标注' }}</text
            ></view
          ><button size="mini" :disabled="token.remainingUses < 1" @click="copyToken(token)">
            出示券码
          </button></view
        ></view
      >
      <view v-else class="voucher-empty"
        ><text>当前没有待使用券</text
        ><text>购买到店团购并由服务端确认支付后，可在这里查看核销凭证</text></view
      >
    </view>
    <view v-if="pageId === '243' && state === 'ready'" class="verification-result-surface">
      <view class="verification-summary">
        <view class="verification-seal"><view></view></view>
        <view><text>服务端核销结果</text><text>订单凭证与剩余次数实时同步</text></view>
        <text>{{ credentialSummary.remaining }} 次</text>
      </view>
      <view class="credential-grid verification-grid">
        <view v-for="token in records" :key="token.entitlementId" class="credential-card">
          <view>
            <view class="voucher-state"
              ><text>{{ token.remainingUses > 0 ? '仍可使用' : '核销完成' }}</text
              ><text>{{ token.status }}</text></view
            >
            <text>订单 {{ token.orderId }}</text>
            <text
              >剩余 {{ token.remainingUses }} 次 · {{ token.validUntil || '有效期未标注' }}</text
            >
          </view>
          <button size="mini" :disabled="token.remainingUses < 1" @click="copyToken(token)">
            复制凭证
          </button>
        </view>
      </view>
      <view class="verification-note">核销状态、有效期和剩余次数均以当前服务端签发记录为准</view>
    </view>
    <view v-if="pageId === '245' && detail" class="aftercare-apply-surface"
      ><view class="aftercare-order-summary"
        ><view class="aftercare-mark"><view></view></view
        ><view
          ><text>订单 {{ detail.orderNumber || detail.orderNo || detail.id }}</text
          ><text>可申请项目由服务端订单快照计算</text></view
        ><text>{{ detail.status }}</text></view
      ><view class="aftercare-money-grid"
        ><view
          ><text>已支付</text><text>{{ money(detail.paidAmountCents) }}</text></view
        ><view
          ><text>已退款</text><text>{{ money(detail.refundedAmountCents) }}</text></view
        ><view
          ><text>履约状态</text><text>{{ detail.fulfillmentStatus }}</text></view
        ></view
      ><view v-if="detail.items?.length" class="aftercare-items"
        ><view class="section-head"
          ><text>申请商品</text><text>{{ detail.items.length }} 项</text></view
        ><view v-for="item in detail.items" :key="item.id"
          ><view
            ><text>{{ item.title }}</text
            ><text>购买 {{ item.quantity }} · 已退 {{ item.refundedQuantity || 0 }}</text></view
          ><text>{{ money(item.lineAmountCents) }}</text></view
        ></view
      ><view class="aftercare-form"
        ><view class="section-head"><text>申请信息</text><text>提交前请核对</text></view
        ><view class="aftercare-note"
          >申请范围和金额由服务端按订单快照重新计算；客户端不会直接改变支付、履约或退款状态。</view
        >
        <picker
          :range="[
            'UNSHIPPED_REFUND',
            'RETURN_REFUND',
            'UNUSED_GROUP_BUY_REFUND',
            'SERVICE_DISPUTE',
            'OTHER',
          ]"
          @change="
            refundDraft.requestType = [
              'UNSHIPPED_REFUND',
              'RETURN_REFUND',
              'UNUSED_GROUP_BUY_REFUND',
              'SERVICE_DISPUTE',
              'OTHER',
            ][$event.detail.value]
          "
          ><view class="field select-field"
            ><text>申请类型</text><text>{{ refundDraft.requestType }}</text></view
          ></picker
        ><input
          v-model="refundDraft.reasonCode"
          class="field"
          maxlength="120"
          placeholder="原因代码"
        /><textarea
          v-model="refundDraft.description"
          class="field textarea"
          maxlength="2000"
          placeholder="补充说明（可选）"
        /><button class="danger aftercare-submit" :loading="busy" @click="submitRefund">
          确认提交售后申请
        </button></view
      ></view
    >
    <view v-if="pageId === '246' && state === 'ready'" class="aftercare-detail-surface"
      ><view class="aftercare-summary"
        ><text>售后记录</text><text>{{ records.length }}</text
        ><text>审批与渠道状态均来自服务端</text></view
      ><view class="aftercare-grid"
        ><view v-for="item in records" :key="item.id" class="aftercare-card"
          ><view
            ><text>{{ item.refundNo || item.id }}</text
            ><text>{{ item.status }}</text></view
          ><text>{{ item.reasonCode }}</text>
          <view
            ><text>{{ money(item.amountCents) }}</text
            ><text>渠道结果以服务端为准</text></view
          ></view
        ></view
      ></view
    >
    <view
      v-if="pageId === '248' && ['ready', 'empty'].includes(state)"
      class="account-manage-surface"
      ><view class="account-safe-banner"
        ><view class="safe-mark"></view
        ><view
          ><text>地址安全保护</text
          ><text>仅在当前消费者鉴权后解密，历史订单保留地址快照</text></view
        ></view
      ><view class="account-list-head"
        ><text>已保存地址</text><text>{{ records.length }} 个</text></view
      >
      <view v-for="item in records" :key="item.id" class="address-card"
        ><view
          ><view
            ><text>{{ item.recipientName }}</text
            ><text>{{ item.mobile }}</text></view
          ><text>{{ item.addressLine }}</text
          ><text>{{ item.isDefault ? '默认地址' : '配送地址' }}</text></view
        ><button size="mini" @click="archiveAddress(item.id)">归档</button></view
      ><view class="form account-form-panel"
        ><view class="section-head"><text>新增配送地址</text><text>加密保存</text></view
        ><input
          v-model="addressDraft.recipientName"
          class="field"
          maxlength="80"
          placeholder="收件人"
        /><input
          v-model="addressDraft.mobile"
          class="field"
          type="number"
          maxlength="11"
          placeholder="手机号"
        /><view class="triple"
          ><input
            v-model="addressDraft.provinceCode"
            class="field"
            maxlength="20"
            placeholder="省代码" /><input
            v-model="addressDraft.cityCode"
            class="field"
            maxlength="20"
            placeholder="市代码" /><input
            v-model="addressDraft.districtCode"
            class="field"
            maxlength="20"
            placeholder="区代码" /></view
        ><input
          v-model="addressDraft.addressLine"
          class="field"
          maxlength="300"
          placeholder="详细地址"
        /><label class="check"
          ><checkbox
            :checked="addressDraft.isDefault"
            @click="addressDraft.isDefault = !addressDraft.isDefault"
          />设为默认</label
        ><button class="primary" :loading="busy" @click="saveAddress">保存新地址</button></view
      ></view
    >
    <view
      v-if="pageId === '250' && ['ready', 'empty'].includes(state)"
      class="account-manage-surface"
      ><view class="account-safe-banner blue"
        ><view class="safe-mark"></view
        ><view
          ><text>发票信息保护</text><text>抬头与税号加密保存，归档不删除历史开票引用</text></view
        ></view
      ><view class="account-list-head"
        ><text>发票抬头</text><text>{{ records.length }} 个</text></view
      >
      <view v-for="item in records" :key="item.id" class="invoice-card"
        ><view
          ><text>{{ item.title }}</text
          ><text
            >{{ item.profileType === 'ENTERPRISE' ? '企业抬头' : '个人抬头' }} ·
            {{ item.taxIdentifier || '无税号' }}</text
          ><text>{{ item.isDefault ? '默认抬头' : '普通抬头' }}</text></view
        ><button size="mini" @click="archiveInvoice(item.id)">归档</button></view
      ><view class="form account-form-panel"
        ><view class="section-head"><text>新增发票抬头</text><text>加密保存</text></view
        ><picker
          :range="['PERSONAL', 'ENTERPRISE']"
          @change="invoiceDraft.profileType = ['PERSONAL', 'ENTERPRISE'][$event.detail.value]"
          ><view class="field select-field"
            ><text>抬头类型</text
            ><text>{{
              invoiceDraft.profileType === 'ENTERPRISE' ? '企业抬头' : '个人抬头'
            }}</text></view
          ></picker
        ><input
          v-model="invoiceDraft.title"
          class="field"
          maxlength="200"
          placeholder="发票抬头"
        /><input
          v-if="invoiceDraft.profileType === 'ENTERPRISE'"
          v-model="invoiceDraft.taxIdentifier"
          class="field"
          maxlength="80"
          placeholder="纳税人识别号"
        /><input
          v-model="invoiceDraft.email"
          class="field"
          maxlength="255"
          placeholder="接收邮箱（可选）"
        /><label class="check"
          ><checkbox
            :checked="invoiceDraft.isDefault"
            @click="invoiceDraft.isDefault = !invoiceDraft.isDefault"
          />设为默认</label
        ><button class="primary" :loading="busy" @click="saveInvoice">保存抬头</button></view
      ></view
    >
    <view v-if="pageId === '252' && ['ready', 'empty'].includes(state)" class="reward-surface">
      <view class="reward-summary">
        <text>当前可用消费奖励</text>
        <text>{{ money(rewardSummary.available) }}</text>
        <view>
          <view
            ><text>{{ money(rewardSummary.original) }}</text
            ><text>累计原额</text></view
          >
          <view
            ><text>{{ money(rewardSummary.redeemed) }}</text
            ><text>累计兑付</text></view
          >
          <view
            ><text>{{ money(rewardSummary.reversed) }}</text
            ><text>累计冲正</text></view
          >
        </view>
      </view>
      <view class="reward-explain">
        <view
          ><text>金额如何理解</text
          ><text>原额、兑付、冲正与当前可用额来自独立账本，不以页面自行计算代替</text></view
        >
        <button size="mini" @click="showGuide = true">说明</button>
      </view>
      <view v-if="records.length" class="ledger-grid"
        ><view v-for="item in records" :key="item.id" class="ledger-card"
          ><view
            ><view class="ledger-title"
              ><text>消费奖励</text><text>{{ item.ruleVersion || '规则版本未标注' }}</text></view
            ><text
              >原额 {{ money(item.originalAmountCents) }} · 已兑
              {{ money(item.redeemedAmountCents) }} · 冲正
              {{ money(item.reversedAmountCents) }}</text
            ></view
          ><view class="ledger-balance"
            ><text>当前可用</text><text>{{ money(item.availableAmountCents) }}</text></view
          ></view
        >
      </view>
      <view v-else class="voucher-empty"
        ><text>暂无消费奖励明细</text><text>奖励记录产生后会按服务端账本状态展示在这里</text></view
      >
    </view>
    <view v-if="pageId === '259' && state === 'ready'" class="order-tools-surface"
      ><view class="order-tools-summary"
        ><view class="order-tools-mark"><view></view></view
        ><view><text>订单与售后工具</text><text>从真实订单进入售后或当前商户客服</text></view
        ><text>{{ records.length }} 笔</text></view
      ><view v-for="order in records" :key="order.id" class="order-tool-card"
        ><view class="order-tool-copy" @click="go('238', { orderId: order.id })"
          ><view
            ><text>{{ order.storeName || '商家订单' }}</text
            ><text>{{ order.status }}</text></view
          ><text>{{ order.orderNumber || order.orderNo || order.id }}</text
          ><text>查看订单详情与服务端履约状态</text></view
        ><view class="order-tool-actions"
          ><button size="mini" @click="go('245', { orderId: order.id })">售后</button
          ><button
            size="mini"
            @click="
              go('262', {
                merchantTenantId: order.merchantTenantId,
                storeId: order.storeId,
                orderId: order.id,
              })
            "
          >
            客服
          </button></view
        ></view
      ></view
    >
    <text v-if="notice" class="notice section">{{ notice }}</text>
    <view v-if="showGuide" class="guide-overlay" @click="showGuide = false">
      <view class="guide-panel" @click.stop>
        <view class="guide-heading"
          ><text>{{ pageId === '242' ? '团购券使用规则' : '消费奖励说明' }}</text
          ><button @click="showGuide = false">关闭</button></view
        >
        <template v-if="pageId === '242'">
          <view class="guide-item"
            ><text>1</text
            ><view
              ><text>何时可以使用</text
              ><text
                >仅当支付及凭证状态经服务端确认、剩余次数大于零且仍在有效期内时可使用。</text
              ></view
            ></view
          >
          <view class="guide-item"
            ><text>2</text
            ><view
              ><text>在哪里使用</text
              ><text
                >券码只能在服务端记录的适用门店核销，不向无关门店或个人发送完整凭证。</text
              ></view
            ></view
          >
          <view class="guide-item"
            ><text>3</text
            ><view
              ><text>退款与失效</text
              ><text
                >退款、撤销或过期后的状态以订单和核销服务端结果为准，页面不会保留虚假的可用状态。</text
              ></view
            ></view
          >
        </template>
        <template v-else>
          <view class="guide-item"
            ><text>1</text
            ><view
              ><text>原额</text
              ><text>奖励产生时记录的原始金额，保留对应规则版本和业务来源。</text></view
            ></view
          >
          <view class="guide-item"
            ><text>2</text
            ><view
              ><text>兑付与冲正</text
              ><text>已经使用的金额单独记为兑付；退款或异常产生的反向金额单独记为冲正。</text></view
            ></view
          >
          <view class="guide-item"
            ><text>3</text
            ><view
              ><text>当前可用</text
              ><text>以服务端独立账本返回的可用额为准，客户端不根据展示字段重新推算。</text></view
            ></view
          >
        </template>
        <button class="guide-confirm" @click="showGuide = false">我知道了</button>
      </view>
    </view>
  </LifeSurface>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--life-line);
}
.row > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}
.row view text:first-child {
  font-size: 25rpx;
  font-weight: 800;
}
.row view text:not(:first-child),
.notice,
.boundary > text {
  color: var(--life-muted);
  font-size: 21rpx;
  line-height: 1.7;
}
.row > text {
  color: var(--life-brand);
  font-size: 22rpx;
  font-weight: 800;
}
.row button {
  margin: 0;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  border-radius: 999rpx;
  font-size: 20rpx;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-top: 28rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid var(--life-line);
}
.field {
  box-sizing: border-box;
  width: 100%;
  padding: 20rpx;
  border: 1rpx solid var(--life-line);
  border-radius: 18rpx;
  background: var(--life-wash);
  font-size: 22rpx;
}
.textarea {
  min-height: 150rpx;
}
.triple {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}
.check {
  color: var(--life-ink-soft);
  font-size: 22rpx;
}
.facts {
  display: flex;
  gap: 10rpx;
  flex-wrap: wrap;
  margin: 18rpx 0;
}
.facts text {
  padding: 10rpx 14rpx;
  border-radius: 999rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 20rpx;
}
.primary,
.secondary,
.danger {
  margin-top: 18rpx;
  border-radius: 999rpx;
  font-size: 23rpx;
  font-weight: 800;
}
.consent-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
}
.consent-actions button {
  width: 100%;
}
.support-surface {
  display: grid;
  margin-top: 20rpx;
  gap: 14rpx;
}
.support-summary {
  display: flex;
  padding: 24rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  gap: 16rpx;
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-blue-deep), var(--life-blue-ink));
  box-shadow: var(--life-shadow);
}
.support-mark {
  display: flex;
  width: 58rpx;
  height: 48rpx;
  border: 3rpx solid var(--life-paper);
  border-radius: 19rpx;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  box-sizing: border-box;
}
.support-mark::after {
  position: absolute;
  width: 10rpx;
  height: 10rpx;
  margin: 48rpx 0 0 -25rpx;
  border-bottom: 3rpx solid var(--life-paper);
  border-left: 3rpx solid var(--life-paper);
  transform: skew(-25deg);
  content: '';
}
.support-mark view {
  width: 24rpx;
  height: 4rpx;
  border-radius: 99rpx;
  background: var(--life-paper);
  box-shadow:
    0 -9rpx 0 var(--life-paper),
    0 9rpx 0 var(--life-paper);
}
.support-summary > view:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
}
.support-summary > view:nth-child(2) text:first-child {
  font-size: 24rpx;
  font-weight: 900;
}
.support-summary > view:nth-child(2) text:last-child {
  opacity: 0.82;
  font-size: 15rpx;
}
.support-summary > text {
  flex: 0 0 auto;
  font-size: 17rpx;
  font-weight: 900;
}
.support-context-note {
  margin: 0;
}
.support-conversation-card {
  display: flex;
  padding: 18rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  align-items: center;
  gap: 13rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.support-conversation-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5rpx;
}
.support-conversation-copy > view {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.support-conversation-copy > view text:first-child {
  overflow: hidden;
  font-size: 18rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.support-conversation-copy > view text:last-child {
  flex: 0 0 auto;
  color: var(--life-brand-deep);
  font-size: 14rpx;
  font-weight: 800;
}
.support-conversation-copy > text {
  overflow: hidden;
  color: var(--life-muted);
  font-size: 14rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.support-open-button {
  margin: 0;
  flex: 0 0 auto;
  border-radius: 999rpx;
  color: var(--life-paper);
  background: var(--life-brand);
  font-size: 14rpx;
}
.conversation-detail {
  padding: 20rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.conversation-filters {
  width: 100%;
  margin: 8rpx 0 16rpx;
  white-space: nowrap;
}
.conversation-filters button {
  display: inline-block;
  width: auto;
  margin: 0 10rpx 0 0;
  border-radius: 999rpx;
  color: var(--life-muted);
  background: var(--life-bg);
  font-size: 18rpx;
}
.conversation-filters button.active {
  color: var(--life-paper);
  background: var(--life-brand);
}
.ticket-facts,
.conversation-actions {
  display: flex;
  gap: 10rpx;
  flex-wrap: wrap;
}
.ticket-facts text {
  padding: 9rpx 13rpx;
  border-radius: 999rpx;
  color: var(--life-yellow-ink);
  background: var(--life-yellow-soft);
  font-size: 18rpx;
}
.message-list {
  display: grid;
  margin-top: 18rpx;
  gap: 12rpx;
}
.message-card {
  display: grid;
  gap: 10rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  background: var(--life-bg);
  color: var(--life-ink);
  font-size: 21rpx;
  line-height: 1.6;
}
.message-card button {
  margin: 0;
  justify-self: start;
}
.message-meta {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
  color: var(--life-muted);
  font-size: 17rpx;
}
.message-composer {
  margin-top: 18rpx;
}
.conversation-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
}
.conversation-actions button {
  width: 100%;
}
@media (max-width: 520px) {
  .consent-actions,
  .conversation-actions {
    grid-template-columns: 1fr;
  }
}
.primary {
  color: var(--life-paper);
  background: var(--life-brand-deep);
}
.secondary {
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
}
.danger {
  color: var(--life-coral-ink);
  background: var(--life-coral-soft);
}
.notice {
  display: block;
}
.context-note {
  display: block;
  margin: 14rpx 0;
  color: var(--life-muted);
  font-size: 21rpx;
  line-height: 1.7;
}
.row-actions {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 8rpx;
}
.row-actions button {
  margin: 0;
}
.boundary {
  border: 1rpx solid var(--life-line);
}
.boundary .section-head text:last-child {
  color: var(--life-coral-ink);
}
.credential-grid {
  display: grid;
  margin-top: 20rpx;
  gap: 14rpx;
}
.voucher-surface,
.reward-surface {
  display: grid;
  margin-top: 20rpx;
  gap: 18rpx;
}
.voucher-summary,
.reward-summary {
  padding: 32rpx;
  border-radius: var(--life-radius-lg);
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-coral), var(--life-red));
  box-shadow: var(--life-shadow);
}
.reward-summary {
  background: linear-gradient(135deg, var(--life-brand), var(--life-brand-deep));
}
.voucher-summary > text:first-child,
.reward-summary > text:first-child {
  display: block;
  font-size: 21rpx;
  opacity: 0.86;
}
.voucher-summary > text:nth-child(2),
.reward-summary > text:nth-child(2) {
  display: block;
  margin: 8rpx 0 24rpx;
  font-size: 52rpx;
  font-weight: 900;
}
.voucher-summary > text:nth-child(2) text {
  font-size: 21rpx;
}
.voucher-summary > view,
.reward-summary > view {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}
.voucher-summary > view > text,
.reward-summary > view > view {
  padding: 14rpx 8rpx;
  border-radius: 16rpx;
  background: var(--life-glass);
  font-size: 18rpx;
  text-align: center;
}
.reward-summary > view > view {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.reward-summary > view view text:first-child {
  font-size: 22rpx;
  font-weight: 900;
}
.reward-summary > view view text:last-child {
  font-size: 15rpx;
  opacity: 0.8;
}
.voucher-guide,
.reward-explain {
  display: flex;
  padding: 22rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  align-items: center;
  gap: 18rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-card);
}
.voucher-guide > view,
.reward-explain > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6rpx;
}
.voucher-guide view text:first-child,
.reward-explain view text:first-child {
  font-size: 23rpx;
  font-weight: 900;
}
.voucher-guide view text:last-child,
.reward-explain view text:last-child {
  color: var(--life-muted);
  font-size: 17rpx;
  line-height: 1.5;
}
.voucher-guide button,
.reward-explain button {
  margin: 0;
  border-radius: 999rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 17rpx;
}
.voucher-state,
.ledger-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.voucher-state text,
.ledger-title text:last-child {
  padding: 5rpx 10rpx;
  border-radius: 999rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 15rpx;
  font-weight: 800;
}
.voucher-state text:last-child {
  color: var(--life-muted);
  background: var(--life-bg);
}
.voucher-empty {
  display: flex;
  min-height: 220rpx;
  padding: 30rpx;
  border: 2rpx dashed var(--life-line);
  border-radius: var(--life-radius-md);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12rpx;
  color: var(--life-muted);
  background: var(--life-paper);
  text-align: center;
}
.voucher-empty text:first-child {
  color: var(--life-ink);
  font-size: 25rpx;
  font-weight: 900;
}
.voucher-empty text:last-child {
  font-size: 18rpx;
  line-height: 1.6;
}
.guide-overlay {
  position: fixed;
  z-index: 80;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: var(--life-overlay);
}
.guide-panel {
  width: 100%;
  padding: 30rpx 28rpx calc(30rpx + env(safe-area-inset-bottom));
  border-radius: 38rpx 38rpx 0 0;
  background: var(--life-paper);
  box-sizing: border-box;
}
.guide-heading {
  display: flex;
  margin-bottom: 20rpx;
  align-items: center;
  justify-content: space-between;
}
.guide-heading > text {
  font-size: 31rpx;
  font-weight: 900;
}
.guide-heading button {
  width: auto;
  margin: 0;
  border-radius: 999rpx;
  color: var(--life-muted);
  background: var(--life-bg);
  font-size: 17rpx;
}
.guide-item {
  display: grid;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--life-line);
  grid-template-columns: 46rpx 1fr;
  gap: 16rpx;
}
.guide-item > text {
  display: flex;
  width: 42rpx;
  height: 42rpx;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  color: var(--life-paper);
  background: var(--life-brand);
  font-size: 18rpx;
  font-weight: 900;
}
.guide-item > view {
  display: flex;
  flex-direction: column;
  gap: 7rpx;
}
.guide-item view text:first-child {
  font-size: 23rpx;
  font-weight: 900;
}
.guide-item view text:last-child {
  color: var(--life-muted);
  font-size: 19rpx;
  line-height: 1.65;
}
.guide-confirm {
  margin-top: 26rpx;
  border-radius: 999rpx;
  color: var(--life-paper);
  background: var(--life-brand);
  font-size: 23rpx;
  font-weight: 900;
}
.credential-card {
  display: flex;
  padding: 24rpx;
  border-radius: var(--life-radius-md);
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  background: linear-gradient(135deg, var(--life-yellow-soft), var(--life-paper));
  box-shadow: var(--life-shadow-soft);
}
.credential-card > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}
.credential-card view text:first-child {
  font-size: 23rpx;
  font-weight: 900;
}
.credential-card view text:last-child {
  color: var(--life-muted);
  font-size: 18rpx;
  line-height: 1.5;
}
.credential-card button {
  margin: 0;
  border-radius: 999rpx;
  color: var(--life-yellow-ink);
  background: var(--life-yellow);
  font-size: 18rpx;
}
.privacy-note {
  margin-bottom: 16rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 17rpx;
  line-height: 1.55;
}
.consent-surface,
.order-tools-surface {
  display: grid;
  margin-top: 20rpx;
  gap: 16rpx;
}
.privacy-summary,
.order-tools-summary {
  display: flex;
  padding: 24rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  gap: 16rpx;
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-brand), var(--life-brand-deep));
  box-shadow: var(--life-shadow);
}
.privacy-summary.subscription {
  background: linear-gradient(135deg, var(--life-blue-deep), var(--life-blue-ink));
}
.privacy-shield {
  display: flex;
  width: 56rpx;
  height: 64rpx;
  border: 3rpx solid var(--life-paper);
  border-radius: 25rpx 25rpx 32rpx 32rpx;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  box-sizing: border-box;
}
.privacy-shield view {
  width: 13rpx;
  height: 22rpx;
  border-right: 5rpx solid var(--life-paper);
  border-bottom: 5rpx solid var(--life-paper);
  transform: rotate(45deg) translate(-3rpx, -3rpx);
}
.privacy-summary > view:nth-child(2),
.order-tools-summary > view:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
}
.privacy-summary > view:nth-child(2) text:first-child,
.order-tools-summary > view:nth-child(2) text:first-child {
  font-size: 24rpx;
  font-weight: 900;
}
.privacy-summary > view:nth-child(2) text:last-child,
.order-tools-summary > view:nth-child(2) text:last-child {
  opacity: 0.82;
  font-size: 15rpx;
}
.privacy-summary > text,
.order-tools-summary > text {
  flex: 0 0 auto;
  font-size: 17rpx;
  font-weight: 900;
}
.consent-trust-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10rpx;
}
.consent-trust-grid > view {
  display: flex;
  min-width: 0;
  padding: 16rpx 6rpx;
  border-radius: 17rpx;
  align-items: center;
  flex-direction: column;
  gap: 5rpx;
  background: var(--life-brand-soft);
}
.consent-trust-grid text:first-child {
  overflow: hidden;
  max-width: 100%;
  color: var(--life-brand-deep);
  font-size: 17rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.consent-trust-grid text:last-child {
  color: var(--life-muted);
  font-size: 13rpx;
}
.privacy-context-note {
  margin: 0;
}
.privacy-fact-list,
.subscription-state {
  display: grid;
  gap: 13rpx;
}
.privacy-fact-card {
  display: flex;
  padding: 18rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  align-items: center;
  gap: 13rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.privacy-fact-mark {
  width: 39rpx;
  height: 39rpx;
  border: 8rpx solid var(--life-brand-soft);
  border-radius: 50%;
  box-sizing: border-box;
  flex: 0 0 auto;
  background: var(--life-brand);
}
.privacy-fact-card > view:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3rpx;
}
.privacy-fact-card > view:nth-child(2) text:first-child {
  font-size: 18rpx;
  font-weight: 900;
}
.privacy-fact-card > view:nth-child(2) text:not(:first-child) {
  overflow: hidden;
  color: var(--life-muted);
  font-size: 14rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.privacy-fact-card > text {
  flex: 0 0 auto;
  color: var(--life-brand-deep);
  font-size: 14rpx;
  font-weight: 800;
}
.subscription-record,
.subscription-empty {
  display: grid;
  padding: 22rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  gap: 7rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.subscription-record > view {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
}
.subscription-record > view text:first-child,
.subscription-empty > text:nth-child(2) {
  font-size: 20rpx;
  font-weight: 900;
}
.subscription-record > view text:last-child {
  color: var(--life-brand-deep);
  font-size: 16rpx;
  font-weight: 800;
}
.subscription-record > text,
.subscription-empty > text:last-child {
  color: var(--life-muted);
  font-size: 15rpx;
  line-height: 1.55;
}
.subscription-empty {
  justify-items: center;
  text-align: center;
}
.subscription-bell {
  position: relative;
  width: 48rpx;
  height: 48rpx;
  border: 4rpx solid var(--life-blue-ink);
  border-radius: 25rpx 25rpx 12rpx 12rpx;
  box-sizing: border-box;
}
.subscription-bell view {
  position: absolute;
  right: 13rpx;
  bottom: -10rpx;
  width: 13rpx;
  height: 7rpx;
  border-radius: 0 0 9rpx 9rpx;
  background: var(--life-blue-ink);
}
.order-tools-summary {
  background: linear-gradient(135deg, var(--life-blue-deep), var(--life-blue-ink));
}
.order-tools-mark {
  display: flex;
  width: 56rpx;
  height: 56rpx;
  border: 3rpx solid var(--life-paper);
  border-radius: 16rpx;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  box-sizing: border-box;
}
.order-tools-mark view {
  width: 24rpx;
  height: 18rpx;
  border-bottom: 5rpx solid var(--life-paper);
  border-left: 5rpx solid var(--life-paper);
  transform: rotate(-45deg) translate(2rpx, -2rpx);
}
.order-tool-card {
  display: flex;
  padding: 19rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  align-items: center;
  gap: 14rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.order-tool-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5rpx;
}
.order-tool-copy > view {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
}
.order-tool-copy > view text:first-child {
  overflow: hidden;
  font-size: 19rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-tool-copy > view text:last-child {
  color: var(--life-brand-deep);
  font-size: 14rpx;
}
.order-tool-copy > text {
  overflow: hidden;
  color: var(--life-muted);
  font-size: 14rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-tool-actions {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 7rpx;
}
.order-tool-actions button {
  margin: 0;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 14rpx;
}
.privacy-note.blue {
  color: var(--life-blue-ink);
  background: var(--life-blue-soft);
}
.account-record {
  padding: 18rpx;
  border: 1rpx solid var(--life-line);
  border-radius: 18rpx;
  background: var(--life-paper);
}
.boundary-facts {
  display: grid;
  margin-top: 18rpx;
  gap: 8rpx;
}
.boundary-facts text {
  padding: 12rpx 16rpx;
  border-radius: 14rpx;
  color: var(--life-muted);
  background: var(--life-bg);
  font-size: 17rpx;
}
.map-grid,
.aftercare-grid,
.ledger-grid {
  display: grid;
  margin-top: 20rpx;
  gap: 14rpx;
}
.map-surface,
.verification-result-surface {
  display: grid;
  margin-top: 20rpx;
  gap: 16rpx;
}
.map-summary,
.verification-summary {
  display: flex;
  padding: 24rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  gap: 16rpx;
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-blue-deep), var(--life-blue-ink));
  box-shadow: var(--life-shadow);
}
.map-pin,
.verification-seal {
  display: flex;
  width: 58rpx;
  height: 58rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.6);
  border-radius: 50% 50% 50% 10rpx;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  transform: rotate(-45deg);
  background: rgba(255, 255, 255, 0.16);
}
.map-pin view,
.verification-seal view {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  transform: rotate(45deg);
  background: var(--life-paper);
}
.map-summary > view:nth-child(2),
.verification-summary > view:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5rpx;
}
.map-summary > view:nth-child(2) text:first-child,
.verification-summary > view:nth-child(2) text:first-child {
  font-size: 25rpx;
  font-weight: 900;
}
.map-summary > view:nth-child(2) text:last-child,
.verification-summary > view:nth-child(2) text:last-child {
  opacity: 0.82;
  font-size: 16rpx;
}
.map-summary > text,
.verification-summary > text {
  font-size: 18rpx;
  font-weight: 800;
}
.map-card {
  display: flex;
  overflow: hidden;
  padding: 14rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  align-items: center;
  gap: 14rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.map-photo {
  display: flex;
  position: relative;
  width: 94rpx;
  height: 94rpx;
  overflow: hidden;
  border-radius: 19rpx;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  background:
    linear-gradient(35deg, transparent 48%, rgba(255, 255, 255, 0.7) 49% 53%, transparent 54%),
    linear-gradient(145deg, var(--life-blue-soft), var(--life-blue-bright));
}
.map-photo::before,
.map-photo::after {
  position: absolute;
  background: rgba(7, 93, 112, 0.2);
  content: '';
}
.map-photo::before {
  width: 120%;
  height: 12rpx;
  transform: rotate(-24deg);
}
.map-photo::after {
  width: 12rpx;
  height: 120%;
  transform: rotate(20deg);
}
.map-photo-pin {
  z-index: 1;
  width: 27rpx;
  height: 27rpx;
  border: 7rpx solid var(--life-paper);
  border-radius: 50% 50% 50% 5rpx;
  transform: rotate(-45deg);
  background: var(--life-brand);
  box-shadow: 0 5rpx 12rpx rgba(17, 119, 136, 0.24);
}
.map-card-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5rpx;
}
.map-card-copy > view {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
}
.map-card-copy > view text:first-child {
  overflow: hidden;
  font-size: 22rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.map-card-copy > view text:last-child {
  flex: 0 0 auto;
  color: var(--life-brand-deep);
  font-size: 15rpx;
}
.map-card-copy > text {
  color: var(--life-muted);
  font-size: 15rpx;
}
.map-card button {
  margin: 0;
  border-radius: 999rpx;
  flex: 0 0 auto;
  color: var(--life-paper);
  background: var(--life-brand);
  font-size: 16rpx;
}
.verification-summary {
  background: linear-gradient(135deg, var(--life-coral), var(--life-red));
}
.verification-seal {
  border-radius: 50%;
  transform: none;
}
.verification-seal view {
  width: 25rpx;
  height: 12rpx;
  border: 0;
  border-bottom: 5rpx solid var(--life-paper);
  border-left: 5rpx solid var(--life-paper);
  border-radius: 0;
  transform: rotate(-45deg) translate(2rpx, -2rpx);
  background: transparent;
}
.verification-grid {
  margin-top: 0;
}
.verification-note {
  padding: 17rpx 20rpx;
  border-radius: 16rpx;
  color: var(--life-coral-ink);
  background: var(--life-coral-soft);
  text-align: center;
  font-size: 16rpx;
}
.aftercare-note {
  margin: 18rpx 0;
  padding: 18rpx;
  border-radius: 18rpx;
  color: var(--life-coral-ink);
  background: var(--life-coral-soft);
  font-size: 17rpx;
  line-height: 1.55;
}
.aftercare-apply-surface,
.aftercare-detail-surface,
.account-manage-surface {
  display: grid;
  margin-top: 20rpx;
  gap: 16rpx;
}
.aftercare-order-summary {
  display: flex;
  padding: 22rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  gap: 18rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.aftercare-mark {
  display: flex;
  width: 66rpx;
  height: 66rpx;
  border-radius: 20rpx;
  align-items: center;
  justify-content: center;
  flex: none;
  background: var(--life-coral-soft);
}
.aftercare-mark > view {
  width: 27rpx;
  height: 27rpx;
  border: 5rpx solid var(--life-red);
  border-radius: 50%;
  border-right-color: transparent;
}
.aftercare-order-summary > view:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6rpx;
}
.aftercare-order-summary > view:nth-child(2) text:first-child {
  overflow: hidden;
  font-size: 22rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aftercare-order-summary > view:nth-child(2) text:last-child {
  color: var(--life-muted);
  font-size: 16rpx;
}
.aftercare-order-summary > text:last-child {
  padding: 5rpx 9rpx;
  border-radius: 999rpx;
  color: var(--life-coral-ink);
  background: var(--life-coral-soft);
  font-size: 15rpx;
  font-weight: 800;
}
.aftercare-money-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10rpx;
}
.aftercare-money-grid > view {
  display: flex;
  padding: 17rpx 8rpx;
  border-radius: 16rpx;
  align-items: center;
  flex-direction: column;
  gap: 5rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.aftercare-money-grid text:first-child {
  color: var(--life-muted);
  font-size: 14rpx;
}
.aftercare-money-grid text:last-child {
  color: var(--life-coral-ink);
  font-size: 18rpx;
  font-weight: 900;
}
.aftercare-items,
.aftercare-form,
.account-form-panel {
  padding: 22rpx;
  border-radius: var(--life-radius-lg);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.aftercare-items > view:not(.section-head) {
  display: flex;
  padding: 15rpx 0;
  border-bottom: 1rpx solid var(--life-line);
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.aftercare-items > view:not(.section-head) > view {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5rpx;
}
.aftercare-items > view:not(.section-head) text:first-child {
  font-weight: 900;
}
.aftercare-items > view:not(.section-head) > view text:last-child {
  color: var(--life-muted);
  font-size: 16rpx;
}
.aftercare-items > view:not(.section-head) > text:last-child {
  color: var(--life-red);
  font-weight: 900;
}
.select-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.select-field text:first-child {
  color: var(--life-muted);
}
.select-field text:last-child {
  color: var(--life-brand-deep);
  font-weight: 900;
}
.aftercare-submit {
  width: 100%;
}
.aftercare-summary {
  padding: 28rpx;
  border-radius: var(--life-radius-lg);
  color: var(--life-paper);
  background: linear-gradient(135deg, var(--life-coral), var(--life-red));
  box-shadow: var(--life-shadow);
}
.aftercare-summary > text {
  display: block;
}
.aftercare-summary > text:first-child {
  font-size: 20rpx;
  opacity: 0.86;
}
.aftercare-summary > text:nth-child(2) {
  margin: 4rpx 0;
  font-size: 50rpx;
  font-weight: 900;
}
.aftercare-summary > text:last-child {
  font-size: 17rpx;
  opacity: 0.86;
}
.account-safe-banner {
  display: flex;
  padding: 20rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  gap: 16rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
}
.account-safe-banner.blue {
  color: var(--life-blue-ink);
  background: var(--life-blue-soft);
}
.safe-mark {
  position: relative;
  width: 56rpx;
  height: 56rpx;
  border: 5rpx solid currentColor;
  border-radius: 50% 50% 14rpx 14rpx;
  flex: none;
  box-sizing: border-box;
}
.safe-mark::after {
  position: absolute;
  right: 15rpx;
  bottom: 11rpx;
  width: 15rpx;
  height: 8rpx;
  border-bottom: 4rpx solid currentColor;
  border-left: 4rpx solid currentColor;
  content: '';
  transform: rotate(-45deg);
}
.account-safe-banner > view:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5rpx;
}
.account-safe-banner > view:last-child text:first-child {
  font-size: 22rpx;
  font-weight: 900;
}
.account-safe-banner > view:last-child text:last-child {
  font-size: 16rpx;
  line-height: 1.5;
}
.account-list-head {
  display: flex;
  margin-top: 8rpx;
  align-items: center;
  justify-content: space-between;
  font-size: 24rpx;
  font-weight: 900;
}
.account-list-head text:last-child {
  color: var(--life-muted);
  font-size: 17rpx;
  font-weight: 500;
}
.address-card,
.invoice-card {
  display: flex;
  padding: 20rpx;
  border: 1rpx solid var(--life-line);
  border-radius: var(--life-radius-md);
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.address-card > view,
.invoice-card > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 7rpx;
}
.address-card > view > view {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.address-card > view > view text:first-child,
.invoice-card > view > text:first-child {
  font-size: 23rpx;
  font-weight: 900;
}
.address-card > view > text:nth-child(2),
.invoice-card > view > text:nth-child(2) {
  color: var(--life-muted);
  font-size: 18rpx;
  line-height: 1.5;
}
.address-card > view > text:last-child,
.invoice-card > view > text:last-child {
  align-self: flex-start;
  padding: 4rpx 8rpx;
  border-radius: 999rpx;
  color: var(--life-brand-deep);
  background: var(--life-brand-soft);
  font-size: 14rpx;
}
.address-card button,
.invoice-card button {
  margin: 0;
  border-radius: 999rpx;
  color: var(--life-muted);
  background: var(--life-bg);
  font-size: 16rpx;
}
.aftercare-card,
.ledger-card {
  padding: 22rpx;
  border-radius: var(--life-radius-md);
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.aftercare-card > view {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.aftercare-card > view:first-child text:first-child {
  overflow: hidden;
  font-size: 22rpx;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aftercare-card > view:first-child text:last-child {
  padding: 6rpx 10rpx;
  border-radius: 10rpx;
  color: var(--life-coral-ink);
  background: var(--life-coral-soft);
  font-size: 15rpx;
}
.aftercare-card > text {
  display: block;
  margin: 14rpx 0;
  color: var(--life-muted);
  font-size: 18rpx;
}
.aftercare-card > view:last-child text:first-child {
  color: var(--life-red);
  font-size: 27rpx;
  font-weight: 900;
}
.aftercare-card > view:last-child text:last-child {
  color: var(--life-muted);
  font-size: 16rpx;
}
.ledger-card {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 18rpx;
}
.ledger-card > view:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8rpx;
}
.ledger-card > view:first-child text:first-child {
  font-size: 22rpx;
  font-weight: 900;
}
.ledger-card > view:first-child text:last-child {
  color: var(--life-muted);
  font-size: 16rpx;
  line-height: 1.5;
}
.ledger-balance {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
}
.ledger-balance text:first-child {
  color: var(--life-muted);
  font-size: 14rpx;
}
.ledger-balance text:last-child {
  margin-top: 5rpx;
  color: var(--life-red);
  font-size: 27rpx;
  font-weight: 900;
}
</style>
