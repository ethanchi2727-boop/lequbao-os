<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminBreadcrumbs, findAdminModule, findAdminNode, type AdminNode } from '../data/admin-nav'

const route = useRoute()
const router = useRouter()
const moduleId = computed(() => String(route.params.module ?? ''))
const path = computed(() => {
  const value = route.params.path
  return Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []
})
const module = computed(() => findAdminModule(moduleId.value))
const node = computed(() => findAdminNode(moduleId.value, path.value))
const crumbs = computed(() => adminBreadcrumbs(moduleId.value, path.value))
const level = computed(() => path.value.length + 1)

function openChild(child: AdminNode): void {
  void router.push({
    name: 'workspace',
    params: { module: moduleId.value, path: [...path.value, child.id] },
  })
}
</script>

<template>
  <main v-if="module && node" class="workspace-page page-wrap" :style="{ '--accent': module.accent }">
    <nav class="breadcrumbs" aria-label="面包屑">
      <RouterLink to="/">全国控制塔</RouterLink><span>/</span>
      <template v-for="(crumb, index) in crumbs" :key="`${crumb.id}-${index}`">
        <span :class="{ current: index === crumbs.length - 1 }">{{ crumb.title }}</span>
        <span v-if="index < crumbs.length - 1">/</span>
      </template>
    </nav>

    <section class="workspace-hero">
      <div class="workspace-icon">{{ module.icon }}</div>
      <div class="workspace-copy">
        <span class="eyebrow">PLATFORM MODULE · LEVEL {{ level }}</span>
        <h1>{{ node.title }}</h1><p>{{ node.summary }}</p>
      </div>
      <div class="hero-status"><i />策略与数据同步正常</div>
    </section>

    <section v-if="node.children?.length" class="workspace-grid">
      <button v-for="(child, index) in node.children" :key="child.id" class="workspace-card" @click="openChild(child)">
        <div class="workspace-card-head"><span>0{{ index + 1 }}</span><em v-if="child.badge">{{ child.badge }}</em><i v-else>↗</i></div>
        <h2>{{ child.title }}</h2><p>{{ child.summary }}</p>
        <div class="card-meta"><span>L{{ level + 1 }}</span><span>{{ child.children?.length ?? 0 }} 个下级空间</span></div>
      </button>
    </section>

    <section v-else class="detail-grid">
      <article class="panel detail-panel">
        <span class="panel-kicker">OPERATION READY</span><h2>数据与操作上下文</h2>
        <div class="detail-checks">
          <div><i>✓</i><span><strong>身份与租户</strong><small>HQ_SUPER_ADMIN · PLATFORM</small></span></div>
          <div><i>✓</i><span><strong>规则快照</strong><small>V5.0 · 生效时间 2026-07-22</small></span></div>
          <div><i>✓</i><span><strong>审计策略</strong><small>高风险操作强确认并只追加留痕</small></span></div>
        </div>
        <button class="primary-button">进入业务操作</button>
      </article>
      <article class="panel evidence-panel">
        <span class="panel-kicker">LATEST EVIDENCE</span><h2>最近证据</h2>
        <div class="timeline">
          <div><i /><span><strong>策略校验通过</strong><small>刚刚 · system</small></span></div>
          <div><i /><span><strong>数据范围已应用</strong><small>2 分钟前 · auth-service</small></span></div>
          <div><i /><span><strong>快照版本已锁定</strong><small>8 分钟前 · workflow</small></span></div>
        </div>
      </article>
    </section>
  </main>
  <main v-else class="not-found page-wrap"><span>404</span><h1>工作空间不存在</h1><RouterLink to="/">返回全国控制塔</RouterLink></main>
</template>
