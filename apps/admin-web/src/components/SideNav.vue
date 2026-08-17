<script setup lang="ts">
import { adminModules } from '../data/admin-nav'

defineProps<{ open: boolean }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <aside class="sidebar" :class="{ open }">
    <div class="brand">
      <div class="brand-mark">◦</div>
      <div><strong>乐趣生活</strong><span>HQ CONTROL TOWER</span></div>
      <button class="sidebar-close" aria-label="关闭导航" @click="$emit('close')">×</button>
    </div>

    <nav class="nav-list" aria-label="总部后台导航">
      <RouterLink class="nav-item dashboard-link" to="/" @click="$emit('close')">
        <span class="nav-icon">总</span><span>全国控制塔</span><small>LIVE</small>
      </RouterLink>
      <p class="nav-section">PLATFORM MODULES</p>
      <RouterLink
        v-for="module in adminModules"
        :key="module.id"
        class="nav-item"
        :to="`/workspace/${module.id}`"
        @click="$emit('close')"
      >
        <span class="nav-icon" :style="{ '--module-accent': module.accent }">{{ module.icon }}</span>
        <span>{{ module.title }}</span><small>›</small>
      </RouterLink>
    </nav>

    <div class="trust-card">
      <div class="trust-icon">✓</div>
      <div><strong>全链路审计在线</strong><span>证据覆盖率 100%</span></div>
    </div>
    <div class="sidebar-foot"><span>V5.0</span><span>Shanghai · CN</span></div>
  </aside>
  <button v-if="open" class="sidebar-backdrop" aria-label="关闭导航遮罩" @click="$emit('close')" />
</template>
