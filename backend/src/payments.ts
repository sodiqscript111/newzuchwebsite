import { findOrderRow, listAwaitingPayment, markOrderPaid, markOrderUnpaid, orderWithItems } from "./db/orders.ts"
import { sendOrderPaidEmails } from "./email.ts"
import { coversOrder, PaystackError, verifyTransaction } from "./paystack.ts"

type OrderRow = NonNullable<Awaited<ReturnType<typeof findOrderRow>>>

// Marks an order paid and, only on the change itself, emails the customer and the owner.
export const confirmPaid = async (env: Env, row: OrderRow, paymentId: string | null) => {
  if (!(await markOrderPaid(env.DB, row, paymentId))) return false
  const paid = await findOrderRow(env.DB, { id: row.id })
  if (paid) {
    const trackUrl = `${env.PUBLIC_URL.replace(/\/+$/, "")}/track?number=${encodeURIComponent(paid.number)}`
    await sendOrderPaidEmails(env, await orderWithItems(env.DB, paid), trackUrl)
  }
  return true
}

// Asks Paystack about an order still waiting for payment, so the customer sees "paid" as soon as
// they come back, even before the webhook arrives. Paystack is the only source of the result.
export const syncPayment = async (env: Env, number: string) => {
  if (!env.PAYSTACK_SECRET_KEY) return
  const row = await findOrderRow(env.DB, { number })
  if (!row || row.status !== "awaiting_payment") return
  try {
    const transaction = await verifyTransaction(env, row.number)
    if (coversOrder(transaction, row.total)) {
      await confirmPaid(env, row, transaction.id ? String(transaction.id) : null)
    } else if (transaction.status === "failed") {
      await markOrderUnpaid(env.DB, row, "payment_failed")
    }
  } catch (error) {
    if (!(error instanceof PaystackError) && !(error instanceof DOMException)) throw error
    console.warn("Paystack verify failed", row.number, String(error))
  }
}

const RECENT_DAYS = 3

// Checks every recent unpaid order, so paid orders show up even without the webhook and even if
// the customer closed the tab before returning. Runs on a schedule and when the admin opens Orders.
export const syncRecentPayments = async (env: Env) => {
  if (!env.PAYSTACK_SECRET_KEY) return
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString()
  for (const number of await listAwaitingPayment(env.DB, since)) await syncPayment(env, number)
}
