// Packages the built web app and the API for Vercel (Build Output API).
// Run by `npm run build:vercel`, after `vite build`.
import { build } from "esbuild"
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const output = path.join(root, ".vercel/output")
const fn = path.join(output, "functions/api.func")

rmSync(output, { recursive: true, force: true })
mkdirSync(fn, { recursive: true })
cpSync(path.join(root, "dist"), path.join(output, "static"), { recursive: true })

await build({
  entryPoints: [path.join(root, "server/vercel.ts")],
  outfile: path.join(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // The web client talks to Turso over HTTPS and needs no native database driver.
  alias: { "@libsql/client": "@libsql/client/web" },
  banner: { js: `import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);` },
  logLevel: "warning"
})

writeFileSync(path.join(fn, "package.json"), JSON.stringify({ type: "module" }))
writeFileSync(path.join(fn, ".vc-config.json"), JSON.stringify({
  runtime: "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  shouldAddHelpers: false,
  maxDuration: 30
}))
writeFileSync(path.join(output, "config.json"), JSON.stringify({
  version: 3,
  routes: [
    { src: "/api/(.*)", dest: "/api?__path=$1" },
    { handle: "filesystem" }
  ]
}))
console.log("Vercel output ready in .vercel/output")
