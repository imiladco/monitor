import tls from "node:tls";

export function checkSsl(hostname, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, timeout: 10000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) {
          resolve({ ok: false, error: "no certificate returned" });
          return;
        }
        const expiresAt = new Date(cert.valid_to);
        const daysLeft = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        resolve({ ok: true, expiresAt, daysLeft, error: null });
      }
    );

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "timeout" });
    });

    socket.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}
