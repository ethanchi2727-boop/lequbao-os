#!/usr/bin/env node
/**
 * 质量门禁运行器
 *
 * 读取 quality-gate.config.json，按模块执行真实质量检查命令。
 * - 任一 P0 检查（typecheck/build/test）失败时返回非 0 退出码
 * - 配置未初始化时明确报告并失败
 * - 没有测试、命令不存在时必须明确报告，不得静默通过
 *
 * 用法: node scripts/quality-gate.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const configPath = resolve(root, 'quality-gate.config.json');

// ANSI 颜色
const C = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function color(text, c) {
  return `${c}${text}${C.reset}`;
}

// 读取配置
if (!existsSync(configPath)) {
  console.error(color('✗ quality-gate.config.json 不存在', C.red));
  console.error(color('  请按 docs/PROJECT_INITIALIZATION.md 完成初始化。', C.yellow));
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch (e) {
  console.error(color('✗ quality-gate.config.json 解析失败: ' + e.message, C.red));
  process.exit(1);
}

// 检查初始化状态
if (!config.initialized) {
  console.error(color('✗ 质量门禁未初始化', C.red));
  console.error(color('  initialized = false', C.yellow));
  console.error(color('  请按 docs/PROJECT_INITIALIZATION.md 完成初始化后再执行。', C.yellow));
  if (config.notes) {
    console.error(color('  提示: ' + config.notes, C.gray));
  }
  process.exit(1);
}

if (!config.modules || config.modules.length === 0) {
  console.error(color('✗ 配置中没有模块', C.red));
  process.exit(1);
}

const P0_CHECKS = ['typecheck', 'build', 'test'];
const ALL_CHECKS = ['lint', 'typecheck', 'test', 'build'];

const results = [];
let hasP0Failure = false;
let hasAnyFailure = false;

console.log(color('\n════════════════════════════════════════', C.cyan));
console.log(color('  质量门禁执行', C.bold));
console.log(color('════════════════════════════════════════\n', C.cyan));
console.log(`项目: ${config.projectName || '(未命名)'}`);
console.log(`技术栈: ${config.techStack ? config.techStack.join(', ') : '(未指定)'}`);
console.log(`模块数: ${config.modules.length}\n`);

for (const mod of config.modules) {
  console.log(color(`▶ 模块: ${mod.name} (${mod.path})`, C.bold));

  for (const checkName of ALL_CHECKS) {
    const check = mod.commands[checkName];
    const isP0 = P0_CHECKS.includes(checkName);

    // 检查项不存在于配置
    if (!check) {
      const msg = `[${mod.name}] ${checkName}: 配置缺失`;
      console.log(`  ✗ ${checkName}: ${color('配置缺失', C.red)}`);
      results.push({ module: mod.name, check: checkName, status: 'missing', exitCode: -1, msg, isP0 });
      if (isP0) hasP0Failure = true;
      hasAnyFailure = true;
      continue;
    }

    // 检查项标记为不适用
    if (check.applicable === false) {
      const reason = check.reason || '(未提供理由)';
      console.log(color(`  ⊘ ${checkName}: 不适用 — ${reason}`, C.gray));
      results.push({ module: mod.name, check: checkName, status: 'not-applicable', exitCode: 0, msg: `不适用: ${reason}`, isP0 });
      continue;
    }

    // 命令为空
    if (!check.cmd || check.cmd.trim() === '') {
      const msg = `[${mod.name}] ${checkName}: 命令为空`;
      console.log(`  ✗ ${checkName}: ${color('命令为空，不得静默通过', C.red)}`);
      results.push({ module: mod.name, check: checkName, status: 'empty-cmd', exitCode: -1, msg, isP0 });
      if (isP0) hasP0Failure = true;
      hasAnyFailure = true;
      continue;
    }

    // 执行命令
    const cwd = resolve(root, mod.path);
    console.log(color(`  ▷ ${checkName}: ${check.cmd}`, C.gray));

    const startTime = Date.now();
    const commandShell = process.platform === 'win32'
      ? (process.env.ComSpec || 'cmd.exe')
      : 'bash';
    const commandArgs = process.platform === 'win32'
      ? ['/d', '/s', '/c', check.cmd]
      : ['-lc', check.cmd];
    const result = spawnSync(commandShell, commandArgs, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const exitCode = result.status;
    const stdout = (result.stdout || '').trim().slice(-500);
    const stderr = (result.stderr || '').trim().slice(-500);

    if (exitCode === 0) {
      console.log(`  ✓ ${checkName}: ${color('PASS', C.green)} (${elapsed}s)`);
      results.push({ module: mod.name, check: checkName, status: 'pass', exitCode, msg: '', isP0 });
    } else {
      // 区分"命令不存在"和"命令执行失败"
      const isCmdNotFound = result.stderr && (result.stderr.includes('command not found') || result.stderr.includes('not recognized'));
      const statusLabel = isCmdNotFound ? '命令不存在' : `失败(exit=${exitCode})`;
      console.log(`  ✗ ${checkName}: ${color(statusLabel, C.red)} (${elapsed}s)`);
      if (stdout) console.log(color(`    stdout: ${stdout.slice(0, 200)}`, C.gray));
      if (stderr) console.log(color(`    stderr: ${stderr.slice(0, 200)}`, C.gray));
      results.push({ module: mod.name, check: checkName, status: isCmdNotFound ? 'cmd-not-found' : 'fail', exitCode, msg: statusLabel, isP0 });
      if (isP0) hasP0Failure = true;
      hasAnyFailure = true;
    }
  }
  console.log('');
}

// 汇总报告
console.log(color('════════════════════════════════════════', C.cyan));
console.log(color('  质量门禁报告', C.bold));
console.log(color('════════════════════════════════════════\n', C.cyan));

console.log('| 模块 | 检查项 | P0 | 退出码 | 结果 |');
console.log('|------|--------|----|--------|------|');
for (const r of results) {
  const p0Label = r.isP0 ? '是' : '否';
  let resultLabel;
  if (r.status === 'pass') resultLabel = 'PASS';
  else if (r.status === 'not-applicable') resultLabel = '不适用';
  else if (r.status === 'cmd-not-found') resultLabel = '命令不存在';
  else if (r.status === 'empty-cmd') resultLabel = '命令为空';
  else if (r.status === 'missing') resultLabel = '配置缺失';
  else resultLabel = `FAIL(${r.msg})`;
  console.log(`| ${r.module} | ${r.check} | ${p0Label} | ${r.exitCode} | ${resultLabel} |`);
}

const passCount = results.filter(r => r.status === 'pass' || r.status === 'not-applicable').length;
const failCount = results.length - passCount;
console.log(`\n总计: ${results.length} 项, 通过 ${passCount} 项, 失败 ${failCount} 项`);

if (hasP0Failure) {
  console.error(color('\n✗ 质量门禁失败：存在 P0 检查项未通过', C.red));
  process.exit(1);
} else if (hasAnyFailure) {
  console.error(color('\n✗ 质量门禁失败：存在非 P0 检查项未通过', C.yellow));
  process.exit(1);
} else {
  console.log(color('\n✓ 质量门禁全部通过', C.green));
  process.exit(0);
}
