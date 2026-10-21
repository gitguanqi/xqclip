import { CLIP_TEMPLATE } from './template';
import type { ClipData, ClipImageInfo, ClipRect, XqClipOptions } from './types';

/** Wheel zoom range and step. */
const WHEEL_MIN = 0.4;
const WHEEL_MAX = 3;
const WHEEL_STEP = 0.2;
/** The crop box never shrinks below this many canvas pixels. */
const MIN_CROP = 64;

/**
 * `wheel` and `touchmove` need `preventDefault`, so their listeners must be
 * non-passive. An engine without options support would read an options object
 * as `useCapture`, so probe once and fall back to the boolean form.
 */
let supportsPassive = false;
try {
  const probe: AddEventListenerOptions = {};
  Object.defineProperty(probe, 'passive', {
    get(): boolean {
      supportsPassive = true;
      return false;
    },
  });
  const probeListener = (): void => {};
  window.addEventListener('xqclip-passive-probe', probeListener, probe);
  window.removeEventListener('xqclip-passive-probe', probeListener, probe);
} catch {
  // Engines that reject the options object keep the boolean form below.
}

function preventScroll(event: Event): void {
  if (event.cancelable) {
    event.preventDefault();
  }
}

/** Reads a point from a mouse, pointer, or touch event. */
function readPoint(event: Event): { x: number; y: number } | null {
  const touchEvent = event as TouchEvent;
  const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0];
  if (touch) {
    return { x: touch.clientX, y: touch.clientY };
  }
  const mouse = event as MouseEvent;
  if (typeof mouse.clientX === 'number' && typeof mouse.clientY === 'number') {
    return { x: mouse.clientX, y: mouse.clientY };
  }
  return null;
}

function resolveElement(target: string | HTMLElement | null | undefined): HTMLElement | null {
  if (!target) {
    return null;
  }
  if (typeof target === 'string') {
    return document.querySelector<HTMLElement>(target);
  }
  return target;
}

type DragState =
  | { mode: 'drag' }
  | {
      mode: 'scale';
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
      startLeft: number;
      startTop: number;
    };

interface BoundListener {
  target: EventTarget;
  type: string;
  handler: EventListener;
}

/**
 * Image cropper that injects its own markup into a host element. Everything it
 * looks up afterwards is scoped to that host, so several croppers can live on
 * one page without binding to each other's nodes.
 */
export class XqClip {
  public readonly options: XqClipOptions;

  /** Host element that receives the widget markup. */
  public box: HTMLElement | null = null;
  /** The injected `.clip-box` root this instance owns. */
  public clipBox!: HTMLElement;
  /** Preview image that lives outside the widget, resolved from `options.pre`. */
  public pre: HTMLImageElement | null = null;

  public boxWin = 400;
  public boxHei = 400;
  public areaWin = 100;
  public areaHei = 100;
  public scale = 1;
  public showPos = true;
  public scaleImg = true;
  public imgSrc = '';

  public scaleMin = MIN_CROP;
  public scaleMinWin = MIN_CROP;
  public scaleMinHei = MIN_CROP;

  public clipBoxInfo: ClipRect = { win: 0, hei: 0, left: 0, top: 0 };
  public clipAreaInfo: ClipRect = { win: 0, hei: 0, left: 0, top: 0 };
  public imgInfo: ClipImageInfo = { elem: null, x: 0, y: 0, win: 0, hei: 0 };

  public clipImg!: HTMLCanvasElement;
  public clipCxt!: CanvasRenderingContext2D;
  public tempCanvas!: HTMLCanvasElement;
  public tempCxt!: CanvasRenderingContext2D;
  public tempData: ImageData | null = null;
  public clipScale = 0;
  public clipScaleBtn!: HTMLElement;
  public clipArea!: HTMLElement;
  public clipShadowTop!: HTMLElement;
  public clipShadowRight!: HTMLElement;
  public clipShadowBottom!: HTMLElement;
  public clipShadowLeft!: HTMLElement;

  public isMobile: boolean | null = null;
  public eventName = { start: 'mousedown', move: 'mousemove', end: 'mouseup' };
  public drag: DragState | null = null;
  public tempInfo: ClipData | null = null;

