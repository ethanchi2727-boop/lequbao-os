<script setup>
import { computed } from 'vue';
import { mobilePagesForFamily } from '../mobile-page-registry.js';
const props = defineProps({ family: { type: String, required: true } });
const pages = computed(() => mobilePagesForFamily(props.family));
const TIC_GLYPHS = Object.freeze({
  'page-180': '📦',
  'page-181': '🤝',
  'page-183': '💰',
  'page-184': '🧾',
  'page-185': '📊',
  'page-187': '🎧',
  'page-188': '💬',
  'page-189': '👤',
  'page-191': '🎫',
  'page-193': '🔔',
  'page-195': '🛡️',
});
</script>
<template>
  <view v-if="pages.length" class="panel">
    <view class="panel-head"
      ><text>任务大厅</text><text>全部 {{ pages.length }} 项</text></view
    >
    <view class="task-list">
      <navigator
        v-for="page in pages"
        :key="page.id"
        class="task-row dir-row"
        :url="`/pages/detail/index?pageId=${page.id}`"
      >
        <text class="dir-tic">{{ TIC_GLYPHS[page.id] ?? '📋' }}</text>
        <view
          ><text>{{ page.title }}</text
          ><text>{{ page.detail }}</text></view
        ><text class="dir-go">进入</text>
      </navigator>
    </view>
  </view>
</template>
