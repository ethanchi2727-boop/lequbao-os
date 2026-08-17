<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AppRole, ExperienceSnapshot } from '@lequ/contracts'
import ActionButton from '../../components/ActionButton.vue'
import JourneyPanel from '../../components/JourneyPanel.vue'
import RoleSwitcher from '../../components/RoleSwitcher.vue'
import ConsumerView from '../../views/ConsumerView.vue'
import HqView from '../../views/HqView.vue'
import MerchantView from '../../views/MerchantView.vue'
import ProviderView from '../../views/ProviderView.vue'
import SalesView from '../../views/SalesView.vue'
import {
  advanceExperience as advanceExperienceRequest,
  fetchExperience,
  resetExperience as resetExperienceRequest,
} from '../../services/experience'

const snapshot = ref<ExperienceSnapshot | null>(null)
const activeRole = ref<AppRole>('sales')
const busy = ref(false)
const loading = ref(true)
const errorMessage = ref('')

const roleHeading = computed(() => {
  const labels: Record<AppRole, string> = {
    sales: '销售增长台',
    provider: '城市交付中枢',
    consumer: 'AI 生活管家',
    merchant: '商家经营驾驶舱',
    hq: '全链路控制塔',
  }
  return labels[activeRole.value]
})

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await fetchExperience()
    activeRole.value = snapshot.value.nextStep?.role ?? 'hq'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function advance(): Promise<void> {
  if (!snapshot.value?.nextStep || busy.value) return
  busy.value = true
  try {
    const updated = await advanceExperienceRequest(snapshot.value)
    snapshot.value = updated
    if (updated.nextStep) {
      activeRole.value = updated.nextStep.role
    }
    uni.showToast({ title: '已写入审计链路', icon: 'success' })
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '处理失败',
      icon: 'none',
      duration: 2600,
    })
  } finally {
    busy.value = false
  }
}

async function reset(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    snapshot.value = await resetExperienceRequest()
    activeRole.value = 'sales'
    uni.showToast({ title: '已创建新演示批次', icon: 'none' })
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '重置失败',
      icon: 'none',
    })
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <view class="experience-page">
    <view class="aurora aurora-one" />
    <view class="aurora aurora-two" />

    <header class="global-header">
      <view class="brand-lockup">
        <view class="brand-mark"><text>◦</text></view>
        <view>
          <text class="brand-name">乐趣生活</text>
          <text class="brand-tagline">LEQU LIFE · V5.0</text>
        </view>
      </view>
      <RoleSwitcher v-model="activeRole" />
      <view class="live-badge"><text class="live-dot" /> {{ roleHeading }}</view>
    </header>

    <view v-if="loading" class="loading-layout">
      <view class="loading-card">
        <view class="skeleton skeleton-short" />
        <view class="skeleton skeleton-title" />
        <view class="skeleton skeleton-hero" />
        <view class="skeleton skeleton-row" />
      </view>
    </view>

    <view v-else-if="errorMessage" class="error-layout">
      <view class="error-card">
        <text class="error-kicker">CONNECTION PAUSED</text>
        <text class="error-title">体验服务暂时没有响应</text>
        <text class="error-copy">{{ errorMessage }}</text>
        <ActionButton label="重新连接" @click="load" />
      </view>
    </view>

    <main v-else-if="snapshot" class="workspace" :class="{ 'hq-mode': activeRole === 'hq' }">
      <view class="app-frame" :class="{ 'hq-frame': activeRole === 'hq' }">
        <SalesView
          v-if="activeRole === 'sales'"
          :snapshot="snapshot"
          :busy="busy"
          @advance="advance"
        />
        <ProviderView
          v-else-if="activeRole === 'provider'"
          :snapshot="snapshot"
          :busy="busy"
          @advance="advance"
        />
        <ConsumerView
          v-else-if="activeRole === 'consumer'"
          :snapshot="snapshot"
          :busy="busy"
          @advance="advance"
        />
        <MerchantView
          v-else-if="activeRole === 'merchant'"
          :snapshot="snapshot"
          :busy="busy"
          @advance="advance"
        />
        <HqView
          v-else
          :snapshot="snapshot"
          :busy="busy"
          @advance="advance"
        />
      </view>
      <JourneyPanel :snapshot="snapshot" @reset="reset" />
    </main>

    <view class="mobile-role-switcher">
      <RoleSwitcher v-model="activeRole" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.experience-page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 48% -20%, rgba(79, 70, 229, 0.3), transparent 36%),
    linear-gradient(180deg, #070b1b 0%, #0a1023 58%, #080c1a 100%);
}

