# xqclip

这是一个提供图片裁切和导出的js包。

[查看英文文档](./README.md)

## 安装

**游览器端**:

引入cdn

```html
<!-- Css -->
<script src="https://unpkg.com/xqclip/lib/css/xqclip.min.css"></script>
<!-- Browser -->
<script src="https://unpkg.com/xqclip/lib/js/xqclip.min.js"></script>
<!-- es module -->
<script type="module">
    import xqclip from '../lib/js/xqclip-esm.min.js';
</script>
```

**Vue**:

```sh
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
downloadBtn.onclick = function () {  
    if (previewImg.src == '') return;
    this.href = previewImg.src;
    this.download = new Date().getTime();
}

changeBtn.addEventListener('click', function () {
    clip.replaceImg('./img/a2.png');
})
```

### vue

+ 引入依赖包

```js
import xqClip from "xqclip";
Vue.use(xqClip);
```

+ 在组件中添加

```html
<div class="clip-bg" style="position:relative;">
    <xq-clip ref="clip" :options="clipOptions"></xq-clip>
    <img ref="preview" id="small-img" src="" alt="">
    <button @click="toggleImg">切换图片</button>
    <button @click="downloadImg">下载图片</button>
</div>
```

+ 调用方法

```js
export default {
    name: 'demo',
    data () {
        return {
            clipOptions: {
                boxWin: 400,
                boxHei: 400,
                url: "",
                pre: "#small-img",
                scale: 16 / 16,
                showPos: true,
                scaleImg: true,
            },
        }
    },
    mounted () {
        this.initClip();
    },
    methods: {
        initClip () {
            let url = '/img/t1.jpg';
            this.$refs.clip.replaceImg(url);
        },
        toggleImg () {
            let url = '/img/t2.png';
            this.$refs.clip.replaceImg(url);
        },
        async downloadImg () {
            let url = this.$refs.preview.src;
            let extName = url.split('/');
            extName = extName[extName.length-1];
            extName = extName.indexOf('?') > -1 ? extName.split('?')[0] : extName;
            let data = await fetch(url);
            let blob = await data.blob();
            let donwBtn = document.createElement('a');
            donwBtn.download = name || 'xqgjs-'+extName;
            donwBtn.href = URL.createObjectURL(blob);
            document.body.appendChild(donwBtn);
            donwBtn.click();
            URL.revokeObjectURL(blob);
            document.body.removeChild(donwBtn);
        },
    }

}
```

## 查看示例

运行这个脚本查看展示案例：`npm run test:browser`。

## 提问题

[这里提问](https://github.com/gitguanqi/xqclip/issues/new)

## 作者

[@gitguanqi](https://github.com/gitguanqi)
