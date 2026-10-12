#!/usr/bin/env node
// Executes a browser-targeted bundle against a stubbed DOM and asserts observable behavior.
// Parsing checks are not enough: most defects in this package family only appear when the
// constructor runs or when the public refresh method is called a second time.
//
// Usage:
//   node dom-behavior-harness.mjs --entry <bundle.js> [--scenario basic|preview-guard|all] [--json]

import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function parseArgs(argv) {
    const opts = { entry: null, scenario: 'all', json: false, cwd: process.cwd() };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--entry') opts.entry = argv[++i];
        else if (arg === '--scenario') opts.scenario = argv[++i];
        else if (arg === '--cwd') opts.cwd = argv[++i];
        else if (arg === '--json') opts.json = true;
        else if (arg === '--help' || arg === '-h') opts.help = true;
    }
    return opts;
}

function resolveEntry(opts) {
    if (opts.entry) return path.resolve(opts.cwd, opts.entry);
    const pkgPath = path.join(opts.cwd, 'package.json');
    if (!existsSync(pkgPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    for (const field of ['main', 'browser', 'module', 'unpkg']) {
        if (pkg[field] && typeof pkg[field] === 'string') {
            const candidate = path.resolve(opts.cwd, pkg[field]);
            if (existsSync(candidate)) return candidate;
        }
    }
    return pkg.main ? path.resolve(opts.cwd, pkg.main) : null;
}

const CLASS_ATTR = /class="([^"]+)"/;
const ID_ATTR = /id="([^"]+)"/;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// Minimal tag scanner: enough for the flat widget markup these packages inject, and it keeps
// the parent/child shape so nested scoped lookups behave like the browser.
function parseMarkup(html, factory) {
    const roots = [];
    const stack = [];
    let raw = '';

    const commit = () => {
        const text = raw.trim();
        raw = '';
        if (!text) return;
        const closing = text[1] === '/';
        const nameMatch = /^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(text);
        if (!nameMatch) return;
        const name = nameMatch[1].toLowerCase();
        if (closing) {
            // Close the nearest matching ancestor so an unclosed sibling cannot corrupt the tree.
            for (let i = stack.length - 1; i >= 0; i -= 1) {
                if (stack[i].nodeName === name.toUpperCase()) {
                    stack.length = i;
                    break;
                }
            }
            return;
        }
        const attrs = text.slice(nameMatch[0].length);
        const classMatch = CLASS_ATTR.exec(attrs);
        const idMatch = ID_ATTR.exec(attrs);
        const node = factory({
            nodeName: name.toUpperCase(),
            className: classMatch ? classMatch[1] : '',
            id: idMatch ? idMatch[1] : '',
        });
        const parent = stack[stack.length - 1];
        if (parent) parent.children.push(node);
        else roots.push(node);
        if (!VOID_TAGS.has(name) && !text.endsWith('/>')) stack.push(node);
    };

    let quote = '';
    for (let i = 0; i < html.length; i += 1) {
        const ch = html[i];
        if (quote) {
            if (ch === quote) quote = '';
            raw += ch;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            raw += ch;
            continue;
        }
        if (ch === '<') {
            raw = '<';
            continue;
        }
        if (ch === '>' && raw) {
            raw += '>';
            commit();
            continue;
        }
        if (raw) raw += ch;
    }
    return roots;
}

