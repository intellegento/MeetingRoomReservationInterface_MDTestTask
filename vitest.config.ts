import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    // .only в тесте роняет прогон (AGENTS.md, docs/testing.md правило 6).
    allowOnly: false,
    passWithNoTests: false,
  },
});
