import { newApp } from "../app.ts"
import { nairaFromAmount, verifyWebhook, WebhookEvent } from "../bachs.ts"
import { addOrderNote, findOrderRow, markOrderPaid, markOrderUnpaid } from "../db/orders.ts"
import { nowIso } from "../lib/http.ts"

export const webhooks = newApp()

const PAID_COLLECTION = new Set(["SUCCEEDED", "OVERPAID"])

webhooks.post("/bachs", async (c) => {
  if (!c.env.BACHS_WEBHOOK_SECRET) return c.json({ message: "Webhooks aren't set up" }, 503)
  const raw = await c.req.text()
  if (!(await verifyWebhook(c.env.BACHS_WEBHOOK_SECRET, c.req.raw.headers, raw))) {
    return c.json({ message: "Invalid signature" }, 401)
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return c.json({ message: "Unexpected event" }, 400)
  }
  const parsed = WebhookEvent.safeParse(body)
  if (!parsed.success) return c.json({ message: "Unexpected event" }, 400)
  const event = parsed.data

  const seen = await c.env.DB.prepare("SELECT 1 FROM webhook_events WHERE id = ?").bind(event.id).first()
  if (seen) return c.json({ received: true, duplicate: true })

  const { data } = event
  const order = (data.reference ? await findOrderRow(c.env.DB, { number: data.reference }) : null) ??
    (data.checkout_id ? await findOrderRow(c.env.DB, { checkoutId: data.checkout_id }) : null)

  if (order) {
    const paid = (event.type === "collection.succeeded" && PAID_COLLECTION.has(data.status ?? "")) ||
      (event.type === "checkout.completed" && data.payment_status === "paid")
    if (paid) {
      const amount = nairaFromAmount(data.amount)
      if (data.currency === "NGN" && amount !== null && amount >= order.total) {
        await markOrderPaid(c.env.DB, order, data.charge_id ?? data.charge?.id ?? null)
      } else {
        await addOrderNote(
          c.env.DB,
          order,
          `Bachs reported ${data.amount ?? "?"} ${data.currency ?? ""} but the order is ₦${order.total}. Check in Bachs.`
        )
      }
    } else if (event.type === "collection.succeeded" && data.status === "ACCEPTED") {
      await addOrderNote(c.env.DB, order, "Bachs accepted a payment on different terms. Check in Bachs.")
    } else if (event.type === "collection.underpaid") {
      await addOrderNote(c.env.DB, order, `Bachs reported an underpayment of ${data.amount ?? "?"}. Check in Bachs.`)
    } else if (event.type === "collection.failed") {
      await markOrderUnpaid(c.env.DB, order, "payment_failed")
    } else if (event.type === "checkout.expired") {
      await markOrderUnpaid(c.env.DB, order, "expired")
    }
  } else {
    console.warn("Bachs event for an unknown order", event.id, data.reference, data.checkout_id)
  }

  await c.env.DB.prepare("INSERT OR IGNORE INTO webhook_events (id, type, received_at) VALUES (?, ?, ?)")
    .bind(event.id, event.type, nowIso())
    .run()
  return c.json({ received: true })
})
