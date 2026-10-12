import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...parts) => resolve(root, ...parts);

/**
 * esbuild has no UMD output, so wrap its IIFE in the classic UMD shell. The
 * entry has a default export, hence the `.default` unwrap in the footer. The
 * global stays lowercase `xqclip` so `new xqclip(...)` keeps working.
 */
const UMD_HEADER = `(function (root, factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') module.exports = factory();
    else if (typeof define === 'function' && define.amd) define(factory);
    else if (typeof define === 'function' && define.cmd) define(function (require, exports, module) { module.exports = factory(); });
    else root.xqclip = factory();
})(typeof self !== 'undefined' ? self : this, function () {
"use strict";
`;
const UMD_FOOTER = `
return __xqclipUmd__.default || __xqclipUmd__;
});
`;

const BUNDLES = [
  { outfile: 'lib/js/xqclip.js', format: 'iife', umd: true, minify: false },
  { outfile: 'lib/js/xqclip.min.js', format: 'iife', umd: true, minify: true },
  { outfile: 'lib/js/xqclip-esm.js', format: 'esm', umd: false, minify: false },
  { outfile: 'lib/js/xqclip-esm.min.js', format: 'esm', umd: false, minify: true },
  // `.mjs` mirrors keep Node from having to guess the module type of the
  // package entry points; the `.js` copies stay for the documented CDN paths.
  { outfile: 'lib/js/xqclip-esm.mjs', format: 'esm', umd: false, minify: false },
  { outfile: 'lib/js/xqclip-esm.min.mjs', format: 'esm', umd: false, minify: true },
];

async function prepareDirectories() {
  for (const dir of ['lib/js', 'lib/css', 'lib/vue', 'lib/style', 'lib/types']) {
    await mkdir(at(dir), { recursive: true });
  }
}

async function buildBundles() {
  for (const bundle of BUNDLES) {
    await build({
      entryPoints: [at('src/index.ts')],
      outfile: at(bundle.outfile),
      bundle: true,
      format: bundle.format,
      target: ['es2018'],
      minify: bundle.minify,
      charset: 'utf8',
      legalComments: 'none',
      logLevel: 'warning',
      ...(bundle.umd
        ? {
            globalName: '__xqclipUmd__',
            banner: { js: UMD_HEADER },
            footer: { js: UMD_FOOTER },
          }
        : {}),
    });
  }
}

async function buildVue() {
  await build({
    entryPoints: [at('src/vue/index.ts')],
    outfile: at('lib/vue/xqclip.js'),
    bundle: true,
    format: 'esm',
    // The SFC is compiled by the consumer's own Vue toolchain.
    external: ['./xqclip.vue'],
    target: ['es2018'],
    charset: 'utf8',
    logLevel: 'warning',
  });

  const sfc = await readFile(at('src/vue/xqclip.vue'), 'utf8');
  await writeFile(
    at('lib/vue/xqclip.vue'),
    sfc.replace("from '../core'", "from '../js/xqclip-esm.js'"),
  );
}

async function buildStyles() {
  const css = await readFile(at('src/style/xqclip.css'), 'utf8');
  await writeFile(at('lib/css/xqclip.css'), css);

  await build({
    stdin: { contents: css, resolveDir: at('lib/css'), loader: 'css' },
    outfile: at('lib/css/xqclip.min.css'),
    minify: true,
    charset: 'utf8',
    logLevel: 'warning',
  });

  // Shared by the Vue SFC, which imports it relatively.
  await copyFile(at('src/style/xqclip.css'), at('lib/style/xqclip.css'));
}

function resolveTsc() {
  try {
    return require.resolve('typescript/bin/tsc');
  } catch {
    return resolve(dirname(require.resolve('typescript')), 'tsc.js');
  }
}

async function buildTypes() {
  execFileSync(process.execPath, [resolveTsc(), '-p', 'tsconfig.build.json'], {
    cwd: root,
    stdio: 'inherit',
  });
  // Resolves the `./index.vue` import inside the emitted plugin declaration.
  await writeFile(
    at('lib/types/vue/xqclip.vue.d.ts'),
    'declare const component: unknown;\nexport default component;\n',
  );
}

await prepareDirectories();
await buildBundles();
await buildVue();
await buildStyles();
await buildTypes();
console.log('xqclip: build finished.');