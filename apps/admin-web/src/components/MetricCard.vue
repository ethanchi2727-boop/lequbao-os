<script setup lang="ts">
defineProps<{
  label: string
  value: string
  change: string
  detail: string
  tone: 'indigo' | 'mint' | 'coral' | 'amber'
}>()
</script>

<template>
  <article class="metric-card" :class="`tone-${tone}`">
    <div class="metric-head"><span>{{ label }}</span><span class="metric-change">{{ change }}</span></div>
    <strong class="metric-value">{{ value }}</strong>
    <div class="mini-chart"><i v-for="height in [32, 45, 39, 58, 52, 71, 67, 84]" :key="height" :style="{ height: `${height}%` }" /></div>
    <span class="metric-detail">{{ detail }}</span>
  </article>
</template>
