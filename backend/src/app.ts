import { Hono } from "hono"

export type AppEnv = { Bindings: Env }

export const newApp = () => new Hono<AppEnv>()
