import { findOrderRow, markOrderPaid, markOrderUnpaid } from "./db/orders.ts"
import { coversOrder, PaystackError, verifyTransaction } from "./paystack.ts"

// Asks Paystack about an order still waiting for payment, so the customer sees "paid" as soon as
// they come back, even before the webhook arrives. Paystack is the only source of the result.
export const syncPayment = async (env: Env, number: string) => {
  if (!env.PAYSTACK_SECRET_KEY) return
  const row = await findOrderRow(env.DB, { number })
  if (!row || row.status !== "awaiting_payment") return
  try {
    const transaction = await verifyTransaction(env, row.number)
    if (coversOrder(transaction, row.total)) {
      await markOrderPaid(env.DB, row, transaction.id ? String(transaction.id) : null)
    } else if (transaction.status === "failed") {
      await markOrderUnpaid(env.DB, row, "payment_failed")
    }
  } catch (error) {
    if (!(error instanceof PaystackError) && !(error instanceof DOMException)) throw error
    console.warn("Paystack verify failed", row.number, String(error))
  }
}
