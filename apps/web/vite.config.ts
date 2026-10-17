import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/oo": {
        target: process.env.ONLYOFFICE_INTERNAL_URL || "http://127.0.0.1:8083",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/oo/, ""),
        headers: {
          "X-Forwarded-Host": "localhost:5173/oo",
          "X-Forwarded-Proto": "http",
        },
      },
    },
  },
});
