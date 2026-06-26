import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_GA4_MEASUREMENT_ID": JSON.stringify(env.VITE_GA4_MEASUREMENT_ID || env.GA4_MEASUREMENT_ID || ""),
      "import.meta.env.VITE_GA4_DEBUG_MODE": JSON.stringify(env.VITE_GA4_DEBUG_MODE || env.GA4_DEBUG_MODE || "true")
    },
    server: {
      port: 5173,
      proxy: {
        "/api": "http://127.0.0.1:8787",
        "/health": "http://127.0.0.1:8787"
      }
    },
    build: {
      outDir: "dist/client"
    }
  };
});
