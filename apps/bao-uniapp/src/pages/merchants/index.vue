<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaoSurface from '../../components/BaoSurface.vue';
import { baoSession } from '../../services/bao-session.js';

const loading = ref(false);
const error = ref(false);
const profile = ref(null);
const stores = ref([]);
async function load() {
  loading.value = true;
  error.value = false;
  try {
    [profile.value, stores.value] = await Promise.all([
      baoSession.request('/api/v1/merchant-operations/profile'),
      baoSession.request('/api/v1/merchant-operations/stores'),
    ]);
  } catch {
    error.value = true;
    profile.value = null;
    stores.value = [];
  } finally {
    loading.value = false;
  }
}
onShow(load);
</script>
<template>
  <BaoSurface eyebrow="商务与经营" title="我的商户" detail="开发、归属、续费与持续服务统一查看。"
    ><view v-if="loading" class="panel empty-state">正在读取权限范围内的商户资料…</view>
    <view v-else-if="error" class="panel empty-state" @click="load">登录后查看，或点此重试</view>
    <view v-if="profile" class="panel"
      ><view class="panel-head"><text>商户概览</text><text>按权限范围</text></view
      ><view class="metrics"
        ><view class="metric"
          ><text>主体状态</text><text>{{ profile.status }}</text></view
        ><view class="metric"
          ><text>门店数量</text><text>{{ stores.length }}</text></view
        ></view
      ></view
    ><view v-if="profile" class="panel"
      ><view class="panel-head"
        ><text>{{ profile.legalSubjectName }}</text
        ><text>{{ profile.industryCode }}</text></view
      ><view class="task-list"
        ><view v-for="store in stores" :key="store.id" class="task"
          ><view
            ><text>{{ store.storeName }}</text
            ><text
              >{{ store.regionCodes.join(' / ') || '区域待完善' }} · 版本 {{ store.version }}</text
            ></view
          ><text :class="['status', store.status !== 'ACTIVE' ? 'warning' : '']">{{
            store.status
          }}</text></view
        ><view v-if="stores.length === 0" class="empty-state">当前权限范围内没有门店</view> ></view
      ></view
    ></BaoSurface
  >
</template>
<style scoped>
.empty-state {
  padding: 44rpx 22rpx;
  color: #737789;
  text-align: center;
  font-size: 23rpx;
}
</style>
