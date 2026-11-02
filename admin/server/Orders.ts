import { Context, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { NotFound, Order, type OrderItem, type OrderUpdate } from "../shared/api.ts"

interface OrderRow {
  id: string
  reference: string
  email: string
  phone: string
  address: string
  items: string
  status: Order["status"]
  note: string
  is_sample: number
  created_at: string
  handled_at: string | null
}

const toOrder = (row: OrderRow) =>
  new Order({
    id: row.id,
    reference: row.reference,
    email: row.email,
    phone: row.phone,
    address: row.address,
    items: JSON.parse(row.items) as Array<OrderItem>,
    status: row.status,
    note: row.note,
    isSample: row.is_sample === 1,
    createdAt: row.created_at,
    handledAt: row.handled_at
  })

export class Orders extends Context.Service<Orders, {
  readonly list: Effect.Effect<Array<Order>>
  update(id: string, update: OrderUpdate): Effect.Effect<Order, NotFound>
}>()("zuch/Orders") {
  static readonly layer = Layer.effect(
    Orders,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      const list = sql<OrderRow>`SELECT * FROM orders ORDER BY created_at DESC`.pipe(
        Effect.map((rows) => rows.map(toOrder)),
        Effect.orDie
      )

      const update = Effect.fn("Orders.update")(function*(id: string, update: OrderUpdate) {
        const [row] = yield* sql<OrderRow>`SELECT * FROM orders WHERE id = ${id}`.pipe(Effect.orDie)
        if (!row) return yield* new NotFound({ message: "Order not found" })

        const status = update.status ?? row.status
        const handledAt = status === "done" ? (row.handled_at ?? new Date().toISOString()) : null
        const note = update.note ?? row.note
        yield* sql`
          UPDATE orders SET status = ${status}, note = ${note}, handled_at = ${handledAt} WHERE id = ${id}
        `.pipe(Effect.orDie)
        return toOrder({ ...row, status, note, handled_at: handledAt })
      })

      return Orders.of({ list, update })
    })
  )
}
