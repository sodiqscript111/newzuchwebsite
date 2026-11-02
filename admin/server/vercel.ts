// The API as a single Vercel function. Files are served by Vercel, and photos must
// use the bucket because function storage does not last between requests.
import { NodeHttpServer } from "@effect/platform-node"
import { Layer } from "effect"
import { HttpRouter } from "effect/http"
import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream } from "node:stream/web"
import { ApiRoutes } from "./App.ts"

const { handler } = HttpRouter.toWebHandler(ApiRoutes.pipe(Layer.provide(NodeHttpServer.layerHttpServices)))

export default async function(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`)
  // The route in scripts/build-vercel.mjs passes the original path along.
  const original = url.searchParams.get("__path")
  if (original !== null) {
    url.pathname = `/api/${original}`
    url.searchParams.delete("__path")
  }

  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value)
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD"
  const response = await handler(new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) as unknown as BodyInit : undefined,
    duplex: "half"
  } as RequestInit))

  res.statusCode = response.status
  response.headers.forEach((value, name) => res.setHeader(name, value))
  if (response.body) await pipeline(Readable.fromWeb(response.body as ReadableStream), res)
  else res.end()
}
