import { defineConfig } from "vitest/config";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  build: {
    target: "esnext",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
