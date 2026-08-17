import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requestedTarget = process.argv[2]

if (!requestedTarget) {
  throw new Error('Usage: node tools/sync-mobile-ui.mjs <apps/.../src/shared>')
}

const npmPackageJson = process.env.npm_package_json
const workspaceDirectory = npmPackageJson ? basename(dirname(npmPackageJson)) : ''
const target = requestedTarget === 'src/shared' && workspaceDirectory
  ? resolve(repositoryRoot, 'apps', workspaceDirectory, requestedTarget)
  : resolve(process.cwd(), requestedTarget)
const relativeTarget = relative(repositoryRoot, target).replaceAll('\\', '/')
if (!/^apps\/[^/]+\/src\/shared$/.test(relativeTarget)) {
  throw new Error(`Refusing to generate mobile UI outside an app source: ${target}`)
}

const mobileUiRoot = resolve(repositoryRoot, 'packages/mobile-ui/src')
const catalogSource = resolve(repositoryRoot, 'packages/product-catalog/src/index.ts')
const generatedBanner = '<!-- Generated from packages/mobile-ui. Do not edit this mirror directly. -->\n'

mkdirSync(target, { recursive: true })
for (const component of ['ProductHome.vue', 'ProductModule.vue']) {
  const source = readFileSync(resolve(mobileUiRoot, component), 'utf8')
    .replace("from '@lequ/product-catalog'", "from './product-catalog'")
  writeFileSync(resolve(target, component), generatedBanner + source, 'utf8')
}
writeFileSync(
  resolve(target, 'product-catalog.ts'),
  '// Generated from packages/product-catalog. Do not edit this mirror directly.\n' +
    readFileSync(catalogSource, 'utf8'),
  'utf8',
)

process.stdout.write(`Synced mobile UI into ${relativeTarget}\n`)
