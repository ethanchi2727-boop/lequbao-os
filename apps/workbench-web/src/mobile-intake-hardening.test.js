import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

describe('移动建档加固接线', () => {
  it('消息上限与剩余字数播报已接入编辑器', () => {
    expect(source).toContain('maxlength="${MAX_INTAKE_MESSAGE_LENGTH}"');
    expect(source).toContain('intakeMessageRemaining(draftMessage)');
  });
  it('文件校验发生在上传模式与 API 调用之前', () => {
    expect(source.indexOf('const validation = validateIntakeFile(file)')).toBeLessThan(
      source.indexOf(
        'const mode = resolveIntakeMutationMode',
        source.indexOf('async function uploadLiveFile'),
      ),
    );
  });
  it('文件选择后清空控件以允许同一文件修正后重试', () => {
    expect(source).toMatch(
      /if \(file\) void uploadLiveFile\(file\);\s*event\.target\.value = '';/u,
    );
  });
  it('确认控件与发布影响说明建立必填语义关联', () => {
    expect(source).toContain('id="confirmation-impact"');
    expect(source).toContain('required aria-describedby="confirmation-impact"');
    expect(source).toContain(
      'data-action="confirm" aria-describedby="confirmation-impact" disabled',
    );
  });
});
