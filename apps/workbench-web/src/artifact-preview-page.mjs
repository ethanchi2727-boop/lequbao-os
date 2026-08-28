const read = (record, snake, camel = snake) => record?.[snake] ?? record?.[camel];
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, fallback = '暂无') => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const preferred = value.summary ?? value.headline ?? value.title ?? value.message;
    if (preferred) return String(preferred);
    return Object.values(value)
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .slice(0, 4)
      .join(' · ');
  }
  return fallback;
};
const dateText = (value) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '尚未生成';

export function renderConversationTopbar({ view, shell, escapeHtml, icon }) {
  return `<header class="topbar artifact-topbar"><div class="mobile-title"><button data-action="back" aria-label="返回">${icon('back')}</button><strong>${escapeHtml(view.title)}</strong><small>${escapeHtml(shell.status)}</small></div><div class="crumb">乐趣宝 <b>›</b> AI 工作台 <b>›</b> <strong>${escapeHtml(view.title)}</strong></div><div class="top-actions"><span>${escapeHtml(shell.status)}</span><button data-route="page-003">${icon('plus')} 新任务</button><button data-route="page-010">${icon('clock')} 后台任务</button></div></header>`;
}

export function renderConversationThread({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (view.page === 'page-019')
    return renderFieldProvenance({ contract, demoMode, livePageState, view, escapeHtml });
  if (view.page === 'page-018')
    return renderChangeConfirmation({ contract, demoMode, livePageState, view, escapeHtml });
  if (view.page === 'page-017')
    return renderMissingItems({ contract, demoMode, livePageState, view, escapeHtml });
  if (view.page === 'page-016')
    return renderRecognitionReview({ contract, demoMode, livePageState, view, escapeHtml });
  if (view.page === 'page-012')
    return renderIdentitySwitcher({ contract, demoMode, livePageState, view, escapeHtml });
  if (['page-011', 'page-015'].includes(view.page))
    return renderSourceLibrary({ contract, demoMode, livePageState, view, escapeHtml });
  if (view.page === 'page-010')
    return renderJobQueue({ contract, demoMode, livePageState, view, escapeHtml });
  if (view.page === 'page-009')
    return renderSessionInbox({ contract, demoMode, livePageState, view, escapeHtml });
  if (view.page === 'page-007')
    return renderProvenance({ contract, demoMode, livePageState, view, escapeHtml });
  if (!demoMode && !livePageState.data) return renderUnavailable(contract, view, escapeHtml);
  const task = demoMode
    ? {
        id: 'demo-task',
        conversation_id: 'demo-conversation',
        status: 'SUCCEEDED',
        plan_version: 3,
        completed_at: '2026-08-24T12:18:00.000Z',
        result_summary_redacted:
          '本周营收环比增长 12.4%，到店转化提升；晚间履约时长和两项异常退款需要管理层关注。',
        artifacts: [
          {
            name: '本周经营复盘_v3.pptx',
            content_type:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            size_bytes: 1468000,
            status: 'READY',
            sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
          },
          {
            name: '经营数据核验表.xlsx',
            content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size_bytes: 286720,
            status: 'READY',
            sha256: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef1',
          },
        ],
        evidence: [
          {
            evidence_type: 'BUSINESS_RECORD',
            label: '门店经营日报',
            summary_redacted: '覆盖 7 天订单、核销与退款事实',
            reference_hash: 'ev-41f8a731',
          },
          {
            evidence_type: 'HUMAN_CONFIRMATION',
            label: '财务口径确认',
            summary_redacted: '收入与退款按锁定口径复核',
            reference_hash: 'ev-9cc2d018',
          },
          {
            evidence_type: 'TOOL_RESULT',
            label: '周环比计算',
            summary_redacted: '输入范围与计算版本已记录',
            reference_hash: 'ev-d7125a44',
          },
        ],
        steps: [
          { status: 'SUCCEEDED' },
          { status: 'SUCCEEDED' },
          { status: 'SUCCEEDED' },
          { status: 'SUCCEEDED' },
        ],
      }
    : livePageState.data;
  const artifacts = list(task.artifacts);
  const evidence = list(task.evidence);
  const steps = list(task.steps);
  const readyArtifacts = artifacts.filter((item) => item.status === 'READY').length;
  const succeededSteps = steps.filter((item) => item.status === 'SUCCEEDED').length;
  const taskId = read(task, 'id') ?? 'task';
  const conversationId = read(task, 'conversation_id', 'conversationId');
  const taskHref = conversationId
    ? `/bao/page-005?${demoMode ? 'demo=1&' : ''}conversationId=${encodeURIComponent(conversationId)}`
    : `/bao/page-010${demoMode ? '?demo=1' : ''}`;
  const status = read(task, 'status') ?? 'UNKNOWN';
  const summary = text(
    read(task, 'result_summary_redacted', 'resultSummaryRedacted'),
    '任务尚未生成可预览的脱敏摘要。',
  );
  const completedAt = read(task, 'completed_at', 'completedAt');
  const planVersion = read(task, 'plan_version', 'planVersion') ?? 1;
  return `<section class="artifact-page" data-page-id="${contract.id}" data-experience="artifact-preview">
    <header class="artifact-heading"><div><small>${demoMode ? '演示成果 · 非真实业务数据' : '权威任务成果'}</small><h1>本周经营复盘</h1><p>先核对版本、摘要、来源和交付边界，再进入任何发布动作。</p></div><div class="artifact-heading-actions"><span class="artifact-status">${escapeHtml(status)}</span><a href="${taskHref}">返回任务</a></div></header>
    <div class="artifact-layout">
      <main class="artifact-canvas">
        <div class="artifact-toolbar"><div><b>成果预览</b><span>版本 ${escapeHtml(planVersion)} · ${escapeHtml(dateText(completedAt))}</span></div><span>${readyArtifacts}/${artifacts.length} 个成果就绪</span></div>
        <article class="report-paper" aria-label="成果脱敏摘要预览">
          <header><small>WEEKLY OPERATIONS REVIEW</small><h2>本周经营复盘</h2><p>${escapeHtml(summary)}</p></header>
          <div class="report-kpis"><span><small>执行步骤</small><b>${succeededSteps}/${steps.length}</b><em>以任务记录为准</em></span><span><small>来源证据</small><b>${evidence.length}</b><em>可追溯记录</em></span><span><small>成果文件</small><b>${artifacts.length}</b><em>${readyArtifacts} 个可用</em></span></div>
          <section><h3>管理层摘要</h3><p>${escapeHtml(summary)}</p></section>
          <section class="report-focus"><div><h3>本版核验重点</h3><p>版本差异、数据口径、敏感信息和目标渠道必须在交付前逐项确认。</p></div><span>人工确认后再发布</span></section>
        </article>
        <p class="artifact-disclaimer">当前页面只预览服务端脱敏摘要和成果元数据，不会把未授权文件正文或演示内容冒充生产成果。</p>
      </main>
      <aside class="artifact-inspector">
        <section><header><div><small>版本摘要</small><strong>计划版本 ${escapeHtml(planVersion)}</strong></div><span>${escapeHtml(status)}</span></header><dl><div><dt>任务编号</dt><dd>${escapeHtml(taskId)}</dd></div><div><dt>完成时间</dt><dd>${escapeHtml(dateText(completedAt))}</dd></div><div><dt>执行结果</dt><dd>${succeededSteps}/${steps.length} 步成功</dd></div></dl></section>
        <section><header><div><small>成果文件</small><strong>${artifacts.length || '暂无'} 项</strong></div></header><div class="artifact-files">${artifacts.length ? artifacts.map((item) => renderArtifact(item, escapeHtml)).join('') : '<p>服务端尚未返回成果元数据。</p>'}</div></section>
        <section><header><div><small>来源覆盖</small><strong>${evidence.length || '暂无'} 条证据</strong></div><a href="/bao/page-007?taskId=${encodeURIComponent(taskId)}">查看完整轨迹</a></header><div class="evidence-list">${evidence.length ? evidence.map((item) => renderEvidence(item, escapeHtml)).join('') : '<p>没有可展示的脱敏证据摘要。</p>'}</div></section>
        <section class="delivery-check"><header><div><small>交付准备</small><strong>仍需人工核验</strong></div></header><ul><li class="done">成果版本与哈希已记录</li><li class="done">来源摘要可追溯</li><li>接收人、渠道与发布时间待确认</li></ul><button disabled>核验后进入发布确认</button><p>当前接口不提供文件下载或自动外发，避免越权读取和未确认发布。</p></section>
      </aside>
    </div>
  </section>`;
}

function renderFieldProvenance({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data) return renderUnavailable(contract, view, escapeHtml);
  const session = demoMode
    ? {
        id: 'demo-intake-session',
        status: 'WAITING_CONFIRMATION',
        version: 4,
        assets: [
          {
            id: 'asset-license',
            originalFilename: '营业执照.jpg',
            assetType: 'IMAGE',
            sourceChannel: 'WEB_UPLOAD',
            sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
            securityStatus: 'SAFE',
            processingStatus: 'SUCCEEDED',
            createdAt: '2026-08-25T00:00:00.000Z',
          },
          {
            id: 'asset-audio',
            originalFilename: '店长补充说明.wav',
            assetType: 'AUDIO',
            sourceChannel: 'WEB_UPLOAD',
            sha256: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef1',
            securityStatus: 'SAFE',
            processingStatus: 'SUCCEEDED',
            createdAt: '2026-08-25T00:08:00.000Z',
          },
        ],
        fields: [
          {
            id: 'field-1',
            fieldPath: 'merchant.legalName',
            candidateValue: '南京拾味餐饮管理有限公司',
            confidence: 0.99,
            decisionStatus: 'CONFIRMED',
            sourceAssetId: 'asset-license',
          },
          {
            id: 'field-2',
            fieldPath: 'store.address',
            candidateValue: '秦淮区中山南路 18 号',
            confidence: 0.74,
            decisionStatus: 'CONFLICT',
            sourceAssetId: 'asset-license',
          },
          {
            id: 'field-3',
            fieldPath: 'store.address',
            candidateValue: '中山南路 18 号 2 楼',
            confidence: 0.67,
            decisionStatus: 'CONFLICT',
            sourceAssetId: 'asset-audio',
          },
        ],
      }
    : livePageState.data;
  const fields = list(session.fields);
  const assets = new Map(list(session.assets).map((asset) => [asset.id, asset]));
  const paths = [...new Set(fields.map((field) => String(field.fieldPath)))];
  const sessionId = String(session.id ?? 'session');
  return `<section class="provenance-page" data-page-id="${contract.id}" data-experience="field-provenance"><header class="provenance-heading"><div><small>${demoMode ? '演示来源 · 非真实业务数据' : '服务端持久化证据'}</small><h1>字段来源</h1><p>从候选字段回到原始材料、安全处理状态和人工决定。</p></div><a href="/bao/page-016?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">返回识别结果</a></header><section class="provenance-summary"><span><small>字段路径</small><b>${paths.length}</b><em>会话 v${escapeHtml(session.version ?? 1)}</em></span><span><small>候选记录</small><b>${fields.length}</b><em>追加式历史</em></span><span><small>来源材料</small><b>${assets.size}</b><em>哈希绑定</em></span></section><div class="provenance-layout"><main><header><div><small>候选历史</small><h2>按服务端返回顺序保留</h2></div><span>${escapeHtml(session.status ?? 'UNKNOWN')}</span></header><div class="provenance-list">${
    paths.length
      ? paths
          .map((path) =>
            renderProvenancePath(
              path,
              fields.filter((field) => field.fieldPath === path),
              assets,
              escapeHtml,
            ),
          )
          .join('')
      : '<div class="source-list-empty"><strong>暂无字段来源</strong><p>材料完成识别后会形成不可覆盖的候选记录。</p></div>'
  }</div></main><aside><section><small>证据边界</small><h2>当前接口实际返回</h2><ul><li>候选值、置信度和决定状态</li><li>来源材料类型、渠道和 SHA-256</li><li>安全扫描与处理结果</li><li>会话版本和业务状态</li></ul></section><section><small>尚未由读取接口暴露</small><h2>不在客户端推测</h2><ul><li>OCR 页码、框选坐标或音频时间段</li><li>模型、规则和规范化版本</li><li>决定人、确认时间和审计追踪号</li></ul></section><section class="provenance-guard"><small>不可覆盖原则</small><p>修正只能追加候选和决定；原始材料、哈希、冲突与被替代值继续保留。</p></section><nav><a href="/bao/page-020?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">查看原始材料</a><a href="/bao/page-018?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">返回确认变更</a></nav></aside></div></section>`;
}

function renderProvenancePath(path, candidates, assets, escapeHtml) {
  return `<article class="provenance-path"><header><code>${escapeHtml(path)}</code><span>${candidates.length} 个候选</span></header><div>${candidates
    .map((field, index) => {
      const asset = assets.get(field.sourceAssetId);
      return `<section class="provenance-candidate status-${String(field.decisionStatus).toLowerCase()}"><b>${index + 1}</b><div><header><strong>${escapeHtml(text(field.candidateValue, '空候选'))}</strong><span>${escapeHtml(field.decisionStatus ?? 'PROPOSED')}</span></header><p>置信度 ${field.confidence == null ? '未返回' : `${Math.round(Number(field.confidence) * 100)}%`} · 候选 ${escapeHtml(field.id ?? '未知')}</p><footer><span>${escapeHtml(asset?.originalFilename ?? '未知材料')}</span><code>${escapeHtml(String(asset?.sha256 ?? '无哈希').slice(0, 12))}…</code><em>${escapeHtml(asset?.securityStatus ?? 'UNKNOWN')} / ${escapeHtml(asset?.processingStatus ?? 'UNKNOWN')}</em></footer></div></section>`;
    })
    .join('')}</div></article>`;
}

function renderChangeConfirmation({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data) return renderUnavailable(contract, view, escapeHtml);
  const session = demoMode
    ? {
        id: 'demo-intake-session',
        status: 'WAITING_CONFIRMATION',
        version: 4,
        missingItems: [],
        impactTargets: ['MINI_PROGRAM', 'GEO', 'AI_CUSTOMER_SERVICE'],
        fields: [
          {
            id: 'field-legal',
            fieldPath: 'merchant.legalName',
            candidateValue: '南京拾味餐饮管理有限公司',
            decisionStatus: 'PROPOSED',
            confidence: 0.99,
          },
          {
            id: 'field-contact',
            fieldPath: 'merchant.public_contact.phone',
            candidateValue: '025-8888 6612',
            decisionStatus: 'PROPOSED',
            confidence: 0.91,
          },
          {
            id: 'field-price',
            fieldPath: 'product.average_price',
            candidateValue: 6800,
            decisionStatus: 'PROPOSED',
            confidence: 0.88,
          },
        ],
      }
    : livePageState.data;
  const pending = list(session.fields).filter((field) =>
    ['PROPOSED', 'CONFLICT'].includes(field.decisionStatus),
  );
  const conflicts = pending.filter((field) => field.decisionStatus === 'CONFLICT').length;
  const sessionId = String(session.id ?? 'session');
  const blocked = list(session.missingItems).length > 0 || conflicts > 0;
  const success = view.state === 'success';
  return `<section class="confirmation-page" data-page-id="${contract.id}" data-experience="change-confirmation"><header class="confirmation-heading"><div><small>${demoMode ? '演示确认 · 非真实业务数据' : '字段级人工确认'}</small><h1>确认变更</h1><p>逐项核对候选、影响和确认资格；不同风险类型必须分别提交。</p></div><a href="/bao/page-016?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">返回识别结果</a></header>${success ? `<section class="confirmation-receipt" role="status"><b>确认请求已受理</b><span>服务端返回会话 v${escapeHtml(session.version ?? 1)}；确认事件与审计记录已在服务端保存。</span></section>` : ''}<section class="confirmation-summary"><span><small>待确认候选</small><b>${pending.length}</b><em>会话 v${escapeHtml(session.version ?? 1)}</em></span><span><small>冲突字段</small><b>${conflicts}</b><em>${conflicts ? '必须先处理' : '当前无冲突'}</em></span><span><small>阻断缺项</small><b>${list(session.missingItems).length}</b><em>${blocked ? '不可整体提交' : '已满足确认条件'}</em></span></section><div class="confirmation-layout"><main><header><div><small>字段差异</small><h2>正式值与待确认候选</h2></div><span>${pending.length} 项</span></header><div class="confirmation-list">${pending.length ? pending.map((field) => renderConfirmationField(field, escapeHtml)).join('') : '<div class="source-list-empty"><strong>没有待确认候选</strong><p>返回识别结果检查材料处理状态。</p></div>'}</div></main><aside><section><small>影响范围</small><h2>确认后可能进入这些服务</h2><div class="confirmation-targets">${
    list(session.impactTargets)
      .map((target) => `<span>${escapeHtml(target)}</span>`)
      .join('') || '<span>服务端尚未返回影响目标</span>'
  }</div><p>确认只记录字段决定，不代表已经对外发布。</p></section><section><small>确认资格</small><h2>由服务端最终裁决</h2><ul><li>当前角色必须拥有商户建档确认权限</li><li>法律主体、支付和公开承诺要求 MFA</li><li>候选类型与确认类型必须完全匹配</li><li>提交版本必须仍是 v${escapeHtml(session.version ?? 1)}</li></ul></section>${demoMode ? '<section class="confirmation-command"><small>提交确认</small><h2>演示模式不可写入</h2><button disabled>选择字段后确认</button></section>' : `<section class="confirmation-command" data-command-form="merchant-intake-confirm"><small>提交一组同类型字段</small><h2>填写候选编号和确认快照</h2><label>确认类型<select data-command-field="confirmationType" required><option value="">请选择</option><option value="LEGAL_SUBJECT">法律主体</option><option value="PAYMENT">支付配置</option><option value="PRICE">商品价格</option><option value="REFUND_RULE">退款规则</option><option value="PUBLIC_CONTACT">公开联系方式</option><option value="PUBLISH_IMPACT">发布影响</option></select></label><label>候选字段编号<input data-command-field="candidateIds" required placeholder="多个编号用逗号分隔"/></label><label>确认内容 JSON<textarea data-command-field="confirmedPayload" required placeholder='{"merchant.legalName":"示例"}'></textarea></label><label>确认渠道<select data-command-field="confirmationChannel" required><option value="WEB_CLICK">网页确认</option><option value="MOBILE_CLICK">移动端确认</option><option value="WECOM_SECURE_CARD">企业微信安全卡片</option></select></label><label>当前会话版本<input data-command-field="expectedVersion" type="number" required value="${escapeHtml(session.version ?? 1)}"/></label><button type="button" data-command="merchant-intake-confirm" ${blocked ? 'disabled' : ''}>核对后提交字段确认</button><output aria-live="polite">${blocked ? '仍有冲突或缺项，请先返回处理' : '提交前还会显示二次确认'}</output></section>`}<nav><a href="/bao/page-019?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">查看字段来源</a><a href="/bao/page-021?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">查看影响与发布</a></nav></aside></div></section>`;
}

function renderConfirmationField(field, escapeHtml) {
  const path = String(field.fieldPath ?? '未知字段');
  const risk = path.startsWith('payment.')
    ? '资金配置'
    : path.includes('price')
      ? '公开价格'
      : path.startsWith('merchant.public_contact.')
        ? '公开信息'
        : path.startsWith('merchant.')
          ? '法律主体'
          : '业务资料';
  const confidence =
    field.confidence == null ? '—' : `${Math.round(Number(field.confidence) * 100)}%`;
  return `<article class="confirmation-field status-${String(field.decisionStatus).toLowerCase()}"><header><code>${escapeHtml(path)}</code><span>${risk}</span></header><div><section><small>当前正式值</small><strong>尚未写入正式档案</strong><p>本接口不返回历史正式值，不在客户端推测。</p></section><b>→</b><section><small>待确认候选 · ${confidence}</small><strong>${escapeHtml(text(field.candidateValue, '空候选'))}</strong><p>${escapeHtml(field.decisionStatus ?? 'PROPOSED')} · 编号 ${escapeHtml(field.id ?? '未知')}</p></section></div></article>`;
}

function renderMissingItems({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data) return renderUnavailable(contract, view, escapeHtml);
  const session = demoMode
    ? {
        id: 'demo-intake-session',
        status: 'WAITING_ANSWERS',
        version: 4,
        fields: [{ fieldPath: 'merchant.legalName' }, { fieldPath: 'store.name' }],
        missingItems: ['merchant.publicContact', 'store.serviceHours', 'product.refundRule'],
        suggestedItems: ['store.parkingGuide'],
      }
    : livePageState.data;
  const blockers = list(session.missingItems);
  const suggestions = demoMode ? list(session.suggestedItems) : [];
  const sessionId = String(session.id ?? 'session');
  const completeness = Math.min(
    100,
    Math.round(
      (list(session.fields).length / Math.max(1, list(session.fields).length + blockers.length)) *
        100,
    ),
  );
  return `<section class="missing-page" data-page-id="${contract.id}" data-experience="missing-items"><header class="missing-heading"><div><small>${demoMode ? '演示缺项 · 非真实业务数据' : '服务端阻断清单'}</small><h1>缺项追问</h1><p>只追问影响当前建档和交付的内容，并说明为什么需要。</p></div><a href="/bao/page-016?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">返回识别结果</a></header><section class="missing-progress"><div><span style="--done:${completeness}%"></span></div><p><b>${blockers.length}</b> 项阻断内容待处理 <small>会话 v${escapeHtml(session.version ?? 1)} · ${escapeHtml(session.status ?? 'UNKNOWN')}</small></p></section><div class="missing-layout"><main><section><header><div><small>阻断缺项</small><h2>补齐后才能进入确认</h2></div><span>${blockers.length} 项</span></header><div class="missing-list">${blockers.length ? blockers.map((item, index) => renderMissingItem(item, index, true, escapeHtml)).join('') : '<div class="source-list-empty"><strong>没有阻断缺项</strong><p>可返回识别结果核对冲突和待确认字段。</p></div>'}</div></section><section><header><div><small>建议补充</small><h2>不阻断当前任务</h2></div><span>${suggestions.length} 项</span></header><div class="missing-list optional">${suggestions.length ? suggestions.map((item, index) => renderMissingItem(item, index, false, escapeHtml)).join('') : '<p class="missing-none">服务端当前没有返回建议补充项。</p>'}</div></section></main><aside><section><small>回答当前缺项</small><h2>保存为可追溯文字材料</h2><p>请同时写明字段名和答案；系统会重新识别并更新缺项，不直接写入正式档案。</p>${demoMode ? '<textarea disabled placeholder="演示模式不写入业务系统"></textarea><button disabled>提交回答材料</button>' : '<div class="missing-answer" data-command-form="merchant-intake-message-add"><label for="missing-answer">缺项回答</label><textarea id="missing-answer" data-command-field="content" required maxlength="4000" placeholder="例：门店营业时间为每天 10:00–22:00"></textarea><button type="button" data-command="merchant-intake-message-add">提交回答材料</button></div>'}<output aria-live="polite">${demoMode ? '演示模式不提交' : '回答后回到同一会话和原字段位置'}</output></section><section class="missing-recovery"><small>恢复位置</small><ol><li><b>1</b><span>回答写入当前建档会话</span></li><li><b>2</b><span>处理链重新识别受影响字段</span></li><li><b>3</b><span>继续原任务，不新建无关会话</span></li></ol></section><section><small>数据最小化</small><ul><li>不收集与当前交付无关的个人或经营信息</li><li>明确“暂不提供”不等于绕过阻断检查</li><li>主体、价格和退款规则仍需单独人工确认</li></ul></section><a class="missing-next" href="/bao/page-018?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">进入确认变更</a></aside></div></section>`;
}

function renderMissingItem(item, index, blocking, escapeHtml) {
  const path = String(item);
  const category = path.startsWith('merchant.')
    ? '主体信息'
    : path.startsWith('store.')
      ? '门店信息'
      : path.startsWith('product.')
        ? '商品与规则'
        : '交付依赖';
  const reason = path.includes('publicContact')
    ? '用于公开页面客户联系，需确认可公开范围。'
    : path.includes('serviceHours')
      ? '营业时间会影响展示、客服回答和履约预期。'
      : path.includes('refundRule')
        ? '退款规则是高风险公开承诺，必须明确并人工确认。'
        : '可提高门店公开信息完整度，但不阻断当前建档。';
  return `<article><b>${index + 1}</b><div><header><span>${category}</span>${blocking ? '<em>阻断</em>' : '<em class="optional">可选</em>'}</header><code>${escapeHtml(path)}</code><p>${reason}</p><button type="button" data-missing-choice="${escapeHtml(path)}">填写此项</button><button type="button" data-missing-choice="${escapeHtml(`${path}: 暂不提供`)}">暂不提供</button></div></article>`;
}

function renderRecognitionReview({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data) return renderUnavailable(contract, view, escapeHtml);
  const session = demoMode
    ? {
        id: 'demo-intake-session',
        status: 'WAITING_CONFIRMATION',
        version: 4,
        missingItems: ['merchant.publicContact'],
        impactTargets: ['MINI_PROGRAM', 'GEO'],
        assets: [
          { id: 'asset-license', originalFilename: '营业执照.jpg' },
          { id: 'asset-menu', originalFilename: '秋季菜单与价格.pdf' },
          { id: 'asset-audio', originalFilename: '店长补充说明.wav' },
        ],
        fields: [
          {
            id: 'field-1',
            fieldPath: 'merchant.legalName',
            candidateValue: '南京拾味餐饮管理有限公司',
            confidence: 0.99,
            decisionStatus: 'PROPOSED',
            sourceAssetId: 'asset-license',
          },
          {
            id: 'field-2',
            fieldPath: 'store.name',
            candidateValue: '拾味小馆 · 新街口店',
            confidence: 0.96,
            decisionStatus: 'CONFIRMED',
            sourceAssetId: 'asset-menu',
          },
          {
            id: 'field-3',
            fieldPath: 'store.address',
            candidateValue: '秦淮区中山南路 18 号',
            confidence: 0.74,
            decisionStatus: 'CONFLICT',
            sourceAssetId: 'asset-license',
          },
          {
            id: 'field-4',
            fieldPath: 'store.address',
            candidateValue: '中山南路 18 号 2 楼',
            confidence: 0.67,
            decisionStatus: 'CONFLICT',
            sourceAssetId: 'asset-audio',
          },
          {
            id: 'field-5',
            fieldPath: 'product.averagePrice',
            candidateValue: 6800,
            confidence: 0.88,
            decisionStatus: 'PROPOSED',
            sourceAssetId: 'asset-menu',
          },
        ],
      }
    : livePageState.data;
  const fields = list(session.fields);
  const assets = new Map(list(session.assets).map((asset) => [asset.id, asset]));
  const confirmed = fields.filter((field) =>
    ['CONFIRMED', 'CORRECTED'].includes(field.decisionStatus),
  ).length;
  const conflicts = fields.filter((field) => field.decisionStatus === 'CONFLICT').length;
  const review = fields.filter((field) => field.decisionStatus === 'PROPOSED').length;
  const sessionId = String(session.id ?? 'session');
  return `<section class="recognition-page" data-page-id="${contract.id}" data-experience="recognition-review"><header class="recognition-heading"><div><small>${demoMode ? '演示识别 · 非真实业务数据' : '服务端字段候选'}</small><h1>识别结果</h1><p>逐字段核对候选值、置信度、冲突和原始材料。</p></div><a href="/bao/page-018?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">进入确认变更</a></header><section class="recognition-summary"><span><small>候选字段</small><b>${fields.length}</b><em>当前版本 v${escapeHtml(session.version ?? 1)}</em></span><span><small>已确认</small><b>${confirmed}</b><em>含人工修正</em></span><span><small>待核对</small><b>${review}</b><em>不自动写入</em></span><span><small>冲突候选</small><b>${conflicts}</b><em>必须人工决定</em></span></section><div class="recognition-layout"><main><header><div><small>字段候选</small><h2>${escapeHtml(session.status ?? 'UNKNOWN')}</h2></div><span>${fields.length} 项结果</span></header><section class="recognition-list">${fields.length ? fields.map((field) => renderRecognitionField(field, assets.get(field.sourceAssetId), escapeHtml)).join('') : '<div class="source-list-empty"><strong>还没有可审查的候选</strong><p>材料通过扫描和识别后会在这里显示。</p></div>'}</section></main><aside><section><small>审查口径</small><h2>置信度不等于业务真实</h2><ul><li>≥ 90% 只代表可建议，高风险字段仍要确认</li><li>70–89% 需核对原始材料与标准化结果</li><li>&lt; 70% 或 CONFLICT 不能自动写入</li></ul></section><section><small>未补齐项</small><h2>${list(session.missingItems).length || '无'} 项</h2><div class="recognition-tags">${
    list(session.missingItems)
      .map((item) => `<code>${escapeHtml(item)}</code>`)
      .join('') || '<span>当前没有服务端缺项</span>'
  }</div></section><section><small>可能影响的发布目标</small><div class="recognition-tags">${
    list(session.impactTargets)
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join('') || '<span>尚未计算影响</span>'
  }</div></section><nav><a href="/bao/page-017?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">处理缺项追问</a><a href="/bao/page-019?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">查看字段来源</a></nav></aside></div></section>`;
}

function renderRecognitionField(field, asset, escapeHtml) {
  const confidence =
    field.confidence === null || field.confidence === undefined
      ? null
      : Math.round(Number(field.confidence) * 100);
  const tier =
    confidence === null
      ? '无法判断'
      : confidence >= 90
        ? '可建议'
        : confidence >= 70
          ? '需核对'
          : '低信心';
  return `<article class="recognition-field status-${String(field.decisionStatus).toLowerCase()}"><header><div><code>${escapeHtml(field.fieldPath ?? '未知字段')}</code><span>${escapeHtml(field.decisionStatus ?? 'PROPOSED')}</span></div><b>${confidence === null ? '—' : `${confidence}%`}</b></header><h3>${escapeHtml(text(field.candidateValue, '空候选'))}</h3><footer><span>${tier}</span><small>来源：${escapeHtml(asset?.originalFilename ?? String(field.sourceAssetId ?? '未知材料'))}</small></footer></article>`;
}

export async function switchWorkbenchTenant({ tenantId, token, deviceId, request = fetch }) {
  const response = await request('/api/v1/auth/sessions/switch-tenant', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId, deviceId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code ?? `HTTP_${response.status}`);
  if (typeof body.accessToken !== 'string' || !body.identity)
    throw new Error('SESSION_RESPONSE_INVALID');
  return body;
}

function renderIdentitySwitcher({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data) return renderUnavailable(contract, view, escapeHtml);
  const context = demoMode
    ? {
        tenantId: '00000000-0000-4000-8000-000000000101',
        userId: '00000000-0000-4000-8000-000000000201',
        roleCodes: ['MERCHANT_OWNER', 'STORE_MANAGER'],
        storeIds: ['00000000-0000-4000-8000-000000000301'],
        sessionId: 'demo-session-not-a-real-credential',
        authLevel: 'MFA',
      }
    : livePageState.data;
  const roles = list(context.roleCodes);
  const stores = list(context.storeIds);
  return `<section class="identity-page" data-page-id="${contract.id}" data-experience="identity-switcher">
    <header class="identity-heading"><div><small>${demoMode ? '演示身份 · 非真实会话' : '服务端已确认'}</small><h1>身份与工作空间</h1><p>切换前核对当前租户、门店、角色和会话边界。</p></div><span>${escapeHtml(context.authLevel ?? 'PASSWORD')}</span></header>
    <div class="identity-grid"><main><section class="identity-current"><div class="identity-avatar" aria-hidden="true">${escapeHtml(String(context.userId).slice(0, 2).toUpperCase())}</div><div><small>当前认证主体</small><h2>员工 ${escapeHtml(String(context.userId).slice(0, 8))}…</h2><p>会话 ${escapeHtml(String(context.sessionId).slice(0, 12))}… · ${escapeHtml(context.authLevel ?? 'PASSWORD')} 认证</p></div><b>在线</b></section>
      <section class="identity-scope"><header><div><small>当前工作空间</small><h2>${escapeHtml(context.tenantId)}</h2></div><span>租户级边界</span></header><div class="identity-facts"><article><small>角色能力</small><strong>${roles.length} 项</strong><div>${roles.map((role) => `<span>${escapeHtml(role)}</span>`).join('')}</div></article><article><small>门店范围</small><strong>${stores.length || '租户级'}</strong><div>${stores.length ? stores.map((store) => `<code>${escapeHtml(String(store).slice(0, 8))}…</code>`).join('') : '<span>不限定单一门店</span>'}</div></article></div></section>
      <section class="identity-boundary"><header><small>切换后会发生什么</small><h2>业务数据必须按新范围重新读取</h2></header><ol><li><b>1</b><span><strong>重新验证成员关系</strong><small>目标租户中没有有效角色时服务端会拒绝。</small></span></li><li><b>2</b><span><strong>签发全新会话</strong><small>不继承原空间的门店、角色或资源缓存。</small></span></li><li><b>3</b><span><strong>保留本地未发送草稿</strong><small>页面重载后只恢复本地内容，业务事实从新租户读取。</small></span></li></ol></section></main>
      <aside><section><small>切换工作空间</small><h2>输入受信任的组织 ID</h2><p>请使用管理员或邀请链接提供的目标 ID。本页不枚举其他租户的成员关系。</p><form data-tenant-switch><label for="target-tenant">目标组织 ID</label><input id="target-tenant" name="tenantId" type="text" required pattern="[0-9a-fA-F-]{36}" placeholder="00000000-0000-4000-8000-000000000000" ${demoMode ? 'disabled' : ''}/><button ${demoMode ? 'disabled' : ''}>验证并切换</button><output aria-live="polite">${demoMode ? '演示模式不签发会话' : '切换会写入安全审计记录'}</output></form></section><section class="identity-guard"><small>最小权限边界</small><ul><li>不向页面展示访问或刷新凭证</li><li>不接受客户端自声明的用户和角色</li><li>切换失败时保留当前有效会话</li><li>新会话必须重新裁决所有资源范围</li></ul></section><a class="identity-return" href="/bao/page-003${demoMode ? '?demo=1' : ''}">返回新对话</a></aside></div>
  </section>`;
}

if (typeof document !== 'undefined')
  document.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element ? event.target.closest('[data-missing-choice]') : null;
    const answer = document.querySelector('#missing-answer');
    if (!(button instanceof HTMLButtonElement) || !(answer instanceof HTMLTextAreaElement)) return;
    answer.value = button.dataset.missingChoice ?? '';
    answer.dispatchEvent(new Event('input', { bubbles: true }));
    answer.focus();
  });

