import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AdminApi } from "../shared/api.ts"
import { Catalog } from "./Catalog.ts"
import { DatabaseLive } from "./Database.ts"
import { Orders } from "./Orders.ts"
import { Photos } from "./Photos.ts"

const OrdersHandlers = HttpApiBuilder.group(
  AdminApi,
  "orders",
  Effect.fn(function*(handlers) {
    const orders = yield* Orders
    return handlers.handleAll({
      list: () => orders.list,
      update: ({ params, payload }) => orders.update(params.id, payload)
    })
  })
)

const CollectionsHandlers = HttpApiBuilder.group(
  AdminApi,
  "collections",
  Effect.fn(function*(handlers) {
    const catalog = yield* Catalog
    return handlers.handleAll({
      list: () => catalog.collections,
      create: ({ payload }) => catalog.createCollection(payload.name)
    })
  })
)

const ProductsHandlers = HttpApiBuilder.group(
  AdminApi,
  "products",
  Effect.fn(function*(handlers) {
    const catalog = yield* Catalog
    return handlers.handleAll({
      list: () => catalog.products,
      create: ({ payload }) => catalog.createProduct(payload),
      update: ({ params, payload }) => catalog.updateProduct(params.id, payload),
      remove: ({ params }) => catalog.removeProduct(params.id),
      addImages: ({ params, payload }) => catalog.addImages(params.id, payload.files),
      orderImages: ({ params, payload }) => catalog.orderImages(params.id, payload.imageIds),
      removeImage: ({ params }) => catalog.removeImage(params.id, params.imageId)
    })
  })
)

const Services = Layer.mergeAll(Orders.layer, Catalog.layer).pipe(
  Layer.provide(Photos.layer),
  Layer.provide(DatabaseLive)
)

export const ApiRoutes = HttpApiBuilder.layer(AdminApi).pipe(
  Layer.provide([OrdersHandlers, CollectionsHandlers, ProductsHandlers]),
  Layer.provide(Services)
)
