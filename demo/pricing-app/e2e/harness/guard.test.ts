import assert from "node:assert/strict";
import { test } from "node:test";
import { blockReason, requireQaUrl } from "./guard.ts";

const rules = {
  appHost: "shop-qa.example.com",
  readHosts: ["fonts.googleapis.com", "*.cdn.example.net"],
  allowedWrites: ["POST /api/orders", "PUT /api/orders/*", "DELETE /api/orders/*/lines/*", "POST /api/search/**"]
};

await test("requireQaUrl accepts only URLs with a QA marker", () => {
  assert.equal(requireQaUrl("https://shop-QA.example.com", ["qa"], "baseURL").host, "shop-qa.example.com");
  assert.throws(() => requireQaUrl("https://shop.example.com", ["qa"], "baseURL"), /does not look like QA/);
  assert.throws(() => requireQaUrl("https://shop-qa.example.com", [], "baseURL"), /does not look like QA/);
  assert.throws(() => requireQaUrl(undefined, ["qa"], "baseURL"), /not set/);
});

await test("reads go to the app or readHosts only", () => {
  assert.equal(blockReason("GET", "https://shop-qa.example.com/api/orders", rules), undefined);
  assert.equal(blockReason("GET", "https://fonts.googleapis.com/css2", rules), undefined);
  assert.equal(blockReason("GET", "https://img.cdn.example.net/a.png", rules), undefined);
  assert.equal(blockReason("GET", "data:image/png;base64,AAAA", rules), undefined);
  assert.match(blockReason("GET", "https://shop.example.com/", rules) ?? "", /not the app/);
  assert.match(blockReason("GET", "https://evilcdn.example.net/", rules) ?? "", /not the app/);
});

await test("writes need an allowedWrites rule for that method and path", () => {
  assert.equal(blockReason("POST", "https://shop-qa.example.com/api/orders", rules), undefined);
  assert.equal(blockReason("POST", "https://shop-qa.example.com/api/orders/", rules), undefined);
  assert.equal(blockReason("PUT", "https://shop-qa.example.com/api/orders/O-1?x=1", rules), undefined);
  assert.equal(blockReason("DELETE", "https://shop-qa.example.com/api/orders/O-1/lines/3", rules), undefined);
  assert.equal(blockReason("POST", "https://shop-qa.example.com/api/search/a/b/c", rules), undefined);
  assert.match(blockReason("DELETE", "https://shop-qa.example.com/api/orders/O-1", rules) ?? "", /not in allowedWrites/);
  assert.match(blockReason("PUT", "https://shop-qa.example.com/api/orders/O-1/lines", rules) ?? "", /not in allowedWrites/);
  assert.match(blockReason("POST", "https://shop-qa.example.com/api/orders.json", rules) ?? "", /not in allowedWrites/);
  assert.match(blockReason("POST", "https://fonts.googleapis.com/api/orders", rules) ?? "", /not the app/);
});
