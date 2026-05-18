import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
    },
  },
  renderer: {
    // Renderer is the web app — built separately via apps/web, served via loadURL
    // In dev mode we point to the Vite dev server; in prod we load built files
    root: '../web',
    build: {
      outDir: 'dist/renderer',
    },
  },
})
