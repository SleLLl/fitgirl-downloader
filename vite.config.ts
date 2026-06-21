import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const tailwindEntry = path.resolve(__dirname, "src/index.css").replace(/\\/g, "/");

// Auto-prepend `@reference` to every component CSS so Tailwind can resolve
// `@apply`/theme tokens in co-located stylesheets. Components just
// `import "./Foo.css"` — no central registry, no per-file boilerplate.
function tailwindReference(entry: string): Plugin {
  return {
    name: "inject-tailwind-reference",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (
        file.endsWith(".css") &&
        file.includes("/src/") &&
        !file.endsWith("/index.css")
      ) {
        return { code: `@reference "${entry}";\n${code}`, map: null };
      }
      return null;
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindReference(tailwindEntry), react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
