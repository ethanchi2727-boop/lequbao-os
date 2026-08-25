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
      <view class="section report-summary"
        ><text>报告版本 {{ report.reportVersion }}</text
        ><text>{{ report.summary }}</text
        ><text>核验时间：{{ report.verifiedAt }}</text
        ><text>{{
          report.expiresAt ? `有效期至：${report.expiresAt}` : '当前报告未设置到期时间'
        }}</text></view
      >
      <view class="section"
        ><view class="section-head"
          ><text>核验证据</text><text>{{ evidenceItems.length }} 项</text></view
        ><view v-if="evidenceItems.length" class="evidence-list"
          ><view v-for="(item, index) in evidenceItems" :key="index"
            ><text>{{ item.kind || `证据 ${index + 1}` }}</text
            ><text>{{ item.status || item.value || '已记录' }}</text></view
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
.evidence-list view {
  display: flex;
  padding: 20rpx;
  justify-content: space-between;
  background: #f2f8f6;
  border-radius: 18rpx;
}
.evidence-list text:first-child {
  font-weight: 900;
}
.evidence-list text:last-child {
  color: #076c50;
}
</style>
