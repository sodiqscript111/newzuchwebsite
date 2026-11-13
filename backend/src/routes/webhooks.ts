import { newApp } from "../app.ts"
import { addOrderNote, findOrderRow } from "../db/orders.ts"
import { confirmPaid } from "../payments.ts"
import { nowIso } from "../lib/http.ts"
import { coversOrder, Transaction, verifyWebhook, WebhookEvent } from "../paystack.ts"

export const webhooks = newApp()

webhooks.post("/paystack", async (c) => {
  if (!c.env.PAYSTACK_SECRET_KEY && !c.env.PAYSTACK_WEBHOOK_SECRET) {
    return c.json({ message: "Webhooks aren't set up" }, 503)
  }
  const raw = await c.req.text()
  if (!(await verifyWebhook(c.env, c.req.raw.headers, raw))) return c.json({ message: "Invalid signature" }, 401)

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return c.json({ message: "Unexpected event" }, 400)
  }
  const parsed = WebhookEvent.safeParse(body)
  if (!parsed.success) return c.json({ message: "Unexpected event" }, 400)
  const { event, data } = parsed.data
  if (event !== "charge.success" || !data.reference) return c.json({ received: true })

  const eventKey = `${event}:${data.id ?? data.reference}`
  const seen = await c.env.DB.prepare("SELECT 1 FROM webhook_events WHERE id = ?").bind(eventKey).first()
  if (seen) return c.json({ received: true, duplicate: true })

  const order = await findOrderRow(c.env.DB, { number: data.reference })
  if (order) {
    const transaction = Transaction.safeParse(data)
    if (transaction.success && coversOrder(transaction.data, order.total)) {
      await confirmPaid(c.env, order, data.id ? String(data.id) : null)
    } else {
      await addOrderNote(
        c.env.DB,
        order,
        `Paystack reported ${data.status ?? "?"} for ${(data.amount ?? 0) / 100} ${data.currency ?? ""}, but the order is ₦${order.total}. Check in Paystack.`
      )
    }
  } else {
    console.warn("Paystack event for an unknown order", data.reference)
  }

  await c.env.DB.prepare("INSERT OR IGNORE INTO webhook_events (id, type, received_at) VALUES (?, ?, ?)")
    .bind(eventKey, event, nowIso())
    .run()
  return c.json({ received: true })
})
