// Bundles main, preload and renderer into out/. Usage: node scripts/build.mjs [--test] [--prod]
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'out');
const args = new Set(process.argv.slice(2));
const production = args.has('--prod');

const nodeTarget = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Electron 44 ships Node 24.
  target: 'node24',
  // npm packages are loaded from node_modules at runtime; electron-builder ships them.
  packages: 'external',
  external: ['electron'],
  sourcemap: !production,
  minify: production,
  logLevel: 'warning',
};

async function buildApp() {
  fs.rmSync(outDir, { recursive: true, force: true });

  await Promise.all([
    build({ ...nodeTarget, entryPoints: ['src/main/index.ts'], outfile: 'out/main/index.js' }),
    build({ ...nodeTarget, entryPoints: ['src/preload/index.ts'], outfile: 'out/preload/index.js' }),
    build({
      bundle: true,
      platform: 'browser',
      format: 'iife',
      // Electron 44 ships Chromium 152.
      target: 'chrome152',
      entryPoints: ['src/renderer/main.ts'],
      outfile: 'out/renderer/main.js',
      sourcemap: !production,
      minify: production,
      logLevel: 'warning',
    }),
  ]);

  for (const file of ['index.html', 'styles.css']) {
    fs.copyFileSync(path.join(root, 'src/renderer', file), path.join(outDir, 'renderer', file));
  }
}

async function buildTests() {
  const testDir = path.join(root, 'test');
  const entryPoints = fs.readdirSync(testDir)
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => path.join('test', name));
  fs.rmSync(path.join(outDir, 'test'), { recursive: true, force: true });
  await build({ ...nodeTarget, entryPoints, outdir: 'out/test', outExtension: { '.js': '.cjs' } });
}

process.chdir(root);
await (args.has('--test') ? buildTests() : buildApp());
