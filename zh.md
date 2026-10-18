# xqclip

这是一个提供图片裁切和导出的js包。

[查看英文文档](./README.md)

## 安装

**游览器端**:

引入cdn

```html
<!-- Css -->
<link rel="stylesheet" href="https://xqgj.cc/xqcdn/libs/xqclip/css/xqclip.min.css">
<!-- Browser -->
<script src="https://xqgj.cc/xqcdn/libs/xqclip/js/xqclip.min.js"></script>
<!-- es module -->
<script type="module">
    import xqclip from 'https://xqgj.cc/xqcdn/libs/xqclip/js/xqclip-esm.min.js';
</script>
```

**npm**:

```sh
pnpm add xqclip
# 或者
npm i xqclip
```

## 使用

### 游览器

+ 页面结构

```html
<div class="corp"></div>
<img id="preview-img" class="clip-bg">
<button id="change">切换图片</button>
<a id="download">下载图片</a>
```

+ 调用方法

```js
let clip = new xqclip({
    box: '.corp',
    boxWin: 300,
    boxHei: 300,
    url: './img/a1.jpg',
    pre: '#preview-img',
    scale: 16/16,
    showPos: true,
    scaleImg: true,
});

let downloadBtn = document.getElementById('download');
let changeBtn = document.getElementById('change');
let previewImg = document.getElementById('preview-img');
downloadBtn.addEventListener('click', function () {
    let url = previewImg.src;
    if (!url || url.indexOf('data:') !== 0) return;
    this.href = url;
    this.download = 'xqclip-' + new Date().getTime() + '.jpg';
});

changeBtn.addEventListener('click', function () {
    clip.replaceImg('./img/a2.png');
});
```

`pre` 是可选参数：不传时组件依然渲染，只是不显示预览图。裁切结果随时可以通过
`clip.getCanvasImgData()` 获取，首次选区变化后返回 `{ base64, blob, file }`，
`onChange` 回调收到的也是同一个对象。

### typescript

包内自带类型声明，无需额外配置：

```ts
import XqClip from 'xqclip';
import type { ClipData, XqClipOptions } from 'xqclip';

const options: XqClipOptions = {
    box: '.corp',
    url: './img/a1.jpg',
    pre: '#preview-img',
    onChange(data: ClipData) {
        console.log(data.base64, data.file);
    },
};
const clip = new XqClip(options);
```

### vue

Vue 入口是一个同时兼容 Vue 2 和 Vue 3 的组件与插件。

```js
// Vue 3
import { createApp } from 'vue';
import xqClip from 'xqclip/vue';

createApp(App).use(xqClip);
```

```js
// Vue 2
import Vue from 'vue';
import xqClip from 'xqclip/vue';

Vue.use(xqClip);
```

+ 在组件中添加

```html
<div class="clip-bg" style="position:relative;">
    <xq-clip ref="clip" v-model="url" :options="clipOptions" @change="onClip"></xq-clip>
    <img id="small-img" src="" alt="">
    <button @click="replaceImg">切换图片</button>
</div>
```

+ 调用方法

```js
export default {
    name: 'demo',
    data () {
        return {
            url: '/img/t1.jpg',
            clipOptions: {
                boxWin: 400,
                boxHei: 400,
                pre: '#small-img',
                scale: 16 / 16,
                showPos: true,
                scaleImg: true,
            },
        }
    },
    methods: {
        onClip (data) {
            console.log(data.base64, data.file);
        },
        replaceImg () {
            this.$refs.clip.replaceImg('/img/t2.png');
        },
        reset () {
            this.$refs.clip.reset();
        },
    }
}
```

组件的 props 包括 `options`（与游览器端配置相同，但 `box` 会被忽略，组件使用自己的
宿主元素）、`modelValue` 和兼容用的 `url`。两种 v-model 写法都支持：优先使用
`modelValue`，并通过 Vue 2 的 `model` 选项把 `v-model` 映射到它，因此在两个大版本中
`v-model` 都绑定图片地址，`replaceImg()` 会同步更新该绑定。

事件：`ready`（内核实例已挂载）、`change`（产生裁切结果）、`update:modelValue`。
方法：`replaceImg(url)`、`reset()`、`getCanvasImgData()`、`getInstance()`。

组件样式由 SFC 自行引入。如果不想用插件而是直接挂载原始 SFC，可以使用
`import XqClip from 'xqclip/lib/vue/xqclip.vue'`；它未经编译，需要支持 Vue 的打包器，
与 `xqclip/vue` 的要求一致。

### Vue 免构建 CDN 用法

仓库内的 CDN 示例直接加载 Vue 全局构建、xqclip UMD 包和一个普通 Options API
组件。每个页面只挂载一个组件和一个 XqClip 实例：

- `test/vue2.html`：Vue 2.7，使用 `new Vue(...).$mount('#app')`。
- `test/vue3.html`：Vue 3.5，使用 `Vue.createApp(...).mount('#app')`。

两页共用 `test/vue-xqclip.component.js`。它是示例辅助文件，不属于包的导出接口；
上面的 `xqclip/vue` SFC 与插件仍用于打包器项目。

旧版本从包根导出了 Vue 插件，现在根导出为游览器端类（`import XqClip from 'xqclip'`），
插件迁移到 `xqclip/vue`。

## 查看示例

运行 `pnpm test:browser` 启动零依赖测试服务器。终端会输出 Browser、ESM、Vue 2
和 Vue 3 的地址，索引页为 `http://127.0.0.1:4173/test/`。

运行 `pnpm test` 执行 DOM 行为测试、打包产物检查与示例契约检查，运行
`pnpm typecheck` 检查 TypeScript 源码。

![test](https://xqgj.cc/xqclip/test/img/xqclip.jpg)

## 提问题

[这里提问](https://github.com/gitguanqi/xqclip/issues/new)

## 作者

[@gitguanqi](https://github.com/gitguanqi)
