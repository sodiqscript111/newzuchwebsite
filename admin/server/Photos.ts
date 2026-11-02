import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Config, Context, Effect, Layer, Option } from "effect"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export const uploadsDir = path.resolve(process.env.DATA_DIR ?? "data", "uploads")

// Where product photos live: S3-compatible storage when its keys are set, otherwise
// the local data folder.
export class Photos extends Context.Service<Photos, {
  readonly backend: "s3" | "local"
  put(key: string, body: Uint8Array, contentType: string): Effect.Effect<string>
  remove(key: string): Effect.Effect<void>
}>()("zuch/Photos") {
  static readonly layer = Layer.effect(
    Photos,
    Effect.gen(function*() {
      const endpoint = yield* Config.option(Config.String("S3_ENDPOINT"))
      if (Option.isNone(endpoint)) return localPhotos

      const bucket = yield* Config.String("S3_BUCKET")
      const publicBaseUrl = (yield* Config.String("S3_PUBLIC_BASE_URL")).replace(/\/+$/, "")
      const client = new S3Client({
        region: yield* Config.String("S3_REGION").pipe(Config.withDefault("auto")),
        endpoint: endpoint.value,
        credentials: {
          accessKeyId: yield* Config.String("S3_ACCESS_KEY_ID"),
          secretAccessKey: yield* Config.String("S3_SECRET_ACCESS_KEY")
        }
      })

      return Photos.of({
        backend: "s3",
        put: (key, body, contentType) =>
          Effect.promise(() =>
            client.send(new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: body,
              ContentType: contentType,
              CacheControl: "public, max-age=31536000, immutable"
            }))
          ).pipe(Effect.as(`${publicBaseUrl}/${key}`)),
        remove: (key) =>
          Effect.promise(() => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))).pipe(Effect.asVoid)
      })
    })
  )
}

const localPhotos = Photos.of({
  backend: "local",
  put: (key, body) =>
    Effect.promise(async () => {
      const file = path.join(uploadsDir, key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, body)
      return `/uploads/${key}`
    }),
  remove: (key) => Effect.promise(() => rm(path.join(uploadsDir, key), { force: true }))
})
