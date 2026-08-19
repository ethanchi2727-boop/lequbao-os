import { copyFile, mkdir, rm } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of [
  'index.html',
  'styles.css',
  'app.js',
  'state.mjs',
  'api-client.js',
  'live-page-registry.mjs',
  'page-contracts.mjs',
  'production-ui-policy.mjs',
]) {
  await copyFile(new URL(`./src/${file}`, import.meta.url), new URL(file, output));
}
console.log('乐趣宝 Web production assets built.');
