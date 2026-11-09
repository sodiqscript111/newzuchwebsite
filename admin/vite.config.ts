import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  root: "web",
  base: "/admin/",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:8787",
      "/media": "http://localhost:8787"
    }
  }
})
