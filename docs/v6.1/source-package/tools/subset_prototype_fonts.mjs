import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prototype = path.join(packageRoot, '03_UIUX原型效果图与设计资产', '乐趣宝与乐趣生活可运行原型');
const fontDir = path.join(prototype, 'fonts');
const textPath = path.join(fontDir, 'prototype-glyphs.txt');
const sourceFiles = ['app.js', 'app-v6.1.js', 'render-v6.1.mjs', 'index.html'];
const glyphText = sourceFiles.map(file => fs.readFileSync(path.join(prototype, file), 'utf8')).join('\n');
fs.writeFileSync(textPath, glyphText, 'utf8');

const weights = ['Regular', 'Bold'];
const hasFullBackups = weights.every(weight =>
  fs.existsSync(path.join(fontDir, `NotoSansCJKsc-${weight}.full.otf`)),
);
const alreadySubsetted = weights.every(weight => {
  const current = path.join(fontDir, `NotoSansCJKsc-${weight}.otf`);
  return fs.existsSync(current) && fs.statSync(current).size < 2 * 1024 * 1024;
});

if (!hasFullBackups && alreadySubsetted) {
  console.log('字体已是轻量子集；未发现全量备份，本次安全跳过。');
  process.exit(0);
}

for (const weight of weights) {
  const original = path.join(fontDir, `NotoSansCJKsc-${weight}.otf`);
  const backup = path.join(fontDir, `NotoSansCJKsc-${weight}.full.otf`);
  const subset = path.join(fontDir, `NotoSansCJKsc-${weight}.subset.otf`);
  if (!fs.existsSync(backup)) fs.renameSync(original, backup);
  execFileSync('pyftsubset', [backup, `--text-file=${textPath}`, `--output-file=${subset}`, '--layout-features=*', '--glyph-names', '--symbol-cmap', '--legacy-cmap', '--notdef-glyph', '--notdef-outline', '--recommended-glyphs', '--name-IDs=*', '--name-legacy', '--name-languages=*']);
  fs.renameSync(subset, original);
}

console.log('已生成原型所需字形子集，.full.otf 为可恢复备份。');
