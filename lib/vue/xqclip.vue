<template>
    <!-- xqclip -->
    <div class="clip-box clip-bg" ref="clipBox">
        <!-- 画布区域 -->
        <canvas class="clip-bg clip-canvas" ref="clipImg"></canvas>
        <!-- 阴影区域 -->
        <div
            class="clip-img-shadow clip-img-shadow-top"
            ref="clipImgShadowTop"
        ></div>
        <div
            class="clip-img-shadow clip-img-shadow-right"
            ref="clipImgShadowRight"
        ></div>
        <div
            class="clip-img-shadow clip-img-shadow-bottom"
            ref="clipImgShadowBottom"
        ></div>
        <div
            class="clip-img-shadow clip-img-shadow-left"
            ref="clipImgShadowLeft"
        ></div>
        <!-- 裁剪框区域 -->
        <div
            class="clip-img-area no-pos"
            data-pos="pos(0,0)"
            data-size="wh(0,0)"
            ref="clipImgArea"
        >
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <!-- 拉伸按钮 -->
            <small class="clip-img-scale" ref="clipImgScale"></small>
        </div>
        <!-- 临时画布 -->
        <canvas class="clip-canvas-temp" ref="clipTemp"></canvas>
    </div>
</template>

<script>
// ̽��������Ƿ�֧�� passive ѡ��ƶ�����Ҫ�� touchmove ����ֹҳ�������
let supportsPassive = false;
try {
    let probe = Object.defineProperty({}, 'passive', {
        get: function () {
            supportsPassive = true;
            return false;
        },
    });
    window.addEventListener('xqclip-passive-probe', null, probe);
    window.removeEventListener('xqclip-passive-probe', null, probe);
} catch (e) { }

function preventScroll(e) {
    if (e.cancelable) {
        e.preventDefault();
    }
}

let wheelScale = 1;


