import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [
    react(),
    // In production builds, replace the CDN office.js reference with a locally bundled copy
    (() => {
      let isBuild = false;
      return {
        name: 'local-office-js',
        configResolved(config: { command: string }) {
          isBuild = config.command === 'build';
        },
        transformIndexHtml(html: string) {
          if (isBuild) {
            return html.replace(
              /src="https:\/\/appsforoffice\.microsoft\.com\/lib\/[^"]+\/hosted\/office\.js"/,
              'src="/office.js"'
            );
          }
          return html;
        },
      };
    })(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    https: {
      // Office Add-in requires HTTPS in dev mode
      // Use a self-signed cert or configure as needed
    },
    cors: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        taskpane: path.resolve(__dirname, 'src/taskpane/index.html'),
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
