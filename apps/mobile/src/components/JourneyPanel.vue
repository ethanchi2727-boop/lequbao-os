<script setup lang="ts">
import { JOURNEY_STEPS, type ExperienceSnapshot } from '@lequ/contracts'

defineProps<{
  snapshot: ExperienceSnapshot
}>()

defineEmits<{
  reset: []
}>()
</script>

<template>
  <aside class="journey-panel">
    <view class="panel-heading">
      <view>
        <text class="eyebrow">LIVE JOURNEY</text>
        <text class="panel-title">端到端交付链路</text>
      </view>
      <text class="progress-value">{{ snapshot.completionRate }}%</text>
    </view>

    <view class="progress-track" aria-label="流程完成度">
      <view class="progress-fill" :style="{ width: `${snapshot.completionRate}%` }" />
    </view>

    <scroll-view class="step-scroll" scroll-y :show-scrollbar="false">
      <view class="step-list">
        <view
          v-for="step in JOURNEY_STEPS"
          :key="step.key"
          class="journey-step"
          :class="{
            done: step.index <= snapshot.completedSteps,
            current: snapshot.nextStep?.index === step.index,
          }"
        >
          <view class="step-marker">
            <text>{{ step.index <= snapshot.completedSteps ? '✓' : step.index }}</text>
          </view>
          <view class="step-copy">
            <text class="step-title">{{ step.shortTitle }}</text>
            <text class="step-description">{{ step.description }}</text>
          </view>
          <text class="risk">{{ step.riskLevel }}</text>
        </view>
      </view>
    </scroll-view>

    <view class="evidence-row">
      <view>
        <text class="evidence-value">{{ snapshot.metrics.auditCoverage }}%</text>
        <text class="evidence-label">审计覆盖</text>
      </view>
      <view>
        <text class="evidence-value">{{ snapshot.metrics.eventCount }}</text>
        <text class="evidence-label">领域事件</text>
      </view>
      <button class="reset-button" @click="$emit('reset')">重置演示</button>
    </view>
  </aside>
</template>

<style scoped lang="scss">
.journey-panel {
  display: flex;
  width: 338px;
  height: min(820px, calc(100vh - 150px));
  min-height: 640px;
  flex-direction: column;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 30px;
  background: linear-gradient(180deg, rgba(21, 28, 58, 0.96), rgba(9, 13, 31, 0.98));
  color: #fff;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.25);
}

.panel-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.eyebrow,
.panel-title,
.step-title,
.step-description,
.evidence-value,
.evidence-label {
  display: block;
}

.eyebrow {
  margin-bottom: 7px;
  color: #8984ff;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.18em;
}

.panel-title {
  font-size: 20px;
  font-weight: 850;
}

.progress-value {
  font-size: 24px;
  font-weight: 900;
}

.progress-track {
  height: 7px;
  margin: 18px 0 16px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.08);
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #675cf6, #4f9bf8, #36d5b0);
  transition: width 360ms ease;
}

.step-scroll {
  min-height: 0;
  flex: 1;
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 2px 2px 12px;
}

.journey-step {
  display: grid;
  min-height: 56px;
  grid-template-columns: 30px 1fr auto;
  align-items: center;
  gap: 11px;
  padding: 8px 9px;
  border-radius: 15px;
  color: rgba(255, 255, 255, 0.46);
}

.journey-step.current {
  background: rgba(103, 92, 246, 0.17);
  color: #fff;
}

.journey-step.done {
  color: rgba(255, 255, 255, 0.84);
}

.step-marker {
  display: flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 850;
}

.done .step-marker {
  border-color: rgba(54, 213, 176, 0.32);
  background: rgba(54, 213, 176, 0.14);
  color: #57e0bd;
}

.current .step-marker {
  border-color: #7c72ff;
  background: #675cf6;
}

.step-title {
  margin-bottom: 3px;
  font-size: 14px;
  font-weight: 800;
}

.step-description {
  overflow: hidden;
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.risk {
  padding: 4px 6px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.07);
  font-size: 10px;
  font-weight: 800;
}

.evidence-row {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.evidence-value {
  font-size: 16px;
  font-weight: 900;
}

.evidence-label {
  margin-top: 3px;
  color: rgba(255, 255, 255, 0.46);
  font-size: 10px;
}

.reset-button {
  min-height: 42px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.74);
  font-size: 12px;
  font-weight: 800;
}

@media (max-width: 1020px) {
  .journey-panel {
    width: min(100%, 760px);
    height: auto;
    min-height: 0;
  }

  .step-scroll {
    max-height: 360px;
  }
}

@media (max-width: 760px) {
  .journey-panel {
    width: auto;
    margin: 0 14px 30px;
    padding: 20px;
    border-radius: 24px;
  }
}
</style>
