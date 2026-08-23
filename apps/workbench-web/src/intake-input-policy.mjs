export const MAX_INTAKE_MESSAGE_LENGTH = 2000;
export const MAX_INTAKE_FILE_BYTES = 20 * 1024 * 1024;
export const INTAKE_FILE_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/amr',
]);
export function intakeMessageRemaining(value) {
  return Math.max(0, MAX_INTAKE_MESSAGE_LENGTH - value.length);
}
export function validateIntakeFile(file) {
  if (!INTAKE_FILE_TYPES.includes(file.type)) return { ok: false, reason: '不支持此文件类型' };
  if (file.size <= 0) return { ok: false, reason: '文件内容为空' };
  if (file.size > MAX_INTAKE_FILE_BYTES) return { ok: false, reason: '文件超过 20 MB 限制' };
  return { ok: true, reason: '' };
}
