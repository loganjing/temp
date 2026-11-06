import { spawn } from "node:child_process"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))
const packageFile = JSON.parse(await readFile(path.join(root, "..", "package.json"), "utf8"))
if (!packageFile.workspaces?.includes("app/*")) throw new Error("The expected app/* workspace is not declared")
const apps = await readdir(path.join(root, "..", "app"), { withFileTypes: true })
const app = apps.find((entry) => entry.isDirectory())
if (!app) throw new Error("No app workspace is available")
const appPackage = JSON.parse(await readFile(path.join(root, "..", "app", app.name, "package.json"), "utf8"))
const npm = process.platform === "win32" ? "npm.cmd" : "npm"
const children = ["dev:web", "dev:server"].map((script) => spawn(npm, ["run", script, "--workspace", appPackage.name], { cwd: path.join(root, ".."), stdio: "inherit", shell: process.platform === "win32" }))
let stopping = false
const stop = (code = 0) => {
  if (stopping) return
  stopping = true
  children.forEach((child) => {
    if (process.platform === "win32" && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
    else child.kill("SIGTERM")
  })
  process.exitCode = code
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop())
for (const child of children) child.once("exit", (code) => stop(code ?? 1))