if (typeof document !== 'undefined')
  document.addEventListener('submit', async (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form?.matches('[data-tenant-switch]')) return;
    event.preventDefault();
    const output = form.querySelector('output');
    const button = form.querySelector('button');
    const tenantId = new FormData(form).get('tenantId');
    const token = sessionStorage.getItem('lequbao.employee-session');
    if (typeof tenantId !== 'string' || !token) return;
    button.disabled = true;
    output.textContent = '正在验证目标组织的成员关系…';
    try {
      let deviceId = sessionStorage.getItem('lequbao.employee-device');
      if (!deviceId) {
        deviceId = `workbench-${crypto.randomUUID()}`;
        sessionStorage.setItem('lequbao.employee-device', deviceId);
      }
      const replacement = await switchWorkbenchTenant({ tenantId, token, deviceId });
      sessionStorage.setItem('lequbao.employee-session', replacement.accessToken);
      sessionStorage.setItem('lequbao.employee-session-record', JSON.stringify(replacement));
      output.textContent = '切换成功，正在按新权限重新读取…';
      location.reload();
    } catch (error) {
      output.textContent = `切换失败：${error instanceof Error ? error.message : 'REQUEST_FAILED'}；当前会话已保留。`;
      button.disabled = false;
    }
  });

export function handlePageInput(target) {
  if (!(target instanceof HTMLInputElement)) return false;
  const config = {
    'conversation-search': ['[data-conversation-row]', '[data-conversation-count]', ' 个会话'],
    'task-search': ['[data-task-row]', '[data-task-count]', ' 个任务'],
    'material-search': ['[data-material-row]', '[data-material-count]', ' 份材料'],
  }[target.dataset.action];
  if (!config) return false;
  const query = target.value.trim().toLocaleLowerCase('zh-CN');
  let visible = 0;
  for (const row of document.querySelectorAll(config[0])) {
    const matches = !query || (row.dataset.search ?? '').includes(query);
    row.hidden = !matches;
    if (matches) visible += 1;
  }
  const count = document.querySelector(config[1]);
  if (count) count.textContent = `${visible}${config[2]}`;
  return true;
}

