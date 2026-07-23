import tls from "node:tls";

// Issuer is best identified by its organization (the CA); a leaf subject by
// its common name (the domain).
function issuerName(entity) {
  if (!entity) return null;
  return entity.O || entity.CN || entity.OU || null;
}
function subjectName(entity) {
  if (!entity) return null;
  return entity.CN || entity.O || null;
}

// Connects with rejectUnauthorized:false so we always get the certificate and
// can report chain/hostname validity ourselves (socket.authorized) instead of
// the connection just erroring out. Returns rich cert metadata for change
// detection and display.
export function checkSsl(hostname, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, timeout: 10000, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const authorizationError = socket.authorizationError ? String(socket.authorizationError) : null;
        const tlsVersion = socket.getProtocol();
        socket.end();

        if (!cert || !cert.valid_to) {
          resolve({ ok: false, error: "no certificate returned" });
          return;
        }
        const expiresAt = new Date(cert.valid_to);
        const daysLeft = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        const hostnameMismatch = authorizationError ? /ALTNAME|hostname|Host:/i.test(authorizationError) : false;

        resolve({
          ok: true,
          expiresAt,
          daysLeft,
          error: null,
          issuer: issuerName(cert.issuer),
          subject: subjectName(cert.subject),
          tlsVersion,
          fingerprint: cert.fingerprint256 || null,
          altNames: cert.subjectaltname || null,
          authorized,
          authorizationError,
          hostnameMismatch,
        });
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
