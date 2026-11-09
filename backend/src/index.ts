import { HTTPException } from "hono/http-exception"
import { newApp } from "./app.ts"
import { bayseHealthCheck } from "./bayse.ts"
import { account } from "./routes/account.ts"
import { admin } from "./routes/admin.ts"
import { checkout } from "./routes/checkout.ts"
import { dev } from "./routes/dev.ts"
import { media } from "./routes/media.ts"
import { shop } from "./routes/shop.ts"
import { webhooks } from "./routes/webhooks.ts"

const app = newApp()

app.use("/api/*", async (c, next) => {
  const method = c.req.method
  const origin = c.req.header("origin")
  if (method !== "GET" && method !== "HEAD" && origin && !c.req.path.startsWith("/api/webhooks/")) {
    const allowed = new Set([new URL(c.req.url).origin, c.env.PUBLIC_URL.replace(/\/+$/, "")])
    const isLocal = c.env.ENVIRONMENT === "development" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    if (!allowed.has(origin) && !isLocal) return c.json({ message: "Request blocked" }, 403)
  }
  await next()
})

app.get("/api/health", (c) => c.json({ ok: true }))

app.get("/api/health/bayse", async (c) => {
  const ok = await bayseHealthCheck(c.env.BAYSE_URL)
  return c.json({ ok }, ok ? 200 : 503)
})

app.route("/api", shop)
app.route("/api", checkout)
app.route("/api/account", account)
app.route("/api/admin", admin)
app.route("/api/webhooks", webhooks)
app.route("/api/dev", dev)
app.route("/media", media)

app.notFound((c) => c.json({ message: "Not found" }, 404))

app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ message: error.message }, error.status)
  console.error(error)
  return c.json({ message: "Something went wrong. Please try again." }, 500)
})

export default app