function renderSourceLibrary({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data && view.state !== 'empty')
    return renderUnavailable(contract, view, escapeHtml);
  const session = demoMode
    ? {
        id: 'demo-intake-session',
        status: 'EXTRACTING',
        channel: 'WEB',
        fields: [
          { sourceAssetId: 'asset-license' },
          { sourceAssetId: 'asset-license' },
          { sourceAssetId: 'asset-menu' },
          { sourceAssetId: 'asset-audio' },
        ],
        assets: [
          {
            id: 'asset-license',
            sourceChannel: 'WEB',
            assetType: 'IMAGE',
            originalFilename: '营业执照.jpg',
            mimeType: 'image/jpeg',
            sha256: 'a18f13bd864e2bb65cf71668c4f7bd6b1064d7fbf41f7238ca2fc9370d141a21',
            securityStatus: 'SAFE',
            processingStatus: 'SUCCEEDED',
            errorCode: null,
            createdBy: 'user-demo',
            createdAt: '2026-08-25T00:12:00.000Z',
          },
          {
            id: 'asset-menu',
            sourceChannel: 'MOBILE_H5',
            assetType: 'DOCUMENT',
            originalFilename: '秋季菜单与价格.pdf',
            mimeType: 'application/pdf',
            sha256: 'b44c871ba4f763d5957692de701cd482b961d82e3877111a067372982531745a',
            securityStatus: 'SAFE',
            processingStatus: 'PROCESSING',
            errorCode: null,
            createdBy: 'user-demo',
            createdAt: '2026-08-25T00:18:00.000Z',
          },
          {
            id: 'asset-audio',
            sourceChannel: 'WECOM',
            assetType: 'AUDIO',
            originalFilename: '店长补充说明.wav',
            mimeType: 'audio/wav',
            sha256: 'cf3361289a468f09e5018cd76a8dc00d5e9382e7d633ad7d0fa6e9da33f1d463',
            securityStatus: 'SAFE',
            processingStatus: 'SUCCEEDED',
            errorCode: null,
            createdBy: 'user-demo',
            createdAt: '2026-08-25T00:21:00.000Z',
          },
          {
            id: 'asset-rejected',
            sourceChannel: 'WEB',
            assetType: 'DOCUMENT',
            originalFilename: '来源不明附件.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sha256: 'd78a49a51f169fec05039cba61cdad1bd01e24346121770f93a073f8206520ca',
            securityStatus: 'REJECTED',
            processingStatus: 'FAILED',
            errorCode: 'MALWARE_DETECTED',
            createdBy: 'user-demo',
            createdAt: '2026-08-25T00:25:00.000Z',
          },
        ],
      }
    : livePageState.data;
  const assets = list(session.assets);
  const fields = list(session.fields);
  const safe = assets.filter((asset) => asset.securityStatus === 'SAFE').length;
  const processing = assets.filter(
    (asset) =>
      ['PENDING', 'QUEUED', 'PROCESSING'].includes(asset.securityStatus) ||
      ['QUEUED', 'PROCESSING'].includes(asset.processingStatus),
  ).length;
  const rejected = assets.filter((asset) =>
    ['REJECTED', 'FAILED'].includes(asset.securityStatus),
  ).length;
  const capture = view.page === 'page-015';
  return `<section class="source-library-page ${capture ? 'material-capture-page' : ''}" data-page-id="${contract.id}" data-experience="${capture ? 'material-capture' : 'source-library'}">
    <header class="source-library-heading"><div><small>${demoMode ? '演示材料 · 非真实文件' : '权威建档材料'}</small><h1>${capture ? '材料与语音' : '材料与来源'}</h1><p>${capture ? '按类型采集、安全扫描、语音转写并保留原件证据。' : '核对原始材料、安全状态、字段引用和处理边界。'}</p></div><button data-action="choose-file">＋ ${capture ? '采集文件或语音' : '添加材料'}</button></header>
    <section class="source-summary"><span><small>材料总数</small><b>${assets.length}</b><em>当前会话</em></span><span><small>安全可用</small><b>${safe}</b><em>仍按用途授权</em></span><span><small>处理中</small><b>${processing}</b><em>不可提前使用</em></span><span><small>已隔离</small><b>${rejected}</b><em>禁止预览发送</em></span></section>
    <div class="source-library-layout"><main>${capture ? '<section class="capture-types"><span><b>图片</b><small>JPG / PNG / WEBP</small></span><span><b>文档</b><small>PDF / DOCX</small></span><span><b>语音</b><small>MP3 / WAV / M4A / AMR</small></span></section>' : ''}<div class="source-list-tools"><label><span>⌕</span><input type="search" data-action="material-search" placeholder="搜索文件名、类型、状态或 SHA-256" autocomplete="off"/></label><span data-material-count>${assets.length} 份材料</span></div><section class="source-list" aria-live="polite">${assets.length ? assets.map((asset) => renderSourceAsset(asset, fields, escapeHtml)).join('') : '<div class="source-list-empty"><strong>当前会话还没有材料</strong><p>添加图片、PDF、Word 或语音后，材料会先进入安全扫描。</p></div>'}</section></main>${renderSourceInspector(session, assets, demoMode, escapeHtml, capture)}</div>
  </section>`;
}

