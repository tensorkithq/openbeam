/// <reference types="vitest/config" />
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**"],
  },
  server: {
    port: 3000,
    strictPort: true,
    allowedHosts: ["openbeam.tensorkit.ai", "localhost"],
    proxy: {
      "/api": "http://localhost:4001",
      "/ws": { target: "ws://localhost:4001", ws: true },
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        overlay: path.resolve(__dirname, "overlay.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
