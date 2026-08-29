/**
 * 通用深层页转换脚本：concept-f HTML → 1:1 Vue SFC
 * 用法：node .gen-deep.cjs <concept-f-html-name> <page-xxx> [ramp]
 * 例：node .gen-deep.cjs detail page-209 green
 *     node .gen-deep.cjs list page-201 green
 *     node .gen-deep.cjs search page-203 green
 */
const fs = require('fs');
const path = require('path');

const CONCEPT_DIR = '/workspace/design/prototype/concept-f';
const PAGE_DIR = '/workspace/apps/life-uniapp/src/pages';

const htmlName = process.argv[2];
const pageId = process.argv[3];
const rampArg = process.argv[4] || 'green';

if (!htmlName || !pageId) {
  console.error('用法: node .gen-deep.cjs <html-name> <page-xxx> [green|blue]');
  process.exit(1);
}

const htmlFile = path.join(CONCEPT_DIR, `${htmlName}.html`);
const oldVue = path.join(PAGE_DIR, pageId, 'index.vue');

const html = fs.readFileSync(htmlFile, 'utf8');
const oldSrc = fs.readFileSync(oldVue, 'utf8');

// ====== 1. 提取 <body> 内 <div class="phone" 到 </div> 之间 phone 内容 ======
// 找 <div class="phone" 开始位置
const phoneStart = html.indexOf('<div class="phone"');
if (phoneStart < 0) { console.error('找不到 .phone'); process.exit(1); }
// 找 phone 的闭合 </div>：从 phoneStart 往后数嵌套层级
let depth = 0, i = phoneStart, phoneEnd = -1;
while (i < html.length) {
  const open = html.indexOf('<div', i);
  const close = html.indexOf('</div>', i);
  if (close < 0) break;
  if (open >= 0 && open < close) { depth++; i = open + 4; }
  else { depth--; i = close + 6; if (depth === 0) { phoneEnd = i; break; } }
}
let phoneBlock = html.slice(phoneStart, phoneEnd);

// ====== 2. 去掉 <div class="cap"> 块（概念展示标题） ======
phoneBlock = phoneBlock.replace(/<div class="cap">[\s\S]*?<\/div>\s*/, '');

// ====== 3. 提取 SVG defs（在 phone 块之后的 <svg width="0" height="0"） ======
let svgDefs = '';
const defsMatch = html.match(/<svg width="0" height="0"[\s\S]*?<\/defs><\/svg>/);
if (defsMatch) svgDefs = defsMatch[0];

// ====== 4. HTML→Vue 标签转换 ======
function htmlToVue(s) {
  // div→view
  s = s.replace(/<div\b/g, '<view').replace(/<\/div>/g, '</view>');
  // span→text
  s = s.replace(/<span\b/g, '<text').replace(/<\/span>/g, '</text>');
  // p→text block
  s = s.replace(/<p\b/g, '<text').replace(/<\/p>/g, '</text>');
  // b→text bold
  s = s.replace(/<b\b/g, '<text').replace(/<\/b>/g, '</text>');
  // strong→text
  s = s.replace(/<strong\b/g, '<text').replace(/<\/strong>/g, '</text>');
  // em→text normal（但 class="maifab em" 不动，只动 <em> 标签）
  s = s.replace(/<em\b/g, '<text').replace(/<\/em>/g, '</text>');
  // s→text line-through
  s = s.replace(/<s\b/g, '<text').replace(/<\/s>/g, '</text>');
  // i→inline-block view（但 <i> 在 .drules 里是标签 chip，不是斜体）
  s = s.replace(/<i\b/g, '<text').replace(/<\/i>/g, '</text>');
  // img→image（HTML img 无需闭合，Vue image 需要 /> 自闭合）
  s = s.replace(/<img\b([^>]*?)(\s*\/?)>/g, '<image$1 />');
  // a→navigator（href=*.html 转换为 /pages/page-XXX/index）
  // 但 <a class="back"> 是返回按钮，不跳转页面
  s = s.replace(/<a\b([^>]*?)href="([^"]*?)"/g, (m, attrs, href) => {
    // back 按钮特殊处理
    if (/class="[^"]*back/.test(attrs)) {
      return `<navigator${attrs}url="" open-type="navigateBack"`;
    }
    // 映射 href → page 路由
    const route = hrefToRoute(href);
    return `<navigator${attrs}url="${route}"`;
  });
  s = s.replace(/<\/a>/g, '</navigator>');
  // button→view（保持 @click）
  // 修复：标签名后可能紧跟属性无空格
  s = s.replace(/<(view|text|image|navigator|button)([a-zA-Z])/g, '<$1 $2');
  return s;
}

// href → 路由映射
function hrefToRoute(href) {
  const base = href.replace(/\?.*$/, '').replace('.html', '');
  const query = href.includes('?') ? '?' + href.split('?')[1] : '';
  const map = {
    'index': '/pages/life/index',
    'mall': '/pages/mall/index',
    'quan': '/pages/community/index',
    'cart': '/pages/cart/index',
    'me': '/pages/me/index',
    'detail': '/pages/page-209/index',
    'list': '/pages/page-201/index',
    'search': '/pages/page-203/index',
    'shop': '/pages/page-218/index',
    'deals': '/pages/page-221/index',
    'address': '/pages/page-248/index',
    'book': '/pages/page-237/index',
    'brand': '/pages/page-224/index',
    'checkout': '/pages/page-229/index',
    'coupons': '/pages/page-228/index',
    'feedback': '/pages/page-264/index',
    'invoice': '/pages/page-250/index',
    'mai': '/pages/page-258/index',
    'member': '/pages/page-235/index',
    'msgs': '/pages/page-262/index',
    'orders': '/pages/page-237/index',
    'pay': '/pages/page-231/index',
    'payok': '/pages/page-232/index',
    'recharge': '/pages/page-255/index',
    'safeguard': '/pages/page-239/index',
    'settings': '/pages/page-254/index',
    'svc': '/pages/page-259/index',
    'voucher-detail': '/pages/page-242/index',
    'voucher-rule': '/pages/page-242/index',
  };
  const route = map[base] || `/pages/${base}/index`;
  // 把 query 参数转换（?s=0 → ?s=0 保持；?id=xxx 保持）
  return route + query;
}

