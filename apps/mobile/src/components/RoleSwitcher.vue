<script setup lang="ts">
import type { AppRole } from '@lequ/contracts'

defineProps<{
  modelValue: AppRole
}>()

const emit = defineEmits<{
  'update:modelValue': [value: AppRole]
}>()

const roles: Array<{ key: AppRole; label: string; short: string }> = [
  { key: 'sales', label: '销售宝', short: '销' },
  { key: 'provider', label: '服务商', short: '服' },
  { key: 'consumer', label: '消费者', short: '乐' },
  { key: 'merchant', label: '经营宝', short: '营' },
  { key: 'hq', label: 'HQ 控制塔', short: 'HQ' },
]
</script>

<template>
  <scroll-view class="role-scroll" scroll-x :show-scrollbar="false">
    <view class="role-switcher" role="tablist" aria-label="切换产品端">
      <button
        v-for="role in roles"
        :key="role.key"
        class="role-pill"
        :class="{ active: modelValue === role.key }"
        :aria-selected="modelValue === role.key"
        role="tab"
        @click="emit('update:modelValue', role.key)"
      >
        <text class="role-glyph">{{ role.short }}</text>
        <text>{{ role.label }}</text>
      </button>
    </view>
  </scroll-view>
</template>

<style scoped lang="scss">
.role-scroll {
  width: 100%;
  white-space: nowrap;
}

.role-switcher {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.055);
  backdrop-filter: blur(18px);
}

.role-pill {
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border-radius: 14px;
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  transition: 180ms ease;
}

.role-pill.active {
  background: #fff;
  color: var(--ink);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
}

.role-glyph {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(103, 92, 246, 0.14);
  color: var(--indigo);
  font-size: 11px;
  font-weight: 900;
}

@media (max-width: 760px) {
  .role-switcher {
    min-width: max-content;
    border: 0;
    background: transparent;
    padding: 0 20px 10px;
  }

  .role-pill {
    min-width: 96px;
    min-height: 42px;
    background: rgba(255, 255, 255, 0.08);
  }
}
</style>
