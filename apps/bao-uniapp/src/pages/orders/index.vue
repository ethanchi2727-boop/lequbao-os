<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import BaoTaskDirectory from '../../components/BaoTaskDirectory.vue';
import { baoSession } from '../../services/bao-session.js';

const loading = ref(false);
const error = ref(false);
const orders = ref([]);
const refunds = ref([]);
async function load() {
  loading.value = true;
  error.value = false;
  try {
    [orders.value, refunds.value] = await Promise.all([
      baoSession.request('/api/v1/merchant-operations/orders?limit=30'),
      baoSession.request('/api/v1/merchant-operations/refunds?limit=30'),
    ]);
  } catch {
    error.value = true;
    orders.value = [];
    refunds.value = [];
  } finally {
    loading.value = false;
  }
}
onShow(load);
</script>
<template>
  <BaoSurface eyebrow="履约处理" title="订单与核销" detail="接单、核销、退款和异常恢复按权限执行。"
    ><view v-if="loading" class="panel empty-state">正在读取订单与退款…</view>
    <view v-else-if="error" class="panel empty-state" @click="load">登录后查看，或点此重试</view>
    <view v-if="!error" class="panel"
      ><view class="panel-head"
        ><text>订单队列</text><text>{{ orders.length }} 笔</text></view
      ><view class="task-list"
        ><view v-for="order in orders" :key="order.id" class="task"
          ><view
            ><text>{{ order.orderNo }} · ¥{{ (order.payableAmountCents / 100).toFixed(2) }}</text
            ><text
              >门店 {{ order.storeId.slice(0, 8) }}… · 已退款 ¥{{
                (order.refundedAmountCents / 100).toFixed(2)
              }}</text
            ></view
          ><text :class="['status', order.status === 'CANCELLED' ? 'warning' : '']">{{
            order.status
          }}</text></view
        ><view v-if="orders.length === 0" class="empty-state">当前没有订单</view> ></view
      ></view
    ><view v-if="refunds.length" class="panel"
      ><view class="panel-head"
        ><text>退款队列</text><text>{{ refunds.length }} 笔</text></view
      ><view class="task-list"
        ><view v-for="refund in refunds" :key="refund.id" class="task"
          ><view
            ><text>退款 ¥{{ (refund.amountCents / 100).toFixed(2) }}</text
            ><text>订单 {{ refund.orderId.slice(0, 8) }}… · {{ refund.reasonCode }}</text></view
          ><text :class="['status', refund.status === 'FAILED' ? 'warning' : '']">{{
            refund.status
          }}</text></view
        ></view
      ></view
    ><BaoTaskDirectory family="orders" /> ></BaoSurface
  >
</template>
<style scoped>
.empty-state {
  padding: 44rpx 22rpx;
  color: var(--bao-mobile-ink-500);
  text-align: center;
  font-size: 23rpx;
}
</style>
