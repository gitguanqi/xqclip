import component from './xqclip.vue';
import type { VueApp, XqClipVuePlugin } from '../types';

/**
 * Works with `Vue.use()` (Vue 2) and `app.use()` (Vue 3): both expose a
 * `component(name, definition)` method.
 */
const plugin: XqClipVuePlugin = {
  install(app: VueApp): void {
    app.component('xqClip', component);
  },
};

export { component };
export default plugin;