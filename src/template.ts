/**
 * Widget markup. Every node carries a class so lookups stay scoped to the
 * instance that injected it, and two widgets on one page cannot collide.
 */
export const CLIP_TEMPLATE = `<div class="clip-box clip-bg">
    <canvas class="clip-bg clip-canvas"></canvas>
    <div class="clip-img-shadow clip-img-shadow-top"></div>
    <div class="clip-img-shadow clip-img-shadow-right"></div>
    <div class="clip-img-shadow clip-img-shadow-bottom"></div>
    <div class="clip-img-shadow clip-img-shadow-left"></div>
    <div class="clip-img-area no-pos" data-pos="pos(0,0)" data-size="wh(0,0)">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <small class="clip-img-scale"></small>
    </div>
    <canvas class="clip-canvas-temp"></canvas>
</div>`;