import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^model-connection-kit$/, replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
      { find: /^model-connection-kit\/pi-ai$/, replacement: fileURLToPath(new URL("./src/pi-ai.ts", import.meta.url)) },
    ],
  },
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
        "pi-ai": fileURLToPath(new URL("./src/pi-ai.ts", import.meta.url)),
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
