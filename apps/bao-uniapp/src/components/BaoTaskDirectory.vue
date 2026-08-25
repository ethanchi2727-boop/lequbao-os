<script setup>
import { computed } from 'vue';
import { mobilePagesForFamily } from '../mobile-page-registry.js';
const props = defineProps({ family: { type: String, required: true } });
const pages = computed(() => mobilePagesForFamily(props.family));
</script>
<template>
  <view v-if="pages.length" class="panel">
    <view class="panel-head"
      ><text>正式任务界面</text><text>{{ pages.length }} 项</text></view
    >
    <view class="task-list">
      <navigator
        v-for="page in pages"
        :key="page.id"
        class="task-row"
        :url="`/pages/detail/index?pageId=${page.id}`"
      >
        <view
          ><text>{{ page.title }}</text
          ><text>{{ page.detail }}</text></view
        ><text>›</text>
      </navigator>
    </view>
  </view>
</template>
