import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { checkPort } from "../checks/port.js";

test("checkPort reports ok against a real listening TCP server", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const result = await checkPort("127.0.0.1", port, 2000);
    assert.equal(result.ok, true);
    assert.equal(result.error, null);
  } finally {
    server.close();
  }
});

test("checkPort reports failure against a closed port", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve)); // now guaranteed closed

  const result = await checkPort("127.0.0.1", port, 2000);
  assert.equal(result.ok, false);
  assert.ok(result.error);
});
