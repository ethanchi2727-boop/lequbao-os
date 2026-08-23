import { copyFile, mkdir, rm } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of [
  'index.html',
  'life.html',
  'styles.css',
  'life.css',
  'product-tokens.css',
  'app.js',
  'life-app.js',
  'life-api.js',
  'state.mjs',
  'api-client.js',
  'live-page-registry.mjs',
  'page-contracts.mjs',
  'production-ui-policy.mjs',
  'experience-registry.mjs',
  'page-experiences.mjs',
  'page-experiences-intake.mjs',
  'page-experiences-sales.mjs',
  'page-experiences-revenue.mjs',
  'page-experiences-delivery.mjs',
  'page-experiences-miniapp.mjs',
  'page-experiences-operations.mjs',
  'page-experiences-commerce.mjs',
  'page-experiences-service.mjs',
  'page-experiences-engagement.mjs',
  'page-experiences-controls.mjs',
  'page-experiences-governance.mjs',
  'page-experiences-risk.mjs',
]) {
  await copyFile(new URL(`./src/${file}`, import.meta.url), new URL(file, output));
}
await mkdir(new URL('./life-assets/', output), { recursive: true });
for (const file of [
  'life-banner.webp',
  'life-category-sprite.webp',
  'life-product.webp',
  'local-dining.webp',
]) {
  await copyFile(
    new URL(`../../assets/miniapp/${file}`, import.meta.url),
    new URL(`./life-assets/${file}`, output),
  );
}
console.log('乐趣宝 Web production assets built.');
