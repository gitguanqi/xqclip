---
name: xqclip
description: Integrate the xqclip browser image cropper into vanilla JavaScript or TypeScript, Vue 2, or Vue 3.
---

# xqclip Integration

Use this skill when a project needs interactive image cropping with `xqclip`.

Read [the package reference](../../llms.txt) before choosing options or methods that are not covered here.

## Choose The Entry

- Use `xqclip` and the `XqClip` class for framework-free browser code.
- Use `xqclip/vue` for Vue 2 or Vue 3. Register the default plugin or import the named component.
- Import `xqclip/css/xqclip.css` or `xqclip/css/xqclip.min.css` for the core class. The Vue entry imports its styles through the SFC.

## Integration Rules

1. Render the host element before constructing `XqClip`.
2. Provide both `box` and `url`; the constructor reports early configuration errors and may not mount without them.
3. Use an image URL that permits cross-origin canvas access. Without CORS headers, cropping fails when the canvas is read.
4. Read crop output from `onChange` or `getCanvasImgData()` as `{ base64, blob, file }`.
5. Call `destroy()` on the class instance when its host is removed. The Vue component handles teardown through its lifecycle hooks.

## Vue Notes

- Pass cropper configuration through `options`; `box` and `onChange` are owned by the component.
- Bind the source image with `v-model`; it maps to `modelValue` and is preferred over the legacy `url` prop.
- Listen for `ready`, `change`, and `update:modelValue`.
- Call component methods `replaceImg`, `reset`, `getCanvasImgData`, or `getInstance` through a template ref.

## Verification

- Confirm the cropper host is sized and visible.
- Load an allowed image and verify `onChange` or `change` produces all three result fields.
- Exercise replace, reset, resize, wheel zoom, and teardown paths used by the application.