  private wheelScale = 1;
  private eventsBound = false;
  private objectUrl: string | null = null;
  private resizeHandler: (() => void) | null = null;
  private readonly listeners: BoundListener[] = [];

  constructor(options: XqClipOptions = {}) {
    this.options = options;

    const box = options.box ?? '.clip-box';
    if (box === '') {
      console.error('box class name is not null!');
      return;
    }
    if (box === '.clip-box') {
      console.error('box class name is not allow!');
      return;
    }

    const url = options.url;
    if (!url) {
      console.error('url is not null!');
      return;
    }

    const pre = resolveElement(options.pre);
    if (!pre || pre.nodeName !== 'IMG') {
      // A missing preview only skips the preview image; the widget itself still
      // mounts, and this diagnostic is the report the caller gets.
      console.error('pre must is image element!');
    } else {
      this.pre = pre as HTMLImageElement;
    }

    const container = resolveElement(box);
    if (!container) {
      console.error(`box element ${String(box)} is not found!`);
      return;
    }
    this.box = container;

    this.boxWin = options.boxWin || 400;
    this.boxHei = options.boxHei || 400;
    this.scale = options.scale || 1;
    this.areaWin = (options.areaWin || 100) * this.scale;
    this.areaHei = options.areaHei || 100;
    this.showPos = options.showPos ?? true;
    this.scaleImg = options.scaleImg ?? true;
    this.imgSrc = url;
    this.scaleMin = MIN_CROP;
    this.scaleMinWin = this.scaleMin * this.scale;
    this.scaleMinHei = this.scaleMin;

    this.checkMobile();
    this.applyBoxSize();
    this.initElem();
  }

  /** Touch devices pick touch events; everything else drags with the mouse. */
  public checkMobile(): void {
    this.isMobile =
      'touchstart' in document ||
      document.documentElement.clientWidth <= 768 ||
      document.body.clientWidth <= 768;
    this.eventName = this.isMobile
      ? { start: 'touchstart', move: 'touchmove', end: 'touchend' }
      : { start: 'mousedown', move: 'mousemove', end: 'mouseup' };

    if (!this.resizeHandler) {
      this.resizeHandler = () => {
        this.checkMobile();
      };
    }
    window.onresize = this.resizeHandler;
  }

  /** The host element is sized from the options; the widget fills it. */
  private applyBoxSize(): void {
    const box = this.box;
    if (!box) {
      return;
    }
    box.style.width = `${this.boxWin}px`;
    box.style.height = `${this.boxHei}px`;
  }

  private initElem(): void {
    const box = this.box;
    if (!box) {
      return;
    }
    box.innerHTML = CLIP_TEMPLATE;
    this.getElem();
  }

  private getElem(): void {
    const box = this.box;
    if (!box) {
      return;
    }
    this.clipBox = this.pick(box, '.clip-box');
    this.clipScaleBtn = this.pick(box, '.clip-img-scale');
    this.clipArea = this.pick(box, '.clip-img-area');
    this.clipShadowTop = this.pick(box, '.clip-img-shadow-top');
    this.clipShadowRight = this.pick(box, '.clip-img-shadow-right');
    this.clipShadowBottom = this.pick(box, '.clip-img-shadow-bottom');
    this.clipShadowLeft = this.pick(box, '.clip-img-shadow-left');

    this.clipImg = this.pick<HTMLCanvasElement>(this.clipBox, '.clip-bg');
    this.tempCanvas = this.pick<HTMLCanvasElement>(this.clipBox, '.clip-canvas-temp');
    this.clipCxt = this.context(this.clipImg);
    this.tempCxt = this.context(this.tempCanvas);
    this.clipImg.width = this.boxWin;
    this.clipImg.height = this.boxHei;

    this.loadImg();
    this.calcAreaElem();
    this.bindEvents();
  }

  /**
   * Widget nodes are always resolved inside the instance's own host, never
   * through `document`, so a second instance cannot grab the first one's nodes.
   */
  private pick<T extends Element>(root: Element, selector: string): T {
    const node = root.querySelector<T>(selector);
    if (!node) {
      throw new Error(`XqClip: widget markup is missing "${selector}".`);
    }
    return node;
  }