.aurora {
  position: fixed;
  pointer-events: none;
  filter: blur(80px);
  opacity: 0.22;
}

.aurora-one {
  top: 20%;
  left: 8%;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: #4f46e5;
}

.aurora-two {
  right: 8%;
  bottom: 4%;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: #0fb98d;
}

.global-header {
  position: relative;
  z-index: 2;
  display: grid;
  max-width: 1480px;
  min-height: 88px;
  grid-template-columns: 220px 1fr 220px;
  align-items: center;
  gap: 28px;
  margin: 0 auto;
  padding: 16px 28px;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #fff;
}

.brand-mark {
  display: flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border: 6px solid #675cf6;
  border-top-color: #3ad8b4;
  border-right-color: #4aa0ff;
  border-radius: 50%;
  color: #fff;
  font-size: 16px;
  font-weight: 900;
  transform: rotate(-24deg);
}

.brand-name,
.brand-tagline {
  display: block;
}

.brand-name {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.brand-tagline {
  margin-top: 3px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.live-badge {
  justify-self: end;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  font-weight: 750;
}

.live-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 7px;
  border-radius: 50%;
  background: #42d7af;
  box-shadow: 0 0 0 5px rgba(66, 215, 175, 0.09);
}

.workspace {
  position: relative;
  z-index: 1;
  display: flex;
  max-width: 1260px;
  align-items: flex-start;
  justify-content: center;
  gap: 28px;
  margin: 0 auto;
  padding: 12px 24px 44px;
}

.workspace.hq-mode {
  max-width: 1480px;
}

.app-frame {
  width: 430px;
  min-height: min(820px, calc(100vh - 150px));
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 36px;
  background: var(--cloud);
  box-shadow: 0 36px 100px rgba(0, 0, 0, 0.38), var(--shadow-glow);
}

.app-frame.hq-frame {
  width: min(1040px, calc(100vw - 420px));
}

.loading-layout,
.error-layout {
  position: relative;
  z-index: 2;
  display: flex;
  min-height: calc(100vh - 90px);
  align-items: center;
  justify-content: center;
  padding: 30px;
}

.loading-card,
.error-card {
  width: min(430px, 100%);
  padding: 26px;
  border-radius: 32px;
  background: #fff;
}

.skeleton {
  border-radius: 12px;
  background: linear-gradient(90deg, #eef1f6 25%, #f7f8fa 50%, #eef1f6 75%);
  background-size: 200% 100%;
  animation: pulse 1.4s infinite;
}

.skeleton-short { width: 32%; height: 16px; }
.skeleton-title { width: 72%; height: 38px; margin-top: 24px; }
.skeleton-hero { height: 230px; margin-top: 22px; border-radius: 26px; }
.skeleton-row { height: 110px; margin-top: 18px; border-radius: 22px; }

@keyframes pulse {
  to { background-position: -200% 0; }
}

.error-kicker,
.error-title,
.error-copy {
  display: block;
}

.error-kicker {
  color: var(--coral);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
}

.error-title {
  margin-top: 12px;
  color: var(--ink);
  font-size: 28px;
  font-weight: 900;
}

.error-copy {
  margin: 12px 0 24px;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.6;
}

.mobile-role-switcher {
  display: none;
}

@media (max-width: 1180px) {
  .workspace {
    flex-wrap: wrap;
  }

  .app-frame.hq-frame {
    width: min(1040px, 100%);
  }
}

@media (max-width: 760px) {
  .experience-page {
    overflow: visible;
    background: var(--cloud);
  }

  .global-header {
    display: flex;
    min-height: 74px;
    padding: 12px 20px 8px;
    background: #070b1b;
  }

  .global-header > :nth-child(2),
  .live-badge {
    display: none;
  }

  .workspace {
    display: block;
    padding: 0;
  }

  .app-frame,
  .app-frame.hq-frame {
    width: 100%;
    min-height: 760px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .mobile-role-switcher {
    position: sticky;
    z-index: 20;
    bottom: 0;
    display: block;
    padding-top: 10px;
    background: #070b1b;
  }
}
</style>
