/**
 * Widget markup. Every node carries a class so lookups stay scoped to the
 * instance that injected it, and two widgets on one page cannot collide.
 */
export declare const CLIP_TEMPLATE = "<div class=\"clip-box clip-bg\">\n    <canvas class=\"clip-bg clip-canvas\"></canvas>\n    <div class=\"clip-img-shadow clip-img-shadow-top\"></div>\n    <div class=\"clip-img-shadow clip-img-shadow-right\"></div>\n    <div class=\"clip-img-shadow clip-img-shadow-bottom\"></div>\n    <div class=\"clip-img-shadow clip-img-shadow-left\"></div>\n    <div class=\"clip-img-area no-pos\" data-pos=\"pos(0,0)\" data-size=\"wh(0,0)\">\n        <span></span>\n        <span></span>\n        <span></span>\n        <span></span>\n        <span></span>\n        <span></span>\n        <span></span>\n        <span></span>\n        <span></span>\n        <small class=\"clip-img-scale\"></small>\n    </div>\n    <canvas class=\"clip-canvas-temp\"></canvas>\n</div>";
