<script setup>
import { computed } from 'vue';
import { mobilePagesForFamily } from '../mobile-page-registry.js';

const props = defineProps({ family: { type: String, required: true } });
const pages = computed(() => mobilePagesForFamily(props.family));
</script>
<template>
  <view v-if="pages.length" class="directory panel"
    ><view class="directory-head"
      ><text>正式任务界面</text><text>{{ pages.length }} 项</text></view
    ><navigator
      v-for="page in pages"
      :key="page.id"
      class="directory-row"
      :url="`/pages/detail/index?pageId=${page.id}`"
      ><view
        ><text>{{ page.title }}</text
        ><text>{{ page.detail }}</text></view
      ><text>›</text></navigator
    ></view
  >
</template>
<style scoped>
.directory {
  padding: 10rpx 24rpx;
}
.directory-head,
.directory-row {
  display: flex;
  align-items: center;
}
.directory-head {
  padding: 16rpx 0;
  justify-content: space-between;
  border-bottom: 1rpx solid var(--bao-mobile-line);
}
.directory-head text:first-child {
  font-size: 24rpx;
  font-weight: 900;
}
.directory-head text:last-child {
  color: var(--bao-mobile-jade-700);
  font-size: 18rpx;
  font-weight: 800;
}
.directory-row {
  min-height: 96rpx;
  border-bottom: 1rpx solid var(--bao-mobile-line);
}
.directory-row:last-child {
  border-bottom: 0;
}
.directory-row view {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}
.directory-row view text:first-child {
  font-size: 22rpx;
  font-weight: 800;
}
.directory-row view text:last-child {
  margin-top: 5rpx;
  overflow: hidden;
  color: var(--bao-mobile-ink-500);
  font-size: 18rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.directory-row > text {
  margin-left: 16rpx;
  color: var(--bao-mobile-jade-700);
  font-size: 34rpx;
}
</style>
