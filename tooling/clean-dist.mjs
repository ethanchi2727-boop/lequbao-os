import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(process.cwd(), 'dist');
const isWorkspaceDist =
  target.startsWith(`${workspaceRoot}${path.sep}`) && path.basename(target) === 'dist';

if (!isWorkspaceDist) throw new Error(`refusing to clean unexpected path: ${target}`);
rmSync(target, { recursive: true, force: true });
