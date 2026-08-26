<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import LifeSurface from '../../components/LifeSurface.vue';
import { lifeSession } from '../../services/life-session.js';

const productId = ref('');
const report = ref(null);
const loading = ref(false);
const error = ref(null);
const missing = computed(() => error.value?.status === 404);
const evidenceItems = computed(() =>
  Array.isArray(report.value?.evidence)
    ? report.value.evidence
    : report.value?.evidence
      ? Object.entries(report.value.evidence).map(([kind, value]) => ({ kind, value }))
      : [],
);

async function load() {
  if (!productId.value) return;
  loading.value = true;
  error.value = null;
  try {
    report.value = await lifeSession.request(
      `/api/v1/life/discovery/products/${encodeURIComponent(productId.value)}/trace-report`,
    );
  } catch (caught) {
    error.value = caught;
  } finally {
    loading.value = false;
  }
}

onLoad((options) => {
  productId.value = String(options?.productId ?? '');
  void load();
});
</script>

<template>
  <LifeSurface
    compact
    :show-assurance="false"
    eyebrow="PAGE-211 · 溯源报告"
    :title="report?.title || '商品溯源'"
    detail="只展示已核验且仍在有效期内的服务端报告"
    theme-color="blue"
  >
    <view v-if="loading" class="section empty-safe">正在核对报告版本…</view>
    <view v-else-if="error?.status === 401" class="section empty-safe">登录后查看溯源报告</view>
    <view v-else-if="error?.status === 403" class="section empty-safe">当前账户无权查看此报告</view>
    <view v-else-if="!productId" class="section empty-safe">缺少商品标识，请返回商品详情重试</view>
    <view v-else-if="missing" class="section trace-missing"
      ><text>暂无有效溯源报告</text
      ><text
        >平台不会用商品宣传文案替代供应商、批次或履约证据。你仍可返回查看商品，但请不要把“暂无报告”理解为“已经核验”。</text
      ></view
    >
    <view v-else-if="error" class="section empty-safe" @click="load">报告加载失败，点此重试</view>
    <template v-else-if="report">
      <view class="trace-pass"
        ><view class="trace-seal"><view></view></view
        ><view
          ><text>有效溯源报告</text><text>报告版本 {{ report.reportVersion }}</text
          ><text>{{ report.summary }}</text></view
        ></view
      >
      <view class="trace-dates"
        ><view
          ><text>核验时间</text><text>{{ report.verifiedAt }}</text></view
        ><view
          ><text>有效期限</text
          ><text>{{ report.expiresAt || '当前报告未设置到期时间' }}</text></view
        ></view
      >
      <view class="section evidence-section"
        ><view class="section-head"
          ><text>核验证据</text><text>{{ evidenceItems.length }} 项</text></view
        ><view v-if="evidenceItems.length" class="evidence-list"
          ><view v-for="(item, index) in evidenceItems" :key="index" class="evidence-item"
            ><view class="evidence-node"></view
            ><view
              ><text>{{ item.kind || `证据 ${index + 1}` }}</text
              ><text>{{ item.status || item.value || '已记录' }}</text></view
            ></view
          ></view
        ><view v-else class="empty-safe">报告没有可公开的结构化证据项</view></view
      >
    </template>
  </LifeSurface>
</template>

<style scoped>
.trace-missing,
.report-summary {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.trace-pass {
  display: flex;
  margin-top: 20rpx;
  padding: 26rpx;
  border-radius: var(--life-radius-lg);
  align-items: center;
  gap: 20rpx;
  background: linear-gradient(135deg, #edfafa, var(--life-blue-soft));
  box-shadow: var(--life-shadow-soft);
}
.trace-seal {
  display: flex;
  width: 86rpx;
  height: 86rpx;
  border: 5rpx solid #1687a0;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  flex: none;
}
.trace-seal > view {
  width: 32rpx;
  height: 17rpx;
  border-bottom: 6rpx solid #1687a0;
  border-left: 6rpx solid #1687a0;
  transform: rotate(-45deg) translate(2rpx, -2rpx);
}
.trace-pass > view:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6rpx;
}
.trace-pass > view:last-child text:first-child {
  color: #075d70;
  font-size: 28rpx;
  font-weight: 900;
}
.trace-pass > view:last-child text:nth-child(2) {
  color: #1687a0;
  font-size: 17rpx;
  font-weight: 800;
}
.trace-pass > view:last-child text:last-child {
  color: var(--life-muted);
  font-size: 19rpx;
  line-height: 1.55;
}
.trace-dates {
  display: grid;
  margin-top: 16rpx;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
}
.trace-dates > view {
  display: flex;
  padding: 18rpx;
  border-radius: var(--life-radius-md);
  flex-direction: column;
  gap: 7rpx;
  background: var(--life-paper);
  box-shadow: var(--life-shadow-soft);
}
.trace-dates text:first-child {
  color: #1687a0;
  font-size: 17rpx;
  font-weight: 900;
}
.trace-dates text:last-child {
  overflow-wrap: anywhere;
  color: var(--life-muted);
  font-size: 16rpx;
}
.evidence-section {
  margin-top: 16rpx;
}
.trace-missing text:first-child,
.report-summary text:first-child {
  font-size: 30rpx;
  font-weight: 900;
}
.trace-missing text:last-child,
.report-summary text:nth-child(n + 2) {
  color: #66736d;
  font-size: 21rpx;
  line-height: 1.7;
}
.evidence-list {
  display: grid;
  gap: 14rpx;
}
.evidence-list .evidence-item {
  display: flex;
  position: relative;
  padding: 12rpx 0 20rpx;
  gap: 16rpx;
  background: transparent;
}
.evidence-item > view:last-child {
  display: flex;
  min-width: 0;
  flex: 1;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid var(--life-line);
  flex-direction: column;
  gap: 7rpx;
}
.evidence-node {
  width: 18rpx;
  height: 18rpx;
  margin-top: 6rpx;
  border: 5rpx solid var(--life-paper);
  border-radius: 50%;
  flex: none;
  background: #1687a0;
  box-shadow: 0 0 0 2rpx #1687a0;
}
.evidence-item > view:last-child text:first-child {
  font-weight: 900;
}
.evidence-item > view:last-child text:last-child {
  color: var(--life-muted);
  font-size: 19rpx;
}
</style>
