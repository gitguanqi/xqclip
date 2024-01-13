# xqclip

This is a js package that provides image cutting and export.

[View Chinese documents](./zh.md)

## Install

**Browser**:

import cdn

```html
<!-- Css -->
<script src="https://xqgj.cc/xqcdn/libs/xqclip/css/xqclip.min.css"></script>
<!-- Browser -->
<script src="https://xqgj.cc/xqcdn/libs/xqclip/js/xqclip.min.js"></script>
<!-- es module -->
<script type="module">
    import xqclip from '../lib/js/xqclip-esm.min.js';
</script>
```

**Vue**:

```sh
npm i xqclip
```

## Usage

### browser

+ page

```html
<div class="corp"></div>
<img id="preview-img" class="clip-bg">
<button id="change">toggle img</button>
<a id="download">download img</a>
```

+ call

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

+ import npm

```js
import xqClip from "xqclip";
Vue.use(xqClip);
```

+ component

```html
<div class="clip-bg" style="position:relative;">
    <xq-clip ref="clip" :options="clipOptions"></xq-clip>
    <img ref="preview" id="small-img" src="" alt="">
    <button @click="toggleImg">toggle</button>
    <button @click="downloadImg">download</button>
</div>
```

+ call method

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

## View xqclip

Run this script to view the demonstration case: `npm run test:browser`.

![test](https://xqgj.cc/xqclip/test/img/xqclip.jpg)

## ask questions

[submit your question](https://github.com/gitguanqi/xqclip/issues/new)

## Author

[@gitguanqi](https://github.com/gitguanqi)
