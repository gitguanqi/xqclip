import type { ClipData, ClipImageInfo, ClipRect, XqClipOptions } from './types';
type DragState = {
    mode: 'drag';
} | {
    mode: 'scale';
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
};
/**
 * Image cropper that injects its own markup into a host element. Everything it
 * looks up afterwards is scoped to that host, so several croppers can live on
 * one page without binding to each other's nodes.
 */
export declare class XqClip {
    readonly options: XqClipOptions;
    /** Host element that receives the widget markup. */
    box: HTMLElement | null;
    /** The injected `.clip-box` root this instance owns. */
    clipBox: HTMLElement;
    /** Preview image that lives outside the widget, resolved from `options.pre`. */
    pre: HTMLImageElement | null;
    boxWin: number;
    boxHei: number;
    areaWin: number;
    areaHei: number;
    scale: number;
    showPos: boolean;
    scaleImg: boolean;
    imgSrc: string;
    scaleMin: number;
    scaleMinWin: number;
    scaleMinHei: number;
    clipBoxInfo: ClipRect;
    clipAreaInfo: ClipRect;
    imgInfo: ClipImageInfo;
    clipImg: HTMLCanvasElement;
    clipCxt: CanvasRenderingContext2D;
    tempCanvas: HTMLCanvasElement;
    tempCxt: CanvasRenderingContext2D;
    tempData: ImageData | null;
    clipScale: number;
    clipScaleBtn: HTMLElement;
    clipArea: HTMLElement;
    clipShadowTop: HTMLElement;
    clipShadowRight: HTMLElement;
    clipShadowBottom: HTMLElement;
    clipShadowLeft: HTMLElement;
    isMobile: boolean | null;
    eventName: {
        start: string;
        move: string;
        end: string;
    };
    drag: DragState | null;
    tempInfo: ClipData | null;
    private wheelScale;
    private eventsBound;
    private objectUrl;
    private resizeHandler;
    private readonly listeners;
    constructor(options?: XqClipOptions);
    /** Touch devices pick touch events; everything else drags with the mouse. */
    checkMobile(): void;
    /** The host element is sized from the options; the widget fills it. */
    private applyBoxSize;
    private initElem;
    private getElem;
    /**
     * Widget nodes are always resolved inside the instance's own host, never
     * through `document`, so a second instance cannot grab the first one's nodes.
     */
    private pick;
    private context;
    /** Loads `imgSrc`, centred and fit to the box. */
    private loadImg;
    drawImg(info: ClipImageInfo): void;
    /** Swaps the source image without re-binding listeners or touching geometry. */
    replaceImg(url: string): boolean;
    /** Re-applies the box size and re-reads the geometry after a layout change. */
    reset(): void;
    /** Sizes and centres the crop box, then re-draws the shadows. */
    calcAreaElem(): void;
    calcAreaPos(): void;
    /** Shadow panels cover everything outside the crop box. */
    initShadowElem(): void;
    /** Listeners are registered once, even when `replaceImg` runs again. */
    bindEvents(): void;
    private on;
    /** `scaleImg: false` disables zooming without unregistering the listener. */
    private handleWheel;
    /** Moves the crop box, or resizes it when the drag started on the handle. */
    moveArea(event: Event): void;
    /** Writes one geometry result to every visual and data-facing surface. */
    private updateAreaRect;
    /** Shadow sizes after a drag, before the next geometry read. */
    calcShadowElem(): void;
    /** Shadow sizes while the crop box is being resized. */
    changeShadowElem(areaMoveWin: number, areaMoveHei?: number): void;
    /** Copies the selected region into the preview canvas and preview image. */
    getAreaData(): void;
    /** Publishes the crop as a data url, an object url, and a file. */
    saveImgData(): void;
    /** The crop from the most recent selection change, if any. */
    getCanvasImgData(): ClipData | null;
    dataToBlob(base64Data: string): Blob;
    dataToFile(dataurl: string, filename?: string): File;
    /** Detaches every listener, empties the host, and revokes the object url. */
    destroy(): void;
}
export {};
