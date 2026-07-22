import net from "node:net";
import { env } from "../config.js";

export function checkPort(host, port, timeoutMs = env.requestTimeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();

    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true, responseMs: Date.now() - start, error: null }));
    socket.once("timeout", () => finish({ ok: false, responseMs: Date.now() - start, error: "timeout" }));
    socket.once("error", (err) => finish({ ok: false, responseMs: Date.now() - start, error: err.message }));

    socket.connect(port, host);
  });
}