export default {
    name: "xqClip",
    props: {
        options: {
            type: Object,
            default: () => {
                return {
                    boxWin: 400, // 裁切画布宽,
                    boxHei: 400, // 裁切画布高
                    areaWin: 100, // 选区宽
                    areaHei: 100, // 选区高
                    pre: "", // 预览class
                    url: "", // 图片地址
                    scale: 1, // 裁切框比例
                    showPos: true, // 裁剪框是否显示坐标和宽高
                    scaleImg: true, // 是否开启图片放大缩小功能
                };
            },
        },
    },
    data() {
        return {
            boxWin: 400,
            boxHei: 400,
            areaWin: 100,
            areaHei: 100,
            pre: "",
            url: "",
            scale: 1,
            showPos: true,
            scaleImg: true,
            imgSrc: "",
            scaleMin: 64,
            scaleMinWin: 0,
            scaleMinHei: 0,
            clipBoxInfo: {
                win: 0,
                hei: 0,
                left: 0,
                top: 0,
            },
            clipAreaInfo: {
                win: 0,
                hei: 0,
                left: 0,
                top: 0,
            },
            imgInfo: {
                elem: null,
                x: 0,
                y: 0,
                win: 0,
                hei: 0,
            },
            clipImg: null,
            clipCxt: null,
            tempCanvas: null,
            tempCxt: null,
            tempData: null,
            tempInfo: null,
            clipScale: 0,
            clipBox: null,
            clipScaleBtn: null,
            clipArea: null,
            clipShadowTop: null,
            clipShadowRight: null,
            clipShadowBottom: null,
            clipShadowLeft: null,
            isMobile: null,
            eventName: {
                start: "",
                move: "",
                end: "",
            },
            drag: null,
            _eventsBound: false,
        };
    },
    mounted() {
        // 初始化
        this.initParams();
        this.checkMobile();
        this.getElem();
    },
    methods: {
        // reset重置
        resetClip() {
            this.initParams();
            this.checkMobile();
            this.getElem();
        },
        resetCanvas () {
            this.clipCxt.fillStyle = '#fff';
            this.clipCxt.fillRect(0, 0, this.clipImg.width, this.clipImg.height);
        },
        // 初始化参数
        initParams() {
            this.$refs.clipBox.style.width = this.options.boxWin + "px";
            this.$refs.clipBox.style.height = this.options.boxHei + "px";
            this.boxWin = this.options.boxWin || this.boxWin;
            this.boxHei = this.options.boxHei || this.boxHei;
            this.areaWin =
                this.options.areaWin * this.options.scale ||
                this.areaWin * this.options.scale;
            this.areaHei = this.options.areaHei || this.areaHei;
            this.imgSrc = this.options.url;
            this.scale = this.options.scale;
            this.showPos = this.options.showPos;
            this.scaleImg = this.options.scaleImg;
            this.scaleMinWin = this.scaleMin * this.scale;
            this.scaleMinHei = this.scaleMin;
            if (this.options.pre) {
                this.pre = document.querySelector(this.options.pre);
            }
        },
        // 是否手机端
        checkMobile() {
            let checkRes =
                "touchstart" in document ||
                document.documentElement.clientWidth <= 768 ||
                document.body.clientWidth <= 768;
            this.isMobile = checkRes;
            this.eventName = this.isMobile
                ? {
                      start: "touchstart",
                      move: "touchmove",
                      end: "touchend",
                  }
                : {
                      start: "mousedown",
                      move: "mousemove",
                      end: "mouseup",
                  };
            window.onresize = () => {
                this.checkMobile();
            };
        },
        // 获取元素
        getElem() {
            this.clipBox = this.$refs.clipBox;
            this.clipScaleBtn = this.$refs.clipImgScale;
            this.clipArea = this.$refs.clipImgArea;
            this.clipShadowTop = this.$refs.clipImgShadowTop;
            this.clipShadowRight = this.$refs.clipImgShadowRight;
            this.clipShadowBottom = this.$refs.clipImgShadowBottom;
            this.clipShadowLeft = this.$refs.clipImgShadowLeft;

            // 创建画布
            this.clipImg = this.$refs.clipImg;
            this.clipCxt = this.clipImg.getContext("2d");
            this.clipImg.width = this.boxWin;
            this.clipImg.height = this.boxHei;
            // 创建临时画布
            this.tempCanvas = this.$refs.clipTemp;
            this.tempCxt = this.tempCanvas.getContext("2d");

            // 加载图片和框以及阴影
            this.loadImg();
            this.calcAreaElem();
            this.bindEvents();
        },
        // 加载图片
        loadImg() {
            let that = this;
            let img = new Image();
            img.src = that.imgSrc;
            img.crossOrigin = "Anonymous";
            img.onload = function () {
                let imgWin = 0;
                let imgHei = 0;
                let imgX = 0;
                let imgY = 0;
                let imgScale = img.width / img.height;
                if (imgScale == 1) {
                    imgWin = that.boxWin / 2;
                    imgHei = that.boxHei / 2;
                    imgX = (that.boxWin - imgWin) / 2;
                } else {
                    imgWin = that.boxWin;
                    imgHei = that.boxHei / imgScale;
                    imgX = 0;
                }
                imgY = (that.boxHei - imgHei) / 2;
                that.imgInfo = {
                    elem: img,
                    x: imgX,
                    y: imgY,
                    win: imgWin,
                    hei: imgHei,
                };
                that.drawImg(that.imgInfo);
            };

        },
        // 绘制图片
        drawImg(obj) {
            this.clipImg.width = this.boxWin;
            this.clipImg.height = this.boxHei;
            this.clipCxt.drawImage(obj.elem, obj.x, obj.y, obj.win, obj.hei);
        },
        replaceImg(url) {
            if (!url) {
                console.error("url is must!");
                return false;
            }
            if (url == "") {
                console.error("url is not null!");
                return false;
            }
            this.clipImg.width = this.boxWin;
            this.clipImg.height = this.boxHei;
            this.imgSrc = url;
            this.loadImg();
            this.calcAreaElem();
            this.bindEvents();
        },
        // 计算裁剪框
        calcAreaElem() {
            // 裁剪框
            this.clipArea.style.width = this.areaWin + "px";
            this.clipArea.style.height = this.areaHei + "px";
            this.clipArea.style.left = (this.boxWin - this.areaWin) / 2 + "px";
            this.clipArea.style.top = (this.boxHei - this.areaHei) / 2 + "px";
            if (this.showPos) {
                this.clipArea.classList.remove("no-pos");
            }

            // 位置
            this.calcAreaPos();
            this.initShadowElem();
        },
        // 计算裁剪框位置
        calcAreaPos() {
            // 位置
            this.clipBoxInfo = {
                win: this.clipBox.offsetWidth,
                hei: this.clipBox.offsetHeight,
                left: this.clipBox.offsetLeft,
                top: this.clipBox.offsetTop,
            };
            this.clipAreaInfo = {
                win: this.clipArea.offsetWidth,
                hei: this.clipArea.offsetHeight,
                left: this.clipArea.offsetLeft,
                top: this.clipArea.offsetTop,
            };
        },
        // 初始化阴影面积
        initShadowElem() {
            // 阴影
            // 上面
            this.clipShadowTop.style.width = this.areaWin + "px";
            this.clipShadowTop.style.height = this.clipAreaInfo.top + "px";
            this.clipShadowTop.style.left = this.clipAreaInfo.left + "px";
            this.clipShadowTop.style.top = 0;
            // 右面
            this.clipShadowRight.style.width = this.clipAreaInfo.left + "px";
            this.clipShadowRight.style.height = this.clipBoxInfo.hei + "px";
            this.clipShadowRight.style.right = 0;
            this.clipShadowRight.style.top = 0;
            // 下面
            this.clipShadowBottom.style.width = this.areaWin + "px";
            this.clipShadowBottom.style.height = this.clipAreaInfo.top + "px";
            this.clipShadowBottom.style.left = this.clipAreaInfo.left + "px";
            this.clipShadowBottom.style.bottom = 0;
            // 左面
            this.clipShadowLeft.style.width = this.clipAreaInfo.left + "px";
            this.clipShadowLeft.style.height = this.clipBoxInfo.hei + "px";
            this.clipShadowLeft.style.left = 0;
            this.clipShadowLeft.style.top = 0;
        },
        // �¼�ֻ��һ�Σ�replaceImg �ظ����ò����ٵ��Ӽ���
        bindEvents() {
            if (this._eventsBound) {
                return;
            }
            this._eventsBound = true;

            let that = this;
            let wheelOpt = supportsPassive ? { passive: false } : false;

            that.clipBox.addEventListener('wheel', function (e) {
                let isMouseUp = e.deltaY > 0 ? false : true;
                if (isMouseUp && wheelScale < 3) {
                    wheelScale += 0.2;
                }
                if (!isMouseUp && wheelScale > 0.4) {
                    wheelScale -= 0.2;
                }
                let imgScale = that.imgInfo.elem.width / that.imgInfo.elem.height;
                let imgWin = 0;
                let imgHei = 0;
                let imgX = 0;
                if (imgScale == 1) {
                    imgWin = (that.boxWin / 2) * wheelScale;
                    imgHei = (that.boxHei / 2) * wheelScale;
                    imgX = ((that.boxWin - imgWin) / 2) * wheelScale;
                } else {
                    imgWin = that.boxWin * wheelScale;
                    imgHei = (that.boxHei / imgScale) * wheelScale;
                    imgX = 0;
                }
                let imgY = (that.boxHei - imgHei) / 2;
                that.imgInfo = {
                    elem: that.imgInfo.elem,
                    x: imgX,
                    y: imgY,
                    win: imgWin,
                    hei: imgHei,
                };
                that.drawImg(that.imgInfo);
            }, wheelOpt);

            that.clipBox.addEventListener(that.eventName.start, function (e) {
                preventScroll(e);
                if (e.target.className == 'clip-img-scale') {
                    return false;
                }
                that.drag = {
                    mode: 'drag',
                };
            }, wheelOpt);

            that.clipScaleBtn.addEventListener(that.eventName.start, function (e) {
                preventScroll(e);
                that.drag = {
                    mode: 'scale',
                    startX: e.clientX,
                    startY: e.clientY,
                };
            }, wheelOpt);

            that.clipBox[`on${that.eventName.move}`] = function (e) {
                that.moveArea(e);
            };
            that.clipBox.addEventListener(that.eventName.end, function () {
                that.drag = null;
                that.clipBox[`on${that.eventName.move}`] = null;
            }, false);
        },

        // ��ק��������ƶ�����
        moveArea(e) {
            let move = this.drag;
            if (!move) {
                return;
            }

            preventScroll(e);

            let movePos = {
                x: e.clientX,
                y: e.clientY,
            };

            if (move.mode == 'drag') {
                this.calcAreaPos();

                let disX = movePos.x - this.clipBoxInfo.left;
                let disY = movePos.y - this.clipBoxInfo.top;
                let cLeft = disX - this.clipAreaInfo.win / 2;
                let cTop = disY - this.clipAreaInfo.hei / 2;

                if (cLeft < 0) {
                    cLeft = 0;
                }
                if (cLeft > this.clipBoxInfo.win - this.clipAreaInfo.win) {
                    cLeft = this.clipBoxInfo.win - this.clipAreaInfo.win;
                }
                if (cTop < 0) {
                    cTop = 0;
                }
                if (cTop > this.clipBoxInfo.hei - this.clipAreaInfo.hei) {
                    cTop = this.clipBoxInfo.hei - this.clipAreaInfo.hei;
                }

                this.clipArea.style.left = cLeft + 'px';
                this.clipArea.style.top = cTop + 'px';
            } else {
                let moveInfo = {
                    width: movePos.x - move.startX,
                    height: movePos.y - move.startY,
                };

                let areaMove = {
                    win: moveInfo.width + this.clipAreaInfo.win,
                    hei: moveInfo.height + this.clipAreaInfo.hei,
                };

                if (this.scale == 1) {
                    areaMove.hei = areaMove.win;
                }
                if (this.scale > 1) {
                    areaMove.win = areaMove.win * this.scale;
                }

                if (areaMove.win >= (this.clipBoxInfo.win - this.clipAreaInfo.left) * this.scale) {
                    areaMove.win = this.clipBoxInfo.win - this.clipAreaInfo.left;
                }
                if (areaMove.hei >= (this.clipBoxInfo.hei - this.clipAreaInfo.top) * this.scale) {
                    areaMove.hei = this.clipBoxInfo.hei - this.clipAreaInfo.top;
                }
                if (areaMove.win <= this.scaleMinWin) {
                    areaMove.win = this.scaleMinWin;
                }
                if (areaMove.hei <= this.scaleMinHei) {
                    areaMove.hei = this.scaleMinHei;
                }

                this.clipArea.style.width = areaMove.win + 'px';
                this.clipArea.style.height = areaMove.hei + 'px';

                this.calcAreaPos();
                this.changeShadowElem(areaMove.win);
                this.calcShadowElem();
            }

            this.getAreaData();
        },

        // �ü����϶�
        clipBoxMove() {
            this.drag = {
                mode: 'drag',
            };
        },

        // ����ü���
        clipAreaScale(e) {
            this.drag = {
                mode: 'scale',
                startX: e.clientX,
                startY: e.clientY,
            };
        },

        // 计算阴影面积
        calcShadowElem() {
            // 上
            this.clipShadowTop.style.height = this.clipAreaInfo.top + "px";
            this.clipShadowTop.style.left = this.clipAreaInfo.left + "px";

            // 右
            this.clipShadowRight.style.width =
                this.clipBoxInfo.win -
                this.clipAreaInfo.left -
                this.clipAreaInfo.win +
                "px";

            // 下
            this.clipShadowBottom.style.height =
                this.clipBoxInfo.hei -
                this.clipAreaInfo.top -
                this.clipAreaInfo.hei +
                "px";
            this.clipShadowBottom.style.left = this.clipAreaInfo.left + "px";

            // 左
            this.clipShadowLeft.style.width = this.clipAreaInfo.left + "px";
        },
        // 计算改变裁切框后的阴影面积
        changeShadowElem(areaMoveWin) {
            // 上
            this.clipShadowTop.style.width = areaMoveWin + "px";
            this.clipShadowTop.style.height = this.clipAreaInfo.top + "px";

            // 右
            this.clipShadowRight.style.width =
                this.clipBoxInfo.win - areaMoveWin + "px";
            this.clipShadowRight.style.height = this.clipBoxInfo.hei + "px";

            // 下
            this.clipShadowBottom.style.width = areaMoveWin + "px";
            this.clipShadowBottom.style.height =
                this.clipBoxInfo.hei -
                this.clipAreaInfo.top -
                areaMoveWin +
                "px";

            // 左
            this.clipShadowLeft.style.width =
                this.clipBoxInfo.win - areaMoveWin + "px";
        },
        // 裁切图片
        getAreaData() {
            // 实时临时画布宽高
            this.tempCanvas.width = this.clipAreaInfo.win;
            this.tempCanvas.height = this.clipAreaInfo.hei;
            this.tempCanvas.style.overflow = "hidden";

            this.clipArea.setAttribute(
                "data-pos",
                `pos(${this.clipAreaInfo.left},${this.clipAreaInfo.top})`
            );
            this.clipArea.setAttribute(
                "data-size",
                `wh(${this.clipAreaInfo.win},${this.clipAreaInfo.hei})`
            );

            // 获取选区数据
            this.tempData = this.clipCxt.getImageData(
                this.clipAreaInfo.left,
                this.clipAreaInfo.top,
                this.clipAreaInfo.win,
                this.clipAreaInfo.hei
            );
            this.tempCxt.putImageData(this.tempData, 0, 0);
            this.saveImgData();
        },
        // 获取选取数据（base64）
        saveImgData() {
            this.tempInfo = {
                base64: this.tempCanvas.toDataURL("image/jpg"),
            };

            this.tempInfo.blob = window.URL.createObjectURL(
                this.dataToBlob(this.tempInfo.base64)
            );
            this.tempInfo.file = this.dataToFile(this.tempInfo.base64);

            // 显示预览图
            if (this.pre != null) {
                this.pre.src = this.tempInfo.base64;
            }
        },
        // 获取选取数据公开
        getCanvasImgData() {
            return this.tempInfo;
        },
        //base64转化为blob
        dataToBlob(base64Data) {
            var byteString;
            if (base64Data.split(",")[0].indexOf("base64") >= 0)
                byteString = atob(base64Data.split(",")[1]);
            else {
                byteString = unescape(base64Data.split(",")[1]);
            }
            var mimeString = base64Data
                .split(",")[0]
                .split(":")[1]
                .split(";")[0];
            var ia = new Uint8Array(byteString.length);
            for (var i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            var blob = new Blob([ia], {
                type: mimeString,
            });
            return blob;
        },
        // base64转为文件
        dataToFile(dataurl, filename) {
            let arr = dataurl.split(",");
            let mime = arr[0].match(/:(.*?);/)[1];
            if (!filename) {
                //若无文件名则取当前时间戳
                filename = Date.parse(new Date()) + ".jpg";
            }
            let bstr = atob(arr[1]);
            let n = bstr.length;
            let u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new File([u8arr], filename, {
                type: mime,
            });
        },
    },
};
</script>

<style scoped>
.clip-box {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.clip-bg {
    background: #eee;
    background-image: linear-gradient(45deg, #ccc 25%, transparent 0),
        linear-gradient(45deg, transparent 75%, #ccc 0),
        linear-gradient(45deg, #ccc 25%, transparent 0),
        linear-gradient(45deg, transparent 75%, #ccc 0);
    background-size: 30px 30px;
    background-position: 0 0, 15px 15px, 15px 15px, 30px 30px;
}

.clip-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.clip-canvas-temp {
    opacity: 0;
}

.clip-img-shadow {
    position: absolute;
    background: rgba(0, 0, 0, 0.5);
}

.clip-img-area {
    position: absolute;
    box-sizing: border-box;
    background: transparent;
    border: 2px dashed #fff;
    cursor: move;
}

.clip-img-area::before {
    content: attr(data-pos);
    position: absolute;
    top: -35px;
    left: 0;
    color: #fff;
    font-size: 12px;
}

.clip-img-area::after {
    content: attr(data-size);
    position: absolute;
    bottom: -35px;
    right: 0;
    color: #fff;
    font-size: 12px;
}

.no-pos::before,
.no-pos::after {
    display: none;
}

.clip-img-area span {
    position: absolute;
    box-sizing: border-box;
    width: 33%;
    height: 33%;
    border-right: 1px dashed rgba(255, 255, 255, 0.6);
    border-bottom: 1px dashed rgba(255, 255, 255, 0.6);
}

.clip-img-area span:nth-child(1) {
    left: 0;
    top: 0;
}

.clip-img-area span:nth-child(2) {
    left: 33%;
    top: 0;
}

.clip-img-area span:nth-child(3) {
    left: 66.6%;
    top: 0;
    border-right: none;
}

.clip-img-area span:nth-child(4) {
    left: 0;
    top: 33.3%;
}

.clip-img-area span:nth-child(5) {
    left: 33.3%;
    top: 33.3%;
}

.clip-img-area span:nth-child(6) {
    left: 66.6%;
    top: 33.3%;
}

.clip-img-area span:nth-child(7) {
    left: 0;
    top: 66.6%;
}

.clip-img-area span:nth-child(8) {
    left: 33.3%;
    top: 66.6%;
}

.clip-img-area span:nth-child(9) {
    left: 66.6%;
    top: 66.6%;
}

.clip-img-area small {
    position: absolute;
    bottom: -1px;
    right: -1px;
    display: inline-block;
    width: 8%;
    height: 8%;
    background: rgb(5, 17, 252);
    cursor: nw-resize;
    z-index: 2;
}
</style>