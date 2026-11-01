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

  // This initial integration is strictly for the current single-admin account.
  // Future partner accounts MUST resolve a per-person, per-app permission and Clerk user ID.
  const userId = String(env.NSV_LIVEBRIDGE_CLERK_USER_ID || "").trim();
  const clerkSecret = String(env.NSV_LIVEBRIDGE_CLERK_SECRET_KEY || "").trim();
  if (!/^user_[A-Za-z0-9]+$/.test(userId) || !clerkSecret) {
    return reply({error: "LiveBridge one-click sign-in is not configured yet"}, 503);
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

  let response;
  try {
    response = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
      method: "POST",
      headers: {
        "authorization": "Bearer " + clerkSecret,
        "content-type": "application/json",
      },
      body: JSON.stringify({user_id: userId, expires_in_seconds: 60}),
    });
  } catch {
    return reply({error: "LiveBridge sign-in service unavailable"}, 502);
  }
  if (!response.ok) return reply({error: "LiveBridge sign-in service rejected the request"}, 502);
  let data;
  try { data = await response.json(); } catch { return reply({error: "Invalid LiveBridge sign-in response"}, 502); }
  if (!data || typeof data.token !== "string" || !data.token) {
    return reply({error: "LiveBridge sign-in ticket missing"}, 502);
  }
  // URL fragment is not sent with HTTP requests. The LiveBridge page removes it before
  // verifying the short-lived, one-use ticket with Clerk. Never put this token in logs.
  return reply({launch_url: DESTINATION + encodeURIComponent(data.token)});
}
