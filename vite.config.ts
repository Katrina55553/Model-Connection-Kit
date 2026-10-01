import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "pi-ai": resolve(__dirname, "src/pi-ai.ts"),
      },
      formats: ["es"],
      cssFileName: "model-connection-kit",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "@earendil-works/pi-ai",
        /^@earendil-works\/pi-ai\//,
      ],
    },
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
