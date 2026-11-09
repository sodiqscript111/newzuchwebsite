import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { z } from "zod"

export const fail = (status: ContentfulStatusCode, message: string): never => {
  throw new HTTPException(status, { message })
}

export const readJson = async <T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> => {
  const body = await c.req.json().catch(() => fail(400, "Send the request as JSON"))
  const result = schema.safeParse(body)
  if (!result.success) {
    const issue = result.error.issues[0]
    return fail(400, issue?.message ?? "Some details are missing or invalid")
  }
  return result.data
}

export const nowIso = () => new Date().toISOString()
