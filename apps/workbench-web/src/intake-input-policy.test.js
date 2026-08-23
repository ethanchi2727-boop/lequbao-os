import { describe, expect, it } from 'vitest';
import {
  INTAKE_FILE_TYPES,
  MAX_INTAKE_FILE_BYTES,
  MAX_INTAKE_MESSAGE_LENGTH,
  intakeMessageRemaining,
  validateIntakeFile,
} from './intake-input-policy.mjs';
describe('移动建档输入策略', () => {
  it('限制消息为 2000 字并提供剩余量', () => {
    expect(MAX_INTAKE_MESSAGE_LENGTH).toBe(2000);
    expect(intakeMessageRemaining('乐'.repeat(1998))).toBe(2);
    expect(intakeMessageRemaining('乐'.repeat(2005))).toBe(0);
  });
  it('允许声明的图片文档和音频类型', () => {
    for (const type of INTAKE_FILE_TYPES)
      expect(validateIntakeFile({ type, size: 1 }).ok).toBe(true);
  });
  it('拒绝未知空文件和超过 20 MB 的文件', () => {
    expect(validateIntakeFile({ type: 'text/html', size: 1 }).reason).toMatch(/类型/u);
    expect(validateIntakeFile({ type: 'image/png', size: 0 }).reason).toMatch(/为空/u);
    expect(
      validateIntakeFile({ type: 'image/png', size: MAX_INTAKE_FILE_BYTES + 1 }).reason,
    ).toMatch(/20 MB/u);
  });
});
