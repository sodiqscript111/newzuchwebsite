// Builds the shop and the admin, and puts them in public/ for the Worker to serve:
// the shop at /, the admin at /admin.
import { execSync } from "node:child_process"
import { cpSync, existsSync, rmSync } from "node:fs"
import path from "node:path"

const backend = path.resolve(import.meta.dirname, "..")
const repo = path.resolve(backend, "..")
const admin = path.join(repo, "admin")
const output = path.join(backend, "public")

const run = (command, cwd) => execSync(command, { cwd, stdio: "inherit" })

for (const dir of [repo, admin]) {
  if (!existsSync(path.join(dir, "node_modules"))) run("npm install", dir)
  run("npm run build", dir)
}

rmSync(output, { recursive: true, force: true })
cpSync(path.join(repo, "dist"), output, { recursive: true })
// The old hardcoded product photos; products now load theirs from R2.
rmSync(path.join(output, "images"), { recursive: true, force: true })
cpSync(path.join(admin, "dist"), path.join(output, "admin"), { recursive: true })
console.log("Shop and admin are in backend/public")
