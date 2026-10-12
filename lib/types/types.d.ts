/** Configuration accepted by the {@link XqClip} constructor. */
export interface XqClipOptions {
    /** Selector or element that hosts the widget. Required at runtime. */
    box?: string | HTMLElement;
    /** Canvas width in pixels. */
    boxWin?: number;
    /** Canvas height in pixels. */
    boxHei?: number;
    /** Crop box width in pixels, before `scale` is applied. */
    areaWin?: number;
    /** Crop box height in pixels. */
    areaHei?: number;
    /** Selector or element of the preview image that lives outside the widget. */
    pre?: string | HTMLElement | null;
    /** Initial image url. Required at runtime. */
    url?: string;
    /** Crop box aspect ratio; `1` keeps the selection square. */
    scale?: number;
    /** Show the position and size labels attached to the crop box. */
    showPos?: boolean;
    /** Allow wheel zooming. */
    scaleImg?: boolean;
    /** Called with the cropped data every time the selection changes. */
    onChange?: (data: ClipData) => void;
}
/** A box in the coordinates of the host element. */
export interface ClipRect {
    win: number;
    hei: number;
    left: number;
    top: number;
}
/** Geometry of the image currently drawn on the canvas. */
export interface ClipImageInfo {
    elem: HTMLImageElement | null;
    x: number;
    y: number;
    win: number;
    hei: number;
}
/** The cropped region, in the three shapes consumers usually need. */
export interface ClipData {
    /** Data url of the cropped region. */
    base64: string;
    /** Object url for the same data; revoke it once the consumer is done. */
    blob: string;
    /** The cropped region as a file. */
    file: File;
}
/** Minimal structural view of a Vue 2 constructor or a Vue 3 app. */
export interface VueApp {
    component(name: string, definition: unknown): unknown;
}
export interface XqClipVuePlugin {
    install(app: VueApp): void;
}
