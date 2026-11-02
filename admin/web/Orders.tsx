import { useState } from "react"
import { api, type Order, type OrderStatus } from "./api.ts"

const STATUSES: ReadonlyArray<{ value: OrderStatus; label: string }> = [
  { value: "new", label: "Not started" },
  { value: "in_progress", label: "Working on it" },
  { value: "done", label: "Done" }
]

const VIEWS = [
  { value: "todo", label: "To do", matches: (o: Order) => o.status !== "done" },
  { value: "done", label: "Done", matches: (o: Order) => o.status === "done" },
  { value: "all", label: "All", matches: () => true }
] as const

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

const describeOptions = (options: Readonly<Record<string, string>>) => {
  const entries = Object.entries(options)
  if (entries.length === 1 && entries[0][0] === "size") return `Size ${entries[0][1]}`
  return entries.map(([key, value]) => `${key} ${value}`).join(" · ")
}

interface Props {
  readonly orders: ReadonlyArray<Order>
  readonly onChange: (order: Order) => void
  readonly notify: (text: string, isError?: boolean) => void
}

export function Orders({ orders, onChange, notify }: Props) {
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
              ? "Nothing to do. All orders are handled."
              : "No orders here yet."}
          </p>
        )
        : (
          <div className="orders">
            {visible.map((order) => <OrderCard key={order.id} order={order} onChange={onChange} notify={notify} />)}
          </div>
        )}
    </>
  )
}

function OrderCard({ order, onChange, notify }: { readonly order: Order } & Omit<Props, "orders">) {
  const [note, setNote] = useState(order.note)

  const save = async (update: { status?: OrderStatus; note?: string }) => {
    // Show the change straight away, put it back if the save fails.
    onChange({ ...order, ...update } as Order)
    try {
      onChange(await api.updateOrder(order.id, update))
    } catch (error) {
      onChange(order)
      notify(error instanceof Error ? error.message : "Could not save", true)
    }
  }

  return (
    <article className={`order status-${order.status}`}>
      <header>
        <div>
          <strong>{order.reference}</strong>
          {order.isSample && <span className="tag">Sample</span>}
        </div>
        <time className="muted" dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
      </header>

      <ul className="order-items">
        {order.items.map((item, index) => (
          <li key={index}>
            {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="no-photo" />}
            <div>
              <p>{item.quantity > 1 && <strong>{item.quantity} × </strong>}{item.name}</p>
              <p className="muted">{describeOptions(item.options)}</p>
            </div>
          </li>
        ))}
      </ul>

      <dl className="order-contact">
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

      <div className="segmented" role="group" aria-label={`Status of ${order.reference}`}>
        {STATUSES.map((status) => (
          <button
            key={status.value}
            aria-pressed={order.status === status.value}
            onClick={() => order.status !== status.value && save({ status: status.value })}
          >
            {status.label}
          </button>
        ))}
      </div>
      {order.handledAt && <p className="muted handled">Handled {formatDate(order.handledAt)}</p>}
    </article>
  )
}
