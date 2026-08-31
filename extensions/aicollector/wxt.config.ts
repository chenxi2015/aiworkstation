import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),

  manifest: {
    name: 'AI Workstation Collector',
    description: 'Local-first AI Workstation collector & bookmarks manager',
    version: '1.0.0',
    permissions: [
      'sidePanel',
      'bookmarks',
      'activeTab',
      'scripting',
      'storage',
      'tabs',
      'downloads',
    ],
    host_permissions: ['<all_urls>'],
    // ffmpeg.wasm requires WebAssembly compilation inside extension pages
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    web_accessible_resources: [
      {
        resources: ['hls-sniffer.js'],
        matches: ['<all_urls>'],
      },
    ],
    action: {
      default_title: '打开 AI Collector 侧边栏',
    },
  },
});
