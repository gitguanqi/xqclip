// Behavior checks for the committed bundles. The DOM harness in `scripts/` is
// driven from here as well, so `pnpm test` covers construction, refresh, the
// crop path, the ESM export surface, and the Vue plugin entry.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...parts) => resolve(root, ...parts);

/** Minimal DOM: enough for the widget markup, the canvas calls, and events. */
function createStubDom() {
  const listeners = [];
  const images = [];
  const errors = [];

  const makeContext = () => ({
    drawImageCalls: 0,
    lastRegion: null,
    drawImage() {
      this.drawImageCalls += 1;
    },
    getImageData(x, y, w, h) {
      this.lastRegion = { x, y, w, h };
      return { data: [0, 0, 0, 0] };
    },
    putImageDataCalls: 0,
    putImageData() {
      this.putImageDataCalls += 1;
    },
  });

  const find = (node, selector) => {
    const key = selector.replace(/^[.#]/, '');
    const walk = (list) => {
      for (const child of list) {
        if (child.className.split(/\s+/).includes(key)) {
          return child;
        }
        const nested = walk(child.children);
        if (nested) {
          return nested;
        }
      }
      return null;
    };
    return walk(node.children);
  };

  const parseMarkup = (html) => {
    const roots = [];
    const stack = [];
    const pattern = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)>/g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const closing = match[1];
      const name = match[2];
      const attrs = match[3];
      if (closing) {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          if (stack[i].nodeName === name.toUpperCase()) {
            stack.length = i;
            break;
          }
        }
        continue;
      }
      const classMatch = /class="([^"]*)"/.exec(attrs);
      const node = makeNode({
        nodeName: name.toUpperCase(),
        className: classMatch ? classMatch[1] : '',
      });
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
      stack.push(node);
    }
    return roots;
  };

  const makeNode = (spec = {}) => {
    const node = {
      nodeName: spec.nodeName || 'DIV',
      className: spec.className || '',
      style: {},
      classList: { add() {}, remove() {} },
      children: [],
      offsetWidth: 300,
      offsetHeight: 300,
      offsetLeft: 0,
      offsetTop: 0,
      clientWidth: 300,
      clientHeight: 300,
      context: makeContext(),
      getContext() {
        return node.context;
      },
      toDataURL: () => 'data:image/jpg;base64,QUFBQQ==',
      setAttribute() {},
      getAttribute: () => null,
      addEventListener(type, handler) {
        listeners.push({ node, type, handler, removed: false });
      },
      removeEventListener(type, handler) {
        const entry = listeners.find(
          (item) => item.node === node && item.type === type && item.handler === handler,
        );
        if (entry) {
          entry.removed = true;
        }
      },
      querySelector: (selector) => find(node, selector),
      querySelectorAll: () => [],
    };
    Object.defineProperty(node, 'innerHTML', {
      get: () => '',
      set: (value) => {
        node.children = parseMarkup(String(value));
      },
    });
    return node;
  };

  class StubImage {
    constructor() {
      this.width = 200;
      this.height = 200;
      this.onload = null;
      this.assignments = [];
      let crossOrigin = null;
      let src = '';
      Object.defineProperty(this, 'crossOrigin', {
        get: () => crossOrigin,
        set: (value) => {
          crossOrigin = value;
          this.assignments.push('crossOrigin');
        },
      });
      Object.defineProperty(this, 'src', {
        get: () => src,
        set: (value) => {
          src = value;
          this.assignments.push('src');
        },
      });
      images.push(this);
    }
  }

  const host = makeNode({ className: 'corp' });
  const preview = makeNode({ nodeName: 'IMG', className: 'preview' });
  const document = {
    documentElement: { clientWidth: 1200 },
    body: { clientWidth: 1200 },
    querySelector(selector) {
      if (selector === '.corp') {
        return host;
      }
      if (selector === '#preview') {
        return preview;
      }
      return null;
    },
  };
  const window = { onresize: null };

  return {
    listeners,
    images,
    errors,
    host,
    preview,
    window,
    document,
    Image: StubImage,
    find: (selector) => find(host, selector),
    handler(node, type) {
      const entry = listeners.find((item) => item.node === node && item.type === type);
      assert.ok(entry, `no ${type} listener on the widget`);
      return entry.handler;
    },
  };
}

