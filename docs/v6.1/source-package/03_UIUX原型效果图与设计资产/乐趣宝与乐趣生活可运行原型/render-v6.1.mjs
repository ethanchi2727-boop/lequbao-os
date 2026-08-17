import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const project = process.cwd();
const output = path.join(project, '..', '关键效果图_V6.1');
const rendered = path.join(project, '渲染缓存_V6.1');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(rendered, { recursive: true });

const cssFiles = ['styles.css','styles-mobile.css','styles-life.css','styles-life-pages.css','styles-fixes.css','styles-v3.css','styles-v3-overrides.css','styles-v6.1.css'];
const css = cssFiles.map(file => fs.readFileSync(path.join(project, file), 'utf8')).join('\n').replaceAll("url('./assets/", "url('../assets/");
const appCode = fs.readFileSync(path.join(project, 'app.js'), 'utf8');
const v61Code = fs.readFileSync(path.join(project, 'app-v6.1.js'), 'utf8');

const shots = [
  ['bao-intake',1536,1024,'乐趣宝_PC端_AI对话建档.png'],
  ['bao-business',1536,1024,'乐趣宝_PC端_商务中心与永久收益.png'],
  ['bao-revenue',1536,1024,'乐趣宝_PC端_收益月结与成本明细.png'],
  ['bao-delivery',1536,1024,'乐趣宝_PC端_一键交付与Harness任务.png'],
  ['bao-merchant',1536,1024,'乐趣宝_PC端_商家经营中心.png'],
  ['bao-miniprogram',1536,1024,'乐趣宝_PC端_商家小程序发布.png'],
  ['bao-service',1536,1024,'乐趣宝_PC端_AI客服与人工接管.png'],
  ['bao-ecosystem',1536,1024,'乐趣宝_PC端_插件与技能生态.png'],
  ['bao-mobile-v61',1660,1080,'乐趣宝_移动端_AI建档与持续收益.png'],
  ['service-mobile',1660,1080,'AI客服_消费者与员工移动端.png'],
  ['life-home-v61',1120,1120,'乐趣生活_鲜活生活首页.png'],
  ['life-tabs-v61',2160,1080,'乐趣生活_五个一级栏目.png'],
  ['life-kit-v61',1600,1100,'乐趣生活_Banner立体图标与按钮精修.png'],
  ['life-details',1760,1080,'乐趣生活_商品团购结算与AI详情.png']
];

function renderMarkup(view) {
  const appNode = { innerHTML: '' };
  const sandbox = { document: { querySelector: () => appNode }, location: { search: `?view=${view}` }, URLSearchParams, console };
  vm.createContext(sandbox);
  vm.runInContext(appCode, sandbox, { filename: 'app.js' });
  vm.runInContext(v61Code, sandbox, { filename: 'app-v6.1.js' });
  return appNode.innerHTML;
}

const python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python';
const vendor = path.resolve(project, '..', '..', '..', 'mockups_v3', 'vendor');
const selected = process.argv.slice(2);
const targets = selected.length ? shots.filter(([view]) => selected.includes(view)) : shots;

for (const [view, width, height, fileName] of targets) {
  const markup = renderMarkup(view);
  const head = `
    @font-face { font-family:"Noto Sans CJK SC";src:url("../fonts/NotoSansCJKsc-Regular.otf");font-weight:400; }
    @font-face { font-family:"Noto Sans CJK SC";src:url("../fonts/NotoSansCJKsc-Bold.otf");font-weight:700; }
    @page { size:${width}px ${height}px;margin:0; }
    html,body,#app { width:${width}px;height:${height}px;margin:0;overflow:hidden; }
    * { font-family:"Noto Sans CJK SC",sans-serif !important; }
  `;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${head}${css}</style></head><body><main id="app">${markup}</main></body></html>`;
  const htmlPath = path.join(rendered, `${view}.html`);
  const pdfPath = path.join(rendered, `${view}.pdf`);
  fs.writeFileSync(htmlPath, html);
  execFileSync(python, ['-m','weasyprint','-q',htmlPath,pdfPath], { cwd:project, env:{...process.env,PYTHONPATH:vendor}, stdio:'inherit' });
  const pngPath = path.join(output, fileName);
  const base = pngPath.replace(/\.png$/i,'');
  execFileSync('pdftocairo',['-png','-singlefile','-r','96',pdfPath,base],{stdio:'inherit'});
  execFileSync(python,['-c',`from PIL import Image\nim=Image.open(r'''${pngPath}''')\nim.load()\nassert im.size==(${width},${height}), im.size\nassert im.getbbox() is not None`],{env:{...process.env,PYTHONPATH:vendor},stdio:'inherit'});
}

console.log(`已渲染并校验 ${targets.length} 张 V6.1 关键效果图。`);
