<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import ProductModule from '../../shared/ProductModule.vue'

const path = ref<string[]>([])

onLoad((query) => {
  const raw = typeof query?.path === 'string' ? query.path : ''
  path.value = decodeURIComponent(raw).split('/').filter(Boolean)
})
</script>

<template>
  <ProductModule product="provider" :route-path="path" />
</template>
