import test from "node:test";
import assert from "node:assert/strict";
import { handleLiveBridgeLaunch } from "../livebridge-sso.js";

const ORIGIN = "https://northstarventures.ca";
const PATH = "/api/admin/launch/livebridge";
function env(configured = true) {
  const store = new Map();
  return {
    NSV_LIVEBRIDGE_CLERK_USER_ID: configured ? "user_TEST123" : "",
    NSV_LIVEBRIDGE_CLERK_SECRET_KEY: configured ? "sk_TEST" : "",
    INBOX: {
      async get(key) { return store.get(key); },
      async put(key, value) { store.set(key, value); }
    }
  };
}
function request(origin = ORIGIN) {
  return new Request(ORIGIN + PATH, {
    method: "POST",
    headers: {origin, authorization: "Bearer authenticated-session"}
  });
}
function launch(req, e, authorize = async () => true) {
  return handleLiveBridgeLaunch(req, e, new URL(req.url), authorize);
}

test("only the exact configured route is handled", async () => {
  const req = new Request(ORIGIN + "/api/admin/launch/unknown", {method: "POST"});
  assert.equal(await launch(req, env()), null);
});

test("refuses unauthenticated requests", async () => {
  const response = await launch(request(), env(), async () => false);
  assert.equal(response.status, 401);
});

test("refuses requests without matching Origin", async () => {
  const response = await launch(request("https://untrusted.example"), env());
  assert.equal(response.status, 403);
});

test("fails closed until Clerk account mapping and secret are provisioned", async () => {
  const response = await launch(request(), env(false));
  assert.equal(response.status, 503);
});

test("issues short-lived Clerk sign-in ticket with fixed destination", async () => {
  const original = globalThis.fetch;
  let observed;
  globalThis.fetch = async (url, options) => {
    observed = {url, options};
    return Response.json({token: "sample-once"});
  };
  try {
    const response = await launch(request(), env());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const data = await response.json();
    assert.equal(data.launch_url, "https://livebridge.ca/admin/index.html#nsv_sso=sample-once");
    assert.equal(observed.url, "https://api.clerk.com/v1/sign_in_tokens");
    const payload = JSON.parse(observed.options.body);
    assert.deepEqual(payload, {user_id:"user_TEST123",expires_in_seconds:60});
    assert.equal(observed.options.headers.authorization, "Bearer sk_TEST");
  } finally { globalThis.fetch = original; }
});

test("repeated launches are rate limited", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({token:"sample-once"});
  try {
    const e = env();
    let response;
    for (let i=0; i<7; i++) response = await launch(request(), e);
    assert.equal(response.status, 429);
  } finally { globalThis.fetch = original; }
});
