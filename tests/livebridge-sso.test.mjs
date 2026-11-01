import test from "node:test";
import assert from "node:assert/strict";
import { handleLiveBridgeLaunch } from "../livebridge-sso.js";

const ORIGIN = "https://northstarventures.ca";
const PATH = "/api/admin/launch/livebridge";
function env(configured = true) {
  const store = new Map();
  let calls = 0;
  return {
    INBOX: {
      async get(key) { return store.get(key); },
      async put(key, value) { store.set(key, value); }
    },
    LIVEBRIDGE_CLERK_RPC: configured ? {
      async issueOwnerTicket() { calls++; return {token:"sample-once"}; }
    } : undefined,
    get rpcCalls() { return calls; },
  };
}
function request(origin = ORIGIN, method = "POST") {
  return new Request(ORIGIN + PATH, {
    method,
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
test("only POST accepted", async () => {
  assert.equal((await launch(request(ORIGIN, "GET"),env())).status, 405);
});
test("refuses unauthenticated requests", async () => {
  assert.equal((await launch(request(), env(), async () => false)).status, 401);
});
test("refuses mismatched Origin requests", async () => {
  assert.equal((await launch(request("https://untrusted.example"),env())).status,403);
});
test("fails closed without RPC binding", async () => {
  assert.equal((await launch(request(),env(false))).status,503);
});
test("issues short-lived private RPC launch ticket with fixed destination", async () => {
  const e=env();
  const response=await launch(request(),e);
  assert.equal(response.status,200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).launch_url,
    "https://livebridge.ca/admin/index.html#nsv_sso=sample-once");
  assert.equal(e.rpcCalls,1);
});
test("limits repeated launches by admin session",async()=>{
  const e=env();let response;
  for(let i=0;i<7;i++)response=await launch(request(),e);
  assert.equal(response.status,429);
  assert.equal(e.rpcCalls,6);
});
test("remote failure is closed and details hidden",async()=>{
  const e=env();
  e.LIVEBRIDGE_CLERK_RPC.issueOwnerTicket=async()=>{throw Error("private secret information")};
  const response=await launch(request(),e);
  assert.equal(response.status,503);
  assert.doesNotMatch(JSON.stringify(await response.json()),/private secret information/);
});
