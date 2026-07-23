import { test } from "node:test";
import assert from "node:assert/strict";
import { matchStatus, getJsonPath } from "../checks/httpAssert.js";

test("matchStatus handles single codes, lists, and ranges", () => {
  assert.equal(matchStatus(200, "200"), true);
  assert.equal(matchStatus(201, "200"), false);
  assert.equal(matchStatus(204, "200,201,204"), true);
  assert.equal(matchStatus(250, "200-299"), true);
  assert.equal(matchStatus(300, "200-299"), false);
  assert.equal(matchStatus(404, "200-299, 404"), true);
});

test("matchStatus returns null when there's no expectation", () => {
  assert.equal(matchStatus(200, ""), null);
  assert.equal(matchStatus(200, null), null);
});

test("getJsonPath resolves dot and bracket paths", () => {
  const obj = { data: { items: [{ id: 7 }, { id: 8 }], errors: null } };
  assert.deepEqual(getJsonPath(obj, "data.items.0.id"), { found: true, value: 7 });
  assert.deepEqual(getJsonPath(obj, "data.items[1].id"), { found: true, value: 8 });
  assert.deepEqual(getJsonPath(obj, "data.errors"), { found: true, value: null });
  assert.equal(getJsonPath(obj, "data.missing").found, false);
  assert.equal(getJsonPath(obj, "nope.deep.path").found, false);
});

test("getJsonPath is safe on non-objects", () => {
  assert.equal(getJsonPath(null, "a").found, false);
  assert.equal(getJsonPath(42, "a").found, false);
});
