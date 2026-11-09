import { newApp } from "../app.ts"

export const media = newApp()

media.get("/*", async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/media\//, ""))
  const object = await c.env.MEDIA.get(key)
  if (!object) return c.notFound()
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("etag", object.httpEtag)
  headers.set("cache-control", "public, max-age=31536000, immutable")
  return new Response(object.body, { headers })
})
