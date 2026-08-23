import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const styleSource = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

function luminance(hex) {
  const channels = hex
    .match(/[\da-f]{2}/giu)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('乐趣宝工作台文字对比度策略', () => {
  const requiredPairs = [
    ['#5f6474', '#ffffff'],
    ['#5f6474', '#fbfbfd'],
    ['#a43f2d', '#ffebe6'],
    ['#0b6b50', '#e6f6ef'],
    ['#0b6b50', '#e8f7f1'],
    ['#2f5fb8', '#e5efff'],
    ['#655d52', '#fff9ef'],
    ['#6b5947', '#fff3e5'],
  ];

  it.each(requiredPairs)('%s 在 %s 上达到普通文本 4.5:1', (foreground, background) => {
    expect(styleSource).toContain(foreground);
    expect(styleSource).toContain(background);
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
