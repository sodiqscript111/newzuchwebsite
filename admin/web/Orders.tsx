import { useState } from "react"
import { api, type Order, type OrderStatus } from "./api.ts"

const STEPS: ReadonlyArray<{ value: "paid" | "in_progress" | "completed"; label: string }> = [
  { value: "paid", label: "Not started" },
  { value: "in_progress", label: "Working on it" },
  { value: "completed", label: "Done" }
]

const UNPAID_LABELS: Partial<Record<OrderStatus, string>> = {
  awaiting_payment: "Awaiting payment",
  payment_failed: "Payment failed",
  expired: "Payment expired",
  cancelled: "Cancelled"
}

const isToDo = (o: Order) => o.status === "paid" || o.status === "in_progress"
const isUnpaid = (o: Order) => o.status === "awaiting_payment" || o.status === "payment_failed" || o.status === "expired"

const VIEWS = [
  { value: "todo", label: "To do", matches: isToDo },
  { value: "done", label: "Done", matches: (o: Order) => o.status === "completed" },
  { value: "unpaid", label: "Unpaid", matches: isUnpaid },
  { value: "all", label: "All", matches: () => true }
] as const

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

const describeSize = (item: Order["items"][number]) => {
  if (item.size) return `Size ${item.size}`
  if (item.measurements) {
    const { chest, waist, hips, length } = item.measurements
    return `Chest ${chest} · waist ${waist} · hips ${hips} · length ${length} cm`
  }
  return ""
}

interface Props {
  readonly orders: ReadonlyArray<Order>
  readonly onChange: (order: Order) => void
  readonly onError: (error: unknown) => void
}

export function Orders({ orders, onChange, onError }: Props) {
  const [view, setView] = useState<(typeof VIEWS)[number]["value"]>("todo")
  const current = VIEWS.find((v) => v.value === view)!
  const visible = orders.filter(current.matches)

  return (
    <>
      <div className="page-head">
        <h1>Orders</h1>
        <div className="tabs" role="group" aria-label="Filter orders">
          {VIEWS.map((v) => (
            <button key={v.value} aria-pressed={view === v.value} onClick={() => setView(v.value)}>
              {v.label} <span className="muted">{orders.filter(v.matches).length}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0
        ? (
          <p className="empty">
            {orders.length === 0
              ? "No orders yet. New orders will show up here."
              : view === "todo"
              ? "Nothing to do. All paid orders are handled."
              : "No orders here."}
          </p>
        )
        : (
          <div className="orders">
            {visible.map((order) => <OrderCard key={order.id} order={order} onChange={onChange} onError={onError} />)}
          </div>
        )}
    </>
  )
}

function OrderCard({ order, onChange, onError }: { readonly order: Order } & Omit<Props, "orders">) {
  const [note, setNote] = useState(order.note)
  const unpaidLabel = UNPAID_LABELS[order.status]

  const save = async (update: { status?: OrderStatus; note?: string }) => {
    // Show the change straight away, put it back if the save fails.
    onChange({ ...order, ...update })
    try {
      onChange(await api.updateOrder(order.id, update))
    } catch (error) {
      onChange(order)
      onError(error)
    }
  }

  return (
    <article className={`order status-${order.status}`}>
      <header>
        <div>
          <strong>{order.number}</strong>
          {unpaidLabel && <span className="tag warn-tag">{unpaidLabel}</span>}
          {order.hasAccount && <span className="tag">Account</span>}
        </div>
        <time className="muted" dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
      </header>

      <ul className="order-items">
        {order.items.map((item, index) => (
          <li key={index}>
            {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="no-photo" />}
            <div>
              <p>{item.quantity > 1 && <strong>{item.quantity} × </strong>}{item.name}</p>
              <p className="muted">{describeSize(item)}</p>
            </div>
          </li>
        ))}
      </ul>

      <dl className="order-contact">
        <dt>Name</dt>
        <dd>{order.name}</dd>
        <dt>Deliver to</dt>
        <dd>{order.address}</dd>
        <dt>Phone</dt>
        <dd><a href={`tel:${order.phone.replace(/\s/g, "")}`}>{order.phone}</a></dd>
        <dt>Email</dt>
        <dd><a href={`mailto:${order.email}`}>{order.email}</a></dd>
      </dl>

      <label className="field">
        <span>Note</span>
        <textarea
          rows={2}
          value={note}
          placeholder="Only you can see this"
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => note !== order.note && save({ note })}
        />
      </label>

      {unpaidLabel
        ? <p className="muted handled">Waiting on payment. Nothing to make yet.</p>
        : (
          <div className="segmented" role="group" aria-label={`Status of ${order.number}`}>
            {STEPS.map((step) => (
              <button
                key={step.value}
                aria-pressed={order.status === step.value}
                onClick={() => order.status !== step.value && save({ status: step.value })}
              >
                {step.label}
              </button>
            ))}
          </div>
        )}
      {order.paidAt && <p className="muted handled">Paid {formatDate(order.paidAt)}</p>}
    </article>
  )
}
