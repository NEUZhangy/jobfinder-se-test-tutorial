import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import istanbul from "vite-plugin-istanbul";
import { defineConfig } from "vite";
import { createFilledInstrumenter } from "./e2e/instrumenter";

// The page only, without the Cloudflare plugin: the Playwright suite fakes every /api/* call.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    istanbul({ include: "web/**", extension: [".ts", ".tsx"], requireEnv: false, forceBuildInstrument: true, instrumenter: createFilledInstrumenter() }),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "web") } },
});
