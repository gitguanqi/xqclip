(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.createXqClipDemo = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function createXqClipDemo(config) {
        var options = config || {};
        var XqClip = options.XqClip;
        var host = document.getElementById('clip-host');
        var preview = document.getElementById('preview-img');
        var changeButton = document.getElementById('change');
        var resetButton = document.getElementById('reset');
        var downloadLink = document.getElementById('download');
        var statusText = document.getElementById('status-text');
        var resultName = document.getElementById('result-name');
        var resultSize = document.getElementById('result-size');
        var imageSources = ['./img/a1.jpg', './img/a2.png'];
        var sourceIndex = 0;
        var clip = null;
        var imageTimer = null;
        var destroyed = false;

        function setStatus(message) {
            if (statusText) {
                statusText.textContent = message;
            }
        }

        function setCheck(name, state, detail) {
            var item = document.querySelector('[data-check="' + name + '"]');
            if (!item) {
                return;
            }
            var badge = item.querySelector('.test-check-state');
            var copy = item.querySelector('.test-check-copy');
            if (badge) {
                badge.textContent = state.toUpperCase();
                badge.classList.toggle('is-pass', state === 'pass');
                badge.classList.toggle('is-fail', state === 'fail');
            }
            if (copy && detail) {
                copy.textContent = detail;
            }
        }

        function fail(message) {
            setStatus(message);
            setCheck('export', 'fail', message);
            console.error('xqclip demo:', message);
        }

        if (typeof XqClip !== 'function') {
            fail('The selected bundle did not expose a constructor.');
            return null;
        }

        if (options.exportError) {
            fail(options.exportError);
            return null;
        }

        setCheck('export', 'pass', options.exportDetail || 'Constructor loaded.');

        try {
            clip = new XqClip({
                box: host,
                boxWin: 320,
                boxHei: 320,
                areaWin: 120,
                areaHei: 120,
                url: imageSources[sourceIndex],
                pre: preview,
                scale: 1,
                showPos: true,
                scaleImg: true,
                onChange: function (data) {
                    var isDataUrl = typeof data.base64 === 'string' &&
                        data.base64.indexOf('data:image/') === 0;
                    var hasFile = data.file && typeof data.file.name === 'string';
                    setCheck(
                        'crop',
                        isDataUrl && hasFile ? 'pass' : 'fail',
                        isDataUrl && hasFile ? 'The crop produced base64 and a File.' : 'Crop data was incomplete.'
                    );
                    setStatus('Crop data is ready.');
                    if (resultName) {
                        resultName.textContent = hasFile ? data.file.name : 'unavailable';
                    }
                    if (resultSize) {
                        resultSize.textContent = hasFile ? data.file.size + ' bytes' : 'unavailable';
                    }
                    if (downloadLink && isDataUrl) {
                        downloadLink.href = data.base64;
                        downloadLink.download = hasFile ? data.file.name : 'xqclip-crop.jpg';
                        downloadLink.setAttribute('aria-disabled', 'false');
                    }
                },
            });
        } catch (error) {
            fail(error instanceof Error ? error.message : String(error));
            return null;
        }

        if (!clip || clip.box !== host) {
            fail('The constructor returned without resolving its host.');
            return clip;
        }

        setCheck('instance', 'pass', 'The widget is scoped to its host element.');
        setStatus('Loading the first image...');

        function waitForImage(expectedSrc, checkReplace) {
            var expectedHref = expectedSrc
                ? new URL(expectedSrc, window.location.href).href
                : '';
            window.clearInterval(imageTimer);
            imageTimer = window.setInterval(function () {
                if (destroyed || !clip || !clip.imgInfo.elem) {
                    return;
                }
                if (expectedHref && clip.imgInfo.elem.src !== expectedHref) {
                    return;
                }
                window.clearInterval(imageTimer);
                imageTimer = null;
                setCheck('image', 'pass', 'The image reached the drawing stage.');
                setStatus('Image loaded; generating the first crop.');
                clip.getAreaData();
                if (checkReplace) {
                    setCheck('replace', 'pass', 'Source image switching works.');
                }
            }, 80);
        }

        waitForImage(imageSources[sourceIndex], false);

        if (changeButton) {
            changeButton.addEventListener('click', function () {
                sourceIndex = sourceIndex === 0 ? 1 : 0;
                var next = imageSources[sourceIndex];
                setStatus('Switching the source image...');
                setCheck('replace', 'pending', 'Waiting for the replacement image.');
                if (!clip.replaceImg(next)) {
                    setCheck('replace', 'fail', 'replaceImg returned false.');
                    return;
                }
                waitForImage(next, true);
            });
        }

        if (resetButton) {
            resetButton.addEventListener('click', function () {
                clip.reset();
                setCheck('reset', 'pass', 'The host and crop geometry were recalculated.');
                setStatus('Crop geometry reset.');
            });
        }

        if (downloadLink) {
            downloadLink.setAttribute('aria-disabled', 'true');
            downloadLink.addEventListener('click', function (event) {
                if (downloadLink.getAttribute('aria-disabled') === 'true') {
                    event.preventDefault();
                }
            });
        }

        function destroy() {
            if (destroyed) {
                return;
            }
            destroyed = true;
            window.clearInterval(imageTimer);
            imageTimer = null;
            if (clip) {
                clip.destroy();
            }
        }

        window.addEventListener('beforeunload', destroy);

        return {
            clip: clip,
            destroy: function () {
                window.removeEventListener('beforeunload', destroy);
                destroy();
            },
        };
    }

    return createXqClipDemo;
});