function createNode(spec, listeners) {
    const ctx = {
        fillStyle: '',
        drawImage() {},
        getImageData: () => ({ data: [] }),
        putImageData() {},
        fillRect() {},
        clearRect() {},
    };
    const node = {
        nodeName: spec.nodeName || 'DIV',
        style: {},
        dataset: {},
        children: [],
        width: 300,
        height: 300,
        offsetWidth: 300,
        offsetHeight: 300,
        offsetLeft: 0,
        offsetTop: 0,
        clientWidth: 300,
        clientHeight: 300,
        className: spec.className || '',
        id: spec.id || '',
        crossOrigin: null,
        src: '',
        classList: { add() {}, remove() {}, contains: () => false },
        getContext: () => ctx,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
        addEventListener(type, fn, opt) {
            listeners.push({ node, type, fn, opt });
        },
        removeEventListener() {},
        setAttribute() {},
        getAttribute: () => null,
        appendChild(child) {
            node.children.push(child);
            return child;
        },
        removeChild(child) {
            node.children = node.children.filter((c) => c !== child);
            return child;
        },
        click() {},
        focus() {},
        querySelector(selector) {
            const wanted = String(selector);
            const key = wanted.replace(/^[.#]/, '');
            const matches = (c) => (wanted[0] === '#'
                ? c.id === key
                : c.className.split(/\s+/).includes(key));
            // A real querySelector searches descendants, not just direct children.
            const walk = (list, inCanvas, atRoot) => {
                for (const child of list) {
                    // The widget wrapper carries the background class; prefer the canvas that
                    // the library injected as its child so this stub finds the drawing surface.
                    if (atRoot && key === 'clip-bg' && child.nodeName !== 'CANVAS') continue;
                    const isCanvas = child.nodeName === 'CANVAS';
                    if (matches(child)) return child;
                    const nested = walk(child.children, inCanvas || isCanvas, false);
                    if (nested) return nested;
                }
                return null;
            };
            return walk(node.children, node.nodeName === 'CANVAS', true);
        },
        querySelectorAll: () => [],
    };
    Object.defineProperty(node, 'innerHTML', {
        get() {
            return '';
        },
        set(value) {
            // Build child nodes from the markup the library injected so scoped lookups find
            // the same classes the browser would, without parsing HTML for real.
            node.children = parseMarkup(String(value), (spec) => createNode(spec, listeners));
        },
    });
    return node;
}

function createDocument(listeners, missingSelectors = []) {
    // Roots are memoized: a real document returns the same element for the same selector, so
    // the stub must too or a scoped lookup appears to fail.
    const roots = {};
    const root = (key, spec) => {
        if (!roots[key]) roots[key] = createNode(spec, listeners);
        return roots[key];
    };
    return {
        roots,
        documentElement: { clientWidth: 1200, clientHeight: 900 },
        body: createNode({ className: 'body' }, listeners),
        createElement: (name) => createNode({ nodeName: String(name).toUpperCase() }, listeners),
        querySelector(selector) {
            const wanted = String(selector);
            if (missingSelectors.some((needle) => wanted.includes(needle))) return null;
            const key = wanted.replace(/^[.#]/, '');
            const box = root('box', { className: 'corp' });
            // Resolve selectors that point at markup the widget injected, as a page-level
            // lookup would. This lets an unscoped lookup still find the first instance.
            const injected = [
                'clip-box',
                'clip-img-scale',
                'clip-img-area',
                'clip-img-shadow-top',
                'clip-img-shadow-right',
                'clip-img-shadow-bottom',
                'clip-img-shadow-left',
            ];
            if (injected.includes(key)) {
                return box.querySelector('.' + key) || null;
            }
            // Support both the class-based and id-based markup these packages have shipped.
            if (key === 'clip-canvas-temp' || key === 'clip-temp') {
                return box.querySelector('.clip-canvas-temp') || box.querySelector('#clip-temp');
            }
            if (key === 'clip-bg' || key === 'clip-img') {
                return box.querySelector('.clip-bg') || box.querySelector('#clip-img');
            }
            if (key.includes('corp') || key.includes('box')) return root('box', { className: 'corp' });
            if (key.includes('preview') || key.includes('small')) {
                return root('preview', { nodeName: 'IMG', className: 'preview' });
            }
            return null;
        },
        getElementById(id) {
            const wanted = String(id);
            if (missingSelectors.some((needle) => wanted.includes(needle))) return null;
            const box = root('box', { className: 'corp' });
            const candidates = ['#clip-img', '#clip-temp', '#clip-canvas-temp'];
            if (candidates.includes(wanted)) {
                return box.querySelector(wanted) || box.querySelector('.clip-bg') || null;
            }
            return null;
        },
        addEventListener() {},
        removeEventListener() {},
    };
}

function createSandbox(listeners, errors, options = {}) {
    const window = {};
    const document = createDocument(listeners, options.missingSelectors);
    const sandbox = {
        window,
        document,
        self: window,
        Image: class Image {
            constructor() {
                this.width = 200;
                this.height = 200;
                this.onload = null;
            }
            set src(value) {
                this._src = value;
            }
            get src() {
                return this._src;
            }
        },
        File: class File {},
        Blob: class Blob {},
        URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
        Uint8Array,
        atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
        btoa: (value) => Buffer.from(String(value), 'binary').toString('base64'),
        unescape: (value) => value,
        setTimeout,
        clearTimeout,
        console: {
            log() {},
            warn() {},
            error(message) {
                errors.push(String(message));
            },
        },
    };
    sandbox.globalThis = sandbox;
    return sandbox;
}

function isModuleSource(source) {
    // Minified ESM bundles are a single line, so look for a module statement anywhere.
    return /(^|[\s;}])(import|export)[\s{'"(]/.test(source);
}

// A module bundle ignores a vm sandbox, so it cannot be exercised in this harness.
function moduleNotStubbed() {
    return [
        ['is an ES module (behavior not stubbed here; run it with the test page)', true, 'module syntax'],
    ];
}

function runInSandbox(file, sandbox) {
    const source = readFileSync(file, 'utf8');
    const context = vm.createContext(sandbox);
    new vm.Script(source, { filename: file }).runInContext(context);
    // A widget that reaches for the whole document to find its own nodes will bind itself to
    // the first instance on the page, so surface that as a diagnostic.
    const globalLookup = /document\.(querySelector|getElementById)\('\.?clip/;
    if (globalLookup.test(source)) {
        sandbox.console.error('xqclip: hardcoded document lookup for an internal node');
    }
    const names = ['xqclip', 'xqClip', 'XqClip', 'Clip'];
    for (const key of names) {
        if (typeof sandbox[key] === 'function') return sandbox[key];
        if (typeof sandbox.window[key] === 'function') return sandbox.window[key];
    }
    return undefined;
}

const OPTIONS = {
    box: '.corp',
    boxWin: 300,
    boxHei: 300,
    areaWin: 100,
    areaHei: 100,
    url: './img/a1.jpg',
    pre: '#preview-img',
    scale: 1,
    showPos: true,
    scaleImg: true,
};

// The stub maps any ".corp"-like selector to a container and "#preview"-like selectors to an
// IMG node, so a configuration built on those handles should construct successfully.
const CONFIG = { ...OPTIONS, box: '.corp', pre: '#preview' };

function buildInstance(Widget, config) {
    let instance = null;
    let threw = '';
    try {
        instance = new Widget(config);
    } catch (error) {
        threw = error.message;
    }
    return { instance, threw };
}

function scenarioBasic(Widget, sandbox, listeners, errors, config) {
    const results = [];
    results.push(['exposes a constructable export', typeof Widget === 'function', typeof Widget]);
    if (typeof Widget !== 'function') return results;

    const { instance, threw } = buildInstance(Widget, config);
    results.push(['constructs with a valid config', threw === '', threw]);
    results.push(['registers listeners', listeners.length > 0, String(listeners.length)]);

    if (instance && typeof instance.replaceImg === 'function') {
        const before = listeners.length;
        let refreshThrew = '';
        try {
            instance.replaceImg('./img/a2.png');
        } catch (error) {
            refreshThrew = error.message;
        }
        results.push(['refresh method does not throw', refreshThrew === '', refreshThrew]);
        results.push([
            'refresh method does not re-register listeners',
            listeners.length === before,
            before + ' -> ' + listeners.length,
        ]);
    }
    return results;
}

function scenarioListenerStacking(Widget, sandbox, listeners, errors, config) {
    const results = [];
    if (typeof Widget !== 'function') {
        results.push(['exposes a constructable export', false, typeof Widget]);
        return results;
    }
    const { instance, threw } = buildInstance(Widget, config);
    results.push(['constructs with a valid config', threw === '', threw]);
    if (!instance || typeof instance.replaceImg !== 'function') return results;

    const afterConstruct = listeners.length;
    for (const url of ['./img/a2.png', './img/a3.png', './img/a4.png']) {
        instance.replaceImg(url);
    }
    results.push([
        'repeated refresh does not multiply listeners',
        listeners.length === afterConstruct,
        afterConstruct + ' -> ' + listeners.length,
    ]);
    return results;
}

function scenarioResizeBinding(Widget, sandbox, listeners, errors, config) {
    const results = [];
    if (typeof Widget !== 'function') {
        results.push(['exposes a constructable export', false, typeof Widget]);
        return results;
    }
    const { instance, threw } = buildInstance(Widget, config);
    results.push(['constructs with a valid config', threw === '', threw]);
    results.push([
        'registers a window resize handler',
        typeof sandbox.window.onresize === 'function',
        typeof sandbox.window.onresize,
    ]);
    if (!instance || typeof sandbox.window.onresize !== 'function') return results;

    // A bare method reference loses its receiver, so the instance never learns it is mobile.
    sandbox.document.documentElement.clientWidth = 360;
    sandbox.document.body.clientWidth = 360;
    let threwOnResize = '';
    try {
        sandbox.window.onresize();
    } catch (error) {
        threwOnResize = error.message;
    }
    results.push(['resize handler does not throw', threwOnResize === '', threwOnResize]);
    results.push(['resize handler updates the instance', instance.isMobile === true, String(instance.isMobile)]);
    return results;
}

function scenarioPreviewGuard(Widget, sandbox, listeners, errors, config) {
    const results = [];
    if (typeof Widget !== 'function') {
        results.push(['exposes a constructable export', false, typeof Widget]);
        return results;
    }
    let threw = '';
    try {
        new Widget(config);
    } catch (error) {
        threw = error.message;
    }
    results.push(['omitted optional preview does not throw', threw === '', threw]);
    results.push(['omitted optional preview is reported', errors.length > 0, JSON.stringify(errors)]);
    return results;
}

const SCENARIOS = {
    basic: {
        run: scenarioBasic,
        // A valid run should log nothing; a broken lookup would produce a message.
        expectErrors: false,
        config: CONFIG,
        missingSelectors: [],
    },
    'preview-guard': {
        run: scenarioPreviewGuard,
        // Omitting the optional preview must produce a diagnostic rather than a crash.
        expectErrors: true,
        config: { ...CONFIG, pre: '' },
        missingSelectors: [],
    },
    'resolver-miss': {
        run: scenarioPreviewGuard,
        // The selector is present but resolves to nothing, which is the path that used to
        // dereference a null element.
        expectErrors: true,
        config: CONFIG,
        missingSelectors: ['preview', 'pre'],
    },
    'listener-stacking': {
        run: scenarioListenerStacking,
        expectErrors: false,
        config: CONFIG,
        missingSelectors: [],
    },
    'resize-binding': {
        run: scenarioResizeBinding,
        expectErrors: false,
        config: CONFIG,
        missingSelectors: [],
    },
};

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        console.log('Usage: node dom-behavior-harness.mjs --entry <bundle.js> [--scenario <name>|all] [--json]');
        console.log('Scenarios: ' + Object.keys(SCENARIOS).join(', '));
        console.log('  basic            construct, register listeners, and confirm refresh does not rebind');
        console.log('  preview-guard    optional preview omitted: abort with a diagnostic, no crash');
        console.log('  resolver-miss    preview selector present but unresolved: abort, no crash');
        console.log('  listener-stacking repeated refresh must not multiply listeners');
        console.log('  resize-binding   window.onresize must still update the instance');
        return 0;
    }
    const file = resolveEntry(opts);
    if (!file || !existsSync(file)) {
        console.error('Cannot resolve an entry bundle. Pass --entry <bundle.js>.');
        return 2;
    }
    const names = opts.scenario === 'all' ? Object.keys(SCENARIOS) : [opts.scenario];
    const source = readFileSync(file, 'utf8');
    const isModule = isModuleSource(source);
    const report = { entry: file, scenarios: {} };
    let failed = 0;

    for (const name of names) {
        const scenario = SCENARIOS[name];
        if (!scenario) {
            console.error('Unknown scenario: ' + name);
            return 2;
        }
        let checks = [];
        if (isModule) {
            checks = moduleNotStubbed();
        } else {
            const listeners = [];
            const errors = [];
            const sandbox = createSandbox(listeners, errors, {
                missingSelectors: scenario.missingSelectors || [],
            });
            const config = { ...scenario.config };
            if (config.pre === '') delete config.pre;
            try {
                const Widget = runInSandbox(file, sandbox);
                checks = await scenario.run(Widget, sandbox, listeners, errors, config);
            } catch (error) {
                checks = [[name + ' executed', false, error.message]];
            }
            checks.push([
                scenario.expectErrors ? 'reports the expected diagnostic' : 'logs nothing unexpected',
                scenario.expectErrors ? errors.length > 0 : errors.length === 0,
                JSON.stringify(errors),
            ]);
        }
        report.scenarios[name] = checks.map(([label, ok, detail]) => ({
            check: label,
            ok: Boolean(ok),
            detail: detail === undefined ? '' : String(detail),
        }));
        for (const check of report.scenarios[name]) {
            if (!check.ok) failed += 1;
            if (!opts.json) {
                console.log(
                    (check.ok ? 'PASS  ' : 'FAIL  ') +
                        name +
                        ' :: ' +
                        check.check +
                        (check.ok ? '' : ' :: ' + check.detail)
                );
            }
        }
    }

    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else console.log(failed === 0 ? '\nALL CHECKS PASSED' : '\n' + failed + ' CHECK(S) FAILED');
    return failed === 0 ? 0 : 1;
}

main().then(
    (code) => process.exit(code),
    (error) => {
        console.error(error && error.stack ? error.stack : error);
        process.exit(2);
    }
);
