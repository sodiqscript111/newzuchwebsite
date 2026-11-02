import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:4320",
      "/uploads": "http://localhost:4320"
    }
  }
})
