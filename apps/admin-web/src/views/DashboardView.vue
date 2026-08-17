<script setup lang="ts">
import MetricCard from '../components/MetricCard.vue'

const metrics = [
  { label: '平台 GMV', value: '¥ 8,426 万', change: '+18.6%', detail: '较上月 · 实时口径', tone: 'indigo' },
  { label: '活跃商家', value: '12,846', change: '+936', detail: '31 个运营城市', tone: 'mint' },
  { label: '续费率', value: '91.8%', change: '+2.4%', detail: '近 90 天滚动', tone: 'amber' },
  { label: '风险事件', value: '27', change: '-12', detail: '3 项需要审批', tone: 'coral' },
] as const

const cities = [
  { rank: '01', city: '上海', merchants: '2,418', gmv: '1,936 万', health: 96, trend: '+22.4%' },
  { rank: '02', city: '杭州', merchants: '1,672', gmv: '1,258 万', health: 94, trend: '+19.1%' },
  { rank: '03', city: '成都', merchants: '1,405', gmv: '986 万', health: 91, trend: '+17.8%' },
  { rank: '04', city: '深圳', merchants: '1,286', gmv: '1,102 万', health: 90, trend: '+15.6%' },
] as const
</script>

<template>
  <main class="dashboard page-wrap">
    <section class="page-intro">
      <div>
        <span class="eyebrow">NATIONAL OPERATIONS · LIVE</span>
        <h1>全国经营控制塔</h1>
        <p>从城市网络到每笔高风险操作，让增长、交付与治理在同一事实层上协同。</p>
      </div>
      <div class="intro-actions">
        <button class="secondary-button">导出经营简报</button>
        <button class="primary-button">✦ 询问 HQ Copilot</button>
      </div>
    </section>

    <section class="metric-grid">
      <MetricCard v-for="metric in metrics" :key="metric.label" v-bind="metric" />
    </section>

    <section class="dashboard-grid">
      <article class="panel map-panel">
        <div class="panel-head">
          <div><span class="panel-kicker">NETWORK PULSE</span><h2>城市网络态势</h2></div>
          <button class="quiet-button">查看城市网络 →</button>
        </div>
        <div class="map-stage">
          <div class="map-glow glow-one" /><div class="map-glow glow-two" />
          <div class="city-node shanghai"><i />上海<strong>96</strong></div>
          <div class="city-node hangzhou"><i />杭州<strong>94</strong></div>
          <div class="city-node chengdu"><i />成都<strong>91</strong></div>
          <div class="city-node shenzhen"><i />深圳<strong>90</strong></div>
          <div class="network-line line-one" /><div class="network-line line-two" /><div class="network-line line-three" />
          <div class="map-legend"><span><i class="healthy" />健康</span><span><i class="attention" />关注</span><span>31 城市在线</span></div>
        </div>
      </article>

      <article class="panel ai-panel">
        <div class="ai-orb">✦</div>
        <span class="panel-kicker">HQ COPILOT BRIEF</span>
        <h2>今天优先处理三件事</h2>
        <ol class="brief-list">
          <li><span>01</span><div><strong>华东续费窗口正在收窄</strong><p>41 家商户进入 7 日窗口，建议城市经理今天完成提案确认。</p></div></li>
          <li><span>02</span><div><strong>2 个 Skill 版本待灰度复核</strong><p>餐厅订座成功率提升 1.8%，退款护栏未触发。</p></div></li>
          <li><span>03</span><div><strong>售后裁决需要 L3 审批</strong><p>涉及 ¥12,860 冲正，证据链已完整。</p></div></li>
        </ol>
        <button class="ai-action">打开审批工作台 <span>↗</span></button>
      </article>
    </section>

    <section class="panel ranking-panel">
      <div class="panel-head">
        <div><span class="panel-kicker">CITY BENCHMARK</span><h2>城市经营质量排行</h2></div>
        <div class="range-tabs"><button class="active">本月</button><button>本季</button><button>年度</button></div>
      </div>
      <div class="ranking-table">
        <div class="table-row table-head"><span>排名 / 城市</span><span>活跃商家</span><span>GMV</span><span>经营健康度</span><span>增长</span></div>
        <div v-for="city in cities" :key="city.city" class="table-row">
          <span class="city-cell"><b>{{ city.rank }}</b><i>{{ city.city.slice(0, 1) }}</i><strong>{{ city.city }}</strong></span>
          <span>{{ city.merchants }}</span><span>¥ {{ city.gmv }}</span>
          <span class="health-cell"><i><em :style="{ width: `${city.health}%` }" /></i>{{ city.health }}</span>
          <span class="trend">{{ city.trend }}</span>
        </div>
      </div>
    </section>
  </main>
</template>
