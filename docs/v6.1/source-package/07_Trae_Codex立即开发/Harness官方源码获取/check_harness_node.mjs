import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'runtime/deepseek-harness-official');
const required = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'package.json', 'pnpm-lock.yaml'];
for (const file of required) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) throw new Error('Harness 缺少文件：' + file);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!packageJson.name) throw new Error('Harness package.json 缺少 name');
console.log('Harness 文件与 Node 项目结构检查通过：' + packageJson.name);
