export const lifeBannerThemes = Object.freeze({
  // 与 App.vue 全局主题 Token 一致：生活绿 #0D8B62 / 交易橙 #FF5A36 / 湖蓝 #1596C9
  green: Object.freeze({ top: '#096948', mid: '#0D8B62', soft: '#E7F7F0' }),
  coral: Object.freeze({ top: '#D8431F', mid: '#FF5A36', soft: '#FFF0EA' }),
  blue: Object.freeze({ top: '#0D6F96', mid: '#1596C9', soft: '#E8F7FD' }),
});

export function resolveLifeBannerTheme(themeColor = 'green') {
  return lifeBannerThemes[themeColor] ?? lifeBannerThemes.green;
}

export function lifeBannerThemeStyle(themeColor) {
  const theme = resolveLifeBannerTheme(themeColor);
  return {
    '--tone-top': theme.top,
    '--tone-mid': theme.mid,
    '--tone-soft': theme.soft,
  };
}

export function resolveLifeChromeMetrics(windowInfo = {}, menuRect = null) {
  const statusBarHeight = Math.max(0, Number(windowInfo.statusBarHeight) || 0);
  const windowWidth = Math.max(0, Number(windowInfo.windowWidth) || 0);
  const validMenu =
    menuRect &&
    Number(menuRect.top) >= statusBarHeight &&
    Number(menuRect.height) > 0 &&
    Number(menuRect.left) > 0;

  if (!validMenu) {
    return { statusBarHeight, navigationHeight: 44, capsuleWidth: 0, capsuleHeight: 0 };
  }

  const capsuleHeight = Number(menuRect.height);
  const verticalGap = Math.max(0, Number(menuRect.top) - statusBarHeight);
  return {
    statusBarHeight,
    navigationHeight: Math.max(44, capsuleHeight + verticalGap * 2),
    capsuleWidth: Math.max(0, windowWidth - Number(menuRect.left) + 6),
    capsuleHeight,
  };
}

export function readLifeChromeMetrics(runtime = globalThis.uni) {
  if (!runtime) return resolveLifeChromeMetrics();
  const windowInfo =
    typeof runtime.getWindowInfo === 'function'
      ? runtime.getWindowInfo()
      : typeof runtime.getSystemInfoSync === 'function'
        ? runtime.getSystemInfoSync()
        : {};
  const menuRect =
    typeof runtime.getMenuButtonBoundingClientRect === 'function'
      ? runtime.getMenuButtonBoundingClientRect()
      : null;
  return resolveLifeChromeMetrics(windowInfo, menuRect);
}
