import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const styleSource = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

describe('乐趣宝工作台窄屏布局契约', () => {
  it('通用页面在移动端缩减外边距和内边距', () => {
    expect(styleSource).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.generic-page \{\s*margin: 12px;\s*padding: 16px;/u,
    );
  });

  it('数据卡片取消桌面最小列宽并允许长值断行', () => {
    expect(styleSource).toMatch(
      /\.generic-grid,\s*\.live-data \{\s*grid-template-columns: minmax\(0, 1fr\);/u,
    );
    expect(styleSource).toMatch(/\.live-data article \{\s*min-width: 0;/u);
    expect(styleSource).toContain('overflow-wrap: anywhere');
  });

  it('命令表单控件在窄屏占满可用宽度', () => {
    expect(styleSource).toMatch(
      /\.command-form input,\s*\.command-form select,\s*\.command-form button \{\s*width: 100%;/u,
    );
  });
});
