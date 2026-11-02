import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { HttpRouter, HttpStaticServer } from "effect/http"
import { existsSync, mkdirSync } from "node:fs"
import { createServer, ServerResponse } from "node:http"
import path from "node:path"
import { ApiRoutes } from "./App.ts"
import { uploadsDir } from "./Photos.ts"

mkdirSync(uploadsDir, { recursive: true })
const UploadsRoutes = HttpStaticServer.layer({ root: uploadsDir, prefix: "/uploads" })

// The built web app, when there is one. In development Vite serves it instead.
const webDist = path.resolve(import.meta.dirname, "../dist")
const WebRoutes = existsSync(webDist)
  ? HttpStaticServer.layer({ root: webDist, spa: true })
  : Layer.empty

// Effect turns on Node's strictContentLength, but Node 22.14 compares the string
// header to a number and rejects every correct response. Keep the check off.
class Response extends ServerResponse {}
Object.defineProperty(Response.prototype, "strictContentLength", { get: () => false, set: () => {} })

const Server = Layer.unwrap(Effect.gen(function*() {
  const port = yield* Config.Port("PORT").pipe(Config.withDefault(4320))
  yield* Effect.log(`Zuch admin running on http://localhost:${port}`)
  return HttpRouter.serve(Layer.mergeAll(ApiRoutes, UploadsRoutes, WebRoutes)).pipe(
    Layer.provide(NodeHttpServer.layer(() => createServer({ ServerResponse: Response }), { port }))
  )
}))

Layer.launch(Server).pipe(NodeRuntime.runMain)
