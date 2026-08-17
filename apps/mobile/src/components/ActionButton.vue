<script setup lang="ts">
defineProps<{
  label: string
  busy?: boolean
  disabled?: boolean
  tone?: 'indigo' | 'mint' | 'dark'
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    class="action-button"
    :class="`tone-${tone ?? 'indigo'}`"
    :disabled="busy || disabled"
    @click="$emit('click')"
  >
    <text v-if="busy" class="spinner" />
    <text>{{ busy ? '正在安全处理…' : label }}</text>
    <text v-if="!busy" class="arrow">↗</text>
  </button>
</template>

<style scoped lang="scss">
.action-button {
  display: flex;
  width: 100%;
  min-height: 56px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 18px;
  color: #fff;
  font-size: 17px;
  font-weight: 850;
  letter-spacing: 0.01em;
  box-shadow: 0 14px 30px rgba(103, 92, 246, 0.24);
  transition: transform 160ms ease, opacity 160ms ease;
}

.action-button:active {
  transform: scale(0.985);
}

.action-button[disabled] {
  opacity: 0.52;
}

.tone-indigo {
  background: linear-gradient(135deg, #7569ff 0%, #5549e8 52%, #3478f6 120%);
}

.tone-mint {
  background: linear-gradient(135deg, #13b486, #0f8e72);
  box-shadow: 0 14px 30px rgba(22, 185, 140, 0.2);
}

.tone-dark {
  background: linear-gradient(135deg, #18213f, #080c1d);
  box-shadow: 0 14px 30px rgba(7, 11, 27, 0.24);
}

.arrow {
  font-size: 20px;
}

.spinner {
  width: 17px;
  height: 17px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