  private context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('XqClip: a 2d canvas context is required.');
    }
    return ctx;
  }

  /** Loads `imgSrc`, centred and fit to the box. */
  private loadImg(): void {
    const img = new Image();
    // Must precede `src`: without it a cross-origin image taints the canvas and
    // both `getImageData` and `toDataURL` throw on the first crop.
    img.crossOrigin = 'anonymous';
    img.src = this.imgSrc;
    img.onload = () => {
      const imgScale = img.width / img.height;
      let imgWin = 0;
      let imgHei = 0;
      let imgX = 0;
      if (imgScale === 1) {
        imgWin = this.boxWin / 2;
        imgHei = this.boxHei / 2;
        imgX = (this.boxWin - imgWin) / 2;
      } else {
        imgWin = this.boxWin;
        imgHei = this.boxHei / imgScale;
        imgX = 0;
      }
      const imgY = (this.boxHei - imgHei) / 2;
      this.imgInfo = { elem: img, x: imgX, y: imgY, win: imgWin, hei: imgHei };
      this.drawImg(this.imgInfo);
    };
  }

  public drawImg(info: ClipImageInfo): void {
    const elem = info.elem;
    if (!elem) {
      return;
    }
    this.clipImg.width = this.boxWin;
    this.clipImg.height = this.boxHei;
    this.clipCxt.drawImage(elem, info.x, info.y, info.win, info.hei);
  }

  /** Swaps the source image without re-binding listeners or touching geometry. */
  public replaceImg(url: string): boolean {
    if (!url) {
      console.error('url is must!');
      return false;
    }
    if (!this.clipImg) {
      return false;
    }
    this.clipImg.width = this.boxWin;
    this.clipImg.height = this.boxHei;
    this.imgSrc = url;
    this.loadImg();
    return true;
  }

  /** Re-applies the box size and re-reads the geometry after a layout change. */
  public reset(): void {
    if (!this.box) {
      return;
    }
    this.checkMobile();
    this.applyBoxSize();
    this.calcAreaElem();
  }

  /** Sizes and centres the crop box, then re-draws the shadows. */
  public calcAreaElem(): void {
    this.clipArea.style.width = `${this.areaWin}px`;
    this.clipArea.style.height = `${this.areaHei}px`;
    this.clipArea.style.left = `${(this.boxWin - this.areaWin) / 2}px`;
    this.clipArea.style.top = `${(this.boxHei - this.areaHei) / 2}px`;
    if (this.showPos) {
      this.clipArea.classList.remove('no-pos');
    }

    this.calcAreaPos();
    this.initShadowElem();
  }

  public calcAreaPos(): void {
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
  }

  /** Shadow panels cover everything outside the crop box. */
  public initShadowElem(): void {
    this.clipShadowTop.style.left = `${this.clipAreaInfo.left}px`;
    this.clipShadowTop.style.top = '0px';

    this.clipShadowRight.style.right = '0px';
    this.clipShadowRight.style.top = '0px';

    this.clipShadowBottom.style.left = `${this.clipAreaInfo.left}px`;
    this.clipShadowBottom.style.bottom = '0px';

    this.clipShadowLeft.style.height = `${this.clipBoxInfo.hei}px`;
    this.clipShadowLeft.style.left = '0px';
    this.clipShadowLeft.style.top = '0px';

    this.changeShadowElem(this.clipAreaInfo.win, this.clipAreaInfo.hei);
  }

  /** Listeners are registered once, even when `replaceImg` runs again. */
  public bindEvents(): void {
    if (this.eventsBound) {
      return;
    }
    this.eventsBound = true;

    const active: AddEventListenerOptions | boolean = supportsPassive ? { passive: false } : false;

    this.on(this.clipBox, 'wheel', (event) => {
      this.handleWheel(event as WheelEvent);
    }, active);

    this.on(this.clipBox, this.eventName.start, (event) => {
      preventScroll(event);
      if ((event.target as HTMLElement | null)?.className === 'clip-img-scale') {
        return;
      }
      this.calcAreaPos();
      this.drag = { mode: 'drag' };
    }, active);

    this.on(this.clipScaleBtn, this.eventName.start, (event) => {
      preventScroll(event);
      const point = readPoint(event);
      if (!point) {
        return;
      }
      this.calcAreaPos();
      this.drag = {
        mode: 'scale',
        startX: point.x,
        startY: point.y,
        startWidth: this.clipAreaInfo.win,
        startHeight: this.clipAreaInfo.hei,
        startLeft: this.clipAreaInfo.left,
        startTop: this.clipAreaInfo.top,
      };
    }, active);

    this.on(this.clipBox, this.eventName.move, (event) => {
      this.moveArea(event);
    }, active);

    this.on(this.clipBox, this.eventName.end, () => {
      this.drag = null;
    });


  }

  private on(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options: AddEventListenerOptions | boolean = false,
  ): void {
    target.addEventListener(type, handler, options);
    this.listeners.push({ target, type, handler });
  }

  /** `scaleImg: false` disables zooming without unregistering the listener. */
  private handleWheel(event: WheelEvent): void {
    const info = this.imgInfo;
    const elem = info.elem;
    if (!this.scaleImg || !elem) {
      return;
    }
    if (event.deltaY > 0) {
      if (this.wheelScale > WHEEL_MIN) {
        this.wheelScale -= WHEEL_STEP;
      }
    } else if (this.wheelScale < WHEEL_MAX) {
      this.wheelScale += WHEEL_STEP;
    }

    const imgScale = elem.width / elem.height;
    let imgWin = 0;
    let imgHei = 0;
    let imgX = 0;
    if (imgScale === 1) {
      imgWin = (this.boxWin / 2) * this.wheelScale;
      imgHei = (this.boxHei / 2) * this.wheelScale;
      imgX = ((this.boxWin - imgWin) / 2) * this.wheelScale;
    } else {
      imgWin = this.boxWin * this.wheelScale;
      imgHei = (this.boxHei / imgScale) * this.wheelScale;
      imgX = 0;
    }
    const imgY = (this.boxHei - imgHei) / 2;
    this.imgInfo = { elem, x: imgX, y: imgY, win: imgWin, hei: imgHei };
    this.drawImg(this.imgInfo);
  }

  /** Moves the crop box, or resizes it when the drag started on the handle. */
  public moveArea(event: Event): void {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    preventScroll(event);

    const point = readPoint(event);
    if (!point) {
      return;
    }

    if (drag.mode === 'drag') {
      let cLeft = point.x - this.clipBoxInfo.left - this.clipAreaInfo.win / 2;
      let cTop = point.y - this.clipBoxInfo.top - this.clipAreaInfo.hei / 2;
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
      this.updateAreaRect(cLeft, cTop, this.clipAreaInfo.win, this.clipAreaInfo.hei);
    } else {
      const ratio =
        drag.startHeight > 0
          ? drag.startWidth / drag.startHeight
          : Math.max(this.scale, 1);
      const deltaX = point.x - drag.startX;
      const deltaY = point.y - drag.startY;
      const widthFromX = drag.startWidth + deltaX;
      const widthFromY = (drag.startHeight + deltaY) * ratio;
      const proposedWidth =
        Math.abs(deltaX) >= Math.abs(deltaY * ratio) ? widthFromX : widthFromY;
      const maxWidth = Math.min(
        this.clipBoxInfo.win - drag.startLeft,
        (this.clipBoxInfo.hei - drag.startTop) * ratio,
      );
      const minWidth = Math.min(
        maxWidth,
        Math.max(this.scaleMinWin, this.scaleMinHei * ratio),
      );
      const areaWin = Math.min(maxWidth, Math.max(minWidth, proposedWidth));
      const areaHei = areaWin / ratio;
      this.updateAreaRect(drag.startLeft, drag.startTop, areaWin, areaHei);
    }
  }

  /** Writes one geometry result to every visual and data-facing surface. */
  private updateAreaRect(left: number, top: number, win: number, hei: number): void {
    this.clipArea.style.left = `${left}px`;
    this.clipArea.style.top = `${top}px`;
    this.clipArea.style.width = `${win}px`;
    this.clipArea.style.height = `${hei}px`;
    this.clipAreaInfo = { win, hei, left, top };
    this.calcShadowElem();
    this.getAreaData();
  }

  /** Shadow sizes after a drag, before the next geometry read. */
  public calcShadowElem(): void {
    this.changeShadowElem(this.clipAreaInfo.win, this.clipAreaInfo.hei);
  }

  /** Shadow sizes while the crop box is being resized. */
  public changeShadowElem(areaMoveWin: number, areaMoveHei = this.clipAreaInfo.hei): void {
    this.clipShadowTop.style.width = `${areaMoveWin}px`;
    this.clipShadowTop.style.height = `${this.clipAreaInfo.top}px`;
    this.clipShadowTop.style.left = `${this.clipAreaInfo.left}px`;
    this.clipShadowRight.style.width =
      `${this.clipBoxInfo.win - this.clipAreaInfo.left - areaMoveWin}px`;
    this.clipShadowRight.style.height = `${this.clipBoxInfo.hei}px`;
    this.clipShadowBottom.style.width = `${areaMoveWin}px`;
    this.clipShadowBottom.style.height =
      `${this.clipBoxInfo.hei - this.clipAreaInfo.top - areaMoveHei}px`;
    this.clipShadowBottom.style.left = `${this.clipAreaInfo.left}px`;
    this.clipShadowLeft.style.width = `${this.clipAreaInfo.left}px`;
  }

  /** Copies the selected region into the preview canvas and preview image. */
  public getAreaData(): void {
    this.tempCanvas.width = this.clipAreaInfo.win;
    this.tempCanvas.height = this.clipAreaInfo.hei;
    this.tempCanvas.style.overflow = 'hidden';

    this.clipArea.setAttribute(
      'data-pos',
      `pos(${this.clipAreaInfo.left},${this.clipAreaInfo.top})`,
    );
    this.clipArea.setAttribute(
      'data-size',
      `wh(${this.clipAreaInfo.win},${this.clipAreaInfo.hei})`,
    );

    this.tempData = this.clipCxt.getImageData(
      this.clipAreaInfo.left,
      this.clipAreaInfo.top,
      this.clipAreaInfo.win,
      this.clipAreaInfo.hei,
    );
    this.tempCxt.putImageData(this.tempData, 0, 0);
    this.saveImgData();
  }

  /** Publishes the crop as a data url, an object url, and a file. */
  public saveImgData(): void {
    const base64 = this.tempCanvas.toDataURL('image/jpg');
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.objectUrl = URL.createObjectURL(this.dataToBlob(base64));
    this.tempInfo = {
      base64,
      blob: this.objectUrl,
      file: this.dataToFile(base64),
    };

    if (this.pre) {
      this.pre.style.width = `${this.clipAreaInfo.win}px`;
      this.pre.style.height = `${this.clipAreaInfo.hei}px`;
      this.pre.style.overflow = 'hidden';
      this.pre.src = base64;
    }
    this.options.onChange?.(this.tempInfo);
  }

  /** The crop from the most recent selection change, if any. */
  public getCanvasImgData(): ClipData | null {
    return this.tempInfo;
  }

  public dataToBlob(base64Data: string): Blob {
    const parts = base64Data.split(',');
    const header = parts[0] ?? '';
    const payload = parts[1] ?? '';
    const byteString = header.indexOf('base64') >= 0 ? atob(payload) : unescape(payload);
    const mimeMatch = /data:(.*?);/.exec(header);
    const mime = mimeMatch?.[1] ?? 'image/jpeg';
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i += 1) {
      bytes[i] = byteString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  public dataToFile(dataurl: string, filename?: string): File {
    const parts = dataurl.split(',');
    const header = parts[0] ?? '';
    const payload = parts[1] ?? '';
    const mimeMatch = /data:(.*?);/.exec(header);
    const mime = mimeMatch?.[1] ?? 'image/jpeg';
    const name = filename ?? `${Date.now()}.jpg`;
    const bstr = atob(payload);
    let n = bstr.length;
    const bytes = new Uint8Array(n);
    while (n > 0) {
      n -= 1;
      bytes[n] = bstr.charCodeAt(n);
    }
    return new File([bytes], name, { type: mime });
  }

  /** Detaches every listener, empties the host, and revokes the object url. */
  public destroy(): void {
    for (const { target, type, handler } of this.listeners) {
      target.removeEventListener(type, handler);
    }
    this.listeners.length = 0;
    this.eventsBound = false;
    this.drag = null;

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    if (this.resizeHandler && window.onresize === this.resizeHandler) {
      window.onresize = null;
    }
    if (this.box) {
      this.box.innerHTML = '';
    }
  }
}