function renderSourceAsset(asset, fields, escapeHtml) {
  const id = String(asset.id ?? 'asset');
  const filename = asset.originalFilename ?? `${asset.assetType ?? 'MATERIAL'} 材料`;
  const security = String(asset.securityStatus ?? 'PENDING');
  const processing = String(asset.processingStatus ?? 'QUEUED');
  const references = fields.filter((field) => field.sourceAssetId === id).length;
  const hash = String(asset.sha256 ?? '');
  const search = [
    filename,
    asset.assetType,
    asset.mimeType,
    security,
    processing,
    hash,
    asset.errorCode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('zh-CN');
  return `<article data-material-row data-search="${escapeHtml(search)}"><div class="source-type type-${String(asset.assetType).toLowerCase()}">${escapeHtml(String(asset.assetType ?? 'FILE').slice(0, 3))}</div><div class="source-main"><header><div><strong>${escapeHtml(filename)}</strong><small>${escapeHtml(asset.sourceChannel ?? 'WEB')} · ${escapeHtml(asset.mimeType ?? '类型未知')}</small></div><time>${escapeHtml(dateText(asset.createdAt))}</time></header><div class="source-state"><span class="security-${security.toLowerCase()}">${escapeHtml(security)}</span><span>${escapeHtml(processing)}</span>${asset.errorCode ? `<span class="source-error">${escapeHtml(asset.errorCode)}</span>` : ''}</div><footer><code>SHA ${escapeHtml(hash.slice(0, 20))}</code><span>${references} 个字段引用</span></footer></div></article>`;
}

function renderSourceInspector(session, assets, demoMode, escapeHtml, capture = false) {
  const sessionId = String(session.id ?? 'session');
  return `<aside class="source-inspector"><section><small>会话边界</small><h2>${escapeHtml(session.status ?? 'UNKNOWN')}</h2><p>当前列表只包含服务端按租户、角色和项目分配校验后返回的材料。</p><dl><div><dt>会话编号</dt><dd>${escapeHtml(sessionId)}</dd></div><div><dt>来源渠道</dt><dd>${escapeHtml(session.channel ?? '—')}</dd></div><div><dt>材料数量</dt><dd>${assets.length}</dd></div></dl></section><section class="source-upload composer"><small>${capture ? '文件与语音采集' : '安全上传'}</small><h2>添加原始材料</h2><p>支持图片、PDF、Word 和音频；文件先计算摘要，再申请限时上传并进入恶意文件扫描。</p><input id="intake-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/mpeg,audio/wav,audio/mp4,audio/amr" hidden/><button type="button" data-action="choose-file">选择文件并安全上传</button><div class="upload-item" aria-live="polite"></div><small role="status">${demoMode ? '演示模式不会上传文件' : '未通过扫描的材料不能被使用'}</small></section><section><small>补充文字</small><h2>保存为可追溯材料</h2>${demoMode ? '<textarea disabled placeholder="演示模式不写入业务系统"></textarea><button disabled>补充文字材料</button>' : `<div class="source-text-command" data-command-form="merchant-intake-message-add"><label>材料内容<textarea data-command-field="content" required maxlength="4000" placeholder="补充来源、口径或现场说明"></textarea></label><button type="button" data-command="merchant-intake-message-add">补充文字材料</button></div>`}</section><section><small>最小权限</small><ul><li>不向浏览器返回对象存储地址</li><li>扫描未通过时禁止预览和发送</li><li>原始哈希与字段来源保持可追溯</li><li>下载与复用需要独立授权能力</li></ul></section><nav><a href="/bao/page-019?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">查看字段来源</a><a href="/bao/page-011?${demoMode ? 'demo=1&' : ''}sessionId=${encodeURIComponent(sessionId)}">进入材料库</a></nav></aside>`;
}

function renderJobQueue({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data && view.state !== 'empty')
    return renderUnavailable(contract, view, escapeHtml);
  const tasks = demoMode
    ? [
        {
          id: 'task-running',
          conversation_id: 'conversation-1',
          mode: 'COMPLEX',
          status: 'RUNNING',
          plan_version: 2,
          planned_steps: 8,
          max_steps: 12,
          actual_tool_calls: 5,
          max_tool_calls: 24,
          actual_cost_micros: 184000,
          max_cost_micros: 800000,
          retry_count: 0,
          updated_at: '2026-08-25T00:18:00.000Z',
          deadline_at: '2026-08-25T01:30:00.000Z',
          result_summary_redacted: '正在核验门店经营事实并生成周报。',
        },
        {
          id: 'task-approval',
          conversation_id: 'conversation-2',
          mode: 'COMPLEX',
          status: 'WAITING_APPROVAL',
          plan_version: 1,
          planned_steps: 6,
          max_steps: 12,
          actual_tool_calls: 3,
          max_tool_calls: 20,
          actual_cost_micros: 126000,
          max_cost_micros: 600000,
          retry_count: 0,
          updated_at: '2026-08-25T00:12:00.000Z',
          deadline_at: '2026-08-25T02:00:00.000Z',
          result_summary_redacted: '发布门店活动前等待人工确认影响范围。',
        },
        {
          id: 'task-paused',
          conversation_id: 'conversation-3',
          mode: 'NORMAL',
          status: 'PAUSED',
          plan_version: 1,
          planned_steps: 4,
          max_steps: 8,
          actual_tool_calls: 2,
          max_tool_calls: 12,
          actual_cost_micros: 52000,
          max_cost_micros: 300000,
          retry_count: 0,
          updated_at: '2026-08-24T23:48:00.000Z',
          deadline_at: '2026-08-25T03:00:00.000Z',
          result_summary_redacted: '已保留完成步骤，等待操作者恢复。',
        },
        {
          id: 'task-failed',
          conversation_id: 'conversation-4',
          mode: 'COMPLEX',
          status: 'FAILED',
          plan_version: 3,
          planned_steps: 9,
          max_steps: 12,
          actual_tool_calls: 7,
          max_tool_calls: 24,
          actual_cost_micros: 318000,
          max_cost_micros: 800000,
          retry_count: 1,
          unknown_result: false,
          failure_code: 'UPSTREAM_TIMEOUT',
          updated_at: '2026-08-24T23:31:00.000Z',
          deadline_at: '2026-08-25T01:00:00.000Z',
          result_summary_redacted: '上游读取超时，已完成步骤和证据保持不变。',
        },
        {
          id: 'task-complete',
          conversation_id: 'conversation-5',
          mode: 'NORMAL',
          status: 'SUCCEEDED',
          plan_version: 2,
          planned_steps: 5,
          max_steps: 8,
          actual_tool_calls: 4,
          max_tool_calls: 12,
          actual_cost_micros: 97000,
          max_cost_micros: 300000,
          retry_count: 0,
          updated_at: '2026-08-24T22:54:00.000Z',
          completed_at: '2026-08-24T22:54:00.000Z',
          result_summary_redacted: '经营摘要与核验表已生成。',
        },
      ]
    : list(livePageState.data);
  const active = tasks.filter((task) =>
    ['PLANNING', 'READY', 'RUNNING'].includes(read(task, 'status')),
  ).length;
  const waiting = tasks.filter((task) =>
    ['PAUSED', 'WAITING_APPROVAL'].includes(read(task, 'status')),
  ).length;
  const failed = tasks.filter((task) => read(task, 'status') === 'FAILED').length;
  const completed = tasks.filter((task) => read(task, 'status') === 'SUCCEEDED').length;
  const selectedId = new URLSearchParams(globalThis.location?.search ?? '').get('taskId');
  const selected = tasks.find((task) => String(read(task, 'id')) === selectedId);
  return `<section class="job-queue-page" data-page-id="${contract.id}" data-experience="job-queue">
    <header class="job-queue-heading"><div><small>${demoMode ? '演示队列 · 非真实任务' : '权威后台任务'}</small><h1>后台任务</h1><p>离开对话后继续查看运行、等待、失败与完成状态。</p></div><button data-route="page-003">＋ 新建 AI 任务</button></header>
    <section class="job-summary"><span><i class="running"></i><small>运行中</small><b>${active}</b></span><span><i class="waiting"></i><small>等待处理</small><b>${waiting}</b></span><span><i class="failed"></i><small>可恢复失败</small><b>${failed}</b></span><span><i class="complete"></i><small>已完成</small><b>${completed}</b></span></section>
    <nav class="job-filters" aria-label="后台任务状态筛选"><a class="active" href="/bao/page-010${demoMode ? '?demo=1' : ''}">全部任务</a><a href="/bao/page-010?${demoMode ? 'demo=1&' : ''}status=RUNNING">运行中</a><a href="/bao/page-010?${demoMode ? 'demo=1&' : ''}status=WAITING_APPROVAL">等待确认</a><a href="/bao/page-010?${demoMode ? 'demo=1&' : ''}status=FAILED">失败</a><a href="/bao/page-010?${demoMode ? 'demo=1&' : ''}status=SUCCEEDED">已完成</a></nav>
    <div class="job-queue-layout"><main><div class="job-list-tools"><label><span>⌕</span><input type="search" data-action="task-search" placeholder="搜索任务编号、状态、模式或失败代码" autocomplete="off"/></label><span data-task-count>${tasks.length} 个任务</span></div><section class="job-list" aria-live="polite">${tasks.length ? tasks.map((task) => renderJobRow(task, demoMode, escapeHtml)).join('') : '<div class="job-list-empty"><strong>当前筛选下没有后台任务</strong><p>服务端没有返回当前身份创建的任务。</p></div>'}</section></main>${renderJobInspector(selected, demoMode, escapeHtml)}</div>
  </section>`;
}

function renderJobRow(task, demoMode, escapeHtml) {
  const id = String(read(task, 'id') ?? 'task');
  const status = String(read(task, 'status') ?? 'UNKNOWN');
  const mode = String(read(task, 'mode') ?? 'NORMAL');
  const calls = Number(read(task, 'actual_tool_calls', 'actualToolCalls') ?? 0);
  const maxCalls = Number(read(task, 'max_tool_calls', 'maxToolCalls') ?? 0);
  const cost = Number(read(task, 'actual_cost_micros', 'actualCostMicros') ?? 0);
  const maxCost = Number(read(task, 'max_cost_micros', 'maxCostMicros') ?? 0);
  const failure = read(task, 'failure_code', 'failureCode');
  const summary = text(
    read(task, 'result_summary_redacted', 'resultSummaryRedacted'),
    '尚无脱敏执行摘要。',
  );
  const search = [id, status, mode, failure].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
  return `<article data-task-row data-search="${escapeHtml(search)}"><header><div><span class="job-status status-${status.toLowerCase()}">${escapeHtml(status)}</span><small>${escapeHtml(mode)} · 计划 v${escapeHtml(read(task, 'plan_version', 'planVersion') ?? 1)}</small></div><time>更新于 ${escapeHtml(dateText(read(task, 'updated_at', 'updatedAt')))}</time></header><h2>${escapeHtml(summary)}</h2><p>${failure ? `失败代码 ${escapeHtml(failure)} · 已完成步骤和证据不会被改写。` : `截止 ${escapeHtml(dateText(read(task, 'deadline_at', 'deadlineAt')))}`}</p><div class="job-usage"><span><small>工具调用</small><b>${calls}/${maxCalls || '—'}</b></span><span><small>成本预算</small><b>${cost ? `${(cost / 1000000).toFixed(2)}` : '0.00'}/${maxCost ? (maxCost / 1000000).toFixed(2) : '—'}</b></span><span><small>重试次数</small><b>${escapeHtml(read(task, 'retry_count', 'retryCount') ?? 0)}</b></span></div><footer><code>${escapeHtml(id)}</code><a href="/bao/page-010?${demoMode ? 'demo=1&' : ''}taskId=${encodeURIComponent(id)}">查看与处理</a></footer></article>`;
}

function renderJobInspector(task, demoMode, escapeHtml) {
  if (!task)
    return `<aside class="job-inspector"><section><small>任务处理</small><h2>选择一个后台任务</h2><p>查看状态、预算、等待或失败原因，以及服务端允许的恢复动作。</p></section><section><small>安全边界</small><ul><li>列表仅返回当前租户和创建人的任务</li><li>未知外部结果不允许直接重试</li><li>高风险步骤恢复前仍需重新确认</li><li>取消不会伪装为撤回既有外部影响</li></ul></section></aside>`;
  const id = String(read(task, 'id'));
  const status = String(read(task, 'status'));
  const retry = Number(read(task, 'retry_count', 'retryCount') ?? 0);
  const unknown = Boolean(read(task, 'unknown_result', 'unknownResult'));
  const actions =
    status === 'PAUSED'
      ? [['employee-agent-task-resume', '恢复任务']]
      : ['READY', 'RUNNING'].includes(status)
        ? [['employee-agent-task-pause', '暂停任务']]
        : status === 'FAILED' && retry < 2 && !unknown
          ? [['employee-agent-task-retry', '安全重试']]
          : [];
  if (!['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status))
    actions.push(['employee-agent-task-cancel', '取消任务']);
  const conversation = read(task, 'conversation_id', 'conversationId');
  return `<aside class="job-inspector"><section><small>已选任务</small><h2>${escapeHtml(status)}</h2><code>${escapeHtml(id)}</code><p>${escapeHtml(text(read(task, 'result_summary_redacted', 'resultSummaryRedacted'), '尚无脱敏执行摘要。'))}</p></section><section><small>恢复资格</small><h2>${actions.length ? '服务端将再次裁决' : '当前没有可用动作'}</h2>${unknown ? '<p class="job-warning">外部结果未知，禁止直接重试。</p>' : ''}<div class="job-actions">${demoMode ? '<button disabled>演示模式不执行任务动作</button>' : actions.map(([command, label]) => `<div data-command-form="${command}"><button data-command="${command}">${label}</button></div>`).join('')}</div></section><nav><a href="/bao/page-007?${demoMode ? 'demo=1&' : ''}taskId=${encodeURIComponent(id)}">查看来源轨迹</a>${conversation ? `<a href="/bao/page-005?${demoMode ? 'demo=1&' : ''}conversationId=${encodeURIComponent(conversation)}">返回任务工作区</a>` : ''}</nav><p class="job-boundary">动作提交后由服务端按任务状态、重试次数、未知结果和高风险步骤重新校验。</p></aside>`;
}

function renderSessionInbox({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data && view.state !== 'empty')
    return renderUnavailable(contract, view, escapeHtml);
  const conversations = demoMode
    ? [
        {
          id: 'demo-conversation-1',
          storeId: 'store-east',
          customerId: 'customer-731802',
          channel: 'WECHAT_MINI_PROGRAM',
          status: 'HUMAN_QUEUED',
          riskLevel: 'HIGH',
          contextType: 'ORDER',
          contextId: 'order-240824',
          updatedAt: '2026-08-24T14:26:00.000Z',
          ticket: {
            reasonCode: 'REFUND_DISPUTE',
            priority: 'URGENT',
            status: 'OPEN',
            dueAt: '2026-08-24T15:00:00.000Z',
          },
        },
        {
          id: 'demo-conversation-2',
          storeId: 'store-east',
          customerId: 'customer-184529',
          channel: 'H5',
          status: 'HUMAN_ACTIVE',
          riskLevel: 'NORMAL',
          contextType: 'PRODUCT',
          contextId: 'product-18',
          updatedAt: '2026-08-24T14:18:00.000Z',
          ticket: {
            reasonCode: 'PRODUCT_QUESTION',
            priority: 'NORMAL',
            status: 'ASSIGNED',
            dueAt: '2026-08-24T16:30:00.000Z',
          },
        },
        {
          id: 'demo-conversation-3',
          storeId: 'store-west',
          customerId: 'customer-650417',
          channel: 'WECHAT_MINI_PROGRAM',
          status: 'WAITING_CUSTOMER',
          riskLevel: 'NORMAL',
          contextType: 'GROUP_BUY',
          contextId: 'group-07',
          updatedAt: '2026-08-24T13:55:00.000Z',
          ticket: {
            reasonCode: 'VOUCHER_USE',
            priority: 'HIGH',
            status: 'ASSIGNED',
            dueAt: '2026-08-24T17:00:00.000Z',
          },
        },
        {
          id: 'demo-conversation-4',
          storeId: 'store-west',
          customerId: 'customer-905163',
          channel: 'H5',
          status: 'HUMAN_QUEUED',
          riskLevel: 'SENSITIVE',
          contextType: 'ORDER',
          contextId: 'order-240817',
          updatedAt: '2026-08-24T13:36:00.000Z',
          ticket: {
            reasonCode: 'PRIVACY_REQUEST',
            priority: 'URGENT',
            status: 'OPEN',
            dueAt: '2026-08-24T14:45:00.000Z',
          },
        },
      ]
    : list(livePageState.data);
  const urgent = conversations.filter((item) => item.ticket?.priority === 'URGENT').length;
  const queued = conversations.filter((item) => item.status === 'HUMAN_QUEUED').length;
  const active = conversations.filter((item) => item.status === 'HUMAN_ACTIVE').length;
  return `<section class="session-inbox-page" data-page-id="${contract.id}" data-experience="session-inbox">
    <header class="session-inbox-heading"><div><small>${demoMode ? '演示队列 · 非真实客户数据' : '权威客服队列'}</small><h1>会话列表</h1><p>按责任范围处理待接入、进行中和等待客户的会话。</p></div><button data-route="page-003">＋ 新对话</button></header>
    <nav class="session-filters" aria-label="会话状态筛选"><a class="active" href="/bao/page-009${demoMode ? '?demo=1' : ''}">待我处理 <b>${queued}</b></a><a href="/bao/page-009?${demoMode ? 'demo=1&' : ''}status=HUMAN_ACTIVE">进行中 <b>${active}</b></a><a href="/bao/page-009?${demoMode ? 'demo=1&' : ''}status=WAITING_CUSTOMER">等待对方</a><a href="/bao/page-009?${demoMode ? 'demo=1&' : ''}status=CLOSED">已完成</a></nav>
    <div class="session-inbox-layout">
      <main>
        <div class="session-list-tools"><label><span>⌕</span><input type="search" data-action="conversation-search" placeholder="搜索客户尾号、状态、渠道或工单原因" autocomplete="off"/></label><span data-conversation-count>${conversations.length} 个会话</span></div>
        <section class="session-list" aria-live="polite">${conversations.length ? conversations.map((item) => renderConversationRow(item, demoMode, escapeHtml)).join('') : '<div class="session-list-empty"><strong>当前筛选下没有会话</strong><p>服务端没有返回当前身份与门店范围内的记录。</p></div>'}</section>
      </main>
      <aside class="session-queue-summary"><section><small>队列概览</small><h2>优先处理高风险与临期会话</h2><div><span><b>${queued}</b><small>等待接入</small></span><span><b>${active}</b><small>处理中</small></span><span><b>${urgent}</b><small>紧急工单</small></span></div></section><section><small>数据边界</small><h2>服务端决定可见范围</h2><ul><li>租户与门店范围逐条校验</li><li>列表不预取消息正文</li><li>客户标识只显示安全尾号</li><li>搜索不会扩大授权范围</li></ul></section><section><small>处理流程</small><ol><li>核对风险和截止时间</li><li>进入会话读取授权消息</li><li>接入、回复或等待客户</li><li>关闭时记录解决代码</li></ol></section></aside>
    </div>
  </section>`;
}

function renderConversationRow(item, demoMode, escapeHtml) {
  const customer = String(item.customerId ?? 'unknown');
  const ticket = item.ticket;
  const statusCopy =
    {
      HUMAN_QUEUED: '等待接入',
      HUMAN_ACTIVE: '处理中',
      WAITING_CUSTOMER: '等待客户',
      CLOSED: '已完成',
    }[item.status] ?? item.status;
  const search = [customer, item.status, item.channel, ticket?.reasonCode, item.riskLevel]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('zh-CN');
  const href = `/bao/page-100?${demoMode ? 'demo=1&' : ''}conversationId=${encodeURIComponent(item.id)}`;
  return `<article data-conversation-row data-search="${escapeHtml(search)}"><div class="session-avatar">客</div><div class="session-row-main"><header><strong>客户 · ${escapeHtml(customer.slice(-6))}</strong><time>${escapeHtml(dateText(item.updatedAt))}</time></header><p>${escapeHtml(ticket?.reasonCode ?? 'GENERAL_SUPPORT')} · 内容需进入会话后按权限读取</p><footer><span>${escapeHtml(item.channel)}</span><span>${escapeHtml(item.contextType ?? 'NONE')}</span>${item.riskLevel !== 'NORMAL' ? `<span class="risk">${escapeHtml(item.riskLevel)}</span>` : ''}</footer></div><div class="session-row-status"><b>${escapeHtml(statusCopy)}</b>${ticket ? `<small class="priority-${String(ticket.priority).toLowerCase()}">${escapeHtml(ticket.priority)} · ${escapeHtml(ticket.status)}</small><time>${escapeHtml(ticket.dueAt ? `截止 ${dateText(ticket.dueAt)}` : '无截止时间')}</time>` : '<small>无转人工工单</small>'}<a href="${href}" aria-label="打开客户 ${escapeHtml(customer.slice(-6))} 的会话">打开会话</a></div></article>`;
}

function renderProvenance({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data) return renderUnavailable(contract, view, escapeHtml);
  const task = demoMode
    ? {
        id: 'demo-task',
        status: 'SUCCEEDED',
        updated_at: '2026-08-24T12:18:00.000Z',
        steps: [
          {
            step_number: 1,
            action_code: 'READ_OPERATION_FACTS',
            tool_code: 'merchant-operations',
            risk_level: 'READ',
            status: 'SUCCEEDED',
            attempt_count: 1,
            output_summary_redacted: '读取 7 天门店订单、核销与退款摘要',
          },
          {
            step_number: 2,
            action_code: 'CALCULATE_WEEKLY_CHANGE',
            tool_code: 'analytics',
            risk_level: 'READ',
            status: 'SUCCEEDED',
            attempt_count: 1,
            output_summary_redacted: '完成周环比计算并保存输入范围',
          },
          {
            step_number: 3,
            action_code: 'GENERATE_REPORT',
            tool_code: 'document',
            risk_level: 'CONFIRM',
            status: 'SUCCEEDED',
            attempt_count: 1,
            output_summary_redacted: '生成管理层汇报与数据核验表',
          },
        ],
        evidence: [
          {
            evidence_type: 'BUSINESS_RECORD',
            label: '门店经营日报',
            summary_redacted: '订单、核销与退款事实摘要',
            reference_hash: 'ev-41f8a731',
            created_at: '2026-08-24T11:42:00.000Z',
          },
          {
            evidence_type: 'TOOL_RESULT',
            label: '周环比计算',
            summary_redacted: '计算版本与输入范围已锁定',
            reference_hash: 'ev-d7125a44',
            created_at: '2026-08-24T11:55:00.000Z',
          },
          {
            evidence_type: 'HUMAN_CONFIRMATION',
            label: '财务口径确认',
            summary_redacted: '收入与退款口径已经人工复核',
            reference_hash: 'ev-9cc2d018',
            created_at: '2026-08-24T12:08:00.000Z',
          },
        ],
        artifacts: [{ id: 'artifact-1' }, { id: 'artifact-2' }],
      }
    : livePageState.data;
  const steps = list(task.steps);
  const evidence = list(task.evidence);
  const taskId = read(task, 'id') ?? 'task';
  const toolSteps = steps.filter((step) => read(step, 'tool_code', 'toolCode'));
  const confirmSteps = steps.filter((step) =>
    ['CONFIRM', 'DUAL_CONFIRM'].includes(read(step, 'risk_level', 'riskLevel')),
  );
  return `<section class="provenance-page" data-page-id="${contract.id}" data-experience="provenance-timeline">
    <header class="provenance-heading"><div><small>${demoMode ? '演示轨迹 · 非真实业务数据' : '权威任务轨迹'}</small><h1>来源与工具轨迹</h1><p>按执行顺序核对读取范围、工具结果、权限边界和人工确认。</p></div><span>${escapeHtml(read(task, 'status') ?? 'UNKNOWN')}</span></header>
    <div class="provenance-layout">
      <main>
        <section class="trace-summary"><span><small>任务步骤</small><b>${steps.length}</b></span><span><small>工具调用</small><b>${toolSteps.length}</b></span><span><small>确认步骤</small><b>${confirmSteps.length}</b></span><span><small>证据记录</small><b>${evidence.length}</b></span></section>
        <section class="step-ledger"><header><div><small>执行账本</small><h2>任务步骤与工具结果</h2></div><span>只读</span></header>${steps.length ? steps.map((step) => renderStep(step, escapeHtml)).join('') : '<p class="trace-empty">服务端尚未返回执行步骤。</p>'}</section>
        <section class="evidence-timeline"><header><div><small>证据时间线</small><h2>不可变来源记录</h2></div><span>${evidence.length} 条</span></header>${evidence.length ? evidence.map((item) => renderTimelineEvidence(item, escapeHtml)).join('') : '<p class="trace-empty">没有可展示的脱敏证据。</p>'}</section>
      </main>
      <aside class="trace-inspector">
        <section><small>轨迹完整性</small><h2>${steps.length && evidence.length ? '已建立可追溯链' : '等待完整记录'}</h2><p>步骤、成果和证据均以服务端任务编号关联；页面不读取模型提示词、秘密凭据或原始客户载荷。</p><dl><div><dt>任务编号</dt><dd>${escapeHtml(taskId)}</dd></div><div><dt>最近更新</dt><dd>${escapeHtml(dateText(read(task, 'updated_at', 'updatedAt')))}</dd></div><div><dt>关联成果</dt><dd>${list(task.artifacts).length} 项</dd></div></dl></section>
        <section><small>安全边界</small><h2>审计记录不可改写</h2><ul><li>修正内容必须产生新版本</li><li>失败步骤保留原因与尝试次数</li><li>权限裁决只展示脱敏摘要</li><li>人工确认保留对象与引用哈希</li></ul></section>
        <nav><a href="/bao/page-006?${demoMode ? 'demo=1&' : ''}taskId=${encodeURIComponent(taskId)}">查看成果预览</a><a href="/bao/page-011${demoMode ? '?demo=1' : ''}">查看原始材料</a></nav>
      </aside>
    </div>
  </section>`;
}

function renderStep(step, escapeHtml) {
  const number = read(step, 'step_number', 'stepNumber') ?? '—';
  const action = read(step, 'action_code', 'actionCode') ?? '未记录动作';
  const tool = read(step, 'tool_code', 'toolCode');
  const risk = read(step, 'risk_level', 'riskLevel') ?? 'READ';
  const status = read(step, 'status') ?? 'UNKNOWN';
  const attempts = read(step, 'attempt_count', 'attemptCount') ?? 0;
  const output = text(
    read(step, 'output_summary_redacted', 'outputSummaryRedacted'),
    '尚无脱敏输出摘要',
  );
  const failure = read(step, 'failure_code', 'failureCode');
  return `<article class="step-record"><b>${escapeHtml(number)}</b><div><header><strong>${escapeHtml(action)}</strong><span>${escapeHtml(status)}</span></header><p>${escapeHtml(output)}</p><footer><code>${escapeHtml(tool ?? 'NO_TOOL')}</code><small>风险 ${escapeHtml(risk)} · 尝试 ${escapeHtml(attempts)} 次${failure ? ` · 失败 ${escapeHtml(failure)}` : ''}</small></footer></div></article>`;
}

function renderTimelineEvidence(item, escapeHtml) {
  return `<article><time>${escapeHtml(dateText(read(item, 'created_at', 'createdAt')))}</time><i></i><div><small>${escapeHtml(read(item, 'evidence_type', 'evidenceType') ?? 'EVIDENCE')}</small><h3>${escapeHtml(item.label ?? '未命名证据')}</h3><p>${escapeHtml(text(read(item, 'summary_redacted', 'summaryRedacted'), '无可展示的脱敏摘要'))}</p><code>${escapeHtml(String(read(item, 'reference_hash', 'referenceHash') ?? '').slice(0, 24))}</code></div></article>`;
}

function renderUnavailable(contract, view, escapeHtml) {
  const copy = {
    loading: ['正在读取任务成果', '服务端正在校验身份、租户和任务范围。'],
    empty: ['缺少任务编号', '请从复杂任务或后台任务进入成果预览。'],
    denied: ['无法访问任务成果', '当前会话未通过身份或任务归属校验。'],
    'partial-error': ['部分成果读取失败', '未展示不完整内容，请稍后重新读取权威任务记录。'],
    'recoverable-failure': ['成果读取失败', '任务事实没有被改写，可以安全刷新后重试。'],
    stopped: ['成果预览已停用', '当前环境没有可用的权威任务读取能力。'],
  }[view.state] ?? ['等待任务成果', '生产模式不会展示演示成果。'];
  return `<section class="artifact-page artifact-unavailable" data-page-id="${contract.id}" data-experience="artifact-preview"><div><small>权威数据模式</small><h1>${escapeHtml(copy[0])}</h1><p>${escapeHtml(copy[1])}</p><button data-route="page-005">返回复杂任务</button></div></section>`;
}

function renderArtifact(item, escapeHtml) {
  const size = Number(read(item, 'size_bytes', 'sizeBytes') ?? 0);
  const hash = String(read(item, 'sha256') ?? '未返回');
  return `<article><b>${escapeHtml(
    String(item.name ?? '未命名成果')
      .split('.')
      .at(-1)
      ?.toUpperCase(),
  )}</b><div><strong>${escapeHtml(item.name ?? '未命名成果')}</strong><small>${escapeHtml(item.status ?? 'UNKNOWN')} · ${size ? `${Math.ceil(size / 1024)} KB` : '大小未知'}</small><code>SHA ${escapeHtml(hash.slice(0, 12))}</code></div></article>`;
}

function renderEvidence(item, escapeHtml) {
  return `<details><summary><span><small>${escapeHtml(read(item, 'evidence_type', 'evidenceType') ?? 'EVIDENCE')}</small><strong>${escapeHtml(item.label ?? '未命名证据')}</strong></span><b>＋</b></summary><p>${escapeHtml(text(read(item, 'summary_redacted', 'summaryRedacted'), '无可展示的脱敏摘要'))}</p><code>${escapeHtml(String(read(item, 'reference_hash', 'referenceHash') ?? '').slice(0, 20))}</code></details>`;
}