// 图片路径转换
function fixImgSrc(s) {
  s = s.replace(/src="\.\.\/assets\/img\/([^"]+)"/g, 'src="/static/v63-img/$1"');
  s = s.replace(/src="\.\.\/assets\/icons\/([^"]+)"/g, 'src="/static/v63-icons/$1"');
  s = s.replace(/src="\.\.\/assets\/brands\/([^"]+)"/g, 'src="/static/v63-brands/$1"');
  // 去掉 alt="" 和结尾的 >
  return s;
}

// 剥 display:none → v-if
function stripDisplayNone(s) {
  return s.replace(/<([a-zA-Z0-9_-]+)([^>]*?)\sstyle="([^"]*?display\s*:\s*none[^"]*?)"([^>]*)>/gi, (m, tag, before, _sty, after) => {
    const rest = `${before}${after}`;
    if (/id="(tfSun|ts-ic-sun)"/.test(rest)) return `<${tag}${rest.replace(/\s+/g,' ').trim()} v-if="isDark">`;
    if (/id="(tfMoon|ts-ic-moon)"/.test(rest)) return `<${tag}${rest.replace(/\s+/g,' ').trim()} v-if="!isDark">`;
    return `<${tag}${rest.replace(/\s+/g,' ').trim()} v-if="false">`;
  });
}

// ====== 5. 处理 phone 外层 ======
let ramp = rampArg === 'blue'
  ? '--hd1:#1a4fb0;--hd2:#0c2a80;--bg:#f6f1e6'
  : '--hd1:#009146;--hd2:#006b36;--bg:#f6f1e6';

let template = phoneBlock;
template = htmlToVue(template);
template = fixImgSrc(template);
template = stripDisplayNone(template);

// phone 外层加 :data-theme 和 style
template = template.replace(
  /<view class="phone"/,
  `<view class="phone" :data-theme="isDark?'dark':''" style="${ramp}" ref="phoneEl"`
);
// id="app" 删掉（Vue 不需要）
template = template.replace(/ id="app"/, '');

// ====== 6. 提取旧 script setup ======
const scriptMatch = oldSrc.match(/<script setup>([\s\S]*?)<\/script>/);
let scriptContent = scriptMatch ? scriptMatch[1] : '';

// 在 script 里加 isDark ref + goBack（如果旧 script 没有）
if (!/isDark/.test(scriptContent)) {
  const hasRefImport = /import\s*\{[^}]*\bref\b[^}]*\}\s*from\s*['"]vue['"]/.test(scriptContent);
  const prefix = hasRefImport ? '' : "import { ref } from 'vue';\n";
  scriptContent = prefix + scriptContent + '\n\n// 深色模式 + 返回\nconst isDark = ref(false);\nfunction toggleTheme() { isDark.value = !isDark.value; }\nfunction goBack() { uni.navigateBack({ delta: 1 }); }\n';
}

// ====== 7. 提取 style ======
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
let styleContent = styleMatch ? styleMatch[1] : '';

// 清理 body/.cap/@media
// 1) 删除 @media 整块（含嵌套大括号）
function removeAtMedia(s) {
  let result = '';
  let i = 0;
  while (i < s.length) {
    const atIdx = s.indexOf('@media', i);
    if (atIdx < 0) { result += s.slice(i); break; }
    result += s.slice(i, atIdx);
    // 找到 @media 后第一个 {
    let brace = s.indexOf('{', atIdx);
    if (brace < 0) { result += s.slice(atIdx); break; }
    brace++;
    let depth = 1;
    while (brace < s.length && depth > 0) {
      if (s[brace] === '{') depth++;
      else if (s[brace] === '}') depth--;
      brace++;
    }
    i = brace;
  }
  return result;
}
styleContent = removeAtMedia(styleContent);
// 2) 删除 body/.cap 规则
styleContent = styleContent
  .replace(/body\s*\{[^}]*\}/g, '')
  .replace(/\.cap\s*\{[^}]*\}/g, '')
  .replace(/\.cap\s+h1[^{]*\{[^}]*\}/g, '')
  .replace(/\.cap\s+p[^{]*\{[^}]*\}/g, '')
  .trim();

// ====== 8. 组装 SFC ======
const sfc = `<template>
${svgDefs ? svgDefs + '\n' : ''}${template}
</template>

<script setup>${scriptContent}</script>

<style scoped>${styleContent}</style>
`;

const outFile = path.join(PAGE_DIR, pageId, 'index.vue');
fs.writeFileSync(outFile, sfc, 'utf8');

// 检查 display:none
const dnCount = (sfc.match(/style="[^"]*display\s*:\s*none/g) || []).length;
const tagClassIssue = (sfc.match(/<[a-zA-Z]+[a-z][a-z]="/g) || []).length;

console.log(`✅ ${pageId}/index.vue 生成完成（${sfc.split('\n').length} 行）`);
console.log(`   display:none 残留: ${dnCount}`);
console.log(`   标签属性粘连: ${tagClassIssue}`);
