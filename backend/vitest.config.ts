import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin"
import { mkdirSync } from "node:fs"
import { defineConfig } from "vitest/config"

mkdirSync("public", { recursive: true })

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          ENVIRONMENT: "development",
          PUBLIC_URL: "https://shop.test",
          ADMIN_PASSWORD: "admin-password",
          PAYSTACK_SECRET_KEY: "",
          PAYSTACK_WEBHOOK_SECRET: "whsec_test",
          RESEND_API_KEY: "",
          EMAIL_FROM: "Zuch <orders@shop.test>",
          OWNER_EMAIL: "owner@shop.test"
        }
      }
    })
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"]
  }
}))
