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
const money = (cents) => `¥${(Number(cents || 0) / 100).toFixed(2)}`;
const senderLabel = (message) =>
  ({
    CUSTOMER: '我',
    EMPLOYEE: message.senderDisplayName || '人工客服',
    AI: '小满助手',
    SYSTEM: '系统',
  })[message.senderType] || message.senderType;
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
      confirmColor: '#9b3f20',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }),
  );

async function load() {
  loading.value = true;
  error.value = null;
  notice.value = '';
  records.value = [];
  detail.value = null;
  selectedConversation.value = null;
  messages.value = [];
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
  busy.value = true;
  notice.value = '';
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
    selectedConversation.value = latest;
    messages.value = persistedMessages;
  } catch {
    notice.value = '会话详情读取失败；未展示任何未经服务端确认的消息。';
  } finally {
    busy.value = false;
  }
}
async function readMessageContent(message) {
  if (!merchantContext.value || !selectedConversation.value || messageContents[message.id]) return;
  busy.value = true;
  try {
    const conversationId = encodeURIComponent(selectedConversation.value.id);
    const messageId = encodeURIComponent(message.id);
    const response = await lifeSession.requestMerchant(
      merchantContext.value,
      `/api/v1/customer-service/conversations/${conversationId}/messages/${messageId}/content`,
    );
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
      v-else-if="state === 'empty' && !['248', '250'].includes(pageId)"
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
      class="section"
      ><view class="section-head"
        ><text>{{ pageId === '254' ? '商户隐私档案' : '商户消息授权' }}</text
        ><text>{{ detail.status }}</text></view
      ><view class="boundary-facts"
        ><text>商户上下文已验证</text><text>门店范围已确认</text
        ><text>持续档案授权 {{ detail.profileMemoryConsent }}</text></view
      ><text class="context-note"
        >当前内容由短期商户消费者会话读取；平台令牌未发送到商户档案接口。</text
      >
      <view v-if="pageId === '254'" class="card-list"
        ><view class="privacy-note"
          >最新持续档案授权：{{ profileConsent?.status || '暂无记录'
          }}<text v-if="profileConsent">
            · {{ profileConsent.policyVersion }} · {{ profileConsent.occurredAt }}</text
          ></view
        ><view v-for="fact in records" :key="fact.id" class="row"
          ><view
            ><text>{{ fact.factType }}</text
            ><text>{{ fact.value }} · {{ fact.purpose }} · {{ fact.status }}</text></view
          ></view
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
      ><view v-else
        ><view v-if="subscriptionConsent" class="privacy-note blue"
          >最新订阅授权：{{ subscriptionConsent.status }} ·
          {{ subscriptionConsent.policyVersion }} · {{ subscriptionConsent.occurredAt }}</view
        ><view v-else class="privacy-note blue"
          >暂无服务端订阅授权记录。首次授权必须绑定已发布政策版本与微信侧订阅结果，因此此处不提供伪造开关。</view
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
      v-if="merchantContext && ['258', '262', '264'].includes(pageId) && state === 'ready'"
      class="section card-list"
      ><view class="context-note"
        >仅展示当前商户和门店下由服务端授权的会话；人工接管与工单状态保持同源。</view
      ><view v-for="conversation in records" :key="conversation.id" class="row"
        ><view @click="openConversation(conversation)"
          ><text>{{ conversation.ticket?.id || conversation.id }}</text
          ><text
            >{{ conversation.status }} · {{ conversation.riskLevel }} ·
            {{ conversation.ticket?.status || '暂无人工工单' }}</text
          ></view
        ><button size="mini" :loading="busy" @click="openConversation(conversation)">
          查看
        </button></view
      ><view v-if="selectedConversation" class="conversation-detail"
        ><view class="section-head"
          ><text>会话 {{ selectedConversation.id }}</text
          ><text>{{ selectedConversation.status }}</text></view
        ><view v-if="selectedConversation.ticket" class="ticket-facts"
          ><text>工单 {{ selectedConversation.ticket.id }}</text
          ><text>{{ selectedConversation.ticket.status }}</text
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

    <view v-if="pageId === '219' && state === 'ready'" class="map-grid"
      ><view v-for="store in records" :key="store.id" class="map-card"
        ><view
          ><text>{{ store.name }}</text
          ><text>{{ store.cityCode || '城市未标注' }} · {{ store.productCount }} 件在售</text
          ><text>{{
            store.latitude === null || store.longitude === null
              ? '坐标尚未核验'
              : '坐标来自门店主档'
          }}</text></view
        ><button size="mini" @click="openStore(store)">地图</button></view
      ></view
    >
    <view v-if="['242', '243'].includes(pageId) && state === 'ready'" class="credential-grid"
      ><view v-for="token in records" :key="token.entitlementId" class="credential-card"
        ><view
          ><text>订单 {{ token.orderId }}</text
          ><text
            >剩余 {{ token.remainingUses }} 次 · {{ token.status }} ·
            {{ token.validUntil || '有效期未标注' }}</text
          ></view
        ><button size="mini" :disabled="token.remainingUses < 1" @click="copyToken(token)">
          复制
        </button></view
      ></view
    >
    <view v-if="pageId === '245' && detail" class="section"
      ><view class="section-head"
        ><text>{{ detail.orderNumber || detail.orderNo || detail.id }}</text
        ><text>{{ detail.status }}</text></view
      ><view class="facts"
        ><text>已付 {{ money(detail.paidAmountCents) }}</text
        ><text>已退 {{ money(detail.refundedAmountCents) }}</text
        ><text>履约 {{ detail.fulfillmentStatus }}</text></view
      ><view class="aftercare-note"
        >申请范围和金额由服务端按订单快照重新计算；客户端不会直接改变支付、履约或退款状态。</view
      >
      ><picker
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
        ><view class="field">申请类型：{{ refundDraft.requestType }}</view></picker
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
      /><button class="danger" :loading="busy" @click="submitRefund">确认提交售后申请</button></view
    >
    <view v-if="pageId === '246' && state === 'ready'" class="aftercare-grid"
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
    >
    <view v-if="pageId === '248' && ['ready', 'empty'].includes(state)" class="section"
      ><view class="privacy-note">地址仅在当前消费者鉴权后解密；历史订单继续保留原地址快照。</view>
      <view v-for="item in records" :key="item.id" class="row account-record"
        ><view
          ><text>{{ item.recipientName }} {{ item.mobile }}</text
          ><text>{{ item.addressLine }}</text></view
        ><button size="mini" @click="archiveAddress(item.id)">归档</button></view
      ><view class="form"
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
    <view v-if="pageId === '250' && ['ready', 'empty'].includes(state)" class="section"
      ><view class="privacy-note blue">发票抬头与税号加密保存；归档不会删除历史开票引用。</view>
      <view v-for="item in records" :key="item.id" class="row account-record"
        ><view
          ><text>{{ item.title }}</text
          ><text>{{ item.profileType }} · {{ item.taxIdentifier || '无税号' }}</text></view
        ><button size="mini" @click="archiveInvoice(item.id)">归档</button></view
      ><view class="form"
        ><picker
          :range="['PERSONAL', 'ENTERPRISE']"
          @change="invoiceDraft.profileType = ['PERSONAL', 'ENTERPRISE'][$event.detail.value]"
          ><view class="field">类型：{{ invoiceDraft.profileType }}</view></picker
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
    <view v-if="pageId === '252' && state === 'ready'" class="ledger-grid"
      ><view v-for="item in records" :key="item.id" class="ledger-card"
        ><view
          ><text>{{ item.ruleVersion || '消费奖励' }}</text
          ><text
            >原额 {{ money(item.originalAmountCents) }} · 已兑
            {{ money(item.redeemedAmountCents) }} · 冲正 {{ money(item.reversedAmountCents) }}</text
          ></view
        ><view class="ledger-balance"
          ><text>当前可用</text><text>{{ money(item.availableAmountCents) }}</text></view
        ></view
      ></view
    >
    <view v-if="pageId === '259' && state === 'ready'" class="section card-list"
      ><view v-for="order in records" :key="order.id" class="row"
        ><view @click="go('238', { orderId: order.id })"
          ><text>{{ order.orderNumber || order.orderNo || order.id }}</text
          ><text>{{ order.storeName || '商家订单' }} · {{ order.status }}</text></view
        ><view class="row-actions"
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
  </LifeSurface>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #e6ebe8;
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
.row view text:last-child,
.notice,
.boundary > text {
  color: #66736d;
  font-size: 21rpx;
  line-height: 1.7;
}
.row > text {
  color: #0f9d72;
  font-size: 22rpx;
  font-weight: 800;
}
.row button {
  margin: 0;
  color: #076c50;
  background: #e8f7f0;
  border-radius: 999rpx;
  font-size: 20rpx;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-top: 28rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #e6ebe8;
}
.field {
  box-sizing: border-box;
  width: 100%;
  padding: 20rpx;
  border: 1rpx solid #dce5e0;
  border-radius: 18rpx;
  background: #f8faf9;
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
  color: #46534d;
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
  color: #076c50;
  background: #e8f7f0;
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
.conversation-detail {
  margin-top: 22rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid var(--life-line);
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
  color: #9b5c00;
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
  color: #fff;
  background: #076c50;
}
.secondary {
  color: #076c50;
  background: #e8f7f0;
}
.danger {
  color: #9b3f20;
  background: #fff0eb;
}
.notice {
  display: block;
}
.context-note {
  display: block;
  margin: 14rpx 0;
  color: #66736d;
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
  border: 1rpx solid #d8e3dd;
}
.boundary .section-head text:last-child {
  color: #9b3f20;
}
.credential-grid {
  display: grid;
  margin-top: 20rpx;
  gap: 14rpx;
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
  color: #9b5c00;
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
.privacy-note.blue {
  color: #075d70;
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
.map-card {
  display: flex;
  padding: 22rpx;
  border-radius: var(--life-radius-md);
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  background: linear-gradient(135deg, var(--life-blue-soft), var(--life-paper));
  box-shadow: var(--life-shadow-soft);
}
.map-card > view {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6rpx;
}
.map-card view text:first-child {
  font-size: 24rpx;
  font-weight: 900;
}
.map-card view text:not(:first-child) {
  color: var(--life-muted);
  font-size: 17rpx;
}
.map-card button {
  margin: 0;
  border-radius: 999rpx;
  color: #075d70;
  background: var(--life-paper);
  font-size: 18rpx;
}
.aftercare-note {
  margin: 18rpx 0;
  padding: 18rpx;
  border-radius: 18rpx;
  color: #9b3f20;
  background: var(--life-coral-soft);
  font-size: 17rpx;
  line-height: 1.55;
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
  color: #9b3f20;
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
