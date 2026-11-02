import { LibsqlClient, LibsqlMigrator } from "@effect/sql-libsql"
import { Config, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import { mkdirSync } from "node:fs"
import path from "node:path"

const Migrations = LibsqlMigrator.layer({
  loader: LibsqlMigrator.fromRecord({
    "0001_create_tables": Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* sql`
        CREATE TABLE collections (
          slug TEXT PRIMARY KEY,
          name TEXT NOT NULL
        )
      `
      yield* sql`
        CREATE TABLE products (
          id TEXT PRIMARY KEY,
          collection_slug TEXT NOT NULL REFERENCES collections(slug),
          slug TEXT NOT NULL,
          name TEXT NOT NULL,
          price INTEGER,
          price_note TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          sizes TEXT NOT NULL DEFAULT '[]',
          visible INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          UNIQUE (collection_slug, slug)
        )
      `
      yield* sql`
        CREATE TABLE product_images (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          storage_key TEXT,
          position INTEGER NOT NULL
        )
      `
      yield* sql`CREATE INDEX product_images_product ON product_images (product_id, position)`
      yield* sql`
        CREATE TABLE orders (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL,
          address TEXT NOT NULL,
          items TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'new',
          note TEXT NOT NULL DEFAULT '',
          is_sample INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          handled_at TEXT
        )
      `
    })
  })
})

// A local file by default; point DATABASE_URL at Turso (libsql://...) when deployed.
const Client = Layer.unwrap(Effect.gen(function*() {
  const url = yield* Config.String("DATABASE_URL").pipe(Config.withDefault("file:data/admin.db"))
  const authToken = yield* Config.option(Config.Redacted("DATABASE_AUTH_TOKEN"))
  if (url.startsWith("file:")) {
    mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true })
  }
  return LibsqlClient.layer({ url, authToken: Option.getOrUndefined(authToken) })
}))

export const DatabaseLive = Migrations.pipe(Layer.provideMerge(Client))
