import type { Order } from "../model/order.ts"

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`

const sizeOf = (item: Order["items"][number]) => {
  if (item.size) return `Size ${item.size}`
  if (item.measurements) {
    const { chest, waist, hips, length } = item.measurements
    return `Chest ${chest}, waist ${waist}, hips ${hips}, length ${length} cm`
  }
  return ""
}

const layout = (heading: string, body: string) => `<!doctype html>
<html><body style="margin:0;padding:24px;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto">
<p style="font-weight:700;letter-spacing:0.2em;margin:0 0 24px">ZUCH</p>
<h1 style="font-size:20px;margin:0 0 16px">${escape(heading)}</h1>
${body}
</div></body></html>`

const itemsTable = (order: Order) =>
  `<table style="width:100%;border-collapse:collapse;margin:16px 0">${order.items
    .map(
      (item) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid #ddd">${item.quantity > 1 ? `${item.quantity} × ` : ""}${escape(item.name)}<br>
<span style="color:#666;font-size:13px">${escape(sizeOf(item))}</span></td>
<td style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right;white-space:nowrap">${naira(item.unitPrice * item.quantity)}</td>
</tr>`
    )
    .join("")}
<tr><td style="padding:12px 0;font-weight:700">Total</td><td style="padding:12px 0;font-weight:700;text-align:right">${naira(order.total)}</td></tr>
</table>`

const itemsText = (order: Order) =>
  order.items.map((item) => `- ${item.quantity} x ${item.name} (${sizeOf(item)}): ${naira(item.unitPrice * item.quantity)}`).join("\n") +
  `\nTotal: ${naira(order.total)}`

export const sendEmail = async (
  env: Env,
  message: { to: string; subject: string; html: string; text: string; replyTo?: string }
) => {
  if (!env.RESEND_API_KEY) return false
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {})
      }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) console.warn("Resend refused an email", response.status, (await response.text()).slice(0, 300))
    return response.ok
  } catch (error) {
    console.warn("Could not send email", String(error))
    return false
  }
}

export const sendOrderPaidEmails = async (env: Env, order: Order, orderUrl: string) => {
  const customer = sendEmail(env, {
    to: order.email,
    subject: `Your Zuch order ${order.number} is confirmed`,
    html: layout(
      "Thank you for your order",
      `<p>Hi ${escape(order.name)}, we've received your payment for order <strong>${order.number}</strong>. We'll start on it soon.</p>
${itemsTable(order)}
<p>Delivering to: ${escape(order.address)}</p>
<p><a href="${orderUrl}" style="color:#000">See your order</a>, or track it any time on our site with your order number and this email.</p>`
    ),
    text: `Hi ${order.name}, we've received your payment for order ${order.number}. We'll start on it soon.\n\n${itemsText(order)}\n\nDelivering to: ${order.address}\nSee your order: ${orderUrl}`
  })

  const owner = env.OWNER_EMAIL
    ? sendEmail(env, {
        to: env.OWNER_EMAIL,
        replyTo: order.email,
        subject: `New paid order ${order.number}: ${naira(order.total)}`,
        html: layout(
          `New order ${order.number}`,
          `${itemsTable(order)}
<p><strong>${escape(order.name)}</strong><br>${escape(order.phone)}<br>${escape(order.email)}<br>${escape(order.address)}</p>
<p><a href="${env.PUBLIC_URL}/admin/#/orders" style="color:#000">Open the admin</a></p>`
        ),
        text: `New paid order ${order.number}\n\n${itemsText(order)}\n\n${order.name}\n${order.phone}\n${order.email}\n${order.address}\n\nAdmin: ${env.PUBLIC_URL}/admin/`
      })
    : Promise.resolve(false)

  await Promise.all([customer, owner])
}

export const sendPasswordResetEmail = (env: Env, to: string, name: string, link: string) =>
  sendEmail(env, {
    to,
    subject: "Reset your Zuch password",
    html: layout(
      "Reset your password",
      `<p>Hi ${escape(name)}, use the link below to choose a new password. It works for one hour.</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#000;color:#fff;text-decoration:none">Choose a new password</a></p>
<p style="color:#666;font-size:13px">If you didn't ask for this, you can ignore this email.</p>`
    ),
    text: `Hi ${name}, choose a new password here (works for one hour): ${link}\n\nIf you didn't ask for this, ignore this email.`
  })
