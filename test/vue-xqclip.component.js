(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.createXqClipComponent = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * Builds the small Options API component used by both CDN demos. Each
     * component owns exactly one XqClip instance and tears it down with the
     * lifecycle hook available in its Vue major.
     */
    function createXqClipComponent(XqClip, config) {
        var settings = config || {};
        var options = settings.options || {};
        var firstUrl = settings.firstUrl || './img/a1.jpg';
        var secondUrl = settings.secondUrl || './img/a2.png';

        if (typeof XqClip !== 'function') {
            throw new Error('createXqClipComponent needs the xqclip constructor.');
        }

        return {
            name: 'XqClipCdnDemo',
            emits: ['ready', 'change'],
            template: [
                '<section class="test-vue-shell">',
                '  <div class="test-vue-actions">',
                '    <button type="button" class="is-primary" @click="switchImage">Switch image</button>',
                '    <button type="button" @click="resetClip">Reset crop</button>',
                '    <a class="test-link-button" :href="downloadHref" :download="downloadName"',
                '       :aria-disabled="downloadHref ? \'false\' : \'true\'"',
                '       @click="guardDownload">Download crop</a>',
                '  </div>',
                '  <div class="test-vue-layout">',
                '    <div class="test-stage"><div ref="host" class="clip-host"></div></div>',
                '    <aside>',
                '      <div class="test-status"><span id="vue-status-text">{{ status }}</span></div>',
                '      <div class="test-preview-frame">',
                '        <img ref="preview" class="test-preview-image" alt="">',
                '      </div>',
                '      <dl class="test-meta">',
                '        <dt>Source</dt><dd>{{ currentUrl }}</dd>',
                '        <dt>File</dt><dd>{{ resultName }}</dd>',
                '        <dt>Size</dt><dd>{{ resultSize }}</dd>',
                '      </dl>',
                '    </aside>',
                '  </div>',
                '</section>',
            ].join('\n'),
            data: function () {
                return {
                    currentUrl: firstUrl,
                    status: 'Waiting for the image...',
                    result: null,
                    error: '',
                };
            },
            computed: {
                downloadHref: function () {
                    return this.result && this.result.base64 ? this.result.base64 : '';
                },
                downloadName: function () {
                    return this.result && this.result.file
                        ? this.result.file.name
                        : 'xqclip-crop.jpg';
                },
                resultName: function () {
                    return this.result && this.result.file
                        ? this.result.file.name
                        : 'unavailable';
                },
                resultSize: function () {
                    return this.result && this.result.file
                        ? this.result.file.size + ' bytes'
                        : 'unavailable';
                },
            },
            mounted: function () {
                var self = this;
                this.$nextTick(function () {
                    self.createClip();
                });
            },
            beforeDestroy: function () {
                this.destroyClip();
            },
            unmounted: function () {
                this.destroyClip();
            },
            methods: {
                createClip: function () {
                    var self = this;
                    if (this._xqclip) {
                        return this._xqclip;
                    }
                    if (!this.$refs.host || !this.$refs.preview) {
                        this.status = 'The component refs are not ready.';
                        return null;
                    }

                    var instanceOptions = Object.assign({}, options, {
                        box: this.$refs.host,
                        pre: this.$refs.preview,
                        url: this.currentUrl,
                        onChange: function (data) {
                            self.result = data;
                            self.status = 'Crop data is ready.';
                            self.$emit('change', data);
                        },
                    });

                    this._xqclip = new XqClip(instanceOptions);
                    if (!this._xqclip.box) {
                        this.status = 'The XqClip host could not be created.';
                        return this._xqclip;
                    }

                    this.$emit('ready', this._xqclip);
                    this.watchImageLoad(this.currentUrl);
                    return this._xqclip;
                },
                watchImageLoad: function (expectedSrc) {
                    var self = this;
                    var expectedHref = expectedSrc
                        ? new URL(expectedSrc, window.location.href).href
                        : '';
                    window.clearInterval(this._imageTimer);
                    this._imageTimer = window.setInterval(function () {
                        if (!self._xqclip || !self._xqclip.imgInfo.elem) {
                            return;
                        }
                        if (expectedHref && self._xqclip.imgInfo.elem.src !== expectedHref) {
                            return;
                        }
                        window.clearInterval(self._imageTimer);
                        self._imageTimer = null;
                        self.status = 'Image loaded.';
                        self._xqclip.getAreaData();
                    }, 80);
                },
                switchImage: function () {
                    if (!this._xqclip) {
                        this.createClip();
                    }
                    if (!this._xqclip) {
                        return false;
                    }
                    var next = this.currentUrl === firstUrl ? secondUrl : firstUrl;
                    this.result = null;
                    this.status = 'Switching the source image...';
                    if (!this._xqclip.replaceImg(next)) {
                        this.status = 'The source image could not be changed.';
                        return false;
                    }
                    this.currentUrl = next;
                    this.watchImageLoad(next);
                    return true;
                },
                resetClip: function () {
                    if (!this._xqclip) {
                        return;
                    }
                    this._xqclip.reset();
                    this.status = 'Crop geometry reset.';
                },
                guardDownload: function (event) {
                    if (!this.downloadHref) {
                        event.preventDefault();
                    }
                },
                destroyClip: function () {
                    window.clearInterval(this._imageTimer);
                    this._imageTimer = null;
                    if (this._xqclip) {
                        this._xqclip.destroy();
                        this._xqclip = null;
                    }
                },
            },
        };
    }

    return createXqClipComponent;
});
