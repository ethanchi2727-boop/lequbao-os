import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyMiniapp } from './miniapp-contract.mjs';

const root = 'docs/v6.1/source-package/03_UIUX原型效果图与设计资产';
const keyRoot = join(root, '关键效果图_V6.1');
const files = (await readdir(keyRoot)).filter((name) => name.endsWith('.png')).sort();
const failures = [];
if (files.length !== 14) failures.push(`UI-004 requires 14 key renders, found ${files.length}`);

for (const name of files) {
  const path = join(keyRoot, name);
  const buffer = await readFile(path);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (buffer.subarray(1, 4).toString('ascii') !== 'PNG') failures.push(`${name} is not PNG`);
  if (width < 1000 || height < 1000) failures.push(`${name} is undersized: ${width}x${height}`);
  if (buffer.length < 100_000) failures.push(`${name} is likely blank or truncated`);
}

for (const app of ['consumer-miniapp', 'merchant-miniapp']) {
  try {
    await verifyMiniapp(app);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

const optimized = await readdir('assets/miniapp');
let optimizedBytes = 0;
for (const name of optimized) optimizedBytes += (await stat(join('assets/miniapp', name))).size;
if (optimized.length !== 4 || optimizedBytes > 1_000_000)
  failures.push(
    `optimized mini-program assets invalid: ${optimized.length} files/${optimizedBytes} bytes`,
  );

const workbenchApp = await readFile('apps/workbench-web/src/app.js', 'utf8');
if (!workbenchApp.includes('<svg class="ui-icon"'))
  failures.push('Workbench must render code-native SVG icons');
if (/const icons\s*=|[✣◫▦▣◇⌁♩⌑◉♧♙⌕]/u.test(workbenchApp))
  failures.push('Workbench contains a text or Unicode placeholder icon');

if (failures.length) {
  for (const failure of failures) console.error(`Visual failure: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Visual assets verified: UI-003 sprite, 14 UI-004 renders, 62 mini-program leaves, ${optimizedBytes} optimized bytes.`,
  );
}