function installGlobals(dom) {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Image: globalThis.Image,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.document;
  globalThis.Image = dom.Image;
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete globalThis[key];
      } else {
        globalThis[key] = value;
      }
    }
  };
}

const CROP_OPTIONS = {
  box: '.corp',
  boxWin: 300,
  boxHei: 300,
  areaWin: 100,
  areaHei: 100,
  url: './img/a1.jpg',
  pre: '#preview',
  scale: 1,
};

test('the committed UMD bundles pass the DOM harness', () => {
  for (const entry of ['lib/js/xqclip.js', 'lib/js/xqclip.min.js']) {
    const result = spawnSync(
      process.execPath,
      ['scripts/dom-behavior-harness.mjs', '--entry', entry, '--scenario', 'all'],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${entry}:\n${result.stdout}${result.stderr}`);
  }
});

test('the UMD build crops a region and reports it', () => {
  const dom = createStubDom();
  const restore = installGlobals(dom);
  try {
    const XqClip = require(at('lib/js/xqclip.js'));
    const changes = [];
    const instance = new XqClip({
      ...CROP_OPTIONS,
      onChange: (data) => changes.push(data),
    });

    assert.deepEqual(dom.errors, []);
    assert.equal(instance.box, dom.host);
    assert.equal(dom.host.style.width, '300px');
    assert.equal(dom.host.style.height, '300px');

    const image = dom.images[0];
    assert.deepEqual(image.assignments, ['crossOrigin', 'src']);
    image.onload();

    const canvas = dom.find('.clip-canvas');
    assert.equal(canvas.context.drawImageCalls, 1);

    const clipBox = dom.find('.clip-box');
    dom.handler(clipBox, 'wheel')({ deltaY: -1 });
    assert.equal(canvas.context.drawImageCalls, 2, 'wheel zoom redraws the image');

    const clipArea = dom.find('.clip-img-area');
    clipArea.offsetWidth = 100;
    clipArea.offsetHeight = 100;
    clipArea.offsetLeft = 100;
    clipArea.offsetTop = 100;

    dom.handler(clipBox, 'mousedown')({ target: { className: '' } });
    dom.handler(clipBox, 'mousemove')({ clientX: 150, clientY: 150 });
    assert.equal(clipArea.style.left, '100px', 'the drag centres the crop box');

    const temp = dom.find('.clip-canvas-temp');
    assert.deepEqual(canvas.context.lastRegion, { x: 100, y: 100, w: 100, h: 100 });
    assert.equal(temp.context.putImageDataCalls, 1, 'the crop reaches the preview canvas');
    assert.equal(changes.length, 1);
    assert.equal(changes[0].base64, 'data:image/jpg;base64,QUFBQQ==');
    assert.equal(changes[0].blob, instance.getCanvasImgData().blob);
    assert.equal(changes[0].file.name.endsWith('.jpg'), true);
    assert.equal(dom.preview.src, changes[0].base64);
    assert.equal(dom.preview.style.width, '100px');

    dom.handler(clipBox, 'mouseup')();
    assert.equal(instance.drag, null);

    const before = dom.listeners.length;
    assert.equal(instance.replaceImg('./img/a2.png'), true);
    assert.equal(dom.listeners.length, before, 'refresh keeps the listener count');

    instance.reset();
    assert.equal(dom.errors.length, 0);

    instance.destroy();
    assert.equal(dom.listeners.every((item) => item.removed), true);
    assert.equal(dom.window.onresize, null);
    assert.equal(dom.host.children.length, 0);
  } finally {
    restore();
  }
});

test('moving and resizing keep the crop, masks, and sampled region in sync', () => {
  const dom = createStubDom();
  const restore = installGlobals(dom);
  try {
    const XqClip = require(at('lib/js/xqclip.js'));
    const instance = new XqClip(CROP_OPTIONS);
    dom.images[0].onload();

    const clipBox = dom.find('.clip-box');
    const clipArea = dom.find('.clip-img-area');
    const scaleHandle = dom.find('.clip-img-scale');
    const topShadow = dom.find('.clip-img-shadow-top');
    const rightShadow = dom.find('.clip-img-shadow-right');
    const bottomShadow = dom.find('.clip-img-shadow-bottom');
    const leftShadow = dom.find('.clip-img-shadow-left');
    const canvas = dom.find('.clip-canvas');

    clipArea.offsetWidth = 100;
    clipArea.offsetHeight = 100;
    clipArea.offsetLeft = 100;
    clipArea.offsetTop = 100;

    dom.handler(clipBox, 'mousedown')({ target: { className: '' } });
    dom.handler(clipBox, 'mousemove')({ clientX: 120, clientY: 130 });

    assert.equal(clipArea.style.left, '70px');
    assert.equal(clipArea.style.top, '80px');
    assert.deepEqual(
      {
        topWidth: topShadow.style.width,
        topHeight: topShadow.style.height,
        topLeft: topShadow.style.left,
        rightWidth: rightShadow.style.width,
        bottomHeight: bottomShadow.style.height,
        leftWidth: leftShadow.style.width,
      },
      {
        topWidth: '100px',
        topHeight: '80px',
        topLeft: '70px',
        rightWidth: '130px',
        bottomHeight: '120px',
        leftWidth: '70px',
      },
      'all four masks follow the moved crop box',
    );
    assert.deepEqual(
      canvas.context.lastRegion,
      { x: 70, y: 80, w: 100, h: 100 },
      'the sampled crop follows the moved crop box',
    );

    // The real browser reports the size assigned by the previous move.
    clipArea.offsetWidth = 100;
    clipArea.offsetHeight = 100;
    clipArea.offsetLeft = 70;
    clipArea.offsetTop = 80;
    dom.handler(scaleHandle, 'mousedown')({ clientX: 170, clientY: 180 });
    dom.handler(clipBox, 'mousemove')({ clientX: 180, clientY: 190 });
    assert.equal(clipArea.style.width, '110px');
    assert.equal(clipArea.style.height, '110px');

    clipArea.offsetWidth = 110;
    clipArea.offsetHeight = 110;
    dom.handler(clipBox, 'mousemove')({ clientX: 200, clientY: 210 });

    assert.equal(clipArea.style.width, '130px', 'resizing uses the original size');
    assert.equal(clipArea.style.height, '130px');
    assert.equal(topShadow.style.width, '130px');
    assert.equal(rightShadow.style.width, '100px');
    assert.equal(bottomShadow.style.height, '90px');
    assert.deepEqual(
      canvas.context.lastRegion,
      { x: 70, y: 80, w: 130, h: 130 },
      'the sampled crop follows the resized crop box',
    );

    instance.destroy();
  } finally {
    restore();
  }
});

test('the ESM builds load without a DOM and keep both export names', async () => {
  const readable = await import(pathToFileURL(at('lib/js/xqclip-esm.mjs')).href);
  const minified = await import(pathToFileURL(at('lib/js/xqclip-esm.min.mjs')).href);

  assert.equal(typeof readable.default, 'function');
  assert.equal(readable.XqClip, readable.default);
  assert.equal(typeof minified.default, 'function');

  const dom = createStubDom();
  const restore = installGlobals(dom);
  try {
    const instance = new readable.default(CROP_OPTIONS);
    assert.equal(instance.box, dom.host);
  } finally {
    restore();
  }
});

test('the shipped plugin installs through the Vue 2 and Vue 3 shape', async () => {
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: [at('lib/vue/xqclip.js')],
    bundle: true,
    write: false,
    format: 'esm',
    logLevel: 'silent',
    plugins: [
      {
        // The consumer's Vue toolchain compiles the SFC; here it is a stub.
        name: 'stub-sfc',
        setup(api) {
          api.onResolve({ filter: /\.vue$/ }, () => ({ path: 'sfc', namespace: 'stub' }));
          api.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'export default { name: "XqClip" };',
            loader: 'js',
          }));
        },
      },
    ],
  });

  const code = result.outputFiles[0].text;
  const bundled = await import(
    `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`
  );
  assert.equal(typeof bundled.default.install, 'function');

  const registered = [];
  const app = { component: (name, definition) => registered.push([name, definition]) };
  bundled.default.install(app);
  bundled.default.install(app);

  assert.deepEqual(
    registered.map(([name]) => name),
    ['xqClip', 'xqClip'],
  );
  assert.equal(registered[0][1], bundled.component);
});

test('the shipped SFC keeps the Vue 2 and Vue 3 contract', async () => {
  const sfc = await readFile(at('lib/vue/xqclip.vue'), 'utf8');

  assert.match(sfc, /from '\.\.\/js\/xqclip-esm\.js'/, 'imports the shipped bundle');
  assert.match(sfc, /modelValue/);
  assert.match(sfc, /model:\s*\{/, 'Vue 2 needs the model option for v-model');
  assert.match(sfc, /beforeUnmount/, 'Vue 3 teardown');
  assert.match(sfc, /beforeDestroy/, 'Vue 2 teardown');
  assert.match(sfc, /<style>/);
  assert.doesNotMatch(sfc, /<style\s+scoped/, 'scoped styles never match core markup');
});
test('the shipped component defers mounting and tears the widget down', async () => {
  const sfc = await readFile(at('lib/vue/xqclip.vue'), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(sfc);
  assert.ok(script, 'the SFC has a script block');

  // The SFC ships uncompiled, so the script block is bundled with its core
  // import pointed at the built ESM bundle, then driven as Vue would.
  const code = script[1].replace(
    "from '../js/xqclip-esm.js'",
    "from '../../lib/js/xqclip-esm.mjs'",
  );
  const { build } = await import('esbuild');
  const result = await build({
    stdin: { contents: code, resolveDir: at('lib/vue'), loader: 'js' },
    bundle: true,
    write: false,
    format: 'esm',
    logLevel: 'silent',
  });
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text, 'utf8').toString('base64')
  );
  const component = module.default;

  const dom = createStubDom();
  const restore = installGlobals(dom);
  try {
    const emitted = [];
    const ctx = {
      ...component.data(),
      $refs: { host: dom.host },
      $emit: (name, payload) => emitted.push([name, payload]),
      options: { pre: '#preview' },
      url: '',
      modelValue: undefined,
    };
    for (const [name, method] of Object.entries(component.methods)) {
      ctx[name] = method.bind(ctx);
    }

    component.mounted.call(ctx);
    assert.equal(ctx.instance, null, 'mounting without a url waits');
    assert.deepEqual(emitted, []);

    assert.equal(ctx.replaceImg('./img/a1.jpg'), true);
    assert.ok(ctx.instance, 'replaceImg mounts the widget');
    assert.equal(emitted[0][0], 'ready');
    assert.deepEqual(emitted[1], ['update:modelValue', './img/a1.jpg']);

    dom.images[0].onload();
    const clipBox = dom.find('.clip-box');
    const clipArea = dom.find('.clip-img-area');
    clipArea.offsetWidth = 100;
    clipArea.offsetHeight = 100;
    clipArea.offsetLeft = 100;
    clipArea.offsetTop = 100;
    dom.handler(clipBox, 'mousedown')({ target: { className: '' } });
    dom.handler(clipBox, 'mousemove')({ clientX: 150, clientY: 150 });
    assert.equal(
      emitted.some(([name]) => name === 'change'),
      true,
      'the crop is emitted as change',
    );
    assert.equal(dom.preview.src, 'data:image/jpg;base64,QUFBQQ==', 'pre reaches the preview image');

    ctx.applyUrl('./img/a2.png');
    assert.equal(dom.images.length, 2, 'a bound url change swaps the image');

    component.beforeDestroy.call(ctx);
    assert.equal(ctx.instance, null);
    assert.equal(dom.listeners.every((item) => item.removed), true, 'teardown removes listeners');
  } finally {
    restore();
  }
});
test('the standalone demos keep the UMD, ESM, and Vue CDN contracts', async () => {
  const browser = await readFile(at('test/browser.html'), 'utf8');
  const esm = await readFile(at('test/esm.html'), 'utf8');
  const vue2 = await readFile(at('test/vue2.html'), 'utf8');
  const vue3 = await readFile(at('test/vue3.html'), 'utf8');
  const index = await readFile(at('test/index.html'), 'utf8');

  assert.match(browser, /<script src="\.\.\/lib\/js\/xqclip\.min\.js"><\/script>/);
  assert.match(browser, /createXqClipDemo\(\{/);
  assert.match(browser, /data-check="crop"/);

  assert.match(esm, /<script type="module">/);
  assert.match(
    esm,
    /import xqclip, \{ XqClip \} from '\.\.\/lib\/js\/xqclip-esm\.min\.js';/,
  );
  assert.match(esm, /xqclip === XqClip/);

  assert.match(vue2, /vue@2\.7\.16\/dist\/vue\.min\.js/);
  assert.match(vue2, /new Vue\(XqClipDemo\)\.\$mount\('#app'\)/);
  assert.match(vue3, /vue@3\.5\.13\/dist\/vue\.global\.prod\.js/);
  assert.match(vue3, /Vue\.createApp\(XqClipDemo\)\.mount\('#app'\)/);

  for (const page of [vue2, vue3]) {
    assert.match(page, /\.\.\/lib\/js\/xqclip\.min\.js/);
    assert.match(page, /vue-xqclip\.component\.js/);
    assert.match(page, /boxWin: 320/);
  }

  assert.match(index, /href="\.\/browser\.html"/);
  assert.match(index, /href="\.\/esm\.html"/);
  assert.match(index, /href="\.\/vue2\.html"/);
  assert.match(index, /href="\.\/vue3\.html"/);
});

test('the CDN Vue component owns one core instance and tears it down once', () => {
  const createXqClipComponent = require(at('test/vue-xqclip.component.js'));
  const previousWindow = globalThis.window;
  const calls = { constructed: 0, replace: [], reset: 0, destroy: 0, crops: 0 };

  globalThis.window = {
    location: { href: 'http://localhost/test/' },
    setInterval: () => 1,
    clearInterval: () => {},
  };

  class FakeXqClip {
    constructor(options) {
      calls.constructed += 1;
      this.options = options;
      this.box = options.box;
      this.imgInfo = { elem: { src: options.url } };
    }

    replaceImg(url) {
      calls.replace.push(url);
      return true;
    }

    reset() {
      calls.reset += 1;
    }

    getAreaData() {
      calls.crops += 1;
    }

    destroy() {
      calls.destroy += 1;
    }
  }

  try {
    const component = createXqClipComponent(FakeXqClip, {
      firstUrl: './img/a1.jpg',
      secondUrl: './img/a2.png',
      options: { boxWin: 320, boxHei: 320 },
    });
    const host = { className: 'host' };
    const preview = { nodeName: 'IMG' };
    const emitted = [];
    const ctx = {
      ...component.data(),
      $refs: { host, preview },
      $emit: (name, payload) => emitted.push([name, payload]),
    };
    for (const [name, method] of Object.entries(component.methods)) {
      ctx[name] = method.bind(ctx);
    }

    const first = ctx.createClip();
    const second = ctx.createClip();
    assert.equal(first, second);
    assert.equal(calls.constructed, 1);
    assert.equal(first.box, host);
    assert.equal(first.options.pre, preview);
    assert.equal(first.options.url, './img/a1.jpg');
    assert.deepEqual(emitted[0], ['ready', first]);

    const data = {
      base64: 'data:image/jpeg;base64,QQ==',
      blob: 'blob:crop',
      file: { name: 'crop.jpg', size: 1 },
    };
    first.options.onChange(data);
    assert.equal(ctx.result, data);
    assert.equal(emitted.some(([name]) => name === 'change'), true);
    assert.equal(component.computed.downloadHref.call(ctx), data.base64);

    assert.equal(ctx.switchImage(), true);
    assert.deepEqual(calls.replace, ['./img/a2.png']);
    assert.equal(ctx.currentUrl, './img/a2.png');

    ctx.resetClip();
    assert.equal(calls.reset, 1);

    component.beforeDestroy.call(ctx);
    component.unmounted.call(ctx);
    assert.equal(calls.destroy, 1);
    assert.equal(ctx._xqclip, null);
  } finally {
    globalThis.window = previousWindow;
  }
});
test('the standalone pages share the test icon and favicon', async () => {
  const pages = [
    'test/browser.html',
    'test/esm.html',
    'test/vue2.html',
    'test/vue3.html',
    'test/index.html',
  ];
  const icon = await readFile(at('test/test-icon.svg'), 'utf8');
  assert.match(icon, /^<svg\b/);
  assert.match(icon, /M10 2v7\.527/);

  for (const page of pages) {
    const html = await readFile(at(page), 'utf8');
    assert.match(
      html,
      /<link rel="icon" href="\.\/test-icon\.svg" type="image\/svg\+xml">/,
      `${page} should declare the shared favicon`,
    );
    assert.match(
      html,
      /class="test-brand-icon" src="\.\/test-icon\.svg" alt="" width="20" height="20"/,
      `${page} should render the shared header icon`,
    );
  }
});
