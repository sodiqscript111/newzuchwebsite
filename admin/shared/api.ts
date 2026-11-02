// The admin API, shared by the server and (types only) by the web app.
import { Schema } from "effect"
import { Multipart } from "effect/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"

export class Collection extends Schema.Class<Collection>("Collection")({
  slug: Schema.String,
  name: Schema.String
}) {}

export class ProductImage extends Schema.Class<ProductImage>("ProductImage")({
  id: Schema.String,
  url: Schema.String
}) {}

const productFields = {
  collectionSlug: Schema.String,
  name: Schema.NonEmptyString,
  // Null means "no fixed price"; priceNote says why (e.g. "Book Appointment").
  price: Schema.NullOr(Schema.Int),
  priceNote: Schema.String,
  description: Schema.String,
  sizes: Schema.Array(Schema.String),
  visible: Schema.Boolean
}

export class ProductInput extends Schema.Class<ProductInput>("ProductInput")(productFields) {}

export class Product extends Schema.Class<Product>("Product")({
  ...productFields,
  id: Schema.String,
  slug: Schema.String,
  images: Schema.Array(ProductImage)
}) {}

export const OrderStatus = Schema.Literals(["new", "in_progress", "done"])
export type OrderStatus = typeof OrderStatus.Type

export class OrderItem extends Schema.Class<OrderItem>("OrderItem")({
  name: Schema.String,
  quantity: Schema.Int,
  imageUrl: Schema.NullOr(Schema.String),
  // Standard size or custom measurements, e.g. { size: "L" } or { chest: "42" }.
  options: Schema.Record(Schema.String, Schema.String)
}) {}

export class Order extends Schema.Class<Order>("Order")({
  id: Schema.String,
  reference: Schema.String,
  email: Schema.String,
  phone: Schema.String,
  address: Schema.String,
  items: Schema.Array(OrderItem),
  status: OrderStatus,
  note: Schema.String,
  isSample: Schema.Boolean,
  createdAt: Schema.String,
  handledAt: Schema.NullOr(Schema.String)
}) {}

export class OrderUpdate extends Schema.Class<OrderUpdate>("OrderUpdate")({
  status: Schema.optional(OrderStatus),
  note: Schema.optional(Schema.String)
}) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { message: Schema.String }
) {}

export class BadRequest extends Schema.TaggedError<BadRequest>()(
  "BadRequest",
  { message: Schema.String }
) {}

const NotFoundResponse = NotFound.pipe(HttpApiSchema.status(404))
const BadRequestResponse = BadRequest.pipe(HttpApiSchema.status(400))

class OrdersGroup extends HttpApiGroup.make("orders")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Order) }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: OrderUpdate,
      success: Order,
      error: NotFoundResponse
    })
  )
  .prefix("/orders")
{}

class CollectionsGroup extends HttpApiGroup.make("collections")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Collection) }),
    HttpApiEndpoint.post("create", "/", {
      payload: Schema.Struct({ name: Schema.NonEmptyString }),
      success: Collection,
      error: BadRequestResponse
    })
  )
  .prefix("/collections")
{}

class ProductsGroup extends HttpApiGroup.make("products")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Product) }),
    HttpApiEndpoint.post("create", "/", {
      payload: ProductInput,
      success: Product,
      error: BadRequestResponse
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: ProductInput,
      success: Product,
      error: [NotFoundResponse, BadRequestResponse]
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      error: NotFoundResponse
    }),
    HttpApiEndpoint.post("addImages", "/:id/images", {
      params: { id: Schema.String },
      payload: Schema.Struct({ files: Multipart.FilesSchema }).pipe(
        HttpApiSchema.asMultipart({ maxFileSize: "15 MiB", maxParts: 20 })
      ),
      success: Product,
      error: [NotFoundResponse, BadRequestResponse]
    }),
    HttpApiEndpoint.put("orderImages", "/:id/images/order", {
      params: { id: Schema.String },
      payload: Schema.Struct({ imageIds: Schema.Array(Schema.String) }),
      success: Product,
      error: NotFoundResponse
    }),
    HttpApiEndpoint.delete("removeImage", "/:id/images/:imageId", {
      params: { id: Schema.String, imageId: Schema.String },
      success: Product,
      error: NotFoundResponse
    })
  )
  .prefix("/products")
{}

export class AdminApi extends HttpApi.make("zuch-admin")
  .add(OrdersGroup)
  .add(CollectionsGroup)
  .add(ProductsGroup)
  .prefix("/api")
{}
