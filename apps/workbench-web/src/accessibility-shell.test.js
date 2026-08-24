import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const appSource = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
const aiStartStyleSource = await readFile(new URL('./ai-start.css', import.meta.url), 'utf8');
const aiStartSource = await readFile(new URL('./ai-start-page.mjs', import.meta.url), 'utf8');

describe('乐趣宝工作台无障碍应用壳', () => {
  it('提供键盘可见的跳转主内容入口和可聚焦主区域', () => {
    expect(appSource).toContain('class="skip-link" href="#main-content"');
    expect(appSource).toContain('<main id="main-content" tabindex="-1" aria-busy=');
    expect(styleSource).toContain('.skip-link:focus');
  });

  it('为键盘焦点提供全局可见样式', () => {
    expect(styleSource).toContain(':focus-visible');
    expect(styleSource).toContain('outline: 3px solid #2f6feb');
  });

  it('尊重用户减少动态效果的系统设置', () => {
    expect(styleSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styleSource).toContain('animation-iteration-count: 1 !important');
  });

  it('路由更新同步文档标题并把焦点交给主内容', () => {
    expect(appSource).toContain('document.title = `乐趣宝 · ${view.title}`');
    expect(appSource).toContain("document.querySelector('#main-content')?.focus");
    expect(appSource).toContain("document.activeElement?.id === 'main-content'");
  });

  it('实现界面声明的 Ctrl+K 与 Ctrl+N 快捷键', () => {
    expect(appSource).toContain("event.key.toLowerCase() === 'n'");
    expect(appSource).toContain("event.key.toLowerCase() === 'k'");
    expect(appSource).toContain('document.querySelector(\'[data-action="page-search"]\')');
  });

  it('搜索结果和命令字段错误使用可感知的无障碍语义', () => {
    expect(appSource).toContain('role="combobox"');
    expect(appSource).toContain('role="listbox"');
    expect(appSource).toContain('aria-selected="false"');
    expect(appSource).toContain('id="page-search-announcement" aria-live="polite"');
    expect(appSource).toContain('class="field-error"');
    expect(appSource).toContain("setAttribute('aria-invalid', 'true')");
  });

  it('结果区使用可恢复的页签语义且加载状态公开 aria-busy', () => {
    expect(appSource).toContain('role="tablist"');
    expect(appSource).toContain('role="tabpanel"');
    expect(appSource).toContain('aria-controls="workbench-results"');
    expect(appSource).toContain('aria-busy="${view.state === \'loading\'}"');
  });

  it('输入、上传和演示录音状态可播报且生产录音失效关闭', () => {
    expect(appSource).toContain('<small role="status" aria-live="polite"');
    expect(appSource).toContain('class="upload-item" role="status"');
    expect(appSource).toContain('disabled aria-disabled="true"');
    expect(appSource).toContain("target.setAttribute('aria-pressed'");
  });

  it('保护未发送草稿、结果区偏好与路由滚动状态', () => {
    expect(appSource).toContain('escapeHtml(draftMessage)');
    expect(appSource).toContain("addEventListener('beforeunload'");
    expect(appSource).toContain('sessionStorage.setItem(resultPanelStorageKey');
    expect(appSource).toContain('scrollPositions.set(location.href, captureScrollPosition())');
    expect(appSource).toContain("document.querySelector('.chat')?.scrollTop");
  });

  it('提供可键盘操作且连接真实创建命令的 AI 新对话首页', () => {
    expect(aiStartSource).toContain('data-experience="conversation-start"');
    expect(aiStartSource).toContain('id="ai-task-title"');
    expect(aiStartSource).toContain('data-command="employee-agent-conversation-create"');
    expect(appSource).toContain('data-action="execution-mode"');
    expect(aiStartSource).toContain('data-action="share-ai-task"');
    expect(aiStartSource).toContain('id="ai-start-status"');
    expect(appSource).toContain('control instanceof HTMLTextAreaElement');
    expect(appSource).toContain("pageStyle.href = '/ai-start.css'");
    expect(aiStartStyleSource).toContain('.ai-start-composer');
    expect(aiStartStyleSource).toContain('.ai-quick-start');
  });
});
