import { describe, expect, it } from 'vitest';
import {
  lifeBannerThemeStyle,
  readLifeChromeMetrics,
  resolveLifeBannerTheme,
  resolveLifeChromeMetrics,
} from './life-visual.js';

describe('乐趣生活 V6.3 visual runtime', () => {
  it('locks the three official banner-linked theme ramps', () => {
    expect(resolveLifeBannerTheme('green')).toEqual({
      top: '#078e64',
      mid: '#22c98f',
      soft: '#e6faef',
    });
    expect(lifeBannerThemeStyle('coral')).toEqual({
      '--tone-top': '#ef3b43',
      '--tone-mid': '#ff756c',
      '--tone-soft': '#fff0e9',
    });
    expect(resolveLifeBannerTheme('blue').top).toBe('#0878b6');
    expect(resolveLifeBannerTheme('unknown')).toBe(resolveLifeBannerTheme('green'));
  });

  it('derives the top operation row from the real WeChat capsule rectangle', () => {
    expect(
      resolveLifeChromeMetrics(
        { statusBarHeight: 47, windowWidth: 390 },
        { top: 52, left: 295, height: 32 },
      ),
    ).toEqual({
      statusBarHeight: 47,
      navigationHeight: 44,
      capsuleWidth: 101,
      capsuleHeight: 32,
    });
  });

  it('uses an H5-safe fallback without inventing a capsule', () => {
    expect(resolveLifeChromeMetrics({ statusBarHeight: 0, windowWidth: 390 })).toEqual({
      statusBarHeight: 0,
      navigationHeight: 44,
      capsuleWidth: 0,
      capsuleHeight: 0,
    });
  });

  it('reads supported runtime APIs without requiring them on H5', () => {
    const runtime = {
      getWindowInfo: () => ({ statusBarHeight: 24, windowWidth: 375 }),
      getMenuButtonBoundingClientRect: () => ({ top: 28, left: 281, height: 32 }),
    };
    expect(readLifeChromeMetrics(runtime)).toEqual({
      statusBarHeight: 24,
      navigationHeight: 44,
      capsuleWidth: 100,
      capsuleHeight: 32,
    });
    expect(readLifeChromeMetrics(null).capsuleWidth).toBe(0);
  });
});
