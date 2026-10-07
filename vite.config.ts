import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // the model/ harness is a dev tool, only the demo app is built
      input: 'index.html',
    },
  },
});
