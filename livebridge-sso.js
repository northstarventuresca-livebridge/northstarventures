// Owner-only, opt-in Command Center launcher for the existing LiveBridge Clerk account.
// NTAG215 URLs are deliberately NOT trusted as authentication. A valid North Star admin
// session is required until a separately verified secure-card identity is implemented.
// Do not accept a userId, return URL or app origin from the browser.
const PATH = "/api/admin/launch/livebridge";
const DESTINATION = "https://livebridge.ca/admin/index.html#nsv_sso=";

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function handleLiveBridgeLaunch(request, env, url, authorize) {
  if (url.pathname !== PATH) return null;
  if (request.method !== "POST") return reply({error: "Method not allowed"}, 405);
  if (request.headers.get("origin") !== url.origin) {
    return reply({error: "Invalid request origin"}, 403);
  }
  if (!(await authorize(request, env))) return reply({error: "Sign in to North Star first"}, 401);

  // This pilot uses the existing single-administrator login. Partner access
  // must NOT be enabled until individual identity and permissions are enforced.
  // The service binding invokes a named, non-HTTP RPC entrypoint on LiveBridge,
  // so its Clerk secret never leaves the LiveBridge Worker.
  if (!env.LIVEBRIDGE_CLERK_RPC) {
    return reply({error: "LiveBridge private sign-in connection not configured"}, 503);
  }
  if (!env.INBOX) return reply({error: "Session storage unavailable"}, 503);

  // Avoid minting tickets excessively for a single North Star admin session.
  const now = Math.floor(Date.now() / 60_000);
  const authHeader = request.headers.get("authorization") || "";
  const session = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const sessionDigest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(session || request.headers.get("cookie") || "")
  );
  const key = "nsv:sso:lb:rate:" + now + ":" +
    Array.from(new Uint8Array(sessionDigest), x => x.toString(16).padStart(2, "0")).join("");
  const count = Number(await env.INBOX.get(key) || 0);
  if (count >= 6) return reply({error: "Too many launch attempts. Try again shortly"}, 429);
  await env.INBOX.put(key, String(count + 1), {expirationTtl: 120});

  let data;
  try {
    data = await env.LIVEBRIDGE_CLERK_RPC.issueOwnerTicket();
  } catch {
    return reply({error: "LiveBridge sign-in is unavailable or not configured"}, 503);
  }
  if (!data || typeof data.token !== "string" || !data.token) {
    return reply({error: "LiveBridge sign-in ticket missing"}, 502);
  }
  // URL fragment is not sent with HTTP requests. The LiveBridge page removes it before
  // verifying the short-lived, one-use ticket with Clerk. Never put this token in logs.
  return reply({launch_url: DESTINATION + encodeURIComponent(data.token)});
}
