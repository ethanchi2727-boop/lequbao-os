import { resolvePage, statusCopy, viewFor } from './state.mjs';

const params = new URLSearchParams(location.search);
let view = viewFor(resolvePage(location.pathname), params.get('state') ?? 'default');
const app = document.querySelector('#app');

const fields = [
  ['主体名称', '南京拾味餐饮管理有限公司', '99%', '已识别'],
  ['门店名称', '拾味小馆 · 新街口店', '96%', '已识别'],
  ['统一信用代码', '91320105MA••••729Q', '99%', '已识别'],
  ['门店地址', '秦淮区中山南路 18 号', '91%', '待确认'],
];

function icon(name) {
  const icons = {
    plus: '+',
    search: '⌕',
    chat: '◫',
    work: '▦',
    shop: '▣',
    geo: '◇',
    tools: '⌁',
    money: '¥',
    mic: '♩',
    file: '⌑',
    camera: '◉',
    send: '↑',
    back: '‹',
  };
  return `<span aria-hidden="true">${icons[name] ?? '·'}</span>`;
}

function statePanel() {
  const copy = statusCopy(view.state);
  if (!copy) return '';
  return `<section class="state-panel state-${view.state}" role="status"><div class="state-symbol">${view.state === 'success' ? '✓' : '!'}</div><div><h2>${copy[0]}</h2><p>${copy[1]}</p></div>${['error', 'loading'].includes(view.state) ? '<button data-action="recover">重试</button>' : ''}</section>`;
}

function sidebar() {
  return `<aside class="sidebar" aria-label="主导航">
    <a class="brand" href="/bao/page-014?demo=1"><b>✣</b><span><strong>乐趣宝</strong><small>AI 经营工作台</small></span></a>
    <button class="new-task">${icon('plus')} 新建 AI 任务 <kbd>Ctrl N</kbd></button>
    <label class="search">${icon('search')}<input aria-label="搜索页面、商户或任务" placeholder="搜页面、商户或任务"/><kbd>Ctrl K</kbd></label>
    <nav>${[
      ['chat', 'AI 对话'],
      ['work', '商务中心'],
      ['shop', '商户交付'],
      ['shop', '商家经营'],
      ['chat', 'AI 客服'],
      ['geo', 'GEO 获客'],
      ['tools', '插件与技能'],
      ['money', '收益结算'],
    ]
      .map(
        ([i, t], n) =>
          `<a class="${n === 0 ? 'active' : ''}" href="#">${icon(i)} ${t}${t === '商户交付' ? '<em>3</em>' : ''}</a>`,
      )
      .join('')}</nav>
    <section class="recent"><small>我的持续服务</small><a href="#">• 拾味小馆 · 交付中</a><a href="#">叶子花店 · 资料待确认</a><a href="#">七月永久收益月结</a></section>
    <button class="identity"><b>周</b><span>周子涵<small>南京西路 · 仅授权范围</small></span>•••</button>
  </aside>`;
}

function topbar() {
  return `<header class="topbar"><div class="mobile-title"><button data-action="back" aria-label="返回">${icon('back')}</button><strong>${view.title}</strong><small>新商户 · 自动保存</small></div><div class="crumb">乐趣生活南京区 <b>›</b> <strong>拾味小馆 · AI 对话建档</strong></div><div class="top-actions"><span>✓ 已保存</span><button>快速执行⌄</button><button>◷ 后台任务 2</button><button aria-label="分享">⌯</button></div></header>`;
}

function composer() {
  return `<form class="composer" data-form="message"><textarea aria-label="补充资料" placeholder="继续说、拍照或把资料直接丢进来…"></textarea><div class="tools"><button type="button" data-route="page-176" aria-label="添加">${icon('plus')}</button><button type="button" data-route="page-176">${icon('file')} 文件</button><button type="button">◎ 联网</button><button type="button">♙ 技能</button><button type="button">⌁ 插件</button><button type="button" data-route="page-177">${icon('mic')}<span class="tool-label"> 语音</span></button><button class="send" type="submit" aria-label="发送">${icon('send')}</button></div><small>支持内容、图片、PDF、语音与相关链接</small></form>`;
}

function conversation() {
  if (view.state === 'empty') return '';
  return `<section class="conversation" aria-label="建档对话">
    <div class="intro"><div class="agent">✣</div><div><strong>把商家资料直接发给我</strong><p>营业执照、门头照、定位、PDF 或语音都可以。</p></div></div>
    <div class="user-bubble">我在拾味小馆门店，要给他开通 898 基础版。这是营业执照、门头和微信定位，店长叫陈海。</div>
    <div class="attachments"><article class="asset photo"><small>营业执照</small><strong>统一社会信用代码</strong><span>JPG · 2.8MB</span><i>安全</i></article><article class="asset storefront"><small>门头照片</small><strong>拾味小馆</strong><span>HEIC · 4.1MB</span><i>安全</i></article><article class="asset location"><b>◇</b><span><small>微信门店定位</small><strong>拾味小馆</strong><em>南京市秦淮区中山南路 18 号</em></span><i>✓</i></article></div>
    <article class="agent-result"><header><div class="agent">✣</div><div><h2>已识别并合并商户资料 <span>✓ 4 个来源已校对</span></h2><p>执照名称和门头名不一致属于正常品牌名情况。地址与定位相差 23 米，已按微信定位保留。</p></div></header><div class="field-grid">${fields.map(([k, v, c, s]) => `<button data-route="page-178"><small>${k}</small><strong>${v}</strong><span>${s} ${c}</span></button>`).join('')}</div><div class="voice"><b>${icon('mic')}</b><span><strong>还差两件事</strong><small>请说一下营业时间；然后店长手机号要点击安全卡片确认。</small></span><button data-route="page-177">按住说话</button></div></article>
  </section>`;
}

