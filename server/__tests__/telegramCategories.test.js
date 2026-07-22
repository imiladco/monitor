import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryForEventType, CATEGORIES } from "../telegramCategories.js";

test("categoryForEventType maps every known event type to a valid category", () => {
  const validKeys = new Set(CATEGORIES.map((c) => c.key));
  const knownTypes = [
    "uptime_change",
    "checkout_change",
    "port_change",
    "ssl_warning",
    "domain_warning",
    "visual_change",
    "cwv_drop",
    "slow_response",
    "slow_response_recovered",
    "db_growth",
    "core_integrity",
    "brute_force",
    "admin_user_created",
    "plugin_installed",
    "plugin_update",
    "plugin_removed",
    "plugin_activated",
    "plugin_deactivated",
    "theme_change",
    "core_update",
  ];
  for (const type of knownTypes) {
    const category = categoryForEventType(type);
    assert.ok(category, `expected a category for ${type}`);
    assert.ok(validKeys.has(category), `${category} (for ${type}) is not a real category`);
  }
});

test("categoryForEventType returns null for an unknown type", () => {
  assert.equal(categoryForEventType("something_made_up"), null);
});

test("CATEGORIES has exactly 7 unique category keys", () => {
  const keys = CATEGORIES.map((c) => c.key);
  assert.equal(keys.length, 7);
  assert.equal(new Set(keys).size, 7);
});
