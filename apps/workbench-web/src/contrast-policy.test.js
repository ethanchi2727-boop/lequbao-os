import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const [styleSource, tokenSource] = await Promise.all([
  readFile(new URL('./styles.css', import.meta.url), 'utf8'),
  readFile(new URL('./product-tokens.css', import.meta.url), 'utf8'),
]);

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
    ['#53645f', '#ffffff'],
    ['#53645f', '#f7f9f8'],
    ['#111b19', '#fff0e1'],
    ['#086448', '#f1fbf7'],
    ['#086448', '#e4f6ef'],
    ['#4b3cc4', '#f6f4ff'],
    ['#655d52', '#fff9ef'],
    ['#6b5947', '#fff3e5'],
  ];

  it.each(requiredPairs)('%s 在 %s 上达到普通文本 4.5:1', (foreground, background) => {
    const visualSource = `${tokenSource}\n${styleSource}`;
    expect(visualSource).toContain(foreground);
    expect(visualSource).toContain(background);
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('使用 V6.2 PC 与 Mobile Theme Namespace', () => {
    expect(tokenSource).toContain('--bao-pc-ink-950');
    expect(tokenSource).toContain('--bao-pc-gradient-brand');
    expect(tokenSource).toContain('--bao-mobile-brand');
    expect(styleSource).toContain('var(--bao-pc-gradient-dark)');
  });
});
