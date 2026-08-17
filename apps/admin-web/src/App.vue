<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import SideNav from './components/SideNav.vue'

const route = useRoute()
const sidebarOpen = ref(false)
const pageLabel = computed(() => route.meta.title ?? 'HQ Control Tower')
</script>

<template>
  <div class="admin-shell">
    <SideNav :open="sidebarOpen" @close="sidebarOpen = false" />
    <section class="app-stage">
      <header class="topbar">
        <button class="menu-button" aria-label="打开导航" @click="sidebarOpen = true">☰</button>
        <div class="topbar-context">
          <span class="context-kicker">LEQU LIFE · HQ</span>
          <span class="context-title">{{ pageLabel }}</span>
        </div>
        <div class="top-actions">
          <button class="command"><span>⌘</span> 搜索商家、订单或功能 <kbd>⌘ K</kbd></button>
          <button class="icon-button" aria-label="消息">◌<span class="notification-dot" /></button>
          <div class="operator">
            <span class="operator-avatar">顾</span>
            <span><strong>顾清和</strong><small>总部超级管理员</small></span>
          </div>
        </div>
      </header>
      <RouterView />
    </section>
  </div>
</template>
