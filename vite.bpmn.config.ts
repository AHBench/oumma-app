import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Standalone build of the Vue 3 process-diagram viewer (bpmn-viewer/).
// Output is committed under public/bpmn-viewer and embedded in the
// Process Design page via <iframe> (Workstream H).
export default defineConfig({
  plugins: [vue()],
  root: 'bpmn-viewer',
  base: '/bpmn-viewer/',
  build: {
    outDir: '../public/bpmn-viewer',
    emptyOutDir: true,
  },
});