function results() {
  return `<aside class="results"><nav><button class="active">建档 <sup>6</sup></button><button>来源 <sup>4</sup></button><button>执行记录</button><button aria-label="关闭">×</button></nav><section class="progress"><div><small>商户资料完整度</small><strong>82%</strong></div><progress value="82" max="100">82%</progress><small>AI 已自动映射 21/25 个字段，还有 4 项需补充或确认。</small></section><h3>已识别</h3>${fields.map(([k, v, c]) => `<div class="result-row"><span><small>${k}</small><strong>${v}</strong></span><em>${c}</em><button data-route="page-178">修正</button></div>`).join('')}<h3>待补充</h3><article class="warning"><b>⚠</b><span><strong>小程序名称由商家填写</strong><small>系统可以给建议，不能代表商家决定。</small></span><button>发补充链接</button></article><article class="warning"><b>⚠</b><span><strong>结算账户</strong><small>需商家管理员自行授权，平台不代收账号。</small></span><button>稍后处理</button></article><p class="safe-note">✓ 每个字段保留原图、语音或定位来源；修正后不覆盖历史。</p></aside>`;
}

function mobileSheet() {
  if (view.page === 'page-176')
    return `<section class="mobile-sheet"><h2>添加门店材料</h2><p>原始文件会先安全检查，再进入识别。</p><div class="capture-grid"><button data-action="upload">${icon('camera')}<strong>拍营业执照</strong><small>JPG、PNG、HEIC</small></button><button data-action="upload">${icon('file')}<strong>选择文件</strong><small>PDF、DOCX</small></button></div><div class="upload-item"><span>营业执照.jpg</span><progress value="68" max="100">68%</progress><b>68%</b></div><button class="primary" data-route="page-175">完成并返回对话</button></section>`;
  if (view.page === 'page-177')
    return `<section class="mobile-sheet voice-sheet"><h2>用语音补充资料</h2><p>松开后自动转写，原语音与文字会一起保留。</p><button class="record" data-action="record">${icon('mic')}<strong>按住说话</strong><small>最长 60 秒</small></button><div class="transcript"><small>实时转写</small><p>每天上午十点到晚上十点，周末不休息。</p><button>修正文字</button></div><button class="primary" data-route="page-175">发送语音与转写</button></section>`;
  if (view.page === 'page-178')
    return `<section class="mobile-sheet confirm-sheet"><h2>识别确认</h2><div class="completion"><b>82%</b><span><strong>资料基本齐全</strong><small>4 项自动识别，2 项必须由商家确认</small></span></div>${fields.map(([k, v, c], i) => `<label><span><small>${k}</small><input value="${v}" ${i < 3 ? 'readonly' : ''}/></span><em>${c}</em></label>`).join('')}<article class="impact"><b>!</b><span><strong>确认会影响对外展示</strong><small>主体、公开电话和发布范围确认后才会进入交付。</small></span></article><label class="check"><input type="checkbox" data-action="consent"/> 我已核对主体、联系方式和发布影响</label><button class="primary" data-action="confirm" disabled>确认并进入交付</button></section>`;
  return '';
}

function bottomNav() {
  return `<nav class="bottom-nav"><a class="active">${icon('chat')}<small>对话</small></a><a>${icon('work')}<small>工作</small></a><a>◇<small>任务</small></a><a>♧<small>消息</small></a><a>♙<small>我的</small></a></nav>`;
}

function render() {
  document.body.dataset.mobilePage = String(view.mobile);
  app.innerHTML = `<div class="shell">${sidebar()}<main>${topbar()}${statePanel()}<div class="workspace"><section class="chat"><div class="chat-heading"><div><h1>新商户资料建档</h1><p><i></i> 支持图片、PDF、门店定位与语音，系统自动整理</p></div><button>•••</button></div>${conversation()}${mobileSheet()}${composer()}</section>${results()}</div>${bottomNav()}</main></div>`;
  if (['denied', 'stopped', 'success'].includes(view.state))
    document.querySelector('.workspace')?.setAttribute('inert', '');
}

app.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!target) return;
  const route = target.dataset.route;
  if (route) {
    history.pushState({}, '', `/bao/${route}?demo=1`);
    view = viewFor(route);
    render();
    return;
  }
  if (target.dataset.action === 'back') {
    history.back();
    return;
  }
  if (target.dataset.action === 'recover') {
    view = { ...view, state: 'default' };
    render();
    return;
  }
  if (target.dataset.action === 'record') {
    target.classList.toggle('recording');
    target.querySelector('strong').textContent = target.classList.contains('recording')
      ? '正在录音…'
      : '按住说话';
  }
  if (target.dataset.action === 'consent') return;
});
app.addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.dataset.action === 'consent') {
    const confirm = document.querySelector('[data-action="confirm"]');
    if (confirm instanceof HTMLButtonElement) confirm.disabled = !event.target.checked;
  }
});
app.addEventListener('submit', (event) => {
  event.preventDefault();
  const textarea = document.querySelector('textarea');
  if (textarea?.value.trim()) {
    textarea.value = '';
    document.querySelector('.composer > small').textContent = '✓ 已保存并进入识别队列';
  }
});
addEventListener('popstate', () => {
  view = viewFor(resolvePage(location.pathname));
  render();
});
render();
