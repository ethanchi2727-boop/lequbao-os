import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

/**
 * Harness 版本与多模态断言门禁。
 *
 * 确保 DeepSeek Harness 锁定到 0.1.1-rc.2（commit b150a55）：
 * - 多模态视觉模型路由（visionEnabled）已就位；
 * - Files API（0.1.1-rc.1 引入）通过 adapter 的事件信封可达；
 * - 上游升级、回滚不会绕过 SOURCE_REFERENCE 与 fetch_harness 锁点；
 * - Adapter 契约测试覆盖 16 标准事件与 health 返回的 commit/version；
 * - 不得通过修改本门禁或测试断言削弱版本要求。
 */
export async function verifyHarnessVersionGate() {
  const failures = [];

  const sourceRef = JSON.parse(
    await read(
      'docs/v6.1/source-package/07_Trae_Codex立即开发/Harness官方源码获取/SOURCE_REFERENCE.json',
    ),
  );
  if (sourceRef.commit !== 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e') {
    failures.push(
      `SOURCE_REFERENCE.json commit 锁点偏离：期望 b150a551b8d465e31e418e1b2eaf5e79bbb7d28e，实际 ${sourceRef.commit}`,
    );
  }
  if (sourceRef.tag !== 'dsh-v0.1.1-rc.2') {
    failures.push(`SOURCE_REFERENCE.json tag 偏离：期望 dsh-v0.1.1-rc.2，实际 ${sourceRef.tag}`);
  }
  if (sourceRef.verified_at !== '2026-08-26') {
    failures.push(
      `SOURCE_REFERENCE.json verified_at 偏离：期望 2026-08-26，实际 ${sourceRef.verified_at}`,
    );
  }

  const fetchScript = await read(
    'docs/v6.1/source-package/07_Trae_Codex立即开发/Harness官方源码获取/fetch_harness.sh',
  );
  if (!fetchScript.includes('b150a551b8d465e31e418e1b2eaf5e79bbb7d28e')) {
    failures.push('fetch_harness.sh locked_commit 不再锁定 b150a55');
  }
  if (!/locked_commit=("|')b150a551b8d465e31e418e1b2eaf5e79bbb7d28e\1/u.test(fetchScript)) {
    failures.push('fetch_harness.sh locked_commit 赋值丢失或被弱化');
  }

  const typesSrc = await read('runtime/harness-adapter/src/types.ts');
  if (!/visionEnabled:\s*z\.boolean\(\)/u.test(typesSrc)) {
    failures.push('HarnessModelStrategySchema 缺少 visionEnabled 多模态字段');
  }
  if (!/kind:\s*z\.enum\(\[\s*'text',\s*'image',\s*'file',\s*'audio'\s*\]\)/u.test(typesSrc)) {
    failures.push('HarnessAttachmentSchema 缺少 image/file/audio 多模态分类');
  }

  const eventsSrc = await read('runtime/harness-adapter/src/events.ts');
  const eventTypes = [
    'session.created',
    'message.started',
    'message.delta',
    'message.completed',
    'tool.requested',
    'tool.started',
    'tool.completed',
    'tool.failed',
    'approval.requested',
    'approval.resolved',
    'artifact.created',
    'task.paused',
    'task.resumed',
    'task.completed',
    'task.failed',
    'task.cancelled',
  ];
  for (const type of eventTypes) {
    if (!eventsSrc.includes(`'${type}'`)) {
      failures.push(`HARNESS_EVENT_TYPES 缺少事件类型 ${type}`);
    }
  }
  if (!/export const HARNESS_EVENT_TYPES = \[([\s\S]*?)\];/u.test(eventsSrc)) {
    failures.push('HARNESS_EVENT_TYPES 枚举丢失');
  }

  const stubSrc = await read('runtime/harness-adapter/src/stub-backend.ts');
  if (!stubSrc.includes("'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'")) {
    failures.push('StubHarnessBackend 不再返回 0.1.1-rc.2 commit');
  }
  if (!stubSrc.includes("'stub-v0.1.1-rc.2'")) {
    failures.push('StubHarnessBackend 不再返回 0.1.1-rc.2 model routing version');
  }

  const contractTest = await read('runtime/harness-adapter/src/adapter.contract.test.ts');
  if (!contractTest.includes('expect(health.harnessCommit).toMatch(/^b150a551/)')) {
    failures.push('契约测试未断言 health.harnessCommit 以 b150a551 开头');
  }
  if (
    !contractTest.includes('expect(health.modelRoutingVersion).toMatch(/^stub-v0\\.1\\.1-rc\\.2$/)')
  ) {
    failures.push('契约测试未断言 modelRoutingVersion 为 stub-v0.1.1-rc.2');
  }
  if (!contractTest.includes('expect(HARNESS_EVENT_TYPES).toHaveLength(16)')) {
    failures.push('契约测试未断言 16 个标准事件齐全');
  }
  if (!contractTest.includes('HarnessBackendUnavailableError')) {
    failures.push('契约测试未覆盖 Adapter 降级路径');
  }

  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyHarnessVersionGate()
    .then((failures) => {
      if (failures.length > 0) {
        for (const failure of failures) console.error(`Harness 版本门禁失败：${failure}`);
        process.exitCode = 1;
        return;
      }
      console.log(
        'Harness 版本门禁通过：0.1.1-rc.2 (b150a55)、多模态、16 标准事件、Adapter 契约与降级路径均已锁定。',
      );
    })
    .catch((error) => {
      console.error('Harness 版本门禁执行异常：', error);
      process.exitCode = 1;
    });
}
