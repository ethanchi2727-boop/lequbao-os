export const lifeBannerThemes = Object.freeze({
  green: Object.freeze({ top: '#078e64', mid: '#22c98f', soft: '#e6faef' }),
  coral: Object.freeze({ top: '#ef3b43', mid: '#ff756c', soft: '#fff0e9' }),
  blue: Object.freeze({ top: '#0878b6', mid: '#27c4df', soft: '#e7f9ff' }),
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
