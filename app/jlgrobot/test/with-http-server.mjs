// Copy beside the application's verification script so @hono/node-server is
// resolved from its installed dependencies. Requests use a real HTTP listener.
import { serve } from "@hono/node-server"
import { once } from "node:events"

export async function withHttpServer({ fetch, close }, verify) {
  const server = await Promise.resolve().then(() => serve({ fetch, hostname: "127.0.0.1", port: 0 })).catch(async (error) => {
    await close?.()
    throw error
  })
  const sockets = new Set()
  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
  })
  try {
    if (!server.listening) await once(server, "listening")
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Verification HTTP server did not obtain its own port")
    return await verify(`http://127.0.0.1:${address.port}`)
  } finally {
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          for (const socket of sockets) socket.destroy()
          reject(new Error("Verification HTTP shutdown exceeded 3 seconds; inspect outstanding requests"))
        }, 3000)
        server.close((error) => {
          clearTimeout(timeout)
          if (error && error.code !== "ERR_SERVER_NOT_RUNNING") return reject(error)
          resolve()
        })
        server.closeIdleConnections()
      })
    } finally {
      await close?.()
    }
  }
}
