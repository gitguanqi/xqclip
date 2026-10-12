import component from './xqclip.vue';
import type { XqClipVuePlugin } from '../types';
/**
 * Works with `Vue.use()` (Vue 2) and `app.use()` (Vue 3): both expose a
 * `component(name, definition)` method.
 */
declare const plugin: XqClipVuePlugin;
export { component };
export default plugin;
